/**
 * Phase 1C browser acceptance flow: the athletes capability as a working
 * workflow — onboarding selection, create/edit/archive/import, role
 * boundaries, disable/re-enable preservation — on the disposable preview stack.
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
const OWNER = { name: 'C Owner', email: `e2e-c-owner-${ts}@example.com` };
const VIEWER = { name: 'C Viewer', email: `e2e-c-viewer-${ts}@example.com` };
const SCOREKEEPER = { name: 'C Scorekeeper', email: `e2e-c-sk-${ts}@example.com` };

function expect(cond, label) {
	if (!cond) throw new Error(`E2E assertion failed: ${label}`);
	console.log(`  ✓ ${label}`);
}

/** Recursively collects athlete-shaped objects (firstName + status keys) from
 * a parsed SvelteKit __data.json payload. */
function collectAthleteRows(node, acc = []) {
	if (Array.isArray(node)) {
		for (const item of node) collectAthleteRows(item, acc);
		return acc;
	}
	if (node && typeof node === 'object') {
		if ('firstName' in node && 'status' in node) acc.push(node);
		for (const value of Object.values(node)) collectAthleteRows(value, acc);
	}
	return acc;
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

async function registerVerifySignIn(page, who) {
	await page.goto(`${APP}/register`);
	await page.fill('input[name="name"]', who.name);
	await page.fill('input[name="email"]', who.email);
	await page.fill('input[name="password"]', PASS);
	await page.fill('input[name="passwordConfirm"]', PASS);
	await page.click('button[type="submit"]');
	await page.waitForSelector('text=We sent a verification email', { timeout: 15000 });
	const token = await verificationToken(who.email);
	await page.goto(`${APP}/verify-email/${token}`);
	await page.waitForLoadState('networkidle');
	await page.goto(`${APP}/login`);
	await page.fill('input[name="email"]', who.email);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/organizations/, { timeout: 15000 });
}

try {
	const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const p = await ctx.newPage();
	p.on('dialog', (d) => d.accept());

	console.log('Step 1: owner account + org with athletes enabled');
	await registerVerifySignIn(p, OWNER);
	await p.fill('#org-name', 'C Athletes Org');
	await p.click('input[name="template"][value="custom"]');
	await p.check('input[name="capability"][value="athletes"]');
	await p.click('button:has-text("Create organization")');
	await p.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	const orgUrl = p.url();
	const orgId = orgUrl.split('/').pop();

	console.log('Step 2: athletes capability in navigation opens a working screen');
	await p.waitForSelector('nav[aria-label="Organization sections"]');
	await p.waitForLoadState('networkidle');
	await p
		.locator('nav[aria-label="Organization sections"]')
		.getByRole('link', { name: /Athletes/ })
		.click();
	await p.waitForURL(/\/cap\/athletes/, { timeout: 15000 });
	await p.waitForSelector('text=Athletes (0)');
	expect(true, 'athletes page opens from navigation');
	expect(
		(await p.$('text=Add an athlete')) !== null,
		'manager form present (available, not planned)'
	);

	console.log('Step 3: create, edit, archive, restore');
	await p.fill('#firstName', 'Riley');
	await p.fill('#lastName', 'Chen');
	await p.selectOption('#gender', 'female');
	await p.fill('#nationality', 'USA');
	await p.fill('#email', 'riley.chen@example.com');
	await p.fill('#phone', '+1-555-0101');
	await p.fill('#eligibilityNotes', 'NOTE-MARKER-U24');
	await p.click('button:has-text("Add athlete")');
	await p.waitForSelector('text=Riley Chen', { timeout: 15000 });
	// Owner/Admin see the private contact fields merged onto the row; notes
	// are not rendered in the list — the owner sees them in the edit dialog.
	await p.waitForSelector('text=riley.chen@example.com', { timeout: 15000 });
	await p.waitForSelector('text=+1-555-0101', { timeout: 15000 });
	expect(true, 'athlete created and listed (owner sees private contact fields)');
	await p.click('button:has-text("Edit")');
	await p.waitForSelector('text=Edit athlete');
	const notesValue = await p.$eval('#edit-eligibility', (el) => el.value).catch(() => null);
	expect(notesValue === 'NOTE-MARKER-U24', 'owner sees eligibility notes in the edit dialog');
	await p.fill('#edit-displayName', 'Riley C.');
	await p.click('button:has-text("Save changes")');
	await p.waitForSelector('text=Riley C.', { timeout: 15000 });
	expect(true, 'athlete edited via dialog');
	await p.click('button:has-text("Archive")');
	await p.waitForSelector('text=Archived', { timeout: 15000 });
	expect(true, 'athlete archived (records preserved)');
	await p.click('button:has-text("Restore")');
	await p.waitForSelector('text=Active', { timeout: 15000 });
	expect(true, 'athlete restored');
	await p.screenshot({ path: path.join(OUT, '1c-03-athletes.png') });

	console.log('Step 4: CSV import');
	await p.click('button:has-text("Import CSV")');
	await p.waitForSelector('text=Import athletes from CSV');
	const dialog = p.locator('[data-slot="dialog-content"]');
	await dialog
		.locator('textarea[name="csv"]')
		.fill(
			'Jordan,Patel,male,Canada,jordan@example.com\nSam,Garcia,female,Mexico,\nAlex,Kim,unspecified,USA,'
		);
	await dialog.locator('button:has-text("Import")').click();
	await p.waitForSelector('text=Import complete', { timeout: 20000 });
	await p.waitForSelector('text=Athletes (4)');
	expect(true, 'CSV import created three more athletes');

	console.log('Step 5: viewer is read-only');
	// Pre-create + accept a viewer off-camera (the UI path is proven in 1A/1B).
	const ownerAuth = await fetch(`${PB}/api/collections/users/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: OWNER.email, password: PASS })
	}).then((r) => r.json());
	await fetch(`${PB}/api/collections/users/records`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: VIEWER.email,
			password: PASS,
			passwordConfirm: PASS,
			name: VIEWER.name
		})
	});
	await fetch(`${PB}/api/collections/users/request-verification`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: VIEWER.email })
	});
	const vt = await verificationToken(VIEWER.email);
	await fetch(`${PB}/api/collections/users/confirm-verification`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: vt })
	});
	const invite = await fetch(`${PB}/api/flihub/invitations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: ownerAuth.token },
		body: JSON.stringify({ organization: orgId, email: VIEWER.email, role: 'viewer' })
	}).then((r) => r.json());
	const viewerAuth = await fetch(`${PB}/api/collections/users/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: VIEWER.email, password: PASS })
	}).then((r) => r.json());
	// Same for a scorekeeper — the second read-oriented role.
	await fetch(`${PB}/api/collections/users/records`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: SCOREKEEPER.email,
			password: PASS,
			passwordConfirm: PASS,
			name: SCOREKEEPER.name
		})
	});
	await fetch(`${PB}/api/collections/users/request-verification`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: SCOREKEEPER.email })
	});
	const skToken = await verificationToken(SCOREKEEPER.email);
	await fetch(`${PB}/api/collections/users/confirm-verification`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: skToken })
	});
	const skInvite = await fetch(`${PB}/api/flihub/invitations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: ownerAuth.token },
		body: JSON.stringify({ organization: orgId, email: SCOREKEEPER.email, role: 'scorekeeper' })
	}).then((r) => r.json());
	const skAuth = await fetch(`${PB}/api/collections/users/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: SCOREKEEPER.email, password: PASS })
	}).then((r) => r.json());
	await fetch(`${PB}/api/flihub/invitations/accept`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: skAuth.token },
		body: JSON.stringify({ token: skInvite.token })
	});
	await fetch(`${PB}/api/flihub/invitations/accept`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: viewerAuth.token },
		body: JSON.stringify({ token: invite.token })
	});

	const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const v = await ctxV.newPage();
	await v.goto(`${APP}/login`);
	await v.fill('input[name="email"]', VIEWER.email);
	await v.fill('input[name="password"]', PASS);
	await v.click('button[type="submit"]');
	await v.waitForURL(/\/organizations/, { timeout: 15000 });
	await v.goto(`${orgUrl}/cap/athletes`);
	await v.waitForSelector('text=Athletes (4)');
	expect(true, 'viewer sees the athlete list');
	expect((await v.$('text=Add an athlete')) === null, 'viewer has no create form');
	// Private contact/eligibility fields are Owner/Admin-only: the viewer's
	// initial document and page-data payload must not contain them anywhere.
	const viewerDoc = await v.content();
	expect(
		!viewerDoc.includes('riley.chen@example.com') &&
			!viewerDoc.includes('+1-555-0101') &&
			!viewerDoc.includes('NOTE-MARKER-U24'),
		'viewer initial document has no private markers'
	);
	await v.waitForSelector('text=can view athletes but not manage them');
	// Direct API write from the viewer's account is denied (against PocketBase directly).
	const denied = await v.evaluate(
		async ({ pbUrl, oid, token }) => {
			const res = await fetch(`${pbUrl}/api/collections/athletes/records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: token },
				body: JSON.stringify({ organization: oid, firstName: 'X', lastName: 'Y', status: 'active' })
			});
			return res.status;
		},
		{ pbUrl: PB, oid: orgId, token: viewerAuth.token }
	);
	expect(denied === 400 || denied === 403, `viewer direct API write denied (${denied})`);
	// Direct read of the private collection returns zero rows for the viewer.
	const privateLeak = await v.evaluate(
		async ({ pbUrl, oid, token }) => {
			const res = await fetch(
				`${pbUrl}/api/collections/athlete_private/records?filter=${encodeURIComponent(`organization = "${oid}"`)}`,
				{ headers: { Authorization: token } }
			);
			const data = await res.json();
			return { status: res.status, total: data.totalItems ?? -1 };
		},
		{ pbUrl: PB, oid: orgId, token: viewerAuth.token }
	);
	expect(
		privateLeak.status === 200 && privateLeak.total === 0,
		`viewer direct athlete_private read returns no rows (${JSON.stringify(privateLeak)})`
	);
	// The SvelteKit page data payload itself must omit the private fields.
	const viewerData = await v.evaluate(async (dataUrl) => {
		const res = await fetch(dataUrl);
		return res.status === 200 ? await res.text() : '';
	}, `${orgUrl}/cap/athletes/__data.json`);
	expect(
		viewerData.length > 0 &&
			viewerData.includes('Riley') &&
			!viewerData.includes('riley.chen@example.com') &&
			!viewerData.includes('+1-555-0101') &&
			!viewerData.includes('NOTE-MARKER-U24') &&
			!viewerData.includes('jordan@example.com'),
		'viewer page data has identity but no private fields'
	);
	// Object-level check: parse the page-data payload and assert every athlete
	// object carries identity but OMITS the private field keys entirely.
	const viewerAthletes = collectAthleteRows(JSON.parse(viewerData));
	expect(
		viewerAthletes.length === 4 &&
			viewerAthletes.every((a) => !('email' in a) && !('phone' in a) && !('eligibilityNotes' in a)),
		`viewer page-data athlete objects omit email/phone/eligibilityNotes (${viewerAthletes.length} rows)`
	);
	// Post-hydration rendered DOM: identity visible, all private markers absent.
	const viewerDom = await v.evaluate(() => document.body.innerText);
	expect(
		viewerDom.includes('Riley') &&
			!viewerDom.includes('riley.chen@example.com') &&
			!viewerDom.includes('+1-555-0101') &&
			!viewerDom.includes('NOTE-MARKER-U24'),
		'viewer rendered DOM after hydration: identity present, all private markers absent'
	);

	// Scorekeeper gets the same restricted view.
	const ctxS = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const s = await ctxS.newPage();
	await s.goto(`${APP}/login`);
	await s.fill('input[name="email"]', SCOREKEEPER.email);
	await s.fill('input[name="password"]', PASS);
	await s.click('button[type="submit"]');
	await s.waitForURL(/\/organizations/, { timeout: 15000 });
	await s.goto(`${orgUrl}/cap/athletes`);
	await s.waitForSelector('text=Athletes (4)');
	expect((await s.$('text=Add an athlete')) === null, 'scorekeeper has no create form');
	const skDoc = await s.content();
	expect(
		!skDoc.includes('riley.chen@example.com') &&
			!skDoc.includes('+1-555-0101') &&
			!skDoc.includes('NOTE-MARKER-U24'),
		'scorekeeper initial document has no private markers'
	);
	const skDenied = await s.evaluate(
		async ({ pbUrl, oid, token }) => {
			const res = await fetch(`${pbUrl}/api/collections/athletes/records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: token },
				body: JSON.stringify({ organization: oid, firstName: 'X', lastName: 'Y', status: 'active' })
			});
			return res.status;
		},
		{ pbUrl: PB, oid: orgId, token: skAuth.token }
	);
	expect(skDenied === 400 || skDenied === 403, `scorekeeper direct API write denied (${skDenied})`);
	const skLeak = await s.evaluate(
		async ({ pbUrl, oid, token }) => {
			const res = await fetch(
				`${pbUrl}/api/collections/athlete_private/records?filter=${encodeURIComponent(`organization = "${oid}"`)}`,
				{ headers: { Authorization: token } }
			);
			const data = await res.json();
			return { status: res.status, total: data.totalItems ?? -1 };
		},
		{ pbUrl: PB, oid: orgId, token: skAuth.token }
	);
	expect(
		skLeak.status === 200 && skLeak.total === 0,
		`scorekeeper direct athlete_private read returns no rows (${JSON.stringify(skLeak)})`
	);
	const skData = await s.evaluate(async (dataUrl) => {
		const res = await fetch(dataUrl);
		return res.status === 200 ? await res.text() : '';
	}, `${orgUrl}/cap/athletes/__data.json`);
	expect(
		skData.length > 0 &&
			skData.includes('Riley') &&
			!skData.includes('riley.chen@example.com') &&
			!skData.includes('+1-555-0101') &&
			!skData.includes('NOTE-MARKER-U24') &&
			!skData.includes('jordan@example.com'),
		'scorekeeper page data has identity but no private fields'
	);
	const skAthletes = collectAthleteRows(JSON.parse(skData));
	expect(
		skAthletes.length === 4 &&
			skAthletes.every((a) => !('email' in a) && !('phone' in a) && !('eligibilityNotes' in a)),
		`scorekeeper page-data athlete objects omit email/phone/eligibilityNotes (${skAthletes.length} rows)`
	);
	await s.waitForSelector('text=can view athletes but not manage them');
	const skDom = await s.evaluate(() => document.body.innerText);
	expect(
		skDom.includes('Riley') &&
			!skDom.includes('riley.chen@example.com') &&
			!skDom.includes('+1-555-0101') &&
			!skDom.includes('NOTE-MARKER-U24'),
		'scorekeeper rendered DOM after hydration: identity present, all private markers absent'
	);

	console.log('Step 6: disable preserves, re-enable restores');
	await p.goto(`${orgUrl}/settings`);
	await p.uncheck('input[name="capability"][value="athletes"]');
	await p.click('button:has-text("Save")');
	await p.waitForSelector('text=Settings saved');
	// Scope to the org section nav — the org's name may contain the word "Athletes".
	const navOff = (await p.locator('nav[aria-label="Organization sections"]').allInnerTexts()).join(
		'\n'
	);
	expect(!navOff.includes('Athletes'), 'athletes leaves navigation when disabled');
	await p.goto(`${orgUrl}/cap/athletes`);
	await v.waitForLoadState; // no-op
	await p.waitForSelector('text=is not enabled');
	expect(true, 'disabled athletes page shows honest not-enabled state');
	// Direct API write while disabled is hook-denied (against PocketBase directly).
	const blocked = await p.evaluate(
		async ({ pbUrl, oid, token }) => {
			const res = await fetch(`${pbUrl}/api/collections/athletes/records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: token },
				body: JSON.stringify({ organization: oid, firstName: 'X', lastName: 'Y', status: 'active' })
			});
			return res.status;
		},
		{ pbUrl: PB, oid: orgId, token: ownerAuth.token }
	);
	expect(blocked === 400, `direct write while disabled blocked (${blocked})`);
	await p.goto(`${orgUrl}/settings`);
	await p.check('input[name="capability"][value="athletes"]');
	await p.click('button:has-text("Save")');
	await p.waitForSelector('text=Settings saved');
	await p.goto(`${orgUrl}/cap/athletes`);
	await p.waitForSelector('text=Athletes (4)');
	expect(true, 're-enabled: all four athletes intact');

	console.log('Step 7: mobile');
	const ctxM = await browser.newContext({ viewport: { width: 375, height: 800 } });
	const m = await ctxM.newPage();
	await m.goto(`${APP}/login`);
	await m.fill('input[name="email"]', OWNER.email);
	await m.fill('input[name="password"]', PASS);
	await m.click('button[type="submit"]');
	await m.waitForURL(/\/organizations/, { timeout: 15000 });
	await m.goto(`${orgUrl}/cap/athletes`);
	await m.waitForSelector('text=Athletes (4)');
	await m.screenshot({ path: path.join(OUT, '1c-07-mobile.png') });
	expect(true, 'mobile athletes view usable at 375px');

	await browser.close();
	console.log('E2E 1C OK');
} catch (err) {
	console.error(err);
	process.exit(1);
}
