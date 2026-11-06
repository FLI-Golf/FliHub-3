/**
 * Phase 1D walkthrough recording (Playwright, headless Chromium, 1280×720,
 * single continuous take): competition structure — an organizer creates a
 * league and a division-less season, enters a team directly into the season,
 * finalizes a division later and assigns the existing entry, then creates a
 * season-linked event next to an independent one.
 *
 * Runs against a disposable instance with fictional demo data. The organizer
 * session uses a prepared cookie (authentication happens off-camera);
 * credentials are never typed on the recording. Every scene synchronizes on
 * visible UI outcomes and logs them into output/run-manifest-1d.json.
 *
 * Run via `npm run record:walkthrough-1d` — the runner provides the
 * environment.
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
		'Run via `npm run record:walkthrough-1d` (recordings/run-walkthrough.mjs sets env).'
	);
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const PASSWORD = 'demo-not-a-real-password';
const ORGANIZER = { name: 'Riley Chen', email: 'riley.chen@example.com' }; // Owner / organizer
const ORG = 'Lakeside Golf Collective';
const LEAGUE = 'Lakeside Golf League';
const SEASON = 'Summer 2026';
const TEAM = 'Blue Heron Flyers';
const DIVISION = 'Open';
const EVENT_STANDALONE = 'Harvest Open';
const EVENT_LINKED = 'Week 1';

const beat = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

// Clock origin = recording context creation (video t=0), NOT module load —
// data seeding must not shift the scene offsets off the video timeline.
let t0 = 0;
const sceneLog = [];
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

// Narration-paced minimum scene durations (local word-count estimate, no API).
const narration = JSON.parse(
	readFileSync(
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'narration-1d.json'),
		'utf8'
	)
);
const WORDS_PER_SECOND = 2.4;
const LEAD_TAIL_SECONDS = 2.4;
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

// ---------------------------------------------------------------------------
// Off-camera helpers (never recorded)
// ---------------------------------------------------------------------------
async function api(pathname, { method = 'GET', body, token } = {}) {
	const res = await fetch(`${PB}${pathname}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: token } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new Error(`API ${method} ${pathname} failed: ${res.status} ${JSON.stringify(data)}`);
	return data;
}

async function confirmLatestVerificationEmail(email) {
	let token = null;
	for (let i = 0; i < 40 && !token; i++) {
		const list = await fetch(`${MAILPIT}/api/v1/messages?limit=50`).then((r) => r.json());
		const msg = (list.messages ?? [])
			.filter((m) => (m.To ?? []).some((t) => t.Address === email))
			.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
		if (msg) {
			const full = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
			const match = `${full.HTML ?? ''}\n${full.Text ?? ''}`.match(
				/verify-email\/([A-Za-z0-9_.-]+)/
			);
			if (match) token = match[1];
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	if (!token) throw new Error(`No verification email for ${email}`);
	await api('/api/collections/users/confirm-verification', { method: 'POST', body: { token } });
}

async function createVerifiedUser(person) {
	await api('/api/collections/users/records', {
		method: 'POST',
		body: { email: person.email, password: PASSWORD, passwordConfirm: PASSWORD, name: person.name }
	});
	await api('/api/collections/users/request-verification', {
		method: 'POST',
		body: { email: person.email }
	});
	await confirmLatestVerificationEmail(person.email);
	return api('/api/collections/users/auth-with-password', {
		method: 'POST',
		body: { identity: person.email, password: PASSWORD }
	});
}

function cookieFor(auth) {
	return {
		name: 'pb_auth',
		value: encodeURIComponent(JSON.stringify({ token: auth.token, record: auth.record })),
		domain: '127.0.0.1',
		path: '/',
		httpOnly: true,
		sameSite: 'Strict'
	};
}

async function showSlate(page, text) {
	await page.evaluate((t) => {
		document.getElementById('recording-slate')?.remove();
		const el = document.createElement('div');
		el.id = 'recording-slate';
		el.textContent = t;
		el.style.cssText =
			'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;' +
			'background:#111827;color:#f9fafb;padding:10px 18px;border-radius:10px;' +
			'font:600 15px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);';
		document.body.appendChild(el);
	}, text);
	await beat(2300);
	await page.evaluate(() => document.getElementById('recording-slate')?.remove());
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

try {
	console.log('Preparing fictional demo data off-camera…');
	const riley = await createVerifiedUser(ORGANIZER);
	// Org, capabilities, and the team roster happen off-camera; competition
	// structure (Phase 1D) is the on-camera subject. `teams` requires
	// `athletes` (dependency closure is enforced server-side).
	const org = await api('/api/flihub/organizations', {
		method: 'POST',
		token: riley.token,
		body: {
			name: ORG,
			template: 'custom',
			capabilities: ['athletes', 'teams', 'leagues-seasons', 'events']
		}
	});
	await api('/api/collections/teams/records', {
		method: 'POST',
		token: riley.token,
		body: { organization: org.id, name: TEAM, status: 'active' }
	});
	const orgUrl = `${APP}/organizations/${org.id}`;

	const context = await browser.newContext({
		viewport: { width: 1280, height: 720 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
	});
	await context.addCookies([cookieFor(riley)]);
	t0 = Date.now(); // video t=0 starts with the recording context
	const page = await context.newPage();
	const nav = () => page.locator('nav[aria-label="Organization sections"]');
	// The season card is the inner section carrying data-season (the page
	// wrapper is also a <section> containing the same text).
	const seasonSection = () => page.locator('section[data-season]', { hasText: SEASON });

	// ---- S1 — League, then a division-less season -----------------------------
	markScene('s1-league-season', 'Organizer creates a league and a division-less season');
	await page.goto(orgUrl);
	await page.waitForSelector('nav[aria-label="Organization sections"]');
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await page.waitForURL(/\/cap\/leagues-seasons/, { timeout: 15000 });
	await page.waitForSelector('text=Leagues (0)');
	await showSlate(page, 'Phase 1D — Competition structure: league and season, divisions optional');
	await page.locator('#league-name').pressSequentially(LEAGUE, { delay: 60 });
	await beat(400);
	await page.click('button:has-text("Add league")');
	await page.waitForSelector('text=Leagues (1)', { timeout: 15000 });
	observed('League created');
	await page.selectOption('#season-league', { label: LEAGUE });
	await page.locator('#season-name').pressSequentially(SEASON, { delay: 60 });
	await page.fill('#season-starts', '2026-06-01');
	await page.fill('#season-ends', '2026-08-31');
	await beat(400);
	await page.click('button:has-text("Add season")');
	await page.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	await page.waitForSelector('text=No divisions — this season runs division-less');
	await seasonSection().scrollIntoViewIfNeeded();
	observed('Season created with schedule dates and no divisions — runs division-less');
	await settleScene('s1-league-season');

	// ---- S2 — Team entered directly into the season ---------------------------
	markScene('s2-direct-entry', 'Team entered directly into the season — no division assigned');
	await showSlate(page, 'Teams enter the season directly — divisions can come later');
	const addEntry = seasonSection().locator('form[action="?/addEntry"]');
	await addEntry.scrollIntoViewIfNeeded();
	await addEntry.locator('select[name="team"]').selectOption({ label: TEAM });
	await beat(600);
	await addEntry.locator('button[type="submit"]').click();
	await page.waitForSelector('text=Team entries (1)', { timeout: 15000 });
	await page.waitForSelector('text=No division assigned');
	const unassignedRow = seasonSection().locator('div.rounded-md.border.p-2', { hasText: TEAM });
	await unassignedRow.scrollIntoViewIfNeeded();
	observed('Blue Heron Flyers entered into the season with “No division assigned” visible');
	await settleScene('s2-direct-entry');

	// ---- S3 — Division created later, existing entry assigned -----------------
	markScene('s3-division-assign', 'Division created later and assigned to the existing entry');
	await showSlate(page, 'A division arrives later — the existing entry is assigned to it');
	const addDivision = seasonSection().locator('form[action="?/createDivision"]');
	await addDivision.scrollIntoViewIfNeeded();
	await addDivision.locator('input[name="name"]').pressSequentially(DIVISION, { delay: 70 });
	await beat(400);
	await addDivision.locator('button[type="submit"]').click();
	await page.waitForSelector('text=Divisions (1)', { timeout: 15000 });
	observed('Open division created');
	const assign = seasonSection().locator('form[action="?/assignEntryDivision"]');
	await assign.scrollIntoViewIfNeeded();
	await assign.locator('select[name="division"]').selectOption({ label: DIVISION });
	await beat(600);
	await assign.locator('button[type="submit"]').click();
	// The unassigned badge text is unique to that state; wait for it to leave
	// the entry row, then assert the row's badge now names the division.
	const entryRow = seasonSection().locator('div.rounded-md.border.p-2', { hasText: TEAM });
	await entryRow
		.locator('text=No division assigned')
		.waitFor({ state: 'detached', timeout: 15000 });
	const entryBadge = await entryRow.locator('[data-slot="badge"]').first().innerText();
	if (entryBadge !== DIVISION)
		throw new Error(`Entry badge should read "${DIVISION}", got "${entryBadge}"`);
	await entryRow.scrollIntoViewIfNeeded();
	observed('Existing entry updated on screen — badge now reads Open');
	await settleScene('s3-division-assign');

	// ---- S4 — Season-linked vs independent events ------------------------------
	markScene('s4-events', 'Season-linked event vs independent event');
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	await page.waitForURL(/\/cap\/events/, { timeout: 15000 });
	await page.waitForSelector('text=Events (0)');
	await showSlate(page, 'Events: linked to a season, or fully independent');
	// Independent event — the season select stays on "Independent (no season)".
	await page.locator('#event-name').pressSequentially(EVENT_STANDALONE, { delay: 60 });
	await beat(400);
	await page.click('button:has-text("Add event")');
	await page.waitForSelector('text=Events (1)', { timeout: 15000 });
	await page.waitForSelector('text=Independent');
	observed('Harvest Open created as an independent event (Independent badge)');
	// Season-linked event. The start time is left unset: the UI's
	// datetime-local value is currently dropped by the backend (reported
	// separately), and typing a date that then shows "Not scheduled" would
	// read as a glitch on camera.
	await page.locator('#event-name').pressSequentially(EVENT_LINKED, { delay: 60 });
	await page.selectOption('#event-season', { label: SEASON });
	await beat(400);
	await page.click('button:has-text("Add event")');
	await page.waitForSelector('text=Events (2)', { timeout: 15000 });
	const linkedRow = page.locator('div.rounded-md.border', { hasText: EVENT_LINKED }).last();
	const linkedText = await linkedRow.innerText();
	if (!linkedText.includes(SEASON))
		throw new Error(`Season-linked event should show "${SEASON}" on its row`);
	await linkedRow.scrollIntoViewIfNeeded();
	observed('Week 1 created linked to Summer 2026 — season badge distinguishes it at a glance');
	await settleScene('s4-events');

	await context.close();
} finally {
	await browser.close();
}

// Move the single-take video into place and write the scene timing manifest.
const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(path.join(OUT, webm), path.join(OUT, 'phase1d-walkthrough.webm'));
writeFileSync(
	path.join(OUT, 'run-manifest-1d.json'),
	JSON.stringify(
		{
			video: 'recordings/output/phase1d-walkthrough.webm',
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
console.log('RECORDING 1D OK');
