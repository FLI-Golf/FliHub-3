/**
 * Full six-group disc golf demonstration verification on the disposable
 * preview stack — the demo event that Phases 1F–1I verified piecewise is
 * taken end to end in one run:
 *
 * 1. The EXACT Phase 1F demo fixture (tests/e2e/phase1f-formats.spec.mjs
 *    Part B): one course with nine par-3 hole records (red + blue positions
 *    in the 220–425 ft range, hole 8 keeping its placeholder demo name), a
 *    Red round and a Blue round replaying the same nine holes, 12 teams of
 *    one male + one female rostered athlete (24 athletes), separate reserve
 *    pools, and six groups of two teams with an assigned scorekeeper.
 * 2. Scorekeeping: the assigned scorekeeper fills and SUBMITS all 12
 *    scorecards (6 groups × 2 rounds) with deterministic varied strokes.
 * 3. Verification: every one of the 24 athletes has exactly 9 scores per
 *    round; the Owner approves and publishes the official result; the
 *    published per-athlete and per-team totals (including per-round totals)
 *    match the submitted strokes exactly.
 * 4. A SIGNED-OUT browser sees the published result and season standings
 *    reflecting the event exactly once, with matching totals.
 *
 * Run via `npm run test:e2e` (the orchestrator runs every *.spec.mjs).
 */
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_E2E_APP_URL;
const MAILPIT = process.env.FLIHUB_E2E_MAILPIT_URL;
const PB = process.env.FLIHUB_E2E_PB_URL;
if (!APP || !MAILPIT || !PB) {
	throw new Error('Run via `npm run test:e2e` (tests/e2e/run-e2e.mjs sets the env).');
}

const PASS = 'e2e-password-123';
const ts = Date.now();
const OWNER = { name: 'Demo Owner', email: `e2e-demo-owner-${ts}@example.com` };
const SCOREKEEPER = { name: 'Demo Keeper', email: `e2e-demo-keeper-${ts}@example.com` };
const SLUG = `fli-demo-${ts.toString(36)}`;

function expect(cond, label) {
	if (!cond) throw new Error(`E2E assertion failed: ${label}`);
	console.log(`  ✓ ${label}`);
}

async function verificationToken(email) {
	for (let i = 0; i < 40; i++) {
		const list = await fetch(`${MAILPIT}/api/v1/messages?limit=50`).then((r) => r.json());
		const msg = (list.messages ?? [])
			.filter((m) => (m.To ?? []).some((t) => t.Address === email))
			.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
		if (msg) {
			const full = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
			const match = `${full.HTML ?? ''}\n${full.Text ?? ''}`.match(
				/verify-email\/([A-Za-z0-9_.-]+)/
			);
			if (match) return match[1];
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`No verification email for ${email}`);
}

async function api(pathname, { method = 'POST', body, token } = {}) {
	const res = await fetch(`${PB}${pathname}`, {
		method,
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new Error(`API ${method} ${pathname} failed: ${res.status} ${JSON.stringify(data)}`);
	return data;
}

async function registerVerified(person) {
	await api('/api/collections/users/records', {
		body: { email: person.email, password: PASS, passwordConfirm: PASS, name: person.name }
	});
	await api('/api/collections/users/request-verification', { body: { email: person.email } });
	const token = await verificationToken(person.email);
	await api('/api/collections/users/confirm-verification', { body: { token } });
	return api('/api/collections/users/auth-with-password', {
		body: { identity: person.email, password: PASS }
	});
}

/** Deterministic varied strokes (2–5) so published totals are checkable. */
function strokesFor(athleteIndex, holeNumber, roundNumber) {
	return 2 + ((athleteIndex + holeNumber + roundNumber) % 4);
}

const browser = await chromium.launch();
try {
	console.log('Step 1: seed the EXACT Phase 1F six-group demo fixture (fictional data)');
	const owner = await registerVerified(OWNER);
	const keeper = await registerVerified(SCOREKEEPER);
	const T = owner.token;
	const org = await api('/api/flihub/organizations', {
		token: T,
		body: {
			name: 'FLI Disc Golf',
			template: 'custom',
			capabilities: [
				'athletes',
				'teams',
				'leagues-seasons',
				'events',
				'venues-courses',
				'scoring-results',
				'standings'
			]
		}
	});
	const invite = await api('/api/flihub/invitations', {
		token: T,
		body: { organization: org.id, email: SCOREKEEPER.email, role: 'scorekeeper' }
	});
	await api('/api/flihub/invitations/accept', {
		token: keeper.token,
		body: { token: invite.token }
	});
	const record = (collection, body, token = T) =>
		api(`/api/collections/${collection}/records`, {
			token,
			body: { organization: org.id, ...body }
		});
	const list = async (collection, filter, token = T) =>
		api(`/api/collections/${collection}/records?perPage=500&filter=${encodeURIComponent(filter)}`, {
			method: 'GET',
			token
		});

	const league = await record('leagues', { name: 'FLI League', status: 'active' });
	const season = await record('seasons', {
		league: league.id,
		name: 'Demo Season',
		status: 'active'
	});
	const event = await record('events', {
		season: season.id,
		name: 'FLI Demonstration Event',
		status: 'planned'
	});
	// 12 teams, each with one male and one female rostered athlete.
	const entries = [];
	const rosterByEntry = new Map();
	const athleteIndex = new Map(); // athlete id -> deterministic stroke index
	const athleteName = new Map();
	const teamNameByEntry = new Map();
	let nextAthleteIndex = 0;
	for (let i = 1; i <= 12; i++) {
		const team = await record('teams', {
			name: `Team ${String(i).padStart(2, '0')}`,
			status: 'active'
		});
		const entry = await record('season_entries', {
			season: season.id,
			team: team.id,
			status: 'active'
		});
		teamNameByEntry.set(entry.id, team.name);
		const male = await record('athletes', {
			firstName: `Marcus${i}`,
			lastName: 'Demo',
			gender: 'male',
			status: 'active'
		});
		const female = await record('athletes', {
			firstName: `Fiona${i}`,
			lastName: 'Demo',
			gender: 'female',
			status: 'active'
		});
		for (const athlete of [male, female]) {
			await record('roster_memberships', {
				entry: entry.id,
				athlete: athlete.id,
				status: 'active'
			});
			athleteIndex.set(athlete.id, nextAthleteIndex++);
			athleteName.set(athlete.id, `${athlete.firstName} ${athlete.lastName}`);
		}
		entries.push(entry);
		rosterByEntry.set(entry.id, [male, female]);
	}
	// Separate reserve pools (documented demo setup).
	const malePool = await record('reserve_pools', {
		season: season.id,
		name: "Men's Reserve",
		gender: 'male',
		status: 'active'
	});
	const femalePool = await record('reserve_pools', {
		season: season.id,
		name: "Women's Reserve",
		gender: 'female',
		status: 'active'
	});
	const maleReserve = await record('athletes', {
		firstName: 'Reserve',
		lastName: 'Marcus',
		gender: 'male',
		status: 'active'
	});
	const femaleReserve = await record('athletes', {
		firstName: 'Reserve',
		lastName: 'Fiona',
		gender: 'female',
		status: 'active'
	});
	await record('reserve_members', { pool: malePool.id, athlete: maleReserve.id, status: 'active' });
	await record('reserve_members', {
		pool: femalePool.id,
		athlete: femaleReserve.id,
		status: 'active'
	});
	// ONE course, nine par-3 hole records, red + blue positions, hole 8 named
	// with the demo placeholder.
	const course = await record('courses', { name: 'FLI Nine', status: 'active' });
	const demoHoleNames = [
		'The Willow',
		'Long Meadow',
		'Twin Pines',
		'The Crossing',
		'Osprey Point',
		'The Hollow',
		'Cedar Gap',
		'Hole 8 (demo name — final content TBD)',
		'Home Stretch'
	];
	const holes = [];
	for (let i = 1; i <= 9; i++) {
		const hole = await record('course_holes', {
			course: course.id,
			number: i,
			name: demoHoleNames[i - 1],
			par: 3,
			status: 'active'
		});
		await record('hole_positions', {
			hole: hole.id,
			label: 'red',
			distance: 225 + i * 8,
			unit: 'feet',
			status: 'active'
		});
		await record('hole_positions', {
			hole: hole.id,
			label: 'blue',
			distance: 300 + i * 12,
			unit: 'feet',
			status: 'active'
		});
		holes.push(hole);
	}
	// Red round, intermission, Blue round replaying the same nine holes.
	const rounds = [];
	rounds.push(
		await record('rounds', {
			event: event.id,
			number: 1,
			name: 'Round one',
			course: course.id,
			positionLabel: 'red',
			status: 'active'
		})
	);
	rounds.push(
		await record('rounds', {
			event: event.id,
			number: 2,
			name: 'Round two',
			course: course.id,
			positionLabel: 'blue',
			status: 'active'
		})
	);
	// Six groups of two teams and four athletes, scorekeeper assigned to each.
	const groups = [];
	for (let g = 0; g < 6; g++) {
		const group = await record('event_groups', {
			event: event.id,
			name: `Group ${g + 1}`,
			scorekeeper: keeper.record.id,
			status: 'active'
		});
		const groupEntries = [entries[g * 2], entries[g * 2 + 1]];
		for (const entry of groupEntries) {
			await record('group_teams', { group: group.id, entry: entry.id, status: 'active' });
			for (const athlete of rosterByEntry.get(entry.id)) {
				await record('group_athletes', {
					group: group.id,
					entry: entry.id,
					athlete: athlete.id,
					status: 'active'
				});
			}
		}
		groups.push({ group, groupEntries });
	}
	expect(true, 'seeded: 12 teams, 24 rostered athletes, reserves, 9 holes, 2 rounds, 6 groups');

	console.log('Step 2: the assigned scorekeeper scores and submits all 12 scorecards');
	for (const round of rounds) {
		for (const { group, groupEntries } of groups) {
			const card = await record('scorecards', { round: round.id, group: group.id }, keeper.token);
			for (const entry of groupEntries) {
				for (const athlete of rosterByEntry.get(entry.id)) {
					for (const hole of holes) {
						await record(
							'scores',
							{
								scorecard: card.id,
								athlete: athlete.id,
								hole: hole.id,
								strokes: strokesFor(athleteIndex.get(athlete.id), hole.number, round.number)
							},
							keeper.token
						);
					}
				}
			}
			await api(`/api/collections/scorecards/records/${card.id}`, {
				method: 'PATCH',
				token: keeper.token,
				body: { status: 'submitted' }
			});
		}
	}
	const cards = await list('scorecards', `event = "${event.id}"`);
	expect(cards.totalItems === 12, 'exactly 12 scorecards exist (6 groups × 2 rounds)');
	expect(
		cards.items.every((c) => c.status === 'submitted'),
		'all 12 scorecards are submitted'
	);
	expect(
		cards.items.every((c) => c.submittedBy === keeper.record.id),
		'every scorecard was submitted by the assigned scorekeeper'
	);

	console.log('Step 3: every athlete has 9 scores per nine-hole round (432 total)');
	const allScores = await api(
		`/api/collections/scores/records?perPage=500&filter=${encodeURIComponent(
			`event = "${event.id}"`
		)}`,
		{ method: 'GET', token: T }
	);
	expect(allScores.totalItems === 432, '432 scores exist (24 athletes × 2 rounds × 9 holes)');
	const perAthleteRound = new Map();
	for (const s of allScores.items) {
		const key = `${s.athlete}|${s.round}`;
		perAthleteRound.set(key, (perAthleteRound.get(key) ?? 0) + 1);
	}
	expect(
		[...athleteIndex.keys()].every((athleteId) =>
			rounds.every((round) => perAthleteRound.get(`${athleteId}|${round.id}`) === 9)
		),
		'each of the 24 athletes has exactly 9 scores in each of the two rounds'
	);

	console.log('Step 4: Owner approves and publishes; published totals match the submitted scores');
	const result = await record('event_results', { event: event.id });
	const published = await api(`/api/collections/event_results/records/${result.id}`, {
		method: 'PATCH',
		token: T,
		body: { status: 'published' }
	});
	expect(published.publishedVersion === 1, 'official result published as v1');
	const versions = await list('result_versions', `result = "${result.id}"`);
	const totals = versions.items[0].totals;
	expect(totals.rounds.length === 2, 'published totals cover both rounds');
	expect(totals.athletes.length === 24, 'published totals cover all 24 athletes');
	expect(totals.teams.length === 12, 'published totals cover all 12 teams');
	// Expected values recomputed independently from the deterministic strokes.
	const expectedAthleteRound = (athleteId, roundNumber) => {
		let sum = 0;
		for (let hole = 1; hole <= 9; hole++) {
			sum += strokesFor(athleteIndex.get(athleteId), hole, roundNumber);
		}
		return sum;
	};
	const roundNumberById = new Map(rounds.map((r) => [r.id, r.number]));
	let athleteRowsChecked = 0;
	for (const row of totals.athletes) {
		const r1 = expectedAthleteRound(row.athlete, 1);
		const r2 = expectedAthleteRound(row.athlete, 2);
		const expectedTotal = r1 + r2;
		if (row.total !== expectedTotal) {
			throw new Error(
				`published athlete total mismatch for ${row.athleteName}: ${row.total} != ${expectedTotal}`
			);
		}
		for (const [roundId, strokes] of Object.entries(row.roundTotals)) {
			const expectedRound = roundNumberById.get(roundId) === 1 ? r1 : r2;
			if (strokes !== expectedRound) {
				throw new Error(
					`published round total mismatch for ${row.athleteName} round ${roundNumberById.get(roundId)}: ${strokes} != ${expectedRound}`
				);
			}
		}
		athleteRowsChecked += 1;
	}
	expect(
		athleteRowsChecked === 24,
		'all 24 published athlete totals (and per-round totals) match the submitted scores'
	);
	const expectedTeamTotal = new Map();
	for (const entry of entries) {
		const [a, b] = rosterByEntry.get(entry.id);
		expectedTeamTotal.set(
			entry.id,
			expectedAthleteRound(a.id, 1) +
				expectedAthleteRound(a.id, 2) +
				expectedAthleteRound(b.id, 1) +
				expectedAthleteRound(b.id, 2)
		);
	}
	let teamRowsChecked = 0;
	for (const row of totals.teams) {
		if (row.total !== expectedTeamTotal.get(row.entry)) {
			throw new Error(
				`published team total mismatch for ${row.teamName}: ${row.total} != ${expectedTeamTotal.get(row.entry)}`
			);
		}
		teamRowsChecked += 1;
	}
	expect(teamRowsChecked === 12, 'all 12 published team totals match the submitted scores');

	console.log('Step 5: a signed-out browser sees the published result and standings exactly once');
	await api(`/api/collections/events/records/${event.id}`, {
		method: 'PATCH',
		token: T,
		body: { publicPublished: true }
	});
	await api(`/api/flihub/organizations/${org.id}/public-page`, {
		token: T,
		body: { slug: SLUG, published: true }
	});
	const payload = await fetch(`${PB}/api/flihub/public/${SLUG}`).then((r) => r.json());
	expect(
		payload.results.length === 1 && payload.results[0].eventName === 'FLI Demonstration Event',
		'public payload contains the published result exactly once'
	);
	expect(
		payload.standings.length === 1 && payload.standings[0].events.length === 1,
		'public standings count the event exactly once'
	);
	const expectedRanking = [...expectedTeamTotal.entries()]
		.map(([entry, total]) => ({ name: teamNameByEntry.get(entry), total }))
		.sort((a, b) => a.total - b.total);
	const publicTeams = payload.standings[0].teams;
	expect(
		publicTeams.length === 12 && publicTeams.every((t) => t.rank !== null && t.played === 1),
		'all 12 teams are ranked with complete participation (1 of 1 event)'
	);
	expect(
		publicTeams[0].rank === 1 && publicTeams[0].total === expectedRanking[0].total,
		`standings leader total matches the submitted scores (${expectedRanking[0].total} strokes)`
	);
	expect(
		publicTeams.every((t) => expectedRanking.find((e) => e.name === t.name)?.total === t.total),
		'every public standings team total matches the submitted scores'
	);
	expect(payload.standings[0].athletes.length === 24, 'public standings list all 24 athletes');

	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page = await ctx.newPage();
	page.setDefaultTimeout(15000);
	await page.goto(`${APP}/o/${SLUG}`);
	await page.waitForSelector('[data-testid="public-page"]');
	const header = (await page.locator('header').allInnerTexts()).join('\n');
	expect(header.includes('Sign in'), 'the browser context is signed out');
	expect(
		(await page.locator('[data-testid="public-result"]').count()) === 1,
		'the rendered page shows exactly one published result card'
	);
	expect(
		(await page.locator('[data-testid="public-standings-table"]').count()) === 1,
		'the rendered page shows exactly one standings table'
	);
	const standingsText = (
		await page.locator('[data-testid="public-standings-teams"]').innerText()
	).replace(/\s+/g, ' ');
	expect(
		standingsText.includes(`1 ${publicTeams[0].name} 1 of 1 ${publicTeams[0].total}`),
		'the rendered standings leader row matches the published payload and submitted scores'
	);
	expect(
		(await page.locator('[data-testid="public-standings-teams"] tbody tr').count()) === 12,
		'the rendered standings list all 12 teams'
	);
	expect(
		(await page.locator('[data-testid="public-result-athletes"] tbody tr').count()) === 24,
		'the rendered result lists all 24 athletes'
	);
	const resultTeamsText = (
		await page.locator('[data-testid="public-result-teams"]').innerText()
	).replace(/\s+/g, ' ');
	expect(
		resultTeamsText.includes(`${expectedRanking[0].name} ${expectedRanking[0].total}`),
		'the rendered result team totals match the submitted scores'
	);
	await page.screenshot({ path: 'tests/e2e/output/demo-sixgroup-public.png', fullPage: true });
	await ctx.close();

	console.log('Six-group demonstration verification: all steps passed');
	await browser.close();
	process.exit(0);
} catch (err) {
	console.error(err);
	await browser.close();
	process.exit(1);
}
