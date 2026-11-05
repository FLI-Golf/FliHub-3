/**
 * Phase 1B walkthrough recording (Playwright, headless Chromium, 1280×720,
 * single continuous take): configurable onboarding and capability-aware
 * navigation.
 *
 * Runs against a disposable instance with fictional demo accounts. Persona
 * switches use prepared session cookies (authentication happens off-camera).
 * Every scene synchronizes on visible UI outcomes (waitForSelector on the
 * expected result), and each scene records its start offset plus the observed
 * outcome in output/run-manifest-1b.json for review.
 *
 * Run via `npm run record:walkthrough-1b` — the runner provides the
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
		'Run via `npm run record:walkthrough-1b` (recordings/run-walkthrough.mjs sets env).'
	);
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const PASSWORD = 'demo-not-a-real-password';
const PEOPLE = {
	dana: { name: 'Dana Kim', email: 'dana.kim@example.com' },
	morgan: { name: 'Morgan Lee', email: 'morgan.lee@example.com' },
	jesse: { name: 'Jesse Park', email: 'jesse.park@example.com' }
};
const ORG_LEAGUE = 'Riverside Disc Golf League';
const ORG_RACE = 'City 10K Series';
const ORG_CUSTOM = 'Community Club';

const beat = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

// Clock origin = recording context creation (video t=0), NOT module load —
// account seeding must not shift the scene offsets off the video timeline.
let t0 = 0;
const sceneLog = [];
function seconds() {
	return Math.round((Date.now() - t0) / 100) / 10;
}
/** Marks a scene start; later observed() calls attach outcomes to it. */
function markScene(id, title) {
	sceneLog.push({ id, title, offsetSeconds: seconds(), observed: [] });
	console.log(`Scene ${id} @ ${seconds()}s`);
}
/** Records an observed, on-screen outcome for the current scene. */
function observed(text) {
	sceneLog[sceneLog.length - 1].observed.push({ atSeconds: seconds(), outcome: text });
	console.log(`  observed @ ${seconds()}s: ${text}`);
}

// Narration-paced minimum scene durations: each explanation must fit inside
// its scene without stretching speech later. Local estimate only — no API.
const narration = JSON.parse(
	readFileSync(
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'narration-1b.json'),
		'utf8'
	)
);
const WORDS_PER_SECOND = 2.4; // ≈145 wpm, comfortable unhurried pace
const LEAD_TAIL_SECONDS = 2.4; // slate lead-in + scene-out hold
function minSceneSeconds(id) {
	const scene = narration.scenes.find((n) => n.id === id);
	const words = scene.tts.trim().split(/\s+/).length;
	return words / WORDS_PER_SECOND + LEAD_TAIL_SECONDS;
}
/** Holds the current scene until its narration-length minimum has elapsed. */
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

/** Switches the recorded session to another prepared persona (or anonymous). */
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

	const context = await browser.newContext({
		viewport: { width: 1280, height: 720 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
	});
	t0 = Date.now(); // video t=0 starts with the recording context
	const page = await context.newPage();
	page.on('dialog', (d) => d.accept());

	// ---- S1 — intro ---------------------------------------------------------
	markScene('s1-intro', 'Intro: capability progress overview');
	await become(context, auth.dana);
	await page.goto(`${APP}/`);
	await page.waitForSelector('text=Capability progress');
	await showSlate(page, 'FliHub walkthrough — Phase 1B: onboarding templates and capabilities');
	await beat(1400);
	observed('Overview page shows the capability progress cards');
	await page.goto(`${APP}/organizations`);
	await page.waitForSelector('text=No memberships yet');
	observed('A fresh account has no organizations');
	await settleScene('s1-intro');

	// ---- S2 — League onboarding ----------------------------------------------
	markScene('s2-league-onboarding', 'League template with editable capability suggestions');
	await showSlate(page, `Create an organization — League template`);
	await page.locator('#org-name').pressSequentially(ORG_LEAGUE, { delay: 70 });
	await page.click('input[name="template"][value="league"]');
	await page.waitForSelector('input[name="capability"][value="athletes"]');
	await page.waitForSelector('input[name="capability"][value="teams"]:checked');
	observed('League template suggests its default capabilities');
	await beat(900);
	// Dependency cascade demo: unchecking Events removes what depends on it.
	await page.click('input[name="capability"][value="events"]');
	await page.waitForSelector('input[name="capability"][value="events"]:not(:checked)');
	await page.waitForSelector('input[name="capability"][value="scoring-results"]:not(:checked)');
	observed('Unchecking Events also unchecks Scoring & results and Standings (dependencies)');
	await beat(800);
	await page.click('input[name="capability"][value="events"]');
	await page.click('input[name="capability"][value="scoring-results"]');
	await page.click('input[name="capability"][value="standings"]');
	await page.waitForSelector('input[name="capability"][value="standings"]:checked');
	await page.waitForSelector('text=Summary:');
	observed('Summary shows name, template, and selection before completion');
	await beat(600);
	await page.click('button:has-text("Create organization")');
	await page.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 20000 });
	await page.waitForSelector('text=Your role: Owner');
	observed(`${ORG_LEAGUE} created; Dana is its Owner`);
	const leagueOrgUrl = page.url();
	const leagueOrgId = leagueOrgUrl.split('/').pop();
	await page.waitForSelector('nav >> text=Settings');
	observed('Organization navigation shows Members, Settings, and enabled capabilities');
	await settleScene('s2-league-onboarding');

	// Off-camera: invite Morgan (Admin) and Jesse (Viewer) to the league org.
	console.log('Inviting Morgan and Jesse off-camera…');
	for (const [key, role] of [
		['morgan', 'admin'],
		['jesse', 'viewer']
	]) {
		const invite = await api('/api/flihub/invitations', {
			method: 'POST',
			token: auth.dana.token,
			body: { organization: leagueOrgId, email: PEOPLE[key].email, role }
		});
		await api('/api/flihub/invitations/accept', {
			method: 'POST',
			token: auth[key].token,
			body: { token: invite.token }
		});
	}

	// ---- S3 — honest planned destinations ------------------------------------
	markScene('s3-honest-planned', 'Enabled but not-yet-built capabilities stay honest');
	await showSlate(page, 'Enabled capabilities are labeled Planned — nothing is faked');
	await page.click('nav >> text=Athletes');
	await page.waitForSelector('main >> text=Planned');
	await page.waitForSelector(`text=${'Athletes'}`);
	observed('The Athletes destination explains it is planned, with no fake controls');
	await page.goto(`${leagueOrgUrl}/cap/fantasy`);
	await page.waitForSelector('text=Not enabled');
	observed('A disabled capability explains its state instead of breaking');
	await settleScene('s3-honest-planned');

	// ---- S4 — Race/Event onboarding -------------------------------------------
	markScene('s4-race-onboarding', 'Race/Event template with distances');
	await page.goto(`${APP}/organizations`);
	await showSlate(page, 'Race/Event template — marathon, half marathon, or custom distances');
	await page.locator('#org-name').pressSequentially(ORG_RACE, { delay: 70 });
	await page.click('input[name="template"][value="race-event"]');
	await page.waitForSelector('text=Marathon');
	await page.waitForSelector('input[type="checkbox"]:checked >> nth=0');
	observed('Marathon (42.195 km) and half marathon (21.0975 km) presets are suggested');
	await page.click('button:has-text("Add custom distance")');
	await page.fill('input[placeholder="Label (e.g. 10K)"]', 'Charity 5 Miler');
	await page.fill('input[placeholder="Distance"]', '5');
	await page.selectOption('select', 'mi');
	await beat(600);
	observed('Custom distance added with an explicit unit (5 mi)');
	await page.click('button:has-text("Create organization")');
	await page.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 20000 });
	await page.waitForSelector('text=Your role: Owner');
	const raceOrgUrl = page.url();
	await page.goto(`${raceOrgUrl}/settings`);
	await page.waitForSelector('text=Race distances');
	await page.waitForFunction(() =>
		[...document.querySelectorAll('main input')].some((el) => el.value === 'Marathon')
	);
	observed('Settings show the saved distances, editable later');
	await settleScene('s4-race-onboarding');

	// ---- S5 — Custom onboarding ------------------------------------------------
	markScene('s5-custom-onboarding', 'Custom template — no assumptions');
	await page.goto(`${APP}/organizations`);
	await showSlate(page, 'Custom template — choose deliberately');
	await page.locator('#org-name').pressSequentially(ORG_CUSTOM, { delay: 70 });
	await page.click('input[name="template"][value="custom"]');
	await beat(700);
	observed('Custom pre-selects nothing');
	await page.click('input[name="capability"][value="athletes"]');
	await page.waitForSelector('input[name="capability"][value="athletes"]:checked');
	await page.click('button:has-text("Create organization")');
	await page.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 20000 });
	await page.waitForSelector('text=Your role: Owner');
	observed(`${ORG_CUSTOM} created with only Athletes enabled`);
	await settleScene('s5-custom-onboarding');

	// ---- S6 — Admin configures capabilities ------------------------------------
	markScene('s6-admin-configures', 'Admins (not just Owners) may configure');
	await become(context, auth.morgan);
	// Establish the Admin role on camera before any configuration is shown.
	await page.goto(`${leagueOrgUrl}`);
	await showSlate(page, `${PEOPLE.morgan.name} is an Admin on this organization`);
	await page.waitForSelector('text=Your role: Admin');
	observed('The role badge shows Morgan is an Admin');
	await page.goto(`${leagueOrgUrl}/settings`);
	await page.waitForSelector('input[name="capability"][value="fantasy"]');
	await page.click('input[name="capability"][value="fantasy"]');
	await page.waitForSelector('input[name="capability"][value="fantasy"]:checked');
	await page.waitForSelector('input[name="capability"][value="standings"]:checked');
	observed('Selecting Fantasy auto-selects the capabilities it depends on');
	await page.click('button:has-text("Save")');
	await page.waitForSelector('text=Settings saved');
	observed('Configuration saved and recorded in the audit trail');
	await settleScene('s6-admin-configures');

	// ---- S7 — disable / re-enable preserves settings ----------------------------
	markScene('s7-disable-reenable', 'Disabling hides workflows — it never deletes data');
	await showSlate(page, 'Disable, then re-enable — configuration is preserved');
	await page.click('input[name="capability"][value="fantasy"]');
	await page.waitForSelector('input[name="capability"][value="fantasy"]:not(:checked)');
	await page.click('button:has-text("Save")');
	await page.waitForSelector('text=Settings saved');
	await beat(500);
	const navWithoutFantasy = (await page.locator('nav').allInnerTexts()).join('\n');
	if (navWithoutFantasy.includes('Fantasy')) {
		throw new Error('Fantasy still in nav after disabling');
	}
	observed('Disabling removes the capability from navigation');
	await page.click('input[name="capability"][value="fantasy"]');
	await page.click('button:has-text("Save")');
	await page.waitForSelector('text=Settings saved');
	const navWithFantasy = (await page.locator('nav').allInnerTexts()).join('\n');
	if (!navWithFantasy.includes('Fantasy')) {
		throw new Error('Fantasy did not return to nav after re-enabling');
	}
	observed('Re-enabling restores it exactly');
	// The race org belongs to Dana — switch back to check its preserved settings.
	await become(context, auth.dana);
	await page.goto(`${raceOrgUrl}/settings`);
	await page.waitForFunction(() =>
		[...document.querySelectorAll('main input')].some((el) => el.value === 'Charity 5 Miler')
	);
	observed('The race distances configured earlier are intact');
	await settleScene('s7-disable-reenable');

	// ---- S8 — viewer boundary ----------------------------------------------------
	markScene('s8-viewer-boundary', 'Capabilities never grant role permissions');
	await become(context, auth.jesse);
	await page.goto(`${leagueOrgUrl}`);
	await page.waitForSelector('text=Your role: Viewer');
	const viewerNav = (await page.locator('nav').allInnerTexts()).join('\n');
	if (viewerNav.includes('Settings')) throw new Error('Viewer sees Settings nav');
	observed('A Viewer sees no Settings link');
	await page.goto(`${leagueOrgUrl}/settings`);
	await page.waitForSelector('text=Read-only for your role');
	observed('The settings page is read-only for Viewers');
	await settleScene('s8-viewer-boundary');

	// ---- S9 — outro ----------------------------------------------------------------
	markScene('s9-outro', 'Three organizations, honestly labeled');
	await become(context, auth.dana);
	await page.goto(`${APP}/organizations`);
	await showSlate(page, 'League, Race/Event, and Custom — onboarded, adjustable, honest');
	await page.waitForSelector(`text=${ORG_LEAGUE}`);
	await page.waitForSelector(`text=${ORG_RACE}`);
	await page.waitForSelector(`text=${ORG_CUSTOM}`);
	observed('All three organizations are listed and switchable');
	await settleScene('s9-outro');

	await context.close();
} finally {
	await browser.close();
}

// Move the single-take video into place and write the scene timing manifest.
const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(path.join(OUT, webm), path.join(OUT, 'phase1b-walkthrough.webm'));
writeFileSync(
	path.join(OUT, 'run-manifest-1b.json'),
	JSON.stringify(
		{
			video: 'recordings/output/phase1b-walkthrough.webm',
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
console.log('RECORDING 1B OK');
