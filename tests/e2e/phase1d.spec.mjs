/**
 * Phase 1D browser acceptance flow: competition structure as working
 * workflows — league/season/division management, team entries (D12: direct
 * season entry, optional division), independent + season-linked events,
 * archive preservation, and role boundaries — on the disposable preview stack.
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
const OWNER = { name: 'D Owner', email: `e2e-d-owner-${ts}@example.com` };
const VIEWER = { name: 'D Viewer', email: `e2e-d-viewer-${ts}@example.com` };

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

const browser = await chromium.launch();
try {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const p = await ctx.newPage();
	p.setDefaultTimeout(10000);

	console.log('Step 1: owner account + org with competition capabilities');
	await p.goto(`${APP}/register`);
	await p.fill('input[name="name"]', OWNER.name);
	await p.fill('input[name="email"]', OWNER.email);
	await p.fill('input[name="password"]', PASS);
	await p.fill('input[name="passwordConfirm"]', PASS);
	await p.click('button[type="submit"]');
	await p.waitForSelector('text=We sent a verification email', { timeout: 15000 });
	const token = await verificationToken(OWNER.email);
	await p.goto(`${APP}/verify-email/${token}`);
	await p.waitForLoadState('networkidle');
	await p.goto(`${APP}/login`);
	await p.fill('input[name="email"]', OWNER.email);
	await p.fill('input[name="password"]', PASS);
	await p.click('button[type="submit"]');
	await p.waitForURL(/\/organizations/, { timeout: 15000 });
	// Org creation lives on the /organizations page itself (no /new route).
	await p.fill('#org-name', 'D Competition Org');
	await p.click('input[name="template"][value="custom"]');
	// teams depends on athletes (dependency closure is enforced server-side).
	await p.check('input[name="capability"][value="athletes"]');
	await p.check('input[name="capability"][value="teams"]');
	await p.check('input[name="capability"][value="leagues-seasons"]');
	await p.check('input[name="capability"][value="events"]');
	await p.click('button:has-text("Create organization")');
	await p.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	const orgUrl = p.url();
	const orgId = orgUrl.split('/').pop();
	expect(true, 'organization created with teams, leagues-seasons, events enabled');

	console.log('Step 2: league + division-less season from navigation');
	const nav = () => p.locator('nav[aria-label="Organization sections"]');
	await p.waitForSelector('nav[aria-label="Organization sections"]');
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await p.waitForURL(/\/cap\/leagues-seasons/, { timeout: 15000 });
	await p.waitForSelector('text=Leagues (0)');
	expect(
		(await p.$('#league-name')) !== null,
		'leagues-seasons page is a working manager (available, not planned)'
	);
	await p.fill('#league-name', 'Tuesday Night League');
	await p.click('button:has-text("Add league")');
	await p.waitForSelector('text=Leagues (1)', { timeout: 15000 });
	expect(true, 'league created');
	await p.selectOption('#season-league', { label: 'Tuesday Night League' });
	await p.fill('#season-name', 'Spring 2026');
	await p.fill('#season-starts', '2026-04-01');
	await p.fill('#season-ends', '2026-06-30');
	await p.click('button:has-text("Add season")');
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	await p.waitForSelector('text=No divisions — this season runs division-less');
	expect(true, 'division-less season created with schedule dates');
	const seasonSection = p.locator('section', { hasText: 'Spring 2026' });

	console.log('Step 3: team entered directly into the season (no division yet)');
	await nav()
		.getByRole('link', { name: /Teams & rosters/ })
		.click();
	await p.waitForURL(/\/cap\/teams/, { timeout: 15000 });
	await p.fill('#team-name', 'Basket Cases');
	await p.click('button:has-text("Add team")');
	await p.waitForSelector('text=Teams (1)', { timeout: 15000 });
	expect(true, 'team created');
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	const addEntry = seasonSection.locator('form[action="?/addEntry"]');
	await addEntry.locator('select[name="team"]').selectOption({ label: 'Basket Cases' });
	await addEntry.locator('button[type="submit"]').click();
	await p.waitForSelector('text=Team entries (1)', { timeout: 15000 });
	await p.waitForSelector('text=No division assigned');
	expect(true, 'team entered before divisions are finalized (D12)');

	console.log('Step 4: division finalized later, then assigned to the entry');
	const addDivision = seasonSection.locator('form[action="?/createDivision"]');
	await addDivision.locator('input[name="name"]').fill('Open');
	await addDivision.locator('button[type="submit"]').click();
	await p.waitForSelector('text=Divisions (1)', { timeout: 15000 });
	const assign = seasonSection.locator('form[action="?/assignEntryDivision"]');
	await assign.locator('select[name="division"]').selectOption({ label: 'Open' });
	await assign.locator('button[type="submit"]').click();
	// Wait for the entry row's "No division assigned" badge to disappear (that
	// text is unique to the unassigned state; the row's select also contains an
	// "Open" option, so text=Open alone is ambiguous).
	const entryRow = seasonSection.locator('div.rounded-md.border.p-2', { hasText: 'Basket Cases' });
	await entryRow
		.locator('text=No division assigned')
		.waitFor({ state: 'detached', timeout: 15000 });
	const entryBadge = await entryRow.locator('[data-slot="badge"]').first().innerText();
	expect(entryBadge === 'Open', 'division assigned after entry (D12)');
	expect(
		!(await entryRow.innerText()).includes('No division assigned'),
		'unassigned badge cleared'
	);

	console.log('Step 5: independent and season-linked events');
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	await p.waitForURL(/\/cap\/events/, { timeout: 15000 });
	await p.waitForSelector('text=Events (0)');
	await p.fill('#event-name', 'Charity Scramble');
	// Season select left on "Independent (no season)".
	await p.click('button:has-text("Add event")');
	await p.waitForSelector('text=Events (1)', { timeout: 15000 });
	await p.waitForSelector('text=Independent');
	expect(true, 'standalone event created (no season)');
	await p.fill('#event-name', 'Week 1');
	await p.selectOption('#event-season', { label: 'Spring 2026' });
	await p.fill('#event-starts', '2026-04-07T18:00');
	await p.click('button:has-text("Add event")');
	await p.waitForSelector('text=Events (2)', { timeout: 15000 });
	const linkedRow = p.locator('div.rounded-md.border', { hasText: 'Week 1' }).last();
	expect(
		(await linkedRow.innerText()).includes('Spring 2026'),
		'season-linked event shows its season'
	);

	console.log('Step 6: archive preserves records and relationships');
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	await seasonSection.locator('form[action="?/archiveSeason"] button[type="submit"]').click();
	await p.waitForSelector('section:has-text("Spring 2026") >> text=archived', { timeout: 15000 });
	const archivedEntry = seasonSection.locator('div.rounded-md.border.p-2', {
		hasText: 'Basket Cases'
	});
	const archivedBadge = await archivedEntry.locator('[data-slot="badge"]').first().innerText();
	expect(archivedBadge === 'Open', 'entry keeps its division while the season is archived');
	expect((await p.innerText('main')).includes('Basket Cases'), 'entry record still listed');
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	const weekOne = p.locator('div.rounded-md.border', { hasText: 'Week 1' }).last();
	const weekOneBadge = await weekOne.locator('[data-slot="badge"]').first().innerText();
	expect(
		weekOneBadge === 'Spring 2026',
		'event keeps its season link while the season is archived'
	);
	// Restore: back to the least-committed state.
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await seasonSection.locator('form[action="?/unarchiveSeason"] button[type="submit"]').click();
	await p.waitForSelector('section:has-text("Spring 2026") >> text=planned', { timeout: 15000 });
	expect(true, 'season restored to planned');
	await p.screenshot({ path: path.join(OUT, '1d-06-competition.png') });

	console.log('Step 7: viewer is read-only across all three workflows');
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

	await v.goto(`${orgUrl}/cap/leagues-seasons`);
	await v.waitForSelector('text=Tuesday Night League', { timeout: 15000 });
	await v.waitForSelector('text=Basket Cases');
	expect((await v.$('#league-name')) === null, 'viewer has no league form');
	expect((await v.$('form[action="?/addEntry"]')) === null, 'viewer has no entry form');
	await v.goto(`${orgUrl}/cap/teams`);
	await v.waitForSelector('text=Basket Cases');
	expect((await v.$('#team-name')) === null, 'viewer has no team form');
	await v.goto(`${orgUrl}/cap/events`);
	await v.waitForSelector('text=Charity Scramble');
	expect((await v.$('#event-name')) === null, 'viewer has no event form');
	const denied = await v.evaluate(
		async ({ pbUrl, oid, token: tok }) => {
			const res = await fetch(`${pbUrl}/api/collections/teams/records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: tok },
				body: JSON.stringify({ organization: oid, name: 'X', status: 'active' })
			});
			return res.status;
		},
		{ pbUrl: PB, oid: orgId, token: viewerAuth.token }
	);
	expect(denied === 400 || denied === 403, `viewer direct API write denied (${denied})`);

	console.log('Step 8: mobile');
	const ctxM = await browser.newContext({ viewport: { width: 375, height: 720 } });
	const m = await ctxM.newPage();
	await m.goto(`${APP}/login`);
	await m.fill('input[name="email"]', OWNER.email);
	await m.fill('input[name="password"]', PASS);
	await m.click('button[type="submit"]');
	await m.waitForURL(/\/organizations/, { timeout: 15000 });
	await m.goto(`${orgUrl}/cap/leagues-seasons`);
	await m.waitForSelector('text=Spring 2026', { timeout: 15000 });
	expect(true, 'competition page usable at 375px');
	await m.screenshot({ path: path.join(OUT, '1d-08-mobile.png') });

	console.log('Phase 1D browser acceptance: all steps passed');
} finally {
	await browser.close();
}
