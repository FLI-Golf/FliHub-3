/**
 * Phase 1I browser acceptance flow: organization publishing and public
 * competition standings on the disposable preview stack.
 *
 * An Owner reserves a slug, brands the page, publishes records and the page
 * itself through the management view; a SIGNED-OUT browser context then
 * verifies the hosted public page at /o/<slug> — branding, schedule,
 * standings, results, published team and athlete profile — and that private
 * athlete contact data, unpublished records, pending corrected versions, and
 * correction reasons appear neither in the rendered page nor in the raw
 * response payload. The D16 correction lifecycle is exercised end to end
 * (published v1 visible → pending v2 invisible → republished v2 replaces v1
 * with a Corrected badge), unpublish hides the page (404) without deleting
 * data, a Viewer sees the preview without management controls, and the
 * member standings capability page renders.
 *
 * Run via `npm run test:e2e` (the orchestrator runs every *.spec.mjs in order).
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
const OWNER = { name: 'I Owner', email: `e2e-i-owner-${ts}@example.com` };
const VIEWER = { name: 'I Viewer', email: `e2e-i-viewer-${ts}@example.com` };
const SLUG = `ie2e-club-${ts.toString(36)}`;
const SECRET_EMAIL = `secret-contact-${ts}@example.com`;
const REASON = 'Hole 1 recorded for the wrong athlete';

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
	console.log('Step 1: seed a season with a published official result (fictional data)');
	const owner = await registerVerified(OWNER);
	const viewer = await registerVerified(VIEWER);
	const org = await api('/api/flihub/organizations', {
		token: owner.token,
		body: {
			name: 'I Public Org',
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
		token: owner.token,
		body: { organization: org.id, email: VIEWER.email, role: 'viewer' }
	});
	await api('/api/flihub/invitations/accept', {
		token: viewer.token,
		body: { token: invite.token }
	});

	const record = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			token: owner.token,
			body: { organization: org.id, ...body }
		});
	const patch = (collection, id, body) =>
		api(`/api/collections/${collection}/records/${id}`, {
			method: 'PATCH',
			token: owner.token,
			body
		});
	const list = async (collection, filter) =>
		(
			await api(
				`/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`,
				{ method: 'GET', token: owner.token }
			)
		).items;

	const league = await record('leagues', { name: 'I League', status: 'active' });
	const season = await record('seasons', {
		league: league.id,
		name: 'I Season',
		status: 'active'
	});
	const course = await record('courses', { name: 'I Course', status: 'active' });
	const holes = [];
	for (let i = 1; i <= 2; i++) {
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
			distance: 250 + i,
			unit: 'feet',
			status: 'active'
		});
		holes.push(hole);
	}
	const mkTeam = async (name, specs) => {
		const team = await record('teams', { name, status: 'active' });
		const entry = await record('season_entries', {
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const athletes = [];
		for (const [firstName, gender] of specs) {
			const athlete = await record('athletes', {
				firstName,
				lastName: 'IDemo',
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
		return { team, entry, athletes };
	};
	const teamOne = await mkTeam('I Throwers', [
		['Ava', 'female'],
		['Ben', 'male']
	]);
	const teamTwo = await mkTeam('I Chasers', [['Cal', 'male']]);
	// Private contact data that must never surface publicly.
	await record('athlete_private', {
		athlete: teamOne.athletes[0].id,
		email: SECRET_EMAIL,
		phone: '555-0100',
		eligibilityNotes: 'confidential-note'
	});

	const event = await record('events', {
		season: season.id,
		name: 'I Open 2026',
		status: 'completed',
		startsAt: '2026-11-01 10:00:00'
	});
	const rounds = [];
	for (let number = 1; number <= 2; number++) {
		rounds.push(
			await record('rounds', {
				event: event.id,
				number,
				course: course.id,
				positionLabel: 'red',
				status: 'active'
			})
		);
	}
	const groups = [];
	for (const [name, teamFixture] of [
		['Group 1', teamOne],
		['Group 2', teamTwo]
	]) {
		const group = await record('event_groups', { event: event.id, name, status: 'active' });
		await record('group_teams', { group: group.id, entry: teamFixture.entry.id, status: 'active' });
		for (const athlete of teamFixture.athletes) {
			await record('group_athletes', {
				group: group.id,
				entry: teamFixture.entry.id,
				athlete: athlete.id,
				status: 'active'
			});
		}
		groups.push({ group, teamFixture });
	}
	for (const round of rounds) {
		for (const { group, teamFixture } of groups) {
			const card = await record('scorecards', { round: round.id, group: group.id });
			for (const athlete of teamFixture.athletes) {
				for (const hole of holes) {
					await record('scores', {
						scorecard: card.id,
						athlete: athlete.id,
						hole: hole.id,
						strokes: 3
					});
				}
			}
			await patch('scorecards', card.id, { status: 'submitted' });
		}
	}
	// Approve and publish v1 (team totals: Throwers 24, Chasers 12 — all at par).
	const result = await record('event_results', { event: event.id });
	await patch('event_results', result.id, { status: 'published' });
	expect(true, 'seeded season, event, and published official result v1');

	console.log('Step 2: owner manages the public page (slug, branding, per-record publication)');
	const ctxOwner = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const o = await signIn(ctxOwner, OWNER);
	await o.goto(`${APP}/organizations/${org.id}/public`);
	await o.waitForSelector('[data-testid="branding-settings"]');
	expect(
		await o.isVisible('[data-testid="public-preview"]'),
		'owner sees the preview before publishing'
	);
	await o.fill('[data-testid="slug-input"]', SLUG);
	await o.fill('[data-testid="tagline-input"]', 'Fairways and chains');
	await o.click('[data-testid="save-branding"]');
	await o.waitForSelector(`text=${SLUG}`);
	expect(true, 'slug reserved and branding saved');

	// Publish the event, one team, and one athlete profile (per-record publication).
	await o
		.locator('[data-testid="event-toggle"]', { hasText: 'I Open 2026' })
		.locator('button')
		.click();
	await o.waitForSelector('[data-testid="event-toggle"] >> text=Public — unpublish');
	await o
		.locator('[data-testid="team-toggle"]', { hasText: 'I Throwers' })
		.locator('button')
		.click();
	await o.waitForSelector('[data-testid="team-toggle"] >> text=Public — unpublish');
	await o.locator('[data-testid="athlete-toggle"]', { hasText: 'Ava' }).locator('button').click();
	await o.waitForSelector('[data-testid="athlete-toggle"] >> text=Public — unpublish');
	expect(true, 'event, team, and one athlete profile published per-record');

	// The page itself is still hidden from visitors until the explicit publish.
	const hiddenStatus = await fetch(`${APP}/o/${SLUG}`).then((r) => r.status);
	expect(hiddenStatus === 404, 'page hidden (404) before the explicit publish action');

	await o.click('[data-testid="publish-button"]');
	await o.waitForSelector('[data-testid="unpublish-button"]');
	expect(true, 'page published from the management view');

	console.log('Step 3: a signed-out visitor reads the public page');
	const ctxAnon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const a = await ctxAnon.newPage();
	a.setDefaultTimeout(10000);
	await a.goto(`${APP}/o/${SLUG}`);
	await a.waitForSelector('[data-testid="public-page"]');
	const anonNav = (await a.locator('header').allInnerTexts()).join('\n');
	expect(anonNav.includes('Sign in'), 'visitor context is signed out');
	expect(
		(await a.locator('[data-testid="public-org-name"]').innerText()).includes('I Public Org'),
		'organization branding (name) renders'
	);
	expect(
		(await a.locator('[data-testid="public-org-tagline"]').innerText()).includes(
			'Fairways and chains'
		),
		'tagline renders'
	);
	const scheduleText = await a.locator('[data-testid="public-schedule"]').innerText();
	expect(scheduleText.includes('I Open 2026'), 'published event appears in the schedule');
	const standingsText = await a.locator('[data-testid="public-standings"]').innerText();
	expect(standingsText.includes('I Throwers'), 'standings show the teams');
	expect(standingsText.includes('24'), 'standings show the published v1 team total');
	expect(standingsText.includes('E'), 'at-par totals display as E');
	const resultsText = await a.locator('[data-testid="public-results"]').innerText();
	expect(resultsText.includes('I Open 2026'), 'published result renders');
	expect(!resultsText.includes('Corrected'), 'v1 carries no correction indicator');
	const teamsText = await a.locator('[data-testid="public-teams"]').innerText();
	expect(teamsText.includes('I Throwers'), 'published team listed');
	expect(!teamsText.includes('I Chasers'), 'unpublished team absent from the teams section');
	const athletesText = await a.locator('[data-testid="public-athletes"]').innerText();
	expect(athletesText.includes('Ava'), 'published athlete profile listed');
	expect(!athletesText.includes('Ben'), 'unpublished athlete profile absent');
	const html = await a.content();
	expect(!html.includes(SECRET_EMAIL), 'private athlete email absent from the rendered page');
	expect(!html.includes('555-0100'), 'private athlete phone absent from the rendered page');
	expect(!html.includes('confidential-note'), 'private eligibility notes absent');
	await a.screenshot({ path: 'tests/e2e/output/1i-public-page.png', fullPage: true });

	// The raw response payload is equally clean.
	const payload = await fetch(`${PB}/api/flihub/public/${SLUG}`).then((r) => r.json());
	const rawPayload = JSON.stringify(payload);
	expect(!rawPayload.includes(SECRET_EMAIL), 'private email absent from the response payload');
	expect(!rawPayload.includes('capabilities'), 'internal configuration absent from the payload');
	expect(
		payload.athletes.length === 1 &&
			Object.keys(payload.athletes[0]).sort().join(',') === 'displayName,gender,nationality',
		'payload athlete profiles expose exactly the D11 display fields'
	);
	const unknownStatus = await fetch(`${APP}/o/definitely-not-${ts}`).then((r) => r.status);
	expect(unknownStatus === 404, 'unknown slugs are 404');

	console.log('Step 4: D16 correction lifecycle on the public surface');
	// Reopen with a reason, correct Ava's hole 1 in round 1 (3 → 5), reapprove.
	await patch('event_results', result.id, { status: 'correcting', reason: REASON });
	const cards = await list(
		'scorecards',
		`event = "${event.id}" && round = "${rounds[0].id}" && group = "${groups[0].group.id}"`
	);
	await patch('scorecards', cards[0].id, { status: 'draft', reason: 'fix hole 1' });
	const scores = await list(
		'scores',
		`scorecard = "${cards[0].id}" && athlete = "${teamOne.athletes[0].id}" && hole = "${holes[0].id}"`
	);
	await patch('scores', scores[0].id, { strokes: 5 });
	await patch('scorecards', cards[0].id, { status: 'submitted' });
	await patch('event_results', result.id, { status: 'approved' }); // v2 — approved, NOT published

	await a.reload();
	await a.waitForSelector('[data-testid="public-standings"]');
	const pendingStandings = await a.locator('[data-testid="public-standings"]').innerText();
	expect(pendingStandings.includes('24'), 'pending v2 leaves the public standings at v1 (24)');
	expect(!pendingStandings.includes('26'), 'pending v2 totals are invisible to visitors');
	expect(
		!(await a.locator('[data-testid="public-results"]').innerText()).includes('Corrected'),
		'no correction indicator while v2 is unpublished'
	);

	await patch('event_results', result.id, { status: 'published' }); // v2 official
	await a.reload();
	await a.waitForSelector('[data-testid="public-standings"]');
	const correctedStandings = await a.locator('[data-testid="public-standings"]').innerText();
	expect(correctedStandings.includes('26'), 'republished v2 replaces the total (26, counted once)');
	expect(!correctedStandings.includes('50'), 'v1 and v2 are never summed');
	expect(
		(await a.locator('[data-testid="corrected-badge"]').innerText()).includes('Corrected'),
		'corrected results carry the Corrected badge'
	);
	const correctedHtml = await a.content();
	expect(!correctedHtml.includes(REASON), 'the correction reason stays private');
	await a.screenshot({ path: 'tests/e2e/output/1i-public-corrected.png', fullPage: true });

	console.log('Step 5: unpublish hides the page without deleting data');
	await o.reload();
	await o.click('[data-testid="unpublish-button"]');
	await o.waitForSelector('[data-testid="publish-button"]');
	const goneStatus = await fetch(`${APP}/o/${SLUG}`).then((r) => r.status);
	expect(goneStatus === 404, 'unpublished page serves 404 to visitors');
	// Data survives: the owner's preview still shows the result.
	await o.waitForSelector('[data-testid="public-preview"]');
	const previewText = await o.locator('[data-testid="public-preview"]').innerText();
	expect(previewText.includes('I Open 2026'), 'unpublish deleted nothing (preview intact)');

	console.log('Step 6: viewer sees the preview but no management controls; member standings page');
	const ctxViewer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const v = await signIn(ctxViewer, VIEWER);
	await v.goto(`${APP}/organizations/${org.id}/public`);
	await v.waitForSelector('[data-testid="public-preview"]');
	expect(
		!(await v.isVisible('[data-testid="branding-settings"]')),
		'viewer has no branding controls'
	);
	expect(!(await v.isVisible('[data-testid="publish-button"]')), 'viewer cannot publish');
	await v.goto(`${APP}/organizations/${org.id}/cap/standings`);
	await v.waitForSelector('[data-testid="member-standings"]');
	const memberStandings = await v.locator('[data-testid="member-standings"]').innerText();
	expect(
		memberStandings.includes('I Throwers') && memberStandings.includes('26'),
		'member standings page shows the corrected published totals'
	);
	await v.screenshot({ path: 'tests/e2e/output/1i-member-standings.png', fullPage: true });

	console.log('Step 7: D17 completeness ranking rendered for a signed-out visitor');
	// Fresh one-athlete-team org mirroring the integration regression: Solo A
	// plays event 1 only, Solo B plays both (everyone at par: 12 per event).
	const rankOrg = await api('/api/flihub/organizations', {
		token: owner.token,
		body: {
			name: 'I Rank Org',
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
	const rec = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			token: owner.token,
			body: { organization: rankOrg.id, ...body }
		});
	const rankLeague = await rec('leagues', { name: 'Rank League', status: 'active' });
	const rankSeason = await rec('seasons', {
		league: rankLeague.id,
		name: 'Rank Season',
		status: 'active'
	});
	const rankCourse = await rec('courses', { name: 'Rank Course', status: 'active' });
	const rankHoles = [];
	for (let i = 1; i <= 2; i++) {
		const hole = await rec('course_holes', {
			course: rankCourse.id,
			number: i,
			name: `Hole ${i}`,
			par: 3,
			status: 'active'
		});
		await rec('hole_positions', {
			hole: hole.id,
			label: 'red',
			distance: 250 + i,
			unit: 'feet',
			status: 'active'
		});
		rankHoles.push(hole);
	}
	const mkSolo = async (name, firstName) => {
		const team = await rec('teams', { name, status: 'active' });
		const entry = await rec('season_entries', {
			season: rankSeason.id,
			team: team.id,
			status: 'active'
		});
		const athlete = await rec('athletes', {
			firstName,
			lastName: 'Rank',
			gender: 'female',
			status: 'active'
		});
		await rec('roster_memberships', { entry: entry.id, athlete: athlete.id, status: 'active' });
		return { team, entry, athlete };
	};
	const soloA = await mkSolo('Solo A', 'Alice');
	const soloB = await mkSolo('Solo B', 'Bree');
	const addGroupWithCards = async (eventId, eventRounds, t, groupName) => {
		const group = await rec('event_groups', { event: eventId, name: groupName, status: 'active' });
		await rec('group_teams', { group: group.id, entry: t.entry.id, status: 'active' });
		await rec('group_athletes', {
			group: group.id,
			entry: t.entry.id,
			athlete: t.athlete.id,
			status: 'active'
		});
		for (const round of eventRounds) {
			const card = await rec('scorecards', { round: round.id, group: group.id });
			for (const hole of rankHoles) {
				await rec('scores', {
					scorecard: card.id,
					athlete: t.athlete.id,
					hole: hole.id,
					strokes: 3
				});
			}
			await api(`/api/collections/scorecards/records/${card.id}`, {
				method: 'PATCH',
				token: owner.token,
				body: { status: 'submitted' }
			});
		}
	};
	const mkRankEvent = async (name, rankTeams, startsAt) => {
		const ev = await rec('events', {
			season: rankSeason.id,
			name,
			status: 'completed',
			startsAt
		});
		const eventRounds = [];
		for (let number = 1; number <= 2; number++) {
			eventRounds.push(
				await rec('rounds', {
					event: ev.id,
					number,
					course: rankCourse.id,
					positionLabel: 'red',
					status: 'active'
				})
			);
		}
		for (const t of rankTeams) {
			await addGroupWithCards(ev.id, eventRounds, t, `${name} ${t.team.name}`);
		}
		const evResult = await rec('event_results', { event: ev.id });
		await api(`/api/collections/event_results/records/${evResult.id}`, {
			method: 'PATCH',
			token: owner.token,
			body: { status: 'published' }
		});
		await api(`/api/collections/events/records/${ev.id}`, {
			method: 'PATCH',
			token: owner.token,
			body: { publicPublished: true }
		});
		return { ev, eventRounds, evResult };
	};
	await mkRankEvent('Rank E1', [soloA, soloB], '2026-11-01 09:00:00');
	const rankE2 = await mkRankEvent('Rank E2', [soloB], '2026-11-08 09:00:00');
	const rankSlug = `ie2e-rank-${ts.toString(36)}`;
	await api(`/api/flihub/organizations/${rankOrg.id}/public-page`, {
		token: owner.token,
		body: { slug: rankSlug, published: true }
	});

	// Before Solo A's second result: Unranked with "1 of 2" rendered.
	await a.goto(`${APP}/o/${rankSlug}`);
	await a.waitForSelector('[data-testid="public-standings-teams"]');
	const teamRow = (name) =>
		a.locator('[data-testid="public-standings-teams"] tbody tr', { hasText: name });
	let rowA = (await teamRow('Solo A').innerText()).replace(/\s+/g, ' ');
	let rowB = (await teamRow('Solo B').innerText()).replace(/\s+/g, ' ');
	expect(rowA.includes('Unranked'), 'Solo A renders as Unranked before its second result');
	expect(rowA.includes('1 of 2'), 'Solo A renders the "1 of 2" event count');
	expect(rowA.includes('12'), 'Solo A shows its 12 strokes (missing results add none)');
	expect(rowB.startsWith('1 '), 'Solo B renders rank 1 with complete participation');
	expect(rowB.includes('2 of 2'), 'Solo B renders the "2 of 2" event count');
	expect(rowB.includes('24'), 'Solo B shows its 24 strokes');
	await a.screenshot({ path: 'tests/e2e/output/1i-unranked.png', fullPage: true });

	// Publish Solo A's second result through the D16 correction window.
	await api(`/api/collections/event_results/records/${rankE2.evResult.id}`, {
		method: 'PATCH',
		token: owner.token,
		body: { status: 'correcting', reason: 'Solo A group was omitted' }
	});
	await addGroupWithCards(rankE2.ev.id, rankE2.eventRounds, soloA, 'Rank E2 Solo A');
	await api(`/api/collections/event_results/records/${rankE2.evResult.id}`, {
		method: 'PATCH',
		token: owner.token,
		body: { status: 'approved' }
	});
	await api(`/api/collections/event_results/records/${rankE2.evResult.id}`, {
		method: 'PATCH',
		token: owner.token,
		body: { status: 'published' }
	});

	// After publication: both teams share first place at 24.
	await a.reload();
	await a.waitForSelector('[data-testid="public-standings-teams"]');
	rowA = (await teamRow('Solo A').innerText()).replace(/\s+/g, ' ');
	rowB = (await teamRow('Solo B').innerText()).replace(/\s+/g, ' ');
	expect(!rowA.includes('Unranked'), 'Solo A is no longer Unranked');
	expect(rowA.startsWith('1 '), 'Solo A shares first place after its second result is published');
	expect(rowB.startsWith('1 '), 'Solo B keeps the shared first place');
	expect(rowA.includes('2 of 2') && rowA.includes('24'), 'Solo A renders 2 of 2 events at 24');
	expect(rowB.includes('2 of 2') && rowB.includes('24'), 'Solo B renders 2 of 2 events at 24');
	await a.screenshot({ path: 'tests/e2e/output/1i-shared-first.png', fullPage: true });

	console.log('Phase 1I browser acceptance: all steps passed');
	await browser.close();
	process.exit(0);
} catch (err) {
	console.error(err);
	await browser.close();
	process.exit(1);
}
