/**
 * Phase 1E walkthrough recording (Playwright, headless Chromium, 1280×720,
 * single continuous take): season rosters, reserve pools, and substitutions —
 * an organizer reviews a team's season roster, the season's separate reserve
 * pool, records a substitution for one season-linked event, and confirms the
 * roster and pool are unchanged afterwards.
 *
 * Runs against a disposable instance with fictional demo data. The full
 * competition structure, roster, reserve pool, and event are seeded off-camera
 * via the direct API; the organizer session uses a prepared cookie
 * (authentication happens off-camera); credentials are never typed on the
 * recording. Every scene synchronizes on visible UI outcomes and logs them
 * into output/run-manifest-1e.json.
 *
 * Run via `npm run record:walkthrough-1e` — the runner provides the
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
		'Run via `npm run record:walkthrough-1e` (recordings/run-walkthrough.mjs sets env).'
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
const POOL = "Men's Reserve";
const EVENT = 'Week 3';
const ROSTERED = [
	{ firstName: 'Ava', lastName: 'Stone', gender: 'female' },
	{ firstName: 'Sam', lastName: 'Finch', gender: 'male' }
];
const RESERVE = { firstName: 'Ben', lastName: 'Reed', gender: 'male' };
const OUT_NAME = 'Ava Stone';
const IN_NAME = 'Ben Reed';

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
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'narration-1e.json'),
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
	// Everything up to the Phase 1E subject happens off-camera: the org, the
	// 1D competition structure, the rostered athletes, the reserve pool with
	// its member, and the season-linked event. The on-camera subject is the
	// roster/reserve/substitution review itself.
	const org = await api('/api/flihub/organizations', {
		method: 'POST',
		token: riley.token,
		body: {
			name: ORG,
			template: 'custom',
			capabilities: ['athletes', 'teams', 'leagues-seasons', 'events']
		}
	});
	const record = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			method: 'POST',
			token: riley.token,
			body: { organization: org.id, ...body }
		});
	const league = await record('leagues', { name: LEAGUE, status: 'active' });
	const season = await record('seasons', {
		league: league.id,
		name: SEASON,
		status: 'active',
		startsOn: '2026-06-01',
		endsOn: '2026-08-31'
	});
	const team = await record('teams', { name: TEAM, status: 'active' });
	const entry = await record('season_entries', {
		season: season.id,
		team: team.id,
		status: 'active'
	});
	for (const person of ROSTERED) {
		const athlete = await record('athletes', { ...person, status: 'active' });
		await record('roster_memberships', { entry: entry.id, athlete: athlete.id, status: 'active' });
	}
	const reserveAthlete = await record('athletes', { ...RESERVE, status: 'active' });
	const pool = await record('reserve_pools', {
		season: season.id,
		name: POOL,
		gender: 'male',
		status: 'active'
	});
	await record('reserve_members', {
		pool: pool.id,
		athlete: reserveAthlete.id,
		status: 'active'
	});
	await record('events', { season: season.id, name: EVENT, status: 'planned' });
	const teamsUrl = `${APP}/organizations/${org.id}/cap/teams`;

	const context = await browser.newContext({
		viewport: { width: 1280, height: 720 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
	});
	await context.addCookies([cookieFor(riley)]);
	t0 = Date.now(); // video t=0 starts with the recording context
	const page = await context.newPage();
	const rosterCard = () =>
		page.locator('[data-slot="card"]', { hasText: `Season roster — ${SEASON}` });
	const poolCard = () =>
		page.locator('[data-slot="card"]', { hasText: `Reserve pools — ${SEASON}` });
	const subsCard = () =>
		page.locator('[data-slot="card"]', { hasText: `Substitutions — ${SEASON}` });

	// ---- S1 — A team's season roster with its regular athletes ----------------
	markScene('s1-season-roster', "A team's season roster with its regular athletes");
	await page.goto(teamsUrl);
	await page.waitForSelector(`text=Season roster — ${SEASON}`, { timeout: 15000 });
	await showSlate(page, 'Phase 1E — Season rosters: athletes assigned per season');
	await rosterCard().scrollIntoViewIfNeeded();
	const rosterText = await rosterCard().innerText();
	for (const person of ROSTERED) {
		const full = `${person.firstName} ${person.lastName}`;
		if (!rosterText.includes(full))
			throw new Error(`Roster should list ${full}, got:\n${rosterText}`);
	}
	if (!rosterText.includes(TEAM)) throw new Error(`Roster should show the ${TEAM} entry`);
	observed('Blue Heron Flyers season roster lists Ava Stone and Sam Finch');
	await settleScene('s1-season-roster');

	// ---- S2 — The season's separate reserve pool -------------------------------
	markScene(
		's2-reserve-pool',
		"The season's separate reserve pool and the reserve who will fill in"
	);
	await showSlate(page, 'Reserve pools are separate from teams — excluded from scheduling');
	await poolCard().scrollIntoViewIfNeeded();
	await beat(900);
	const poolText = await poolCard().innerText();
	if (!poolText.includes(POOL)) throw new Error(`Pool card should show "${POOL}"`);
	if (!poolText.includes(IN_NAME)) throw new Error(`Pool should list ${IN_NAME}`);
	if (!poolText.includes('male only')) throw new Error('Pool should show its male-only badge');
	observed("Men's Reserve pool (male only) lists Ben Reed as the available reserve");
	await settleScene('s2-reserve-pool');

	// ---- S3 — Substitution recorded for one season-linked event ----------------
	markScene('s3-substitution', 'Substitution recorded for one season-linked event');
	await showSlate(page, 'A substitution: one event, one out, one reserve in — append-only');
	await subsCard().scrollIntoViewIfNeeded();
	await page.selectOption('#sub-event', { label: EVENT });
	await beat(500);
	await page.selectOption('#sub-entry', { label: TEAM });
	await beat(500);
	await page.selectOption('#sub-out', { label: OUT_NAME });
	await beat(500);
	await page.selectOption('#sub-in', { label: IN_NAME });
	await beat(500);
	await page.locator('#sub-reason').pressSequentially('Travel conflict', { delay: 60 });
	await beat(400);
	await page.click('button:has-text("Record substitution")');
	await page.waitForSelector('text=replaced by', { timeout: 15000 });
	const subRow = subsCard().locator('div.rounded-md.border', { hasText: 'replaced by' }).last();
	await subRow.scrollIntoViewIfNeeded();
	const subText = await subRow.innerText();
	for (const expected of [EVENT, OUT_NAME, IN_NAME]) {
		if (!subText.includes(expected))
			throw new Error(`Substitution record should show "${expected}", got:\n${subText}`);
	}
	observed('Substitution recorded: Week 3 — Ava Stone replaced by Ben Reed, with the reason');
	await settleScene('s3-substitution');

	// ---- S4 — Roster and reserve pool unchanged after the substitution ---------
	markScene('s4-roster-intact', 'Roster and reserve pool unchanged after the substitution');
	await showSlate(page, 'The roster did not change — the substitution applies to that event only');
	await rosterCard().scrollIntoViewIfNeeded();
	await beat(1200);
	const rosterAfter = await rosterCard().innerText();
	if (!rosterAfter.includes(OUT_NAME))
		throw new Error(`${OUT_NAME} should still be on the season roster`);
	if (rosterAfter.includes('Past member'))
		throw new Error('No roster membership may be archived by the substitution');
	observed('Ava Stone is still on the Blue Heron Flyers season roster — no past-member badge');
	await poolCard().scrollIntoViewIfNeeded();
	await beat(900);
	const poolAfter = await poolCard().innerText();
	if (!poolAfter.includes(IN_NAME))
		throw new Error(`${IN_NAME} should still be in the reserve pool`);
	observed('Ben Reed is still in the reserve pool — membership untouched');
	await settleScene('s4-roster-intact');

	await context.close();
} finally {
	await browser.close();
}

// Move the single-take video into place and write the scene timing manifest.
const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(path.join(OUT, webm), path.join(OUT, 'phase1e-walkthrough.webm'));
writeFileSync(
	path.join(OUT, 'run-manifest-1e.json'),
	JSON.stringify(
		{
			video: 'recordings/output/phase1e-walkthrough.webm',
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
console.log('RECORDING 1E OK');
