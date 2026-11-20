/** Development-only orchestration. Every write uses the caller's normal PocketBase API,
 * preserving collection rules, scoring locks, authorship, and change-history hooks. */
export class DemoFillError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function loadDemoEvent(
	pb: NonNullable<App.Locals['pb']>,
	organizationId: string,
	eventId: string,
	userId: string
) {
	const validId = /^[a-z0-9]{15}$/;
	if (![organizationId, eventId].every((id) => validId.test(id)))
		throw new DemoFillError(404, 'Event not found.');
	const memberships = await pb
		.collection('memberships')
		.getFullList({ filter: `organization = "${organizationId}" && user = "${userId}"` });
	const mine = memberships.find(
		(row) => String(row.organization) === organizationId && String(row.user) === userId
	);
	if (!mine) throw new DemoFillError(404, 'Event not found.');
	if (!['owner', 'admin'].includes(String(mine.role)))
		throw new DemoFillError(403, 'Only Owners and Admins can use event-wide scoring test tools.');
	const event = await pb.collection('events').getOne(eventId);
	if (String(event.organization) !== organizationId)
		throw new DemoFillError(404, 'Event not found.');
	if (String(event.status) === 'archived')
		throw new DemoFillError(400, 'Archived events cannot use scoring test tools.');
	const org = await pb.collection('organizations').getOne(organizationId);
	const caps: unknown =
		typeof org.capabilities === 'string' ? JSON.parse(org.capabilities) : org.capabilities;
	if (!Array.isArray(caps) || !caps.includes('scoring-results'))
		throw new DemoFillError(
			400,
			'Enable Scoring & official results before using scoring test tools.'
		);
	const filter = `organization = "${organizationId}" && event = "${eventId}"`;
	const [results, rounds, groups, assignments, cards, scores, holes] = await Promise.all([
		pb.collection('event_results').getFullList({ filter }),
		pb
			.collection('rounds')
			.getFullList({ filter: `${filter} && status = "active"`, sort: 'number' }),
		pb.collection('event_groups').getFullList({ filter: `${filter} && status = "active"` }),
		pb.collection('group_athletes').getFullList({ filter: `${filter} && status = "active"` }),
		pb.collection('scorecards').getFullList({ filter }),
		pb.collection('scores').getFullList({ filter }),
		pb
			.collection('course_holes')
			.getFullList({ filter: `organization = "${organizationId}" && status = "active"` })
	]);
	if (results.length)
		throw new DemoFillError(
			400,
			'This event already has an official result. Scoring test tools are unavailable; use the existing correction workflow.'
		);
	if (groups.some((group) => Boolean(group.injuryHandoff)))
		throw new DemoFillError(400, 'An injury handoff requires manual scoring during draft testing.');
	if (!rounds.length || !groups.length)
		throw new DemoFillError(400, 'Set up active rounds and groups first.');
	// Validate all required layouts and lineups before creating any scorecards.
	for (const round of rounds) {
		if (!round.course || !holes.some((hole) => String(hole.course) === String(round.course)))
			throw new DemoFillError(400, 'Every active round needs a course with active holes.');
	}
	for (const group of groups) {
		if (!assignments.some((row) => String(row.group) === group.id))
			throw new DemoFillError(400, 'Every active group needs assigned roster athletes.');
	}
	return { rounds, groups, assignments, cards, scores, holes };
}

export async function fillEventDemoScores(
	pb: NonNullable<App.Locals['pb']>,
	organizationId: string,
	eventId: string,
	userId: string,
	random: () => number = Math.random,
	seasonDemoGenerated = false
) {
	const { rounds, groups, assignments, cards, scores, holes } = await loadDemoEvent(
		pb,
		organizationId,
		eventId,
		userId
	);
	let added = 0,
		touched = 0,
		skipped = 0;
	try {
		for (const round of rounds) {
			const roundHoles = holes.filter((hole) => String(hole.course) === String(round.course));
			for (const group of groups) {
				let card = cards.find(
					(row) => String(row.round) === round.id && String(row.group) === group.id
				);
				if (card && String(card.status) !== 'draft') {
					skipped++;
					continue;
				}
				const occupied = new Set(
					scores
						.filter((row) => String(row.round) === round.id && String(row.group) === group.id)
						.map((row) => `${String(row.athlete)}|${String(row.hole)}`)
				);
				const missing = assignments
					.filter((row) => String(row.group) === group.id)
					.flatMap((athlete) =>
						roundHoles
							.filter((hole) => !occupied.has(`${String(athlete.athlete)}|${hole.id}`))
							.map((hole) => ({ athlete: String(athlete.athlete), hole: hole.id }))
					);
				if (!missing.length) continue;
				if (!card)
					card = await pb
						.collection('scorecards')
						.create({ organization: organizationId, round: round.id, group: group.id });

				const scorecardId = card?.id;
				if (!scorecardId) {
					throw new DemoFillError(400, 'Could not create the draft scorecard.');
				}
				for (const cell of missing) {
					await pb.collection('scores').create({
						organization: organizationId,
						scorecard: scorecardId,
						...cell,
						...(seasonDemoGenerated ? { seasonDemoGenerated } : {}),
						strokes: 2 + Math.floor(random() * 4)
					});
					added++;
				}
				touched++;
			}
		}
	} catch {
		throw new DemoFillError(
			400,
			`Stopped after saving ${added} test scores. Some changes may already be saved. Refresh and review the event before retrying; saved scores are preserved and submitted cards stay locked.`
		);
	}
	return { added, touched, skipped };
}

/** Submit complete draft cards through the usual API, preserving hook validation
 * and submission authorship. Preflight the whole event before any submission. */
export async function submitEventDemoScorecards(
	pb: NonNullable<App.Locals['pb']>,
	organizationId: string,
	eventId: string,
	userId: string
) {
	const { rounds, groups, assignments, cards, scores, holes } = await loadDemoEvent(
		pb,
		organizationId,
		eventId,
		userId
	);
	const pending: { id: string }[] = [];
	let skipped = 0;
	for (const round of [...rounds].sort((a, b) => Number(a.number) - Number(b.number))) {
		const roundHoles = holes.filter((hole) => String(hole.course) === String(round.course));
		for (const group of groups) {
			const card = cards.find(
				(row) => String(row.round) === round.id && String(row.group) === group.id
			);
			if (card?.status === 'submitted') {
				skipped++;
				continue;
			}
			if (!card || String(card.status) !== 'draft')
				throw new DemoFillError(
					400,
					'Every round and group needs a complete draft scorecard. Fill missing scores, review the event, then try again. Nothing was submitted.'
				);
			const saved = new Set(
				scores
					.filter(
						(score) =>
							String(score.scorecard) === card.id &&
							Number.isSafeInteger(Number(score.strokes)) &&
							Number(score.strokes) > 0
					)
					.map((score) => `${String(score.athlete)}|${String(score.hole)}`)
			);
			for (const athlete of assignments.filter((row) => String(row.group) === group.id)) {
				for (const hole of roundHoles) {
					if (!saved.has(`${String(athlete.athlete)}|${hole.id}`))
						throw new DemoFillError(
							400,
							'Some scorecards have missing or invalid scores. Fill missing scores and review before submitting. Nothing was submitted.'
						);
				}
			}
			pending.push({ id: card.id });
		}
	}
	let submitted = 0;
	try {
		for (const card of pending) {
			await pb.collection('scorecards').update(card.id, { status: 'submitted' });
			submitted++;
		}
	} catch {
		throw new DemoFillError(
			400,
			`Stopped after submitting ${submitted} scorecards. Refresh and review before retrying; already submitted cards stay locked and will be skipped. No official result was approved or published.`
		);
	}
	return { submitted, skipped };
}
