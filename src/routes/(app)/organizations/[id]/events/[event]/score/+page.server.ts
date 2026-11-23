import {
	DemoFillError,
	fillEventDemoScores,
	submitEventDemoScorecards
} from '$lib/server/fill-event-demo-scores';
import type { TeeSchedule } from '$lib/tee-times';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrgRole } from '$lib/server/auth';
import { pbErrorMessage, pbErrorStatus } from '$lib/server/auth';

interface InjuryHandoff {
	round: string;
	hole: string;
	roundNumber: number;
	holeNumber: number;
	outgoing: string;
	reserve: string;
	entry: string;
}

const ID_PATTERN = /^[a-z0-9]{15}$/;

/**
 * Phase 1G phone scorecard (D15). Everything on this page is resolved from
 * the verified Phase 1F setup: rounds (with hole counts derived from their
 * course), groups, group teams, and group athletes. The permission matrix is
 * enforced by the scoring collection rules + flihub_scoring hook; this load
 * mirrors it only to render an honest read-only state (hiding inputs is not
 * authorization).
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) error(503, 'PocketBase is not configured.');
	if (!ID_PATTERN.test(params.id) || !ID_PATTERN.test(params.event)) {
		error(404, 'Not found.');
	}
	const memberships = await pb.collection('memberships').getFullList({
		filter: `organization = "${params.id}"`,
		expand: 'user'
	});
	const mine = memberships.find((m) => String(m.user) === user.id);
	if (!mine) error(404, 'Not found.');
	const myRole = String(mine.role) as OrgRole;

	const event = await pb
		.collection('events')
		.getOne(params.event)
		.catch(() => null);
	if (!event || String(event.organization) !== params.id) error(404, 'Event not found.');

	const filter = `organization = "${params.id}"`;
	const eventFilter = `${filter} && event = "${params.event}"`;
	const [
		roundRows,
		holeRows,
		positionRows,
		groupRows,
		groupAthleteRows,
		entryRows,
		teamRows,
		athleteRows,
		scorecardRows,
		scoreRows,
		changeRows,
		resultRows
	] = await Promise.all([
		pb.collection('rounds').getFullList({ filter: eventFilter, sort: 'number' }),
		pb.collection('course_holes').getFullList({ filter, sort: 'number' }),
		pb.collection('hole_positions').getFullList({ filter, sort: 'label' }),
		pb.collection('event_groups').getFullList({ filter: eventFilter, sort: 'name' }),
		pb.collection('group_athletes').getFullList({ filter: eventFilter, sort: 'created' }),
		pb
			.collection('season_entries')
			.getFullList({ filter, sort: 'id' })
			.catch(() => []),
		pb
			.collection('teams')
			.getFullList({ filter, sort: 'name' })
			.catch(() => []),
		pb
			.collection('athletes')
			.getFullList({ filter, sort: 'lastName,firstName' })
			.catch(() => []),
		pb.collection('scorecards').getFullList({ filter: eventFilter, sort: 'created' }),
		pb.collection('scores').getFullList({ filter: eventFilter, sort: 'created' }),
		pb.collection('score_changes').getFullList({ filter: eventFilter, sort: '-created' }),
		pb.collection('event_results').getFullList({ filter: eventFilter })
	]);

	const memberName = new Map(
		memberships.map((m) => [
			String(m.user),
			String((m.expand?.user as { name?: unknown } | undefined)?.name ?? '') || String(m.user)
		])
	);
	const memberRole = new Map(memberships.map((m) => [String(m.user), String(m.role ?? '')]));
	const teamName = new Map(teamRows.map((t) => [t.id, String(t.name ?? '')]));
	const entryTeam = new Map(entryRows.map((en) => [en.id, String(en.team ?? '')]));
	const athleteName = new Map(
		athleteRows.map((a) => [
			a.id,
			String(a.displayName ?? '') ||
				`${String(a.firstName ?? '')} ${String(a.lastName ?? '')}`.trim()
		])
	);
	const holeById = new Map(holeRows.map((h) => [h.id, h]));

	const activeRounds = roundRows.filter((r) => String(r.status) === 'active');
	let offset = 0;
	const rounds = activeRounds.map((r) => {
		const courseId = String(r.course ?? '');
		const holes = holeRows
			.filter((h) => String(h.course) === courseId && String(h.status) === 'active')
			.map((h) => ({
				id: h.id,
				number: Number(h.number ?? 0),
				par: Number(h.par ?? 3),
				name: String(h.name ?? ''),
				// D15: scoring-time display falls back non-blocking when the
				// round's named position is missing on a hole.
				positionMissing:
					!!String(r.positionLabel ?? '') &&
					!positionRows.some(
						(p) =>
							String(p.hole) === h.id &&
							String(p.status) === 'active' &&
							String(p.label) === String(r.positionLabel)
					)
			}));
		const round = {
			teeSchedule: (r.teeSchedule || null) as TeeSchedule | null,
			id: r.id,
			number: Number(r.number ?? 0),
			name: String(r.name ?? '') || null,
			positionLabel: String(r.positionLabel ?? '') || null,
			holeCount: holes.length,
			displayOffset: offset,
			holes
		};
		offset += holes.length;
		return round;
	});

	const canManage = myRole === 'owner' || myRole === 'admin';
	const season = String(event.season ?? '');
	const reserveRows =
		canManage && ID_PATTERN.test(season)
			? await pb.collection('reserve_members').getFullList({
					filter: pb.filter('organization = {:org} && season = {:season} && status = "active"', {
						org: params.id,
						season
					})
				})
			: [];

	const groups = groupRows
		.filter((g) => String(g.status) === 'active')
		.map((g) => {
			const keeperId = String(g.scorekeeper ?? '');
			const keeperRole = memberRole.get(keeperId) ?? '';
			return {
				id: g.id,
				handoff: g.injuryHandoff as InjuryHandoff | null,
				name: String(g.name ?? ''),
				scorekeeper: keeperId || null,
				scorekeeperName: keeperId ? (memberName.get(keeperId) ?? keeperId) : null,
				// D15: a Viewer listed as a group's scorekeeper has no scoring
				// access — the UI says so instead of pretending otherwise.
				scorekeeperHasAccess:
					keeperRole === 'scorekeeper' || keeperRole === 'owner' || keeperRole === 'admin'
			};
		});

	const canScore =
		canManage || (myRole === 'scorekeeper' && groups.some((g) => g.scorekeeper === user.id));

	return {
		organizationId: params.id,
		currentUserId: user.id,
		myRole,
		canManage,
		canScore,
		resultStatus: resultRows.length > 0 ? String(resultRows[0].status) : null,
		event: {
			id: event.id,
			name: String(event.name ?? ''),
			season: String(event.season ?? '') || null
		},
		rounds,
		groups,
		reserves: [...new Set(reserveRows.map((row) => String(row.athlete)))]
			.filter((id) =>
				athleteRows.some((athlete) => athlete.id === id && athlete.status === 'active')
			)
			.filter(
				(id) => !groupAthleteRows.some((row) => row.athlete === id && row.status === 'active')
			)
			.filter((id) => !groups.some((group) => group.handoff?.reserve === id))
			.map((id) => ({ id, name: athleteName.get(id) || id }))
			.sort((a, b) => a.name.localeCompare(b.name)),
		athleteNames: Object.fromEntries(athleteName),
		groupAthletes: groupAthleteRows
			.filter((ga) => String(ga.status) === 'active')
			.map((ga) => ({
				group: String(ga.group ?? ''),
				entry: String(ga.entry ?? ''),
				teamName: teamName.get(entryTeam.get(String(ga.entry ?? '')) ?? '') ?? '',
				athlete: String(ga.athlete ?? ''),
				athleteName: athleteName.get(String(ga.athlete ?? '')) ?? ''
			})),
		scorecards: scorecardRows.map((c) => ({
			id: c.id,
			round: String(c.round ?? ''),
			group: String(c.group ?? ''),
			status: (String(c.status) || 'draft') as 'draft' | 'submitted',
			submittedByName: String(c.submittedBy ?? '')
				? (memberName.get(String(c.submittedBy)) ?? String(c.submittedBy))
				: null,
			submittedAt: String(c.submittedAt ?? '') || null
		})),
		scores: scoreRows.map((s) => ({
			id: s.id,
			round: String(s.round ?? ''),
			group: String(s.group ?? ''),
			entry: String(s.entry ?? ''),
			athlete: String(s.athlete ?? ''),
			hole: String(s.hole ?? ''),
			strokes: Number(s.strokes ?? 0)
		})),
		changes: changeRows.slice(0, 50).map((ch) => ({
			action: String(ch.action ?? ''),
			scorecard: String(ch.scorecard ?? ''),
			athleteName: String(ch.athlete ?? '') ? (athleteName.get(String(ch.athlete)) ?? null) : null,
			holeNumber: String(ch.hole ?? '')
				? Number(holeById.get(String(ch.hole))?.number ?? 0) || null
				: null,
			prevStrokes: ch.prevStrokes ? Number(ch.prevStrokes) : null,
			newStrokes: ch.newStrokes ? Number(ch.newStrokes) : null,
			reason: String(ch.reason ?? '') || null,
			authorName: memberName.get(String(ch.author ?? '')) ?? String(ch.author ?? ''),
			created: String(ch.created ?? '')
		}))
	};
};

/** Finds the (round, group) scorecard or creates a draft one. */
async function ensureScorecard(
	pb: NonNullable<App.Locals['pb']>,
	orgId: string,
	roundId: string,
	groupId: string
) {
	const existing = await pb
		.collection('scorecards')
		.getFirstListItem(`round = "${roundId}" && group = "${groupId}"`)
		.catch(() => null);
	if (existing) return existing;
	try {
		return await pb.collection('scorecards').create({
			organization: orgId,
			round: roundId,
			group: groupId
		});
	} catch (err) {
		const concurrent = await pb
			.collection('scorecards')
			.getFirstListItem(`round = "${roundId}" && group = "${groupId}"`)
			.catch(() => null);
		if (concurrent) return concurrent;
		throw err;
	}
}

export const actions: Actions = {
	recordInjuryHandoff: async ({ locals, request, params }) => {
		if (!import.meta.env.DEV) return fail(404, { message: 'Not found.' });
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		if (![params.id, params.event].every((id) => ID_PATTERN.test(id))) {
			return fail(404, { message: 'Event not found.' });
		}
		const form = await request.formData();
		const body = Object.fromEntries(
			['group', 'round', 'hole', 'outgoing', 'reserve', 'reason'].map((key) => [
				key,
				String(form.get(key) ?? '')
			])
		);
		try {
			await locals.pb.send(
				`/api/flihub/organizations/${params.id}/events/${params.event}/injury-handoff`,
				{ method: 'POST', body }
			);
			return { injuryHandoffSaved: true, activeGroup: body.group, activeRound: body.round };
		} catch (err) {
			return fail(pbErrorStatus(err), {
				message: pbErrorMessage(err),
				activeGroup: body.group,
				activeRound: body.round
			});
		}
	},
	submitAllDemoScorecards: async ({ locals, params }) => {
		if (!import.meta.env.DEV) return fail(404, { message: 'Not found.' });
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		try {
			const host = new URL(locals.pb.baseURL).hostname;
			if (!['127.0.0.1', 'localhost', '[::1]'].includes(host))
				return fail(403, {
					message: 'Event-wide test submission requires the local development PocketBase.'
				});
			const result = await submitEventDemoScorecards(
				locals.pb,
				params.id,
				params.event,
				locals.user.id
			);
			return {
				eventDemoSummary: `Submitted ${result.submitted} complete scorecards. Skipped ${result.skipped} already submitted cards. Scores were unchanged. Next: review, approve, and publish the official result separately.`
			};
		} catch (err) {
			return fail(err instanceof DemoFillError ? err.status : pbErrorStatus(err), {
				message: err instanceof DemoFillError ? err.message : pbErrorMessage(err)
			});
		}
	},
	fillAllDemoScores: async ({ locals, params }) => {
		if (!import.meta.env.DEV) return fail(404, { message: 'Not found.' });
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		try {
			const host = new URL(locals.pb.baseURL).hostname;
			if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
				return fail(403, {
					message: 'Event-wide test filling requires the local development PocketBase.'
				});
			}
			const result = await fillEventDemoScores(locals.pb, params.id, params.event, locals.user.id);
			return {
				eventDemoSummary: `Added ${result.added} test scores across ${result.touched} scorecards. Skipped ${result.skipped} locked scorecards. Existing scores were preserved. Review and submit each scorecard manually; no results were approved or published.`
			};
		} catch (err) {
			return fail(err instanceof DemoFillError ? err.status : pbErrorStatus(err), {
				message: err instanceof DemoFillError ? err.message : pbErrorMessage(err)
			});
		}
	},
	// Creates or updates one score cell. The hook derives event/round/group/
	// entry and records the author; rules enforce the D15 permission matrix.
	enterScore: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const roundId = String(form.get('round') ?? '');
		const groupId = String(form.get('group') ?? '');
		const athleteId = String(form.get('athlete') ?? '');
		const holeId = String(form.get('hole') ?? '');
		const strokesRaw = String(form.get('strokes') ?? '').trim();
		if (strokesRaw === '') {
			// An emptied input is a missing score — it is never stored as zero,
			// and existing values are not deleted (deletes are locked).
			return fail(400, {
				message: 'Enter a stroke count — missing scores stay missing, never zero.'
			});
		}
		const strokes = Number(strokesRaw);
		if (!Number.isSafeInteger(strokes) || strokes < 1) {
			return fail(400, { message: 'Scores must be positive whole numbers.' });
		}
		if (![roundId, groupId, athleteId, holeId].every((id) => ID_PATTERN.test(id))) {
			return fail(400, { message: 'Invalid score assignment.' });
		}
		try {
			const scorecard = await ensureScorecard(locals.pb, params.id, roundId, groupId);
			const existing = await locals.pb
				.collection('scores')
				.getFirstListItem(`round = "${roundId}" && athlete = "${athleteId}" && hole = "${holeId}"`)
				.catch(() => null);
			if (existing) {
				await locals.pb.collection('scores').update(existing.id, { strokes });
			} else {
				await locals.pb.collection('scores').create({
					organization: params.id,
					scorecard: scorecard.id,
					athlete: athleteId,
					hole: holeId,
					strokes
				});
			}
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { saved: true };
	},

	submitScorecard: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			const scorecard = await ensureScorecard(
				locals.pb,
				params.id,
				String(form.get('round') ?? ''),
				String(form.get('group') ?? '')
			);
			await locals.pb.collection('scorecards').update(scorecard.id, { status: 'submitted' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return {
			submitted: true,
			activeRound: String(form.get('round') ?? ''),
			activeGroup: String(form.get('group') ?? '')
		};
	},

	reopenScorecard: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const id = String(form.get('scorecard') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason) {
			return fail(400, {
				message: 'Provide a reason for reopening — it is recorded in the change history.'
			});
		}
		try {
			await locals.pb.collection('scorecards').update(id, { status: 'draft', reason });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { reopened: true };
	},

	// Clearly labeled DEMO control (D15): fills the missing draft cells of one
	// (round, group) with sample strokes using the caller's own permissions.
	fillDemoScores: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const roundId = String(form.get('round') ?? '');
		const groupId = String(form.get('group') ?? '');
		try {
			const scorecard = await ensureScorecard(locals.pb, params.id, roundId, groupId);
			const round = await locals.pb.collection('rounds').getOne(roundId);
			const group = await locals.pb.collection('event_groups').getOne(groupId);
			if (group.injuryHandoff) {
				return fail(400, { message: 'Enter scores manually for a group with an injury handoff.' });
			}
			const [holes, groupAthletes, existing] = await Promise.all([
				locals.pb.collection('course_holes').getFullList({
					filter: `course = "${String(round.course)}" && status = "active"`
				}),
				locals.pb.collection('group_athletes').getFullList({
					filter: `group = "${groupId}" && status = "active"`
				}),
				locals.pb.collection('scores').getFullList({
					filter: `scorecard = "${scorecard.id}"`
				})
			]);
			const filled = new Set(existing.map((s) => `${String(s.athlete)}|${String(s.hole)}`));
			for (const ga of groupAthletes) {
				for (const hole of holes) {
					if (filled.has(`${String(ga.athlete)}|${hole.id}`)) continue;
					await locals.pb.collection('scores').create({
						organization: params.id,
						scorecard: scorecard.id,
						athlete: String(ga.athlete),
						hole: hole.id,
						strokes: 2 + Math.floor(Math.random() * 4)
					});
				}
			}
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { demoFilled: true, activeRound: roundId, activeGroup: groupId };
	}
};
