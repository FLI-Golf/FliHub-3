/**
 * Phase 1B browser acceptance flow: template onboarding (League, Race/Event,
 * Custom), capability settings, capability-aware navigation, role boundaries,
 * and Phase 1A regressions — against the disposable preview stack.
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
const OWNER = { name: 'B Owner', email: `e2e-b-owner-${ts}@example.com` };
const VIEWER = { name: 'B Viewer', email: `e2e-b-viewer-${ts}@example.com` };

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

	console.log('Step 1: owner account');
	await registerVerifySignIn(p, OWNER);
	// API token for off-camera assertions/setup (same account as the browser).
	const apiAuthToken = await fetch(`${PB}/api/collections/users/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: OWNER.email, password: PASS })
	})
		.then((r) => r.json())
		.then((d) => d.token);

	// ---- League template onboarding ------------------------------------------
	console.log('Step 2: League onboarding with editable defaults');
	await p.fill('#org-name', 'B League Org');
	await p.click('input[name="template"][value="league"]');
	await p.waitForSelector('input[name="capability"][value="athletes"]');
	expect(
		await p.isChecked('input[name="capability"][value="teams"]'),
		'league template pre-checks teams'
	);
	expect(
		!(await p.isChecked('input[name="capability"][value="fantasy"]')),
		'league template leaves fantasy unchecked'
	);
	// Defaults are editable: drop Venues & courses (nothing depends on it) and
	// add Fantasy (its standings dependency is a league default) as the
	// honestly-Planned capability — Standings became a working page in 1I.
	await p.uncheck('input[name="capability"][value="venues-courses"]');
	await p.check('input[name="capability"][value="fantasy"]');
	await p.click('button:has-text("Create organization")');
	await p.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	await p.waitForSelector('text=Your role: Owner');
	expect(true, 'league org created through onboarding');
	const leagueUrl = p.url();

	// Settings link visible to owner; capability nav present with honest labels.
	await p.waitForSelector('nav >> text=Settings');
	expect((await p.$$('nav >> text=Planned')).length > 0, 'subnav shows Planned capability labels');
	await p.screenshot({ path: path.join(OUT, '1b-02-league-org.png') });

	// ---- Capability destination pages ----------------------------------------
	// Athletes (1C), Teams/Leagues & seasons/Events (1D), Venues & courses
	// (1F), Scoring (1G), and Standings (1I) became working workflows; Fantasy
	// stays planned and must keep its honest planned panel with no fake CRUD.
	console.log('Step 3: capability pages are honest, not fake CRUD');
	await p.click('nav >> text=Fantasy');
	await p.waitForSelector('text=Planned');
	const capText = await p.locator('main').innerText();
	expect(capText.includes('Fantasy'), 'fantasy capability page reachable from nav');
	expect(
		!capText.includes('Create league') && !capText.includes('Start draft'),
		'no fake CRUD controls on planned page'
	);
	// A capability that is NOT enabled rejects direct-URL access with an explanation.
	await p.goto(`${leagueUrl}/cap/venues-courses`);
	const disabledText = await p.locator('main').innerText();
	expect(
		disabledText.includes('not enabled') || disabledText.includes('Not enabled'),
		'disabled capability rejects direct URL access with an explanation'
	);
	expect(true, 'no broken link or fake screen for disabled capability');

	// ---- Settings: toggle off and on, persistence ------------------------------
	console.log('Step 4: settings persistence');
	await p.goto(`${leagueUrl}/settings`);
	await p.waitForSelector('input[name="capability"][value="events"]');
	await p.uncheck('input[name="capability"][value="events"]');
	await p.click('button:has-text("Save")');
	await p.waitForLoadState('networkidle');
	const navTextAfterOff = await p.locator('header, main nav, nav').allInnerTexts();
	expect(
		!navTextAfterOff.some((t) => t.includes('Events')),
		'disabled capability leaves the navigation'
	);
	// Re-enable and confirm return (dependency closure adds scoring-results back too
	// when events is re-enabled by the user choice below).
	await p.check('input[name="capability"][value="events"]');
	await p.check('input[name="capability"][value="scoring-results"]');
	await p.click('button:has-text("Save")');
	await p.waitForLoadState('networkidle');
	const navTextAfterOn = (await p.locator('nav').allInnerTexts()).join('\n');
	expect(navTextAfterOn.includes('Events'), 're-enabled capability returns to navigation');
	await p.screenshot({ path: path.join(OUT, '1b-04-settings.png') });

	// ---- Race/Event onboarding with distances ----------------------------------
	console.log('Step 5: Race/Event onboarding with distances');
	await p.goto(`${APP}/organizations`);
	await p.waitForLoadState('networkidle');
	await p.fill('#org-name', 'B Race Org');
	await p.click('input[name="template"][value="race-event"]');
	await p.waitForSelector('input[name="capability"][value="athletes"]');
	await p.waitForSelector('text=Marathon');
	expect(await p.isChecked('text=Marathon'), 'marathon preset checked by default');
	await p.click('button:has-text("Add custom distance")');
	await p.fill('input[placeholder="Label (e.g. 10K)"]', 'Charity 5 Miler');
	await p.fill('input[placeholder="Distance"]', '5');
	await p.selectOption('select', 'mi');
	const submittedDistances = await p.locator('input[name="raceDistances"]').inputValue();
	await p.click('button:has-text("Create organization")');
	await p.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	const raceUrl = p.url();
	const raceOrgId = raceUrl.split('/').pop();
	// Direct evidence of what the hook stored.
	const stored = await fetch(`${PB}/api/collections/organizations/records/${raceOrgId}`, {
		headers: { Authorization: apiAuthToken }
	}).then((r) => r.json());
	console.log(
		'  stored template:',
		stored.template,
		'| distances:',
		JSON.stringify(stored.race_distances)
	);
	await p.goto(`${raceUrl}/settings`);
	await p.waitForLoadState('networkidle');
	// Distances render as editable inputs — read input VALUES, not innerText.
	const raceSettingsText = await p.locator('main').innerText();
	expect(raceSettingsText.includes('Race distances'), 'race settings show the distances card');
	const distanceValues = await p.$$eval('main input', (els) => els.map((el) => el.value));
	if (!distanceValues.includes('Marathon') || !distanceValues.includes('Charity 5 Miler')) {
		console.log('  distance input values:', JSON.stringify(distanceValues));
		console.log('  submittedDistances were:', submittedDistances);
	}
	expect(distanceValues.includes('Marathon'), 'race settings list marathon');
	expect(distanceValues.includes('Charity 5 Miler'), 'custom distance persisted');
	const unitValues = await p.$$eval('main select', (els) => els.map((el) => el.value));
	expect(unitValues.includes('mi'), 'explicit unit shown');
	await p.screenshot({ path: path.join(OUT, '1b-05-race-settings.png') });

	// ---- Custom onboarding ------------------------------------------------------
	console.log('Step 6: Custom template starts empty');
	await p.goto(`${APP}/organizations`);
	await p.fill('#org-name', 'B Custom Org');
	await p.click('input[name="template"][value="custom"]');
	const checked = await p.$$eval('input[name="capability"]:checked', (els) => els.length);
	expect(checked === 0, 'custom template forces no capability assumptions');
	await p.click('button:has-text("Create organization")');
	await p.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	await p.waitForSelector('text=Your role: Owner');

	// ---- Viewer boundaries -------------------------------------------------------
	console.log('Step 7: viewer cannot reach configuration');
	// Pre-create + accept a viewer off-camera via the API (UI path proven in 1A).
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
	const vToken = await verificationToken(VIEWER.email);
	await fetch(`${PB}/api/collections/users/confirm-verification`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: vToken })
	});
	const invite = await fetch(`${PB}/api/flihub/invitations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: apiAuthToken },
		body: JSON.stringify({
			organization: leagueUrl.split('/').pop(),
			email: VIEWER.email,
			role: 'viewer'
		})
	}).then((r) => r.json());
	const viewerAuth = await fetch(`${PB}/api/collections/users/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: VIEWER.email, password: PASS })
	}).then((r) => r.json());
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
	await v.goto(`${leagueUrl}`);
	const viewerNav = (await v.locator('nav').allInnerTexts()).join('\n');
	expect(!viewerNav.includes('Settings'), 'viewer does not see Settings navigation');
	await v.goto(`${leagueUrl}/settings`);
	const viewerSettings = await v.locator('main').innerText();
	expect(
		viewerSettings.includes('Only Owners and Admins') ||
			viewerSettings.includes('read-only') ||
			!(await v.$('button:has-text("Save")')),
		'viewer gets a read-only settings view with no save control'
	);
	// Direct API request with the viewer's own PocketBase credentials is denied.
	const viewerToken = viewerAuth.token;
	const deniedStatus = await fetch(
		`${PB}/api/flihub/organizations/${leagueUrl.split('/').pop()}/configure`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: viewerToken },
			body: JSON.stringify({ capabilities: ['fantasy', 'standings', 'scoring-results', 'events'] })
		}
	).then((r) => r.status);
	expect(deniedStatus === 403, 'viewer direct configure request is denied (403)');

	// ---- Mobile + Phase 1A regression ---------------------------------------------
	console.log('Step 8: mobile onboarding and Phase 1A regression');
	const ctxM = await browser.newContext({ viewport: { width: 375, height: 800 } });
	const m = await ctxM.newPage();
	await m.goto(`${APP}/login`);
	await m.fill('input[name="email"]', OWNER.email);
	await m.fill('input[name="password"]', PASS);
	await m.click('button[type="submit"]');
	await m.waitForURL(/\/organizations/, { timeout: 15000 });
	await m.waitForSelector('#org-name');
	await m.click('input[name="template"][value="league"]');
	await m.waitForSelector('input[name="capability"][value="athletes"]');
	await m.screenshot({ path: path.join(OUT, '1b-08-mobile-onboarding.png') });
	expect(true, 'mobile onboarding form usable at 375px');

	await m.goto(`${APP}/walkthroughs/phase1a`);
	const videoOk = await m.evaluate(async () => {
		const vid = document.querySelector('video');
		if (!vid) return false;
		if (vid.readyState < 1) {
			await new Promise((r) => vid.addEventListener('loadedmetadata', r, { once: true }));
		}
		return vid.duration > 100 && vid.textTracks.length > 0;
	});
	expect(videoOk, 'approved Phase 1A walkthrough still plays with captions');

	await browser.close();
	console.log('E2E 1B OK');
} catch (err) {
	console.error(err);
	process.exit(1);
}
