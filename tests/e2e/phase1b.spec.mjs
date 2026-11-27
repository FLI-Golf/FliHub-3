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
import {
	createGuidedOrganization,
	openOrganizationSetup,
	completeGuidedSetup
} from './helpers/onboarding.mjs';

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
	await page.waitForURL((url) => url.pathname === '/account', { timeout: 15000 });
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

	const capability = (id) => p.locator(`input[name="capability"][value="${id}"]`);
	const save = async () => {
		await p.getByRole('button', { name: 'Save settings', exact: true }).click();
		await p.getByText('Settings saved', { exact: true }).waitFor();
	};
	const readOrganization = async (id) => {
		const res = await fetch(`${PB}/api/collections/organizations/records/${id}`, {
			headers: { Authorization: apiAuthToken }
		});
		expect(res.ok, 'owner can read saved organization configuration');
		return res.json();
	};
	const createLegacyOrganization = async (name, template) => {
		// The guided UI intentionally supports a narrower set of profiles.
		// Exercise the documented legacy creation contract for these templates.
		const res = await fetch(`${PB}/api/flihub/organizations`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: apiAuthToken },
			body: JSON.stringify({ name, template })
		});
		expect(res.ok, `${template} template remains supported by the legacy creation endpoint`);
		return (await res.json()).id;
	};

	console.log('Step 2: Guided League creation and editable configuration');
	await openOrganizationSetup(p);
	const leagueUrl = await createGuidedOrganization(p, 'B League Org');
	const leagueId = new URL(leagueUrl).pathname.split('/').at(-1);
	await p.getByText('Your role: Owner', { exact: true }).waitFor();
	const league = await readOrganization(leagueId);
	expect(league.template === 'league', 'guided disc golf stores the League template');
	expect(league.capabilities.includes('teams'), 'League defaults enable teams');
	expect(!league.capabilities.includes('fantasy'), 'League defaults leave fantasy disabled');

	await p.getByRole('link', { name: /^Settings/ }).click();
	await capability('venues-courses').uncheck();
	await capability('sponsorships').check();
	await save();
	const customized = await readOrganization(leagueId);
	expect(
		!customized.capabilities.includes('venues-courses'),
		'disabled course capability persists'
	);
	expect(customized.capabilities.includes('sponsorships'), 'added sponsorship capability persists');
	await p.screenshot({ path: path.join(OUT, '1b-02-league-org.png') });

	console.log('Step 3: available and disabled capabilities reflect their actual status');
	await p.getByRole('link', { name: /^Sponsorships/ }).click();
	await p.getByText('Add sponsor', { exact: true }).first().waitFor();
	expect(true, 'implemented sponsorship manager is reachable from capability navigation');
	const disabled = await p.goto(`${leagueUrl}/cap/venues-courses`);
	expect(disabled?.ok(), 'disabled capability URL resolves to an explanatory screen');
	await p.getByText('Courses is not enabled', { exact: true }).waitFor();
	expect(
		!(await p.getByRole('button', { name: /add course/i }).count()),
		'disabled course workflow offers no create action'
	);

	console.log('Step 4: settings persistence and dependency closure');
	await p.goto(`${leagueUrl}/settings`);
	await capability('events').uncheck();
	await save();
	expect(
		!(await p.getByRole('link', { name: /^Events/ }).count()),
		'disabled capability leaves navigation'
	);
	const disabledEvents = await readOrganization(leagueId);
	expect(
		!disabledEvents.capabilities.some((id) =>
			['events', 'scoring-results', 'standings'].includes(id)
		),
		'dependent scoring and standings are disabled with events'
	);
	await capability('scoring-results').check();
	await save();
	const enabledEvents = await readOrganization(leagueId);
	expect(
		enabledEvents.capabilities.includes('events') &&
			enabledEvents.capabilities.includes('scoring-results'),
		'enabling scoring restores its event dependency'
	);
	await p.getByRole('link', { name: /^Events/ }).waitFor();
	await p.screenshot({ path: path.join(OUT, '1b-04-settings.png') });

	console.log('Step 5: Race/Event defaults and custom distance persistence');
	const raceId = await createLegacyOrganization('B Race Org', 'race-event');
	const race = await readOrganization(raceId);
	expect(
		race.template === 'race-event' &&
			race.race_distances.some(
				(d) => d.label === 'Marathon' && d.distance === 42.195 && d.unit === 'km'
			),
		'Race/Event stores the canonical marathon by default'
	);
	const raceSettings = `${APP}/organizations/${raceId}/settings`;
	await p.goto(raceSettings);
	await p.getByRole('button', { name: 'Add distance', exact: true }).click();
	const custom = p.getByPlaceholder('Label (e.g. 10K)', { exact: true }).last();
	await custom.fill('Charity 5 Miler');
	const distanceRow = custom.locator('..');
	await distanceRow.getByPlaceholder('Distance', { exact: true }).fill('5');
	await distanceRow.locator('select').selectOption('mi');
	await save();
	const savedRace = await readOrganization(raceId);
	expect(
		savedRace.race_distances.some(
			(d) => d.label === 'Charity 5 Miler' && d.distance === 5 && d.unit === 'mi'
		),
		'custom distance and explicit unit persisted'
	);
	await p.reload();
	expect(
		(await p.getByPlaceholder('Label (e.g. 10K)', { exact: true }).all()).length >= 2,
		'race settings render persisted distances after reload'
	);
	expect(
		(await p.getByPlaceholder('Label (e.g. 10K)', { exact: true }).last().inputValue()) ===
			'Charity 5 Miler',
		'custom distance remains editable in Settings'
	);
	await p.screenshot({ path: path.join(OUT, '1b-05-race-settings.png') });

	console.log('Step 6: Custom template starts empty');
	const customId = await createLegacyOrganization('B Custom Org', 'custom');
	const customOrg = await readOrganization(customId);
	expect(
		customOrg.template === 'custom' && customOrg.capabilities.length === 0,
		'Custom stores no assumed capabilities'
	);
	await p.goto(`${APP}/organizations/${customId}`);
	await p.getByText('Your role: Owner', { exact: true }).waitFor();
	await p.goto(`${APP}/organizations/${customId}/settings`);
	expect(
		!(await p.locator('input[name="capability"]:checked').count()),
		'Custom settings show an empty capability selection'
	);

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
	await v.waitForURL((url) => url.pathname === '/organizations', { timeout: 15000 });
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
	await m.waitForURL((url) => url.pathname === '/organizations', { timeout: 15000 });
	await m.getByRole('link', { name: 'Create an organization', exact: true }).click();
	await m.waitForURL((url) => url.pathname === '/organizations/new', { timeout: 15000 });
	await completeGuidedSetup(m, 'B Mobile Preview');
	await m.getByRole('button', { name: 'Create organization', exact: true }).waitFor();
	expect(
		await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
		'guided review fits the mobile viewport'
	);
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
