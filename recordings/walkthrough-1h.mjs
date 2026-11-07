/**
 * Phase 1H walkthrough recording (Playwright, headless Chromium, 1280×720):
 * official results + corrections on the disposable preview stack. The demo
 * starts with submitted scorecards already in place so the video focuses on the
 * official results workflow rather than on score entry.
 *
 * Runs against a disposable instance with fictional demo data. The four scenes
 * are asserted in-browser before the take advances, so the Viewer-facing
 * `v1`/`v2` values and labels remain the source of truth.
 */
import path from 'node:path';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_RECORD_APP_URL;
const MAILPIT = process.env.FLIHUB_RECORD_MAILPIT_URL;
const PB = process.env.FLIHUB_RECORD_PB_URL;
if (!APP || !MAILPIT || !PB) {
	throw new Error(
		'Run via `npm run record:walkthrough-1h` (recordings/run-walkthrough.mjs sets env).'
	);
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const PASS = 'e2e-password-123';
const ts = Date.now();
const OWNER = { name: 'H Owner', email: `e2e-h-owner-${ts}@example.com` };
const KEEPER = { name: 'H Keeper', email: `e2e-h-keeper-${ts}@example.com` };
const VIEWER = { name: 'H Viewer', email: `e2e-h-viewer-${ts}@example.com` };

const sceneLog = [];
let t0 = 0;
const narration = JSON.parse(
	readFileSync(
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'narration-1h.json'),
		'utf8'
	)
);
const WORDS_PER_SECOND = 2.4;
const LEAD_TAIL_SECONDS = 2.4;
function seconds() {
	return Math.round((Date.now() - t0) / 100) / 10;
}
function markScene(id, title) {
	sceneLog.push({ id, title, offsetSeconds: seconds(), observed: [] });
	console.log(`Scene ${id} @ ${seconds()}s`);
}
function observed(text) {
	sceneLog[sceneLog.length - 1].observed.push({ atSeconds: seconds(), outcome: text });
	console.log(`  observed @ ${seconds()}s: ${text}`);
}
function minSceneSeconds(id) {
	const scene = narration.scenes.find((n) => n.id === id);
	const words = scene.tts.trim().split(/\s+/).length;
	return words / WORDS_PER_SECOND + LEAD_TAIL_SECONDS;
}
async function settleScene(id) {
	const scene = sceneLog[sceneLog.length - 1];
	const elapsed = seconds() - scene.offsetSeconds;
	const remaining = minSceneSeconds(id) - elapsed;
	if (remaining > 0) await beat(remaining * 1000);
}

function beat(ms = 1200) {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
	page.setDefaultTimeout(12000);
	await page.goto(`${APP}/login`);
	await page.fill('input[name="email"]', person.email);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/organizations/, { timeout: 20000 });
	return page;
}

function expect(cond, label) {
	if (!cond) throw new Error(`Playwright assertion failed: ${label}`);
	console.log(`  ✓ ${label}`);
}

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
try {
	t0 = Date.now();
	console.log('Preparing fictional demo data off-camera…');
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
	const ctxOwner = await browser.newContext({
		viewport: { width: 1280, height: 850 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 850 } }
	});
	const ctxViewer = await browser.newContext({
		viewport: { width: 1280, height: 850 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 850 } }
	});
	const ownerPage = await signIn(ctxOwner, OWNER);
	const viewerPage = await signIn(ctxViewer, VIEWER);

	markScene('s1-approve-publish', 'Owner approves and publishes the initial result');
	await ownerPage.goto(resultsUrl);
	await ownerPage.waitForSelector('button:has-text("Approve result")', { timeout: 15000 });
	await ownerPage.click('button:has-text("Approve result")');
	await ownerPage.waitForTimeout(1500);
	await ownerPage.goto(resultsUrl);
	await ownerPage.waitForSelector('text=Approved — not yet published · v1', { timeout: 15000 });
	const approvedText = await ownerPage.locator('main').innerText();
	expect(
		approvedText.includes('Blue Heron Flyers') && approvedText.includes('108'),
		'approved v1 shows 108'
	);
	await ownerPage.click('button:has-text("Publish")');
	await ownerPage.waitForTimeout(1500);
	await ownerPage.goto(resultsUrl);
	await ownerPage.waitForSelector('text=Published · v1', { timeout: 15000 });
	await viewerPage.goto(resultsUrl);
	await viewerPage.waitForSelector('[data-testid="official-result"]', { timeout: 15000 });
	const viewerOfficial1 = await viewerPage.locator('[data-testid="official-result"]').innerText();
	expect(
		viewerOfficial1.includes('Official published result — v1') && viewerOfficial1.includes('108'),
		'Viewer sees v1 official at 108'
	);
	observed('Viewer sees the official published result — v1 at 108');
	await beat(4200);

	markScene('s2-reopen-correct', 'Owner reopens the result, corrects one stroke, and stages v2');
	await ownerPage.fill(
		'input[aria-label="Correction reason"]',
		'Hole 1 was recorded for the wrong athlete'
	);
	await ownerPage.click('button:has-text("Reopen for correction")');
	await ownerPage.waitForTimeout(1500);
	await ownerPage.goto(resultsUrl);
	await ownerPage.waitForSelector('text=Under correction', { timeout: 15000 });
	const correctionReason = await ownerPage.locator('main').innerText();
	expect(
		correctionReason.includes('Hole 1 was recorded for the wrong athlete'),
		'correction reason remains visible while under correction'
	);
	await ownerPage.goto(scoreUrl);
	await ownerPage.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	await ownerPage.fill('input[aria-label="Reason for reopening"]', 'Correcting hole 1');
	await ownerPage.click('button:has-text("Reopen to draft")');
	await ownerPage.waitForTimeout(1500);
	await ownerPage.goto(scoreUrl);
	await ownerPage.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	const cell = ownerPage.locator('input[aria-label="Strokes for Ava Stone on hole 1"]');
	await cell.fill('5');
	await cell.dispatchEvent('change');
	await ownerPage.waitForTimeout(1200);
	await ownerPage.goto(scoreUrl);
	await ownerPage.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	await ownerPage.click('button:has-text("Submit scorecard")');
	await ownerPage.waitForSelector('text=Submitted — locked', { timeout: 15000 });
	await ownerPage.goto(resultsUrl);
	await ownerPage.waitForSelector('button:has-text("Reapprove (new version)")', { timeout: 15000 });
	await ownerPage.click('button:has-text("Reapprove (new version)")');
	await ownerPage.waitForTimeout(1500);
	await ownerPage.goto(resultsUrl);
	await ownerPage.waitForSelector('text=Approved — not yet published · v2', { timeout: 15000 });
	const v2Text = await ownerPage.locator('main').innerText();
	expect(v2Text.includes('110'), 'corrected v2 totals (110) are staged');
	expect(
		v2Text.includes('v1') &&
			v2Text.includes('v2') &&
			v2Text.includes('correction reason: Hole 1 was recorded for the wrong athlete'),
		'v1 and v2 are preserved with the reason attached'
	);
	observed('The corrected version is staged as v2 at 110');
	await beat(4200);

	markScene('s3-viewer-mid-correction', 'Viewer sees v1 official while v2 waits to publish');
	await viewerPage.goto(resultsUrl);
	await viewerPage.waitForSelector('[data-testid="official-result"]', { timeout: 15000 });
	const viewerMid = await viewerPage.locator('main').innerText();
	expect(
		viewerMid.includes('Official published result — v1') && viewerMid.includes('108'),
		'Viewer still sees v1 as official while v2 is pending'
	);
	const pending = await viewerPage.locator('[data-testid="pending-result"]').innerText();
	expect(
		pending.includes('NOT the official result until published') && pending.includes('Approved v2'),
		'Viewer sees the pending v2 labeled as not official yet'
	);
	observed('Official v1 stays visible while v2 is labeled awaiting publication');
	await beat(6000);

	markScene('s4-publish-v2', 'Owner republishes the corrected result and Viewer sees v2 official');
	await ownerPage.click('button:has-text("Publish")');
	await ownerPage.waitForTimeout(1500);
	await ownerPage.goto(resultsUrl);
	await ownerPage.waitForSelector('text=Published · v2', { timeout: 15000 });
	await viewerPage.goto(resultsUrl);
	await viewerPage.waitForSelector('[data-testid="official-result"]', { timeout: 15000 });
	const viewerFinal = await viewerPage.locator('main').innerText();
	expect(
		viewerFinal.includes('Official published result — v2') && viewerFinal.includes('110'),
		'Viewer sees corrected v2 as official at 110'
	);
	expect(
		viewerFinal.includes('Blue Heron Flyers 108'),
		'v1 remains visible in version history at 108'
	);
	observed('Viewer now sees v2 at 110 as official, with v1 preserved in history');
	await settleScene('s4-publish-v2');
	await ctxOwner.close();
	await ctxViewer.close();

	writeFileSync(
		path.join(OUT, 'run-manifest-1h.json'),
		JSON.stringify(
			{
				video: 'recordings/output/phase1h-walkthrough.webm',
				clockOrigin: 'Offsets are seconds of video time (t=0 at recording context creation)',
				pacing:
					'Scene holds are sized so each narration line fits its scene (2.4 words/s + 2.4s lead/tail)',
				scenes: sceneLog.map((s) => ({
					...s,
					narrationWords: narration.scenes
						.find((n) => n.id === s.id)
						.tts.trim()
						.split(/\s+/).length,
					minSeconds: Math.round(minSceneSeconds(s.id) * 10) / 10
				}))
			},
			null,
			2
		)
	);
	console.log('Recorded 1H walkthrough manifest to recordings/output/run-manifest-1h.json');
} finally {
	await browser.close();
}

const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(path.join(OUT, webm), path.join(OUT, 'phase1h-walkthrough.webm'));
console.log('RECORDING 1H OK');
