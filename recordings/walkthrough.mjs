/**
 * Phase 1A walkthrough recording (Playwright, headless Chromium, 1280×720,
 * single continuous take).
 *
 * Records the implemented Phase 1A workflow against a disposable instance
 * with fictional demo accounts. Deliberately paced, with a scene slate shown
 * at each scene start. Persona switches happen via prepared session cookies
 * (authentication is prepared off-camera); invitation/verification tokens
 * never appear legibly on screen (copy-link inputs are blurred).
 *
 * One context = one .webm file, so no ffmpeg concatenation is required.
 * Scene start offsets are written to output/run-manifest.json.
 *
 * Run via `npm run record:walkthrough` — the runner provides the environment.
 */
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_RECORD_APP_URL;
const MAILPIT = process.env.FLIHUB_RECORD_MAILPIT_URL;
const PB = process.env.FLIHUB_RECORD_PB_URL;
if (!APP || !MAILPIT || !PB) {
	throw new Error(
		'Run via `npm run record:walkthrough` (recordings/run-walkthrough.mjs sets env).'
	);
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const PASSWORD = 'demo-not-a-real-password';
const PEOPLE = {
	casey: { name: 'Casey Rivera', email: 'casey.rivera@example.com' },
	alex: { name: 'Alex Chen', email: 'alex.chen@example.com' },
	sam: { name: 'Sam Ortiz', email: 'sam.ortiz@example.com' },
	val: { name: 'Val Kim', email: 'val.kim@example.com' }
};
const ORG_A = 'Riverside Disc Golf Club';
const ORG_B = 'City League';

const beat = (ms = 1200) => new Promise((r) => setTimeout(r, ms));
const startedAt = Date.now();
const sceneOffsets = [];
function markScene(id) {
	sceneOffsets.push({ id, offsetSeconds: Math.round((Date.now() - startedAt) / 1000) });
	console.log(`Scene ${id} @ ${Math.round((Date.now() - startedAt) / 1000)}s`);
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

/** Confirms the newest verification email for an address via mailpit. */
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
		body: {
			email: person.email,
			password: PASSWORD,
			passwordConfirm: PASSWORD,
			name: person.name
		}
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

/** Masks one-time link material so tokens are never legible on camera. */
async function blurSensitiveInputs(page) {
	await page.evaluate(() => {
		document.querySelectorAll('input[readonly]').forEach((el) => (el.style.filter = 'blur(7px)'));
	});
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
	// Casey registers on camera; the other personas are prepared here.
	for (const key of ['alex', 'sam', 'val']) {
		auth[key] = await createVerifiedUser(PEOPLE[key]);
	}

	const context = await browser.newContext({
		viewport: { width: 1280, height: 720 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
	});
	const page = await context.newPage();
	page.on('dialog', (d) => d.accept());

	// ---- S1 — intro (anonymous) ---------------------------------------------
	markScene('s1-intro');
	await page.goto(`${APP}/`);
	await page.waitForSelector('text=FliHub — sports organization management');
	await showSlate(
		page,
		'FliHub walkthrough — Phase 1A: accounts, organizations, invitations, roles'
	);
	await beat(1600);

	// ---- S2 — register + create organization (Casey, on camera) -------------
	markScene('s2-register-create-org');
	await page.goto(`${APP}/register`);
	await showSlate(page, 'Create an account');
	await page.locator('input[name="name"]').pressSequentially(PEOPLE.casey.name, { delay: 80 });
	await page.locator('input[name="email"]').pressSequentially(PEOPLE.casey.email, { delay: 80 });
	await page.locator('input[name="password"]').pressSequentially(PASSWORD, { delay: 80 });
	await page.locator('input[name="passwordConfirm"]').pressSequentially(PASSWORD, { delay: 80 });
	await beat(800);
	await page.click('button[type="submit"]');
	await page.waitForSelector('text=We sent a verification email', { timeout: 20000 });
	await beat(1600);

	// Verify off-camera (the real user clicks the email link), then fetch the
	// session token for Casey's later pre-authenticated scenes.
	await confirmLatestVerificationEmail(PEOPLE.casey.email);
	auth.casey = await api('/api/collections/users/auth-with-password', {
		method: 'POST',
		body: { identity: PEOPLE.casey.email, password: PASSWORD }
	});

	await page.goto(`${APP}/login`);
	await showSlate(page, 'Sign in');
	await page.locator('input[name="email"]').pressSequentially(PEOPLE.casey.email, { delay: 80 });
	await page.locator('input[name="password"]').pressSequentially(PASSWORD, { delay: 80 });
	await beat(700);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/organizations/, { timeout: 20000 });
	await page.waitForSelector('text=No memberships yet');
	await beat(1500);

	await showSlate(page, 'Create your organization — you become its Owner');
	await page.locator('#org-name').pressSequentially(ORG_A, { delay: 80 });
	await beat(700);
	await page.click('text=Create organization');
	await page.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 20000 });
	await page.waitForSelector('text=Your role: Owner');
	await beat(1800);

	// ---- S3 — invite a member ------------------------------------------------
	markScene('s3-invite-members');
	await showSlate(page, 'Invite a member as Scorekeeper');
	await page.locator('#invite-email').pressSequentially(PEOPLE.sam.email, { delay: 80 });
	await beat(700);
	await page.click('button:has-text("Scorekeeper")');
	await page.waitForSelector('text=Invitation created for', { timeout: 20000 });
	await blurSensitiveInputs(page); // token stays out of the footage
	await beat(1800);
	const samInviteLink = await page.locator('input[readonly]').inputValue();
	if (!samInviteLink) throw new Error('invite link not captured');
	const invitePath = (link) => link.replace(/^https?:\/\/[^/]+/, '');

	// Off-camera: identical invitations for Alex (Admin) and Val (Viewer).
	console.log('Preparing Alex/Val invitations off-camera…');
	const caseyMemberships = await api(
		`/api/collections/memberships/records?filter=(user="${auth.casey.record.id}")`,
		{ token: auth.casey.token }
	);
	const orgId = caseyMemberships.items[0].organization;
	async function inviteOffCamera(person, role) {
		const inv = await api('/api/flihub/invitations', {
			method: 'POST',
			token: auth.casey.token,
			body: { organization: orgId, email: person.email, role }
		});
		return `${APP}/invitations/accept?token=${inv.token}`;
	}
	const alexInviteLink = await inviteOffCamera(PEOPLE.alex, 'admin');
	const valInviteLink = await inviteOffCamera(PEOPLE.val, 'viewer');

	// ---- S4 — Sam accepts (Scorekeeper view) ---------------------------------
	markScene('s4-accept-scorekeeper');
	await become(context, auth.sam);
	await page.goto(`${APP}${invitePath(samInviteLink)}`);
	await showSlate(page, `${PEOPLE.sam.name} opens the invitation link`);
	await page.waitForSelector(`text=${ORG_A}`);
	await beat(1400);
	await page.click('button:has-text("Accept and join")');
	await page.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 20000 });
	await page.waitForSelector('text=Your role: Scorekeeper');
	await showSlate(page, 'Scorekeepers see members — not member management');
	await beat(1600);

	// ---- S5 — Alex (Admin) and Val (Viewer) join ------------------------------
	markScene('s5-admin-and-viewer');
	await become(context, auth.alex);
	await page.goto(`${APP}${invitePath(alexInviteLink)}`);
	await showSlate(page, `${PEOPLE.alex.name} joins as Admin`);
	await page.waitForSelector(`text=${ORG_A}`);
	await beat(1200);
	await page.click('button:has-text("Accept and join")');
	await page.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 20000 });
	await page.waitForSelector('text=Your role: Admin');
	await showSlate(page, 'Admins invite Scorekeepers and Viewers — not Admins');
	await beat(1700);

	await become(context, auth.val);
	await page.goto(`${APP}${invitePath(valInviteLink)}`);
	await showSlate(page, `${PEOPLE.val.name} joins as Viewer`);
	await page.waitForSelector(`text=${ORG_A}`);
	await beat(1000);
	await page.click('button:has-text("Accept and join")');
	await page.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 20000 });
	await page.waitForSelector('text=Your role: Viewer');
	await beat(1400);

	// ---- S6 — second organization + switching (Casey) ------------------------
	markScene('s6-org-switching');
	await become(context, auth.casey);
	await page.goto(`${APP}/organizations`);
	await showSlate(page, 'A second organization');
	await page.locator('#org-name').pressSequentially(ORG_B, { delay: 80 });
	await beat(600);
	await page.click('text=Create organization');
	await page.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 20000 });
	await page.waitForSelector('text=Your role: Owner');
	await beat(1200);
	await page.goto(`${APP}/organizations`);
	await showSlate(page, 'Switching between organizations');
	await page.waitForSelector('text=Set active');
	await page.click('text=Set active');
	await page.waitForLoadState('networkidle');
	await beat(1600);

	// ---- S7 — transfer ownership ---------------------------------------------
	markScene('s7-transfer-ownership');
	await page.goto(`${APP}/organizations/${orgId}`);
	await showSlate(page, 'Transfer ownership to the Admin');
	await page.waitForSelector('text=Members (4)');
	await beat(1200);
	const alexRow = page.locator('div.flex.flex-wrap.items-center.gap-2', {
		hasText: PEOPLE.alex.name
	});
	await alexRow.getByRole('button', { name: 'Transfer ownership' }).click();
	await page.waitForSelector('text=Your role: Admin', { timeout: 20000 });
	await beat(1700);

	await become(context, auth.alex);
	await page.goto(`${APP}/organizations/${orgId}`);
	await showSlate(page, 'The Admin is now the Owner');
	await page.waitForSelector('text=Your role: Owner');
	await beat(1700);

	// ---- S8 — capability progress overview (anonymous) ------------------------
	markScene('s8-progress-overview');
	await become(context, null);
	await page.goto(`${APP}/#planned-features`);
	await showSlate(page, 'Capability progress: Phase 1A complete');
	await page.waitForSelector('text=Organizations, invitations & roles');
	await beat(2200);

	await context.close();

	// Single continuous take: rename the one video file deterministically.
	const videoPath = await page.video().path();
	const { renameSync } = await import('node:fs');
	const finalPath = path.join(OUT, 'phase1a-walkthrough.webm');
	renameSync(videoPath, finalPath);

	writeFileSync(
		path.join(OUT, 'run-manifest.json'),
		JSON.stringify({ video: finalPath, scenes: sceneOffsets }, null, 2)
	);
	console.log('Recorded:', finalPath);
	console.log('RECORDING OK');
} finally {
	await browser.close();
}
