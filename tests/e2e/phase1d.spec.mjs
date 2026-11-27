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
import { createOrganizationWithCapabilities, openSection } from './helpers/onboarding.mjs';

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
	const orgUrl = await createOrganizationWithCapabilities(p, 'D Competition Org', [
		'athletes',
		'teams',
		'leagues-seasons',
		'events'
	]);
	const orgId = orgUrl.split('/').pop();
	expect(true, 'organization created with teams, leagues-seasons, events enabled');

	console.log('Step 2: league + division-less season from navigation');
	const nav = () => p.locator('nav[aria-label="Organization sections"]');
	await p.waitForSelector('nav[aria-label="Organization sections"]');
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await p.waitForURL(/\/cap\/leagues-seasons/, { timeout: 15000 });
	await p.getByRole('heading', { name: 'Set up a league and season', exact: true }).waitFor();
	await p.getByLabel('League name', { exact: true }).fill('Tuesday Night League');
	await p.getByRole('button', { name: 'Next', exact: true }).click();
	await p.getByLabel('Season name', { exact: true }).fill('Spring 2026');
	await p.getByLabel('Start date (optional)', { exact: true }).fill('2026-04-01');
	await p.getByLabel('End date (optional)', { exact: true }).fill('2026-06-30');
	await p.getByRole('button', { name: 'Review', exact: true }).click();
	await p.getByRole('button', { name: 'Create league and season', exact: true }).click();
	await p.getByText(/Saved: Tuesday Night League → Spring 2026/).waitFor();
	await openSection(p, 'Seasons (1)');
	await openSection(p, 'Spring 2026');
	await p.waitForSelector('text=No divisions — this season runs division-less');
	expect(true, 'guided setup saved the league and the division-less season');
	const seasonSection = p.locator('details[data-season]').filter({ hasText: 'Spring 2026' });

	console.log('Step 3: team entered directly into the season (no division yet)');
	await nav()
		.getByRole('link', { name: /Teams, rosters & substitutions/ })
		.click();
	await p.waitForURL(/\/cap\/teams/, { timeout: 15000 });
	await openSection(p, 'Add a team');
	await p.fill('#team-name', 'Basket Cases');
	await p.click('button:has-text("Add team")');
	await p.waitForSelector('text=Teams (1)', { timeout: 15000 });
	expect(true, 'team created');
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await openSection(p, 'Seasons (1)');
	await openSection(p, 'Spring 2026');
	const addEntry = seasonSection.locator('form[action="?/addEntry"]');
	await addEntry.locator('select[name="team"]').selectOption({ label: 'Basket Cases' });
	await addEntry.locator('button[type="submit"]').click();
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	await openSection(p, 'Seasons (1)');
	await openSection(p, 'Spring 2026');
	await p.waitForSelector('text=Team entries (1)', { timeout: 15000 });
	expect(
		(await seasonSection.getByLabel('Assign division').inputValue()) === '',
		'entry starts without a division'
	);
	expect(true, 'team entered before divisions are finalized (D12)');

	console.log('Step 4: division finalized later, then assigned to the entry');
	const addDivision = seasonSection.locator('form[action="?/createDivision"]');
	await addDivision.locator('input[name="name"]').fill('Open');
	await addDivision.locator('button[type="submit"]').click();
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	await openSection(p, 'Seasons (1)');
	await openSection(p, 'Spring 2026');
	await p.waitForSelector('text=Divisions (1)', { timeout: 15000 });
	const assign = seasonSection.locator('form[action="?/assignEntryDivision"]');
	await assign.locator('select[name="division"]').selectOption({ label: 'Open' });
	await assign.locator('button[type="submit"]').click();
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	await openSection(p, 'Seasons (1)');
	await openSection(p, 'Spring 2026');
	const entryRow = seasonSection.locator('div.rounded-md.border.p-2', { hasText: 'Basket Cases' });
	await entryRow
		.locator('[data-slot="badge"]')
		.filter({ hasText: /^Open$/ })
		.waitFor();
	expect(
		(await entryRow.getByLabel('Assign division').inputValue()) !== '',
		'division selection persists on the assigned entry'
	);

	console.log('Step 5: independent and season-linked events');
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	await p.waitForURL(/\/cap\/events/, { timeout: 15000 });
	await p.getByText('No current or upcoming events yet.', { exact: true }).waitFor();
	const advanced = p
		.locator('details')
		.filter({
			has: p.locator('summary').filter({ hasText: /^Advanced event creation/ })
		})
		.filter({ has: p.locator('form[action="?/createEvent"]') });
	const creation = advanced.locator('form[action="?/createEvent"]');

	async function openAdvancedCreation() {
		await advanced.waitFor();
		if (!(await advanced.evaluate((element) => element.open))) {
			await advanced.locator(':scope > summary').click();
		}
		await creation.waitFor({ state: 'visible' });
	}

	const eventCard = (name) =>
		p.locator('details[class~="group/event"]').filter({
			has: p.locator('summary').getByText(name, { exact: true })
		});

	await openAdvancedCreation();
	await creation.getByLabel('Event name', { exact: true }).fill('Invalid event dates');
	await creation.getByLabel('Multi-day event').check();
	await creation.getByLabel('Starts at (optional)').fill('2026-04-08T18:00');
	await creation.getByLabel('Ends at', { exact: true }).fill('2026-04-07T18:00');
	await creation.getByRole('button', { name: 'Add event', exact: true }).click();
	const dateError = 'The event end must be after its start.';
	await advanced.getByRole('alert').filter({ hasText: dateError }).waitFor();
	expect(
		(await p.getByText(dateError, { exact: true }).count()) === 1 &&
			(await eventCard('Invalid event dates').count()) === 0,
		'an invalid date range stays in the advanced form and creates no event'
	);
	await p.goto(`${orgUrl}/cap/events`);

	await openAdvancedCreation();
	await creation.locator('#event-name').fill('Charity Scramble');
	expect(
		(await creation.locator('#event-season').inputValue()) === '',
		'independent creation defaults to no season'
	);
	await creation.getByRole('button', { name: 'Add event', exact: true }).click();
	const independent = eventCard('Charity Scramble');
	await independent.locator('summary').getByText('Independent', { exact: true }).waitFor();
	expect(true, 'standalone event created (no season)');

	await openAdvancedCreation();
	await creation.locator('#event-name').fill('Week 1');
	await creation.locator('#event-season').selectOption({ label: 'Spring 2026' });
	await creation.locator('#event-starts').fill('2026-04-07T18:00');
	await creation.getByRole('button', { name: 'Add event', exact: true }).click();
	const linkedRow = eventCard('Week 1');
	await linkedRow.locator('summary').getByText('Spring 2026', { exact: true }).waitFor();
	expect(true, 'season-linked event shows its season');

	console.log('Step 6: archive preserves records and relationships');
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	await openSection(p, 'Seasons (1)');
	await openSection(p, 'Spring 2026');
	await seasonSection.locator('form[action="?/archiveSeason"] button[type="submit"]').click();
	await openSection(p, 'Seasons (1)');
	await p
		.getByRole('group', { name: 'Season view' })
		.getByRole('button', { name: 'Past seasons (1)', exact: true })
		.click();
	await openSection(p, 'Spring 2026');
	await seasonSection.locator('summary').getByText('archived', { exact: true }).waitFor();
	const archivedEntry = seasonSection.locator('div.rounded-md.border.p-2', {
		hasText: 'Basket Cases'
	});
	const archivedBadge = await archivedEntry.locator('[data-slot="badge"]').first().innerText();
	expect(archivedBadge === 'Open', 'entry keeps its division while the season is archived');
	expect((await p.innerText('main')).includes('Basket Cases'), 'entry record still listed');
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	const eventView = p.getByRole('group', { name: 'Event view' });
	await eventView
		.getByRole('button', {
			name: 'Current & upcoming (1)',
			exact: true
		})
		.waitFor();
	await eventView
		.getByRole('button', {
			name: 'Past events (1)',
			exact: true
		})
		.click();
	const weekOne = eventCard('Week 1');
	await weekOne.locator('summary').waitFor();
	const weekOneBadge = await weekOne.locator('summary [data-slot="badge"]').first().innerText();
	expect(
		weekOneBadge === 'Spring 2026',
		'event keeps its season link while the season is archived'
	);
	// Restore: back to the least-committed state.
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await openSection(p, 'Seasons (1)');
	await p
		.getByRole('group', { name: 'Season view' })
		.getByRole('button', { name: 'Past seasons (1)', exact: true })
		.click();
	await openSection(p, 'Spring 2026');
	await seasonSection.locator('form[action="?/unarchiveSeason"] button[type="submit"]').click();
	await openSection(p, 'Seasons (1)');
	await p
		.getByRole('group', { name: 'Season view' })
		.getByRole('button', { name: 'Current & upcoming (1)', exact: true })
		.click();
	await openSection(p, 'Spring 2026');
	await seasonSection.locator('summary').getByText('planned', { exact: true }).waitFor();
	expect(true, 'season restored to planned');
	await p.screenshot({ path: path.join(OUT, '1d-06-competition.png') });
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	await eventView
		.getByRole('button', {
			name: 'Current & upcoming (2)',
			exact: true
		})
		.click();
	await eventCard('Week 1').locator('summary').getByText('Spring 2026', { exact: true }).waitFor();
	expect(true, 'restored season event returns to current events');

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
	await openSection(v, 'Leagues (1)');
	await v
		.locator('span.font-medium:not([data-slot="badge"])')
		.getByText('Tuesday Night League', { exact: true })
		.waitFor();
	await openSection(v, 'Seasons (1)');
	await openSection(v, 'Spring 2026');
	await v
		.locator('details[data-season] div.rounded-md.border.p-2')
		.getByText('Basket Cases', { exact: true })
		.waitFor({ state: 'visible' });
	expect((await v.$('#league-name')) === null, 'viewer has no league form');
	expect(
		(await v
			.getByRole('heading', {
				name: 'Set up a league and season',
				exact: true
			})
			.count()) === 0,
		'viewer has no guided league and season setup'
	);
	expect((await v.$('form[action="?/addEntry"]')) === null, 'viewer has no entry form');
	await v.goto(`${orgUrl}/cap/teams`);
	await openSection(v, 'Teams (1)');
	await v
		.locator('details[class~="group/team-list"]')
		.getByText('Basket Cases', { exact: true })
		.waitFor({ state: 'visible' });
	expect((await v.$('#team-name')) === null, 'viewer has no team form');
	await v.goto(`${orgUrl}/cap/events`);
	await v
		.locator('details[class~="group/event"] > summary')
		.getByText('Charity Scramble', { exact: true })
		.waitFor({ state: 'visible' });
	expect((await v.$('#event-name')) === null, 'viewer has no event form');
	expect(
		(await v.locator('form[action="?/createEvent"]').count()) === 0,
		'viewer has no advanced event creation form'
	);

	const deniedEvent = await fetch(`${PB}/api/collections/events/records`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: viewerAuth.token
		},
		body: JSON.stringify({
			organization: orgId,
			name: 'Unauthorized viewer event',
			status: 'planned'
		})
	});
	expect(
		deniedEvent.status === 400 || deniedEvent.status === 403,
		`viewer direct event API write denied (${deniedEvent.status})`
	);
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
	await openSection(m, 'Seasons (1)');
	await openSection(m, 'Spring 2026');
	await m
		.locator('details[data-season] div.rounded-md.border.p-2')
		.getByText('Basket Cases', { exact: true })
		.waitFor({ state: 'visible' });
	expect(true, 'competition page usable at 375px');
	await m.screenshot({ path: path.join(OUT, '1d-08-mobile.png') });

	console.log('Phase 1D browser acceptance: all steps passed');
} finally {
	await browser.close();
}
