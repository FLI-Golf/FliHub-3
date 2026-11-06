/**
 * Phase 1G browser acceptance flow: mobile scorekeeping (D15) on the
 * disposable preview stack — a phone-sized scorecard resolved from the
 * verified 1F setup (event, rounds with derived hole counts, groups, teams,
 * athletes), per-athlete stroke entry with draft save/resume, missing-never-
 * zero submission blocking, a labeled demo-fill control, the Draft →
 * Submitted lifecycle with Owner/Admin reopen preserving values, event-wide
 * cross-group entry for an assigned scorekeeper, the Viewer-as-scorekeeper
 * distinction, continued display numbering (10–18) keyed to physical holes,
 * and a single-round event with no intermission.
 *
 * Run via `npm run test:e2e` (the orchestrator runs every *.spec.mjs in order).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_E2E_APP_URL;
const MAILPIT = process.env.FLIHUB_E2E_MAILPIT_URL;
const PB = process.env.FLIHUB_E2E_PB_URL;
if (!APP || !MAILPIT || !PB) {
	throw new Error('Run via `npm run test:e2e` (tests/e2e/run-e2e.mjs sets the env).');
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
const PASS = 'e2e-password-123';
const ts = Date.now();
const OWNER = { name: 'G Owner', email: `e2e-g-owner-${ts}@example.com` };
const KEEPER = { name: 'G Keeper', email: `e2e-g-keeper-${ts}@example.com` };
const VIEWER = { name: 'G Viewer', email: `e2e-g-viewer-${ts}@example.com` };

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

async function signIn(ctx, person) {
	const page = await ctx.newPage();
	page.setDefaultTimeout(10000);
	await page.goto(`${APP}/login`);
	await page.fill('input[name="email"]', person.email);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/organizations/, { timeout: 15000 });
	return page;
}

const browser = await chromium.launch();
try {
	console.log('Step 1: seed the verified 1F setup off-screen (fictional data)');
	const owner = await registerVerified(OWNER);
	const keeper = await registerVerified(KEEPER);
	const viewer = await registerVerified(VIEWER);
	const org = await api('/api/flihub/organizations', {
		token: owner.token,
		body: {
			name: 'G Scoring Org',
			template: 'custom',
			capabilities: [
				'athletes',
				'teams',
				'leagues-seasons',
				'events',
				'venues-courses',
				'scoring-results'
			]
		}
	});
	for (const [person, auth, role] of [
		[KEEPER, keeper, 'scorekeeper'],
		[VIEWER, viewer, 'viewer']
	]) {
		const invite = await api('/api/flihub/invitations', {
			token: owner.token,
			body: { organization: org.id, email: person.email, role }
		});
		await api('/api/flihub/invitations/accept', {
			token: auth.token,
			body: { token: invite.token }
		});
	}
	const record = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			token: owner.token,
			body: { organization: org.id, ...body }
		});
	const league = await record('leagues', { name: 'Harbor League', status: 'active' });
	const season = await record('seasons', {
		league: league.id,
		name: 'Summer 2026',
		status: 'active'
	});
	const course = await record('courses', { name: 'Lakeside Nine', status: 'active' });
	const holes = [];
	for (let i = 1; i <= 9; i++) {
		const hole = await record('course_holes', {
			course: course.id,
			number: i,
			name: `Hole ${i}`,
			par: 3,
			status: 'active'
		});
		await record('hole_positions', {
			hole: hole.id,
			label: 'red',
			distance: 230 + i * 8,
			unit: 'feet',
			status: 'active'
		});
		await record('hole_positions', {
			hole: hole.id,
			label: 'blue',
			distance: 300 + i * 10,
			unit: 'feet',
			status: 'active'
		});
		holes.push(hole);
	}
	const mkTeam = async (name, people) => {
		const team = await record('teams', { name, status: 'active' });
		const entry = await record('season_entries', {
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const athletes = [];
		for (const [first, last, gender] of people) {
			const athlete = await record('athletes', {
				firstName: first,
				lastName: last,
				gender,
				status: 'active'
			});
			await record('roster_memberships', {
				entry: entry.id,
				athlete: athlete.id,
				status: 'active'
			});
			athletes.push(athlete);
		}
		return { entry, athletes };
	};
	const t1 = await mkTeam('Blue Heron Flyers', [
		['Ava', 'Stone', 'female'],
		['Sam', 'Finch', 'male']
	]);
	const t2 = await mkTeam('Cedar Hawks', [
		['Mia', 'Calder', 'female'],
		['Leo', 'Park', 'male']
	]);
	const t3 = await mkTeam('River Otters', [
		['Nora', 'Vale', 'female'],
		['Eli', 'Brook', 'male']
	]);
	const demoEvent = await record('events', {
		season: season.id,
		name: 'FLI Demonstration Event',
		status: 'planned'
	});
	const round1 = await record('rounds', {
		event: demoEvent.id,
		number: 1,
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});
	const round2 = await record('rounds', {
		event: demoEvent.id,
		number: 2,
		course: course.id,
		positionLabel: 'blue',
		status: 'active'
	});
	const groupOne = await record('event_groups', {
		event: demoEvent.id,
		name: 'Group 1',
		scorekeeper: keeper.record.id,
		status: 'active'
	});
	const groupTwo = await record('event_groups', {
		event: demoEvent.id,
		name: 'Group 2',
		scorekeeper: viewer.record.id,
		status: 'active'
	});
	for (const [group, teams] of [
		[groupOne, [t1, t2]],
		[groupTwo, [t3]]
	]) {
		for (const team of teams) {
			await record('group_teams', { group: group.id, entry: team.entry.id, status: 'active' });
			for (const athlete of team.athletes) {
				await record('group_athletes', {
					group: group.id,
					entry: team.entry.id,
					athlete: athlete.id,
					status: 'active'
				});
			}
		}
	}
	const clubNight = await record('events', {
		season: season.id,
		name: 'Club Night',
		status: 'planned'
	});
	await record('rounds', {
		event: clubNight.id,
		number: 1,
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});
	const clubGroup = await record('event_groups', {
		event: clubNight.id,
		name: 'Group 1',
		scorekeeper: keeper.record.id,
		status: 'active'
	});
	await record('group_teams', { group: clubGroup.id, entry: t1.entry.id, status: 'active' });
	for (const athlete of t1.athletes) {
		await record('group_athletes', {
			group: clubGroup.id,
			entry: t1.entry.id,
			athlete: athlete.id,
			status: 'active'
		});
	}
	const scoreUrl = `${APP}/organizations/${org.id}/events/${demoEvent.id}/score`;
	expect(true, '1F fixture ready: course, rounds, staffed groups, scorekeeper + viewer members');

	console.log('Step 2: scorekeeper opens the phone scorecard');
	const ctxK = await browser.newContext({ viewport: { width: 375, height: 720 } });
	const k = await signIn(ctxK, KEEPER);
	await k.goto(scoreUrl);
	await k.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	const picker = await k.locator('[data-testid="round-picker"]').innerText();
	expect(
		picker.includes('Round 1 · 9 holes · red') &&
			picker.includes('— intermission —') &&
			picker.includes('Round 2 · 9 holes · blue'),
		'round picker shows Round 1 · 9 holes · Red, an intermission, Round 2 · 9 holes · Blue'
	);
	const main = await k.innerText('main');
	expect(
		main.includes('FLI Demonstration Event') &&
			main.includes('Group 1') &&
			main.includes('Blue Heron Flyers') &&
			main.includes('Ava'),
		'scorecard identifies the event, group, teams, and athletes from the 1F setup'
	);

	console.log('Step 3: draft entry, save and resume, missing-never-zero');
	const cell = (holeNo, athleteName) =>
		k.locator(`input[aria-label="Strokes for ${athleteName} on hole ${holeNo}"]`);
	await cell(1, 'Ava Stone').fill('3');
	await cell(1, 'Ava Stone').dispatchEvent('change');
	await k.waitForTimeout(1500);
	await k.goto(scoreUrl);
	await k.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	expect(
		(await cell(1, 'Ava Stone').inputValue()) === '3',
		'draft score persisted and resumed after a fresh page load'
	);
	const missingAlert = await k.locator('main').innerText();
	expect(
		/\d+ scores? missing/.test(missingAlert) && missingAlert.includes('never stored as zero'),
		'missing scores are visible and labeled never-zero'
	);
	expect(
		await k.locator('button:has-text("Submit scorecard")').isDisabled(),
		'submission is blocked while scores are missing'
	);

	console.log('Step 4: labeled demo fill, then submit');
	await k.click('button:has-text("Fill with demo scores (demo data")');
	await k.waitForFunction(() => !document.body.innerText.match(/\d+ scores? missing/), {
		timeout: 15000
	});
	expect(true, 'demo-fill control is explicitly labeled demo data and fills the draft');
	await k.click('button:has-text("Submit scorecard")');
	await k.waitForSelector('text=Submitted — locked', { timeout: 15000 });
	expect(
		(await k.locator('main').innerText()).includes('Submitted by G Keeper'),
		'submission records who submitted'
	);
	expect(
		(await k.$$('button:has-text("Reopen to draft")')).length === 0,
		'scorekeeper has no reopen control on a submitted card'
	);

	console.log('Step 5: cross-group entry within the assigned event');
	await k.click('button:has-text("Group 2")');
	await k.waitForSelector('text=River Otters', { timeout: 15000 });
	await cell(1, 'Nora Vale').fill('4');
	await cell(1, 'Nora Vale').dispatchEvent('change');
	await k.waitForTimeout(1500);
	await k.goto(scoreUrl);
	await k.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	await k.click('button:has-text("Group 2")');
	expect(
		(await cell(1, 'Nora Vale').inputValue()) === '4',
		'assigned scorekeeper enters scores for another group in the same event'
	);

	console.log('Step 6: second pass displays 10–18, keyed to round + physical hole');
	await k.click('button:has-text("Round 2")');
	await k.waitForSelector('text=Round 2 · Group', { timeout: 15000 });
	await k.click('button:has-text("Group 1")');
	const round2Text = await k.locator('main').innerText();
	expect(
		round2Text.includes('10') && round2Text.includes('18') && round2Text.includes('Hole 1'),
		'round 2 displays holes 10–18 while naming the physical holes'
	);
	await cell(10, 'Ava Stone').fill('5');
	await cell(10, 'Ava Stone').dispatchEvent('change');
	await k.waitForTimeout(1500);
	const stored = await api(
		`/api/collections/scores/records?perPage=5&filter=${encodeURIComponent(
			`round = "${round2.id}" && athlete = "${t1.athletes[0].id}"`
		)}`,
		{ method: 'GET', token: owner.token }
	);
	expect(
		stored.totalItems === 1 &&
			stored.items[0].hole === holes[0].id &&
			stored.items[0].round === round2.id &&
			stored.items[0].strokes === 5,
		'display hole 10 stored as (round 2, physical hole 1) — rounds never mix'
	);
	expect(
		(
			await api(
				`/api/collections/scores/records?perPage=5&filter=${encodeURIComponent(
					`round = "${round1.id}" && athlete = "${t1.athletes[0].id}" && hole = "${holes[0].id}"`
				)}`,
				{ method: 'GET', token: owner.token }
			)
		).items[0]?.strokes !== 5,
		'round 1 score on the same physical hole is unchanged'
	);

	console.log('Step 7: viewer is read-only even as a listed group scorekeeper');
	const ctxV = await browser.newContext({ viewport: { width: 375, height: 720 } });
	const v = await signIn(ctxV, VIEWER);
	await v.goto(scoreUrl);
	await v.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	const viewerText = await v.locator('main').innerText();
	expect(
		viewerText.includes('Read-only: score entry needs the Scorekeeper role'),
		'viewer sees the explicit read-only explanation'
	);
	expect(
		(await v.$$('input[name="strokes"]')).length === 0,
		'viewer gets no stroke inputs anywhere'
	);
	await v.click('button:has-text("Group 2")');
	expect(
		(await v.locator('main').innerText()).includes('no scoring access (Viewer role'),
		'the viewer-as-scorekeeper distinction is spelled out in the UI'
	);
	const denied = await v.evaluate(
		async ({ pbUrl, oid, token: tok, card }) => {
			const res = await fetch(`${pbUrl}/api/collections/scores/records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: tok },
				body: JSON.stringify({ organization: oid, scorecard: card, strokes: 3 })
			});
			return res.status;
		},
		{ pbUrl: PB, oid: org.id, token: viewer.token, card: stored.items[0].scorecard }
	);
	expect(denied === 400 || denied === 403, `viewer direct API score write denied (${denied})`);

	console.log('Step 8: owner reopens; values and history preserved');
	const ctxO = await browser.newContext({ viewport: { width: 768, height: 900 } });
	const o = await signIn(ctxO, OWNER);
	await o.goto(scoreUrl);
	await o.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	await o.fill('input[aria-label="Reason for reopening"]', 'Checking hole 2 entry');
	await o.click('button:has-text("Reopen to draft")');
	await o.waitForSelector('text=Draft', { timeout: 15000 });
	expect(
		(await o.locator('input[aria-label="Strokes for Ava Stone on hole 1"]').inputValue()) === '3',
		'reopened scorecard preserves the previously entered value'
	);
	const history = await o.locator('main').innerText();
	expect(
		history.includes('Change history') &&
			history.includes('G Keeper') &&
			history.includes('submitted') &&
			history.includes('reopened') &&
			history.includes('Checking hole 2 entry'),
		'change history shows authors and the required reopen reason'
	);

	console.log('Step 9: a single nine-hole round works with no intermission');
	await o.goto(`${APP}/organizations/${org.id}/events/${clubNight.id}/score`);
	await o.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	const singlePicker = await o.locator('[data-testid="round-picker"]').innerText();
	expect(
		singlePicker.includes('Round 1 · 9 holes · red') && !singlePicker.includes('intermission'),
		'single-round event shows one nine-hole round and no intermission'
	);

	console.log('Step 10: the Scoring capability page links to event scoring');
	await o.goto(`${APP}/organizations/${org.id}/cap/scoring-results`);
	await o.waitForSelector('text=Mobile scorekeeping', { timeout: 15000 });
	const capText = await o.locator('main').innerText();
	expect(
		capText.includes('FLI Demonstration Event') &&
			capText.includes('Open scoring') &&
			capText.includes('Phase 1H'),
		'scoring page lists ready events and keeps approval honestly in Phase 1H'
	);
	await k.screenshot({ path: path.join(OUT, '1g-phone-scorecard.png'), fullPage: true });

	console.log('Phase 1G browser acceptance: all steps passed');
} finally {
	await browser.close();
}
