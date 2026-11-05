/**
 * Phase 1A browser acceptance flow (Playwright, headless Chromium):
 *   register → verify email → sign in → create org → invite → recipient
 *   accepts → switch orgs → role boundaries → transfer ownership → sign out.
 * Two organizations (Alpha Club, Beta League), two accounts, two browser
 * contexts. Asserts visible UI state at every step and screenshots each into
 * tests/e2e/output/ (git-ignored).
 *
 * Run via `npm run test:e2e` — the orchestrator provides the environment.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_E2E_APP_URL;
const MAILPIT = process.env.FLIHUB_E2E_MAILPIT_URL;
if (!APP || !MAILPIT) {
	throw new Error('Run via `npm run test:e2e` (tests/e2e/run-e2e.mjs sets the env).');
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
const PASS = 'e2e-password-123';
const ts = Date.now();
const OWNER = { name: 'E2E Owner', email: `e2e-owner-${ts}@example.com` };
const MEMBER = { name: 'E2E Member', email: `e2e-member-${ts}@example.com` };

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

async function registerVerifySignIn(page, who, nextPath) {
	const target = nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : '/register';
	await page.goto(`${APP}${target}`);
	await page.fill('input[name="name"]', who.name);
	await page.fill('input[name="email"]', who.email);
	await page.fill('input[name="password"]', PASS);
	await page.fill('input[name="passwordConfirm"]', PASS);
	await page.click('button[type="submit"]');
	await page.waitForSelector('text=We sent a verification email', { timeout: 15000 });

	const token = await verificationToken(who.email);
	await page.goto(`${APP}/verify-email/${token}`);
	await page.waitForLoadState('networkidle');

	const loginTarget = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login';
	await page.goto(`${APP}${loginTarget}`);
	await page.fill('input[name="email"]', who.email);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');
	await page.waitForLoadState('networkidle');
}

function expect(cond, label) {
	if (!cond) throw new Error(`E2E assertion failed: ${label}`);
	console.log(`  ✓ ${label}`);
}

try {
	// --disable-dev-shm-usage avoids renderer crashes in containers with a small /dev/shm.
	const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

	// ---- Owner: register, verify, sign in, create org -----------------------
	const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const a = await ctxA.newPage();
	a.on('dialog', (d) => d.accept());

	console.log('Step 1: owner registers, verifies email, signs in');
	await registerVerifySignIn(a, OWNER);
	await a.waitForURL(/\/organizations/, { timeout: 15000 });
	await a.waitForSelector('text=No memberships yet');
	expect(true, 'empty state shown for account with no memberships');
	await a.screenshot({ path: path.join(OUT, '01-empty.png') });

	console.log('Step 2: owner creates Alpha Club');
	await a.fill('#org-name', 'Alpha Club');
	await a.click('text=Create organization');
	await a.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	await a.waitForSelector('text=Your role: Owner');
	expect(true, 'org created; owner role badge shown');
	await a.screenshot({ path: path.join(OUT, '02-org-created.png') });

	console.log('Step 3: owner invites member as Scorekeeper');
	await a.fill('#invite-email', MEMBER.email);
	await a.click('button:has-text("Scorekeeper")');
	await a.waitForSelector('text=Invitation created for', { timeout: 15000 });
	const inviteLink = await a.locator('input[readonly]').inputValue();
	expect(inviteLink.includes('/invitations/accept'), 'invite link shown once for copy');
	expect(inviteLink.startsWith(APP), 'invite link stays on-app');
	const invitePath = inviteLink.replace(/^https?:\/\/[^/]+/, '');
	await a.screenshot({ path: path.join(OUT, '03-invite.png') });

	// ---- Member: accept through registration + verification -----------------
	console.log('Step 4: member opens invite link, registers, verifies, accepts');
	const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const b = await ctxB.newPage();
	b.on('dialog', (d) => d.accept());
	await b.goto(`${APP}${invitePath}`);
	await b.waitForURL(/\/login\?next=/, { timeout: 15000 });
	expect(true, 'signed-out invite visit redirects to sign-in with next preserved');
	await b.click('text=Create one');
	await registerVerifySignIn(b, MEMBER, invitePath);
	await b.waitForURL(/\/invitations\/accept/, { timeout: 20000 });
	await b.waitForSelector('text=Alpha Club');
	await b.screenshot({ path: path.join(OUT, '04-accept.png') });
	await b.click('button:has-text("Accept and join")');
	await b.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	await b.waitForSelector('text=Your role: Scorekeeper');
	expect(true, 'member accepted and sees Scorekeeper role');

	console.log('Step 5: role boundaries for Scorekeeper');
	const inviteCard = await b.$('text=Invite a member');
	expect(inviteCard === null, 'scorekeeper does not see invitation management UI');
	const invitesList = await b.$('text=Only Owners and Admins can see this list');
	expect(invitesList === null, 'scorekeeper does not see invitations list');
	await b.waitForSelector('text=Members (2)');
	await b.waitForSelector('text=E2E Owner');
	expect(true, 'member sees member names');
	await b.screenshot({ path: path.join(OUT, '05-member-view.png') });

	// ---- Second org + switching ---------------------------------------------
	console.log('Step 6: second organization and switching');
	await a.goto(`${APP}/organizations`);
	await a.fill('#org-name', 'Beta League');
	await a.click('text=Create organization');
	await a.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	await a.waitForSelector('text=Beta League');
	await a.goto(`${APP}/organizations`);
	await a.waitForSelector('text=Beta League');
	await a.waitForSelector('text=Set active');
	await a.click('text=Set active');
	await a.waitForLoadState('networkidle');
	const headerText = await a.locator('header').innerText();
	expect(headerText.includes('Alpha Club'), 'header shows Alpha Club active after switch');
	await a.screenshot({ path: path.join(OUT, '06-switch.png') });
	await b.goto(`${APP}/organizations`);
	const bOrgsText = await b.locator('main').innerText();
	expect(
		bOrgsText.includes('Alpha Club') && !bOrgsText.includes('Beta League'),
		'member sees only their own organization'
	);

	// ---- Transfer ownership ---------------------------------------------------
	console.log('Step 7: ownership transfer to member');
	await a.goto(`${APP}/organizations`);
	await a.click('text=Open');
	await a.waitForSelector('text=Your role: Owner');
	await a.click('button:has-text("Transfer ownership")'); // confirm() auto-accepted
	await a.waitForSelector('text=Your role: Admin', { timeout: 15000 });
	expect(true, 'former owner becomes Admin after transfer');
	const ownerBadges = await a.locator('main').innerText();
	expect((ownerBadges.match(/Owner/g) || []).length >= 1, 'an Owner still exists');
	await a.screenshot({ path: path.join(OUT, '07-transferred.png') });

	await b.goto(`${APP}/organizations`);
	await b.click('text=Open');
	await b.waitForSelector('text=Your role: Owner', { timeout: 15000 });
	await b.waitForSelector('text=Invite a member');
	expect(true, 'new owner sees invitation management UI');
	const adminInviteCard = await a.$('text=Invite a member');
	expect(adminInviteCard !== null, 'admin retains invite UI');
	const adminRoleButton = await a.$('button[name="role"][value="admin"]');
	expect(adminRoleButton === null, 'admin cannot invite admins (no Admin button)');

	// ---- Sign out --------------------------------------------------------------
	console.log('Step 8: sign out');
	await a.goto(`${APP}/organizations`);
	await a.click('header >> text=Sign out');
	await a.waitForURL(`${APP}/`, { timeout: 15000 });
	await a.waitForSelector('header >> text=Sign in');
	expect(true, 'sign-out returns to signed-out header');
	await a.goto(`${APP}/organizations`);
	await a.waitForURL(/\/login\?next=/, { timeout: 15000 });
	expect(true, 'protected route redirects after sign-out');

	// ---- Mobile spot check ------------------------------------------------------
	console.log('Step 9: mobile viewport');
	const ctxM = await browser.newContext({ viewport: { width: 375, height: 800 } });
	const m = await ctxM.newPage();
	await m.goto(`${APP}/login`);
	await m.fill('input[name="email"]', MEMBER.email);
	await m.fill('input[name="password"]', PASS);
	await m.click('button[type="submit"]');
	await m.waitForURL(/\/organizations/, { timeout: 15000 });
	await m.waitForSelector('main >> text=Alpha Club');
	await m.screenshot({ path: path.join(OUT, '09-mobile.png'), fullPage: true });
	expect(true, 'mobile organizations view usable at 375px');

	await browser.close();
	console.log('E2E OK');
} catch (err) {
	console.error(err);
	process.exit(1);
}
