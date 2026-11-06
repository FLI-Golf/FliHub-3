/**
 * Phase 1H browser acceptance flow: official results and corrections (D16)
 * on the disposable preview stack — the FLI demo's submitted scorecards
 * reviewed and approved by an Owner, published, locked against scorecard
 * edits, reopened with a recorded correction reason, corrected through the
 * 1G scorecard flow, reapproved as version 2 (previous values, author,
 * timestamp, and reason preserved), and republished — with Viewer approval
 * denied in the UI and at the direct API, forged metadata rejected, and no
 * unpublish path.
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
const OWNER = { name: 'H Owner', email: `e2e-h-owner-${ts}@example.com` };
const KEEPER = { name: 'H Keeper', email: `e2e-h-keeper-${ts}@example.com` };
const VIEWER = { name: 'H Viewer', email: `e2e-h-viewer-${ts}@example.com` };

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

async function apiStatus(pathname, { method = 'POST', body, token } = {}) {
	const res = await fetch(`${PB}${pathname}`, {
		method,
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	return res.status;
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
	console.log('Step 1: seed the FLI demo with every scorecard submitted (fictional data)');
	const owner = await registerVerified(OWNER);
	const keeper = await registerVerified(KEEPER);
	const viewer = await registerVerified(VIEWER);
	const org = await api('/api/flihub/organizations', {
		token: owner.token,
		body: {
			name: 'H Results Org',
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
			label: i % 2 ? 'red' : 'blue',
			distance: 230 + i * 8,
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
		status: 'active'
	});
	const round2 = await record('rounds', {
		event: demoEvent.id,
		number: 2,
		course: course.id,
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
		scorekeeper: keeper.record.id,
		status: 'active'
	});
	const groupMembers = new Map([
		[groupOne.id, [t1, t2]],
		[groupTwo.id, [t3]]
	]);
	for (const [groupId, teams] of groupMembers) {
		for (const team of teams) {
			await record('group_teams', { group: groupId, entry: team.entry.id, status: 'active' });
			for (const athlete of team.athletes) {
				await record('group_athletes', {
					group: groupId,
					entry: team.entry.id,
					athlete: athlete.id,
					status: 'active'
				});
			}
		}
	}
	// Submit every (round × group) scorecard: strokes = 3 everywhere, so team
	// totals are predictable (2 athletes × 9 holes × 2 rounds × 3 = 108).
	for (const round of [round1, round2]) {
		for (const [groupId, teams] of groupMembers) {
			const card = await record('scorecards', { round: round.id, group: groupId });
			for (const team of teams) {
				for (const athlete of team.athletes) {
					for (const hole of holes) {
						await record('scores', {
							scorecard: card.id,
							athlete: athlete.id,
							hole: hole.id,
							strokes: 3
						});
					}
				}
			}
			await api(`/api/collections/scorecards/records/${card.id}`, {
				method: 'PATCH',
				token: owner.token,
				body: { status: 'submitted' }
			});
		}
	}
	const resultsUrl = `${APP}/organizations/${org.id}/events/${demoEvent.id}/results`;
	const scoreUrl = `${APP}/organizations/${org.id}/events/${demoEvent.id}/score`;
	expect(true, 'FLI demo ready: 4 scorecards submitted across two rounds and two groups');

	console.log('Step 2: a Viewer sees the review read-only and cannot approve');
	const ctxV = await browser.newContext({ viewport: { width: 1280, height: 850 } });
	const v = await signIn(ctxV, VIEWER);
	await v.goto(resultsUrl);
	await v.waitForSelector('text=Submitted scorecards', { timeout: 15000 });
	const viewerText = await v.locator('main').innerText();
	expect(
		viewerText.includes('4/4 submitted') &&
			viewerText.includes('Read-only: approval, publication, and corrections are Owner/Admin'),
		'viewer sees the submission grid read-only'
	);
	expect(
		(await v.$$('button:has-text("Approve result")')).length === 0,
		'viewer has no approve control'
	);
	const viewerDenied = await apiStatus('/api/collections/event_results/records', {
		token: viewer.token,
		body: { organization: org.id, event: demoEvent.id }
	});
	expect(
		viewerDenied === 400 || viewerDenied === 403,
		`viewer approval denied at the direct API (${viewerDenied})`
	);

	console.log('Step 3: the Owner approves — totals are snapshotted as version 1');
	const ctxO = await browser.newContext({ viewport: { width: 1280, height: 850 } });
	const o = await signIn(ctxO, OWNER);
	await o.goto(resultsUrl);
	await o.waitForSelector('button:has-text("Approve result")', { timeout: 15000 });
	await o.click('button:has-text("Approve result")');
	await o.waitForTimeout(1500);
	await o.goto(resultsUrl);
	await o.waitForSelector('text=Approved — not yet published · v1', { timeout: 15000 });
	const approvedText = await o.locator('main').innerText();
	expect(
		approvedText.includes('Blue Heron Flyers') && approvedText.includes('108'),
		'approved totals table snapshots team totals (108 strokes)'
	);
	expect(
		approvedText.includes('approved v1') && approvedText.includes(OWNER.name),
		'result history records the approval with its author'
	);

	console.log('Step 4: publish — the published version is stamped');
	await o.click('button:has-text("Publish")');
	await o.waitForTimeout(1500);
	await o.goto(resultsUrl);
	await o.waitForSelector('text=Published · v1', { timeout: 15000 });
	const publishedText = await o.locator('main').innerText();
	expect(
		publishedText.includes('published') && publishedText.includes(OWNER.name),
		'publication is stamped with author and time'
	);

	console.log('Step 4b: the Viewer sees v1 (108) as the official published result');
	await v.goto(resultsUrl);
	await v.waitForSelector('[data-testid="official-result"]', { timeout: 15000 });
	const viewerOfficial1 = await v.locator('[data-testid="official-result"]').innerText();
	expect(
		viewerOfficial1.includes('Official published result — v1') && viewerOfficial1.includes('108'),
		'viewer sees v1 at 108 as the official total after publication'
	);

	console.log('Step 5: published results lock the scorecards');
	await o.goto(scoreUrl);
	await o.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	const lockedText = await o.locator('main').innerText();
	expect(
		lockedText.includes('official result is published — reopen the result'),
		'score page explains the result lock instead of offering reopen'
	);
	const cards = await api(
		`/api/collections/scorecards/records?filter=${encodeURIComponent(`event = "${demoEvent.id}"`)}`,
		{ method: 'GET', token: owner.token }
	);
	const lockStatus = await apiStatus(`/api/collections/scorecards/records/${cards.items[0].id}`, {
		method: 'PATCH',
		token: owner.token,
		body: { status: 'draft', reason: 'sneaky edit' }
	});
	expect(lockStatus === 400, `scorecard reopen under a published result rejected (${lockStatus})`);

	console.log('Step 6: no unpublish — reopen requires a recorded reason');
	const results = await api(
		`/api/collections/event_results/records?filter=${encodeURIComponent(`event = "${demoEvent.id}"`)}`,
		{ method: 'GET', token: owner.token }
	);
	const resultId = results.items[0].id;
	const unpublish = await apiStatus(`/api/collections/event_results/records/${resultId}`, {
		method: 'PATCH',
		token: owner.token,
		body: { status: 'approved' }
	});
	expect(unpublish === 400, `unpublish rejected at the direct API (${unpublish})`);
	const noReason = await apiStatus(`/api/collections/event_results/records/${resultId}`, {
		method: 'PATCH',
		token: owner.token,
		body: { status: 'correcting' }
	});
	expect(noReason === 400, `result reopen without a reason rejected (${noReason})`);
	await o.goto(resultsUrl);
	await o.fill(
		'input[aria-label="Correction reason"]',
		'Hole 1 was recorded for the wrong athlete'
	);
	await o.click('button:has-text("Reopen for correction")');
	await o.waitForTimeout(1500);
	await o.goto(resultsUrl);
	await o.waitForSelector('text=Under correction', { timeout: 15000 });
	expect(
		(await o.locator('main').innerText()).includes('Hole 1 was recorded for the wrong athlete'),
		'the correction reason is visible while under correction'
	);

	console.log('Step 7: correct one hole score through the 1G scorecard flow');
	await o.goto(scoreUrl);
	await o.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	await o.fill('input[aria-label="Reason for reopening"]', 'Correcting hole 1');
	await o.click('button:has-text("Reopen to draft")');
	await o.waitForTimeout(1500);
	await o.goto(scoreUrl);
	await o.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	const cell = o.locator('input[aria-label="Strokes for Ava Stone on hole 1"]');
	await cell.fill('5');
	await cell.dispatchEvent('change');
	await o.waitForTimeout(1500);
	await o.goto(scoreUrl);
	await o.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	await o.click('button:has-text("Submit scorecard")');
	await o.waitForSelector('text=Submitted — locked', { timeout: 15000 });
	expect(true, 'hole 1 corrected (3 → 5) and the scorecard resubmitted');

	console.log('Step 7b: mid-correction, the Viewer still sees v1 (108) as official');
	await v.goto(resultsUrl);
	await v.waitForSelector('[data-testid="official-result"]', { timeout: 15000 });
	const viewerMid = await v.locator('main').innerText();
	expect(
		viewerMid.includes('Official published result — v1') &&
			viewerMid.includes('108') &&
			viewerMid.includes('Under correction'),
		'viewer still sees official v1 at 108 while the correction is in progress'
	);

	console.log('Step 8: reapprove — exactly one new version preserving the old one');
	await o.goto(resultsUrl);
	await o.waitForSelector('button:has-text("Reapprove (new version)")', { timeout: 15000 });
	await o.click('button:has-text("Reapprove (new version)")');
	await o.waitForTimeout(1500);
	await o.goto(resultsUrl);
	await o.waitForSelector('text=Approved — not yet published · v2', { timeout: 15000 });
	const v2Text = await o.locator('main').innerText();
	expect(v2Text.includes('110'), 'corrected v2 totals (110) are staged, awaiting publication');
	expect(
		v2Text.includes('v1') &&
			v2Text.includes('v2') &&
			v2Text.includes('correction reason: Hole 1 was recorded for the wrong athlete'),
		'version history preserves v1 and shows the v2 correction reason'
	);
	const versions = await api(
		`/api/collections/result_versions/records?filter=${encodeURIComponent(
			`result = "${resultId}"`
		)}&sort=version`,
		{ method: 'GET', token: owner.token }
	);
	expect(versions.items.length === 2, 'exactly one new version per reapproval');
	const v1Totals = versions.items[0].totals.teams.find((t) => t.teamName === 'Blue Heron Flyers');
	const v2Totals = versions.items[1].totals.teams.find((t) => t.teamName === 'Blue Heron Flyers');
	expect(
		v1Totals.total === 108 && v2Totals.total === 110 && Boolean(versions.items[0].publishedAt),
		'previous values, publication stamp, and the corrected totals are both preserved'
	);
	const forgeVersion = await apiStatus('/api/collections/result_versions/records', {
		token: owner.token,
		body: {
			organization: org.id,
			event: demoEvent.id,
			result: resultId,
			version: 3,
			totals: {},
			approvedBy: owner.record.id
		}
	});
	expect(
		forgeVersion === 400 || forgeVersion === 403,
		`version forgery rejected (${forgeVersion})`
	);

	console.log('Step 8b: approved v2 is NOT official — the Viewer still sees v1 (108)');
	await v.goto(resultsUrl);
	await v.waitForSelector('[data-testid="official-result"]', { timeout: 15000 });
	const viewerOfficialStill = await v.locator('[data-testid="official-result"]').innerText();
	expect(
		viewerOfficialStill.includes('Official published result — v1') &&
			viewerOfficialStill.includes('108'),
		'viewer still sees official v1 at 108 while v2 awaits publication'
	);
	const viewerPending = await v.locator('[data-testid="pending-result"]').innerText();
	expect(
		viewerPending.includes('NOT the official result until published'),
		'the approved v2 is explicitly labeled not official'
	);
	const viewerResult = await api(
		`/api/collections/event_results/records?filter=${encodeURIComponent(
			`event = "${demoEvent.id}"`
		)}`,
		{ method: 'GET', token: viewer.token }
	);
	const viewerVersions = await api(
		`/api/collections/result_versions/records?filter=${encodeURIComponent(
			`result = "${resultId}"`
		)}&sort=version`,
		{ method: 'GET', token: viewer.token }
	);
	expect(
		viewerResult.items[0].publishedVersion === 1 &&
			viewerVersions.items[1].publishedAt === '' &&
			viewerVersions.items[0].totals.teams.find((t) => t.teamName === 'Blue Heron Flyers').total ===
				108,
		'direct API: the official pointer stays at v1 (108); v2 carries no publication stamp'
	);

	console.log('Step 9: republish the corrected result');
	await o.click('button:has-text("Publish")');
	await o.waitForTimeout(1500);
	await o.goto(resultsUrl);
	await o.waitForSelector('text=Published · v2', { timeout: 15000 });
	const finalText = await o.locator('main').innerText();
	expect(
		finalText.includes('approved v2') && finalText.includes('published v2'),
		'the audit log tells the whole story: approve, publish, reopen, reapprove, republish'
	);

	console.log('Step 9b: the Viewer now sees v2 (110) as official, with v1 intact in history');
	await v.goto(resultsUrl);
	await v.waitForSelector('[data-testid="official-result"]', { timeout: 15000 });
	const viewerFinal = await v.locator('main').innerText();
	expect(
		viewerFinal.includes('Official published result — v2') && viewerFinal.includes('110'),
		'viewer sees the corrected v2 at 110 as the official total'
	);
	expect(
		viewerFinal.includes('Blue Heron Flyers 108'),
		'v1 remains intact at 108 in the visible version history'
	);

	await ctxV.close();
	await ctxO.close();
	console.log('Phase 1H browser acceptance: all steps passed');
} finally {
	await browser.close();
}
