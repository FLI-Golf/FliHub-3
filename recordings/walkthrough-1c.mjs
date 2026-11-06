/**
 * Phase 1C walkthrough recording (Playwright, headless Chromium, 1280×720,
 * single continuous take): athlete identity — Owners manage private
 * contact/eligibility fields, Viewers receive identity only, archive/restore,
 * and CSV import.
 *
 * Runs against a disposable instance with fictional demo accounts. Persona
 * switches use prepared session cookies (authentication happens off-camera);
 * credentials are never typed on the recording. Every scene synchronizes on
 * visible UI outcomes and logs them into output/run-manifest-1c.json.
 *
 * Run via `npm run record:walkthrough-1c` — the runner provides the
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
		'Run via `npm run record:walkthrough-1c` (recordings/run-walkthrough.mjs sets env).'
	);
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const PASSWORD = 'demo-not-a-real-password';
const PEOPLE = {
	sam: { name: 'Sam Delgado', email: 'sam.delgado@example.com' }, // Owner
	val: { name: 'Val Ortiz', email: 'val.ortiz@example.com' } // Viewer
};
const ORG = 'Harbor City Athletics';
const ATHLETE = {
	first: 'Jordan',
	last: 'Avery',
	email: 'jordan.avery@example.com',
	phone: '+1-555-0142',
	notes: 'U24 eligible through the 2026 season'
};

const beat = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

// Clock origin = recording context creation (video t=0), NOT module load —
// account seeding must not shift the scene offsets off the video timeline.
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
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'narration-1c.json'),
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

/** Switches the recorded session to another prepared persona. */
async function become(context, auth) {
	await context.clearCookies();
	if (auth) await context.addCookies([cookieFor(auth)]);
	await beat(400);
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

try {
	console.log('Preparing fictional demo accounts off-camera…');
	const auth = {};
	for (const key of Object.keys(PEOPLE)) {
		auth[key] = await createVerifiedUser(PEOPLE[key]);
	}
	// Org + roster invitation happen off-camera; onboarding is Phase 1B's subject.
	const org = await api('/api/flihub/organizations', {
		method: 'POST',
		token: auth.sam.token,
		body: { name: ORG, template: 'custom', capabilities: ['athletes'] }
	});
	const invite = await api('/api/flihub/invitations', {
		method: 'POST',
		token: auth.sam.token,
		body: { organization: org.id, email: PEOPLE.val.email, role: 'viewer' }
	});
	await api('/api/flihub/invitations/accept', {
		method: 'POST',
		token: auth.val.token,
		body: { token: invite.token }
	});
	const orgUrl = `${APP}/organizations/${org.id}`;

	const context = await browser.newContext({
		viewport: { width: 1280, height: 720 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
	});
	t0 = Date.now(); // video t=0 starts with the recording context
	const page = await context.newPage();
	page.on('dialog', (d) => d.accept()); // native confirm() on archive
	const athletesNav = () =>
		page.locator('nav[aria-label="Organization sections"]').getByRole('link', { name: /Athletes/ });

	// ---- S1 — Owner creates an athlete with private fields -------------------
	markScene('s1-owner-create', 'Owner creates an athlete with private contact/eligibility fields');
	await become(context, auth.sam);
	await page.goto(orgUrl);
	await page.waitForSelector('nav[aria-label="Organization sections"]');
	await athletesNav().click();
	await page.waitForURL(/\/cap\/athletes/, { timeout: 15000 });
	await page.waitForSelector('text=Athletes (0)');
	await showSlate(page, 'Phase 1C — Athletes: identity plus Owner-only private fields');
	await page.locator('#firstName').pressSequentially(ATHLETE.first, { delay: 70 });
	await page.locator('#lastName').pressSequentially(ATHLETE.last, { delay: 70 });
	await page.selectOption('#gender', 'female');
	await page.locator('#nationality').pressSequentially('Canada', { delay: 70 });
	await beat(600);
	await page.locator('#email').pressSequentially(ATHLETE.email, { delay: 40 });
	await page.locator('#phone').pressSequentially(ATHLETE.phone, { delay: 40 });
	await page.locator('#eligibilityNotes').pressSequentially(ATHLETE.notes, { delay: 25 });
	observed('Owner sees and fills the private contact/eligibility fields (labeled private)');
	await beat(600);
	await page.click('button:has-text("Add athlete")');
	await page.waitForSelector('text=Athletes (1)', { timeout: 15000 });
	await page.waitForSelector(`text=${ATHLETE.email}`);
	observed('Roster lists Jordan Avery; the Owner view shows the private contact fields');
	await settleScene('s1-owner-create');

	// ---- S2 — Viewer: identity only -------------------------------------------
	markScene('s2-viewer-readonly', 'Viewer sees identity only — no private fields or controls');
	await become(context, auth.val);
	await page.goto(`${orgUrl}/cap/athletes`);
	await page.waitForSelector('text=Athletes (1)', { timeout: 15000 });
	await page.waitForSelector('text=Jordan Avery');
	await showSlate(page, 'Viewer: identity only — private fields are never sent');
	// The private markers must be absent from the whole page, not just hidden.
	const viewerHtml = await page.content();
	for (const marker of [ATHLETE.email, ATHLETE.phone, ATHLETE.notes]) {
		if (viewerHtml.includes(marker))
			throw new Error(`Viewer page leaked a private marker: ${marker.slice(0, 6)}…`);
	}
	if (await page.$('#firstName')) throw new Error('Viewer should not see the create form');
	observed('Viewer sees name/nationality/status; no email, phone, notes, or editing controls');
	await beat(800);
	await page.waitForSelector('text=can view athletes but not manage them');
	observed('Read-only notice explains the role boundary');
	await settleScene('s2-viewer-readonly');

	// ---- S3 — Archive, then restore -------------------------------------------
	markScene('s3-archive-restore', 'Owner archives and restores the same record');
	await become(context, auth.sam);
	await page.goto(`${orgUrl}/cap/athletes`);
	await page.waitForSelector('text=Jordan Avery', { timeout: 15000 });
	await showSlate(page, 'Archive keeps the record — there is no permanent delete');
	await page.click('button:has-text("Archive")');
	await page.waitForSelector('text=Archived', { timeout: 15000 });
	observed('Athlete archived — record preserved, marked inactive');
	await beat(900);
	await page.click('button:has-text("Restore")');
	await page.waitForSelector('text=Active', { timeout: 15000 });
	observed('Same record restored with its details intact');
	await settleScene('s3-archive-restore');

	// ---- S4 — CSV import (bulk option) ----------------------------------------
	markScene('s4-csv-import', 'CSV import for bulk roster entry');
	await showSlate(page, 'Bulk entry: one athlete per CSV row');
	await page.click('button:has-text("Import CSV")');
	await page.waitForSelector('text=Import athletes from CSV', { timeout: 15000 });
	await page.waitForSelector('textarea[name="csv"]');
	observed('CSV import dialog offers bulk entry (not exercised — demo data stays minimal)');
	await settleScene('s4-csv-import');
	await page.keyboard.press('Escape');

	await context.close();
} finally {
	await browser.close();
}

// Move the single-take video into place and write the scene timing manifest.
const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(path.join(OUT, webm), path.join(OUT, 'phase1c-walkthrough.webm'));
writeFileSync(
	path.join(OUT, 'run-manifest-1c.json'),
	JSON.stringify(
		{
			video: 'recordings/output/phase1c-walkthrough.webm',
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
console.log('RECORDING 1C OK');
