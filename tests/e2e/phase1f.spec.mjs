/**
 * Phase 1F browser acceptance flow: event operations as working workflows
 * (D14) — a course layout with named holes and labeled positions, ordered
 * rounds with position labels, event groups with per-group scorekeepers,
 * team assignment through season entries, athlete assignment resolved from
 * Phase 1E rosters plus event-scoped substitutions (reserves appear only for
 * the event with the substitution), season-roster preservation, and role
 * boundaries — on the disposable preview stack.
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
const OWNER = { name: 'F Owner', email: `e2e-f-owner-${ts}@example.com` };
const VIEWER = { name: 'F Viewer', email: `e2e-f-viewer-${ts}@example.com` };

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

	console.log('Step 1: owner account + org with all event-operation capabilities');
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
	await p.fill('#org-name', 'F Event Ops Org');
	await p.click('input[name="template"][value="custom"]');
	for (const cap of ['athletes', 'teams', 'leagues-seasons', 'events', 'venues-courses']) {
		await p.check(`input[name="capability"][value="${cap}"]`);
	}
	await p.click('button:has-text("Create organization")');
	await p.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	const orgUrl = p.url();
	const orgId = orgUrl.split('/').pop();
	expect(true, 'organization created with events + venues-courses enabled');

	console.log('Step 2: 1D/1E prerequisites — structure, roster, reserve, event');
	const nav = () => p.locator('nav[aria-label="Organization sections"]');
	await p.waitForSelector('nav[aria-label="Organization sections"]');
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await p.waitForURL(/\/cap\/leagues-seasons/, { timeout: 15000 });
	await p.fill('#league-name', 'Harbor League');
	await p.click('button:has-text("Add league")');
	await p.waitForSelector('text=Leagues (1)', { timeout: 15000 });
	await p.selectOption('#season-league', { label: 'Harbor League' });
	await p.fill('#season-name', 'Summer 2026');
	await p.click('button:has-text("Add season")');
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	await nav()
		.getByRole('link', { name: /Teams & rosters/ })
		.click();
	await p.waitForURL(/\/cap\/teams/, { timeout: 15000 });
	await p.fill('#team-name', 'Blue Heron Flyers');
	await p.click('button:has-text("Add team")');
	await p.waitForSelector('text=Teams (1)', { timeout: 15000 });
	await nav()
		.getByRole('link', { name: /Leagues & seasons/ })
		.click();
	await p.waitForSelector('text=Seasons (1)', { timeout: 15000 });
	const seasonSection = p.locator('section', { hasText: 'Summer 2026' });
	const addEntry = seasonSection.locator('form[action="?/addEntry"]');
	await addEntry.locator('select[name="team"]').selectOption({ label: 'Blue Heron Flyers' });
	await addEntry.locator('button[type="submit"]').click();
	await p.waitForSelector('text=Team entries (1)', { timeout: 15000 });
	await nav()
		.getByRole('link', { name: /Athletes/ })
		.click();
	await p.waitForURL(/\/cap\/athletes/, { timeout: 15000 });
	const addAthlete = async (first, last, gender) => {
		await p.fill('#firstName', first);
		await p.fill('#lastName', last);
		await p.selectOption('#gender', gender);
		await p.click('button:has-text("Add athlete")');
		await p.waitForSelector(`text=${first} ${last}`, { timeout: 15000 });
	};
	await addAthlete('Ava', 'Stone', 'female');
	await addAthlete('Sam', 'Finch', 'male');
	await addAthlete('Ben', 'Reed', 'male');
	await nav()
		.getByRole('link', { name: /Teams & rosters/ })
		.click();
	await p.waitForURL(/\/cap\/teams/, { timeout: 15000 });
	await p.waitForSelector('text=Season roster — Summer 2026', { timeout: 15000 });
	const rosterForm = p.locator('form[action="?/addRosterMember"]');
	await rosterForm.locator('select[name="athlete"]').selectOption({ label: 'Ava Stone' });
	await rosterForm.locator('button:has-text("Add to roster")').click();
	await p.waitForSelector('form[action="?/removeRosterMember"]', { timeout: 15000 });
	await rosterForm.locator('select[name="athlete"]').selectOption({ label: 'Sam Finch' });
	await rosterForm.locator('button:has-text("Add to roster")').click();
	await p.waitForSelector('text=Sam Finch', { timeout: 15000 });
	await p.fill('#pool-name', 'Reserve Pool');
	await p.click('button:has-text("Create pool")');
	await p.waitForSelector('form[action="?/addReserveMember"]', { timeout: 15000 });
	const poolForm = p.locator('form[action="?/addReserveMember"]');
	await poolForm.locator('select[name="athlete"]').selectOption({ label: 'Ben Reed' });
	await poolForm.locator('button:has-text("Add to pool")').click();
	await p.waitForSelector('text=Ben Reed', { timeout: 15000 });
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	await p.waitForURL(/\/cap\/events/, { timeout: 15000 });
	await p.fill('#event-name', 'Week 1');
	await p.selectOption('#event-season', { label: 'Summer 2026' });
	await p.click('button:has-text("Add event")');
	await p.waitForSelector('text=Events (1)', { timeout: 15000 });
	expect(true, 'structure, two rostered athletes, one reserve, and a season event ready');

	console.log('Step 3: course layout — named hole with red and blue positions');
	await nav()
		.getByRole('link', { name: /Venues & courses/ })
		.click();
	await p.waitForURL(/\/cap\/venues-courses/, { timeout: 15000 });
	expect(
		(await p.$('#course-name')) !== null,
		'venues-courses page is a working course manager (not a planned placeholder)'
	);
	expect(
		(await p.innerText('main')).includes('Venue records (physical locations) are planned'),
		'venue records honestly labeled as planned'
	);
	await p.fill('#course-name', 'Lakeside DGC');
	await p.click('button:has-text("Create course")');
	await p.waitForSelector('form[action="?/addHole"]', { timeout: 15000 });
	const holeForm = p.locator('form[action="?/addHole"]');
	await holeForm.locator('input[name="number"]').fill('1');
	await holeForm.locator('input[name="name"]').fill('The Willow');
	await holeForm.locator('button[type="submit"]').click();
	await p.waitForSelector('text=Hole 1 — The Willow', { timeout: 15000 });
	expect((await p.innerText('main')).includes('Par 3'), 'hole defaults to par 3');
	const posForm = p.locator('form[action="?/addPosition"]');
	await posForm.locator('input[name="label"]').fill('red');
	await posForm.locator('input[name="distance"]').fill('280');
	await posForm.locator('button[type="submit"]').click();
	await p.waitForSelector('text=280 feet', { timeout: 15000 });
	await posForm.locator('input[name="label"]').fill('blue');
	await posForm.locator('input[name="distance"]').fill('342');
	await posForm.locator('button[type="submit"]').click();
	await p.waitForSelector('text=342 feet', { timeout: 15000 });
	expect(true, 'red (280 ft) and blue (342 ft) positions carry different distances');
	await p.screenshot({ path: path.join(OUT, '1f-03-course.png') });

	console.log('Step 4: two rounds distinguish red from blue positions');
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	await p.waitForURL(/\/cap\/events/, { timeout: 15000 });
	await p.waitForSelector('#ops-event', { timeout: 15000 });
	const roundForm = p.locator('form[action="?/addRound"]');
	await roundForm.locator('input[name="number"]').fill('1');
	await roundForm.locator('select[name="course"]').selectOption({ label: 'Lakeside DGC' });
	// Selecting the course swaps the position field to a chooser of the
	// course's actual position labels.
	await roundForm.locator('select[name="positionLabel"]').selectOption('red');
	await roundForm.locator('button[type="submit"]').click();
	await p.waitForSelector('text=red positions', { timeout: 15000 });
	await roundForm.locator('input[name="number"]').fill('2');
	await roundForm.locator('select[name="course"]').selectOption({ label: 'Lakeside DGC' });
	await roundForm.locator('select[name="positionLabel"]').selectOption('blue');
	await roundForm.locator('button[type="submit"]').click();
	await p.waitForSelector('text=blue positions', { timeout: 15000 });
	await p.waitForSelector('text=— intermission —', { timeout: 15000 });
	expect(true, 'round 1 (red) and round 2 (blue) separated by the intermission marker');

	console.log('Step 5: group with scorekeeper, team, and rostered athletes');
	await p.fill('#group-name', 'Group 1');
	await p.selectOption('#group-scorekeeper', { label: `${OWNER.name} (owner)` });
	await p.click('button:has-text("Create group")');
	await p.waitForSelector(`text=${OWNER.name}`, { timeout: 15000 });
	expect(true, 'group created with a member scorekeeper assigned');
	const addTeamForm = p.locator('form[action="?/addGroupTeam"]');
	await addTeamForm.locator('select[name="entry"]').selectOption({ label: 'Blue Heron Flyers' });
	await addTeamForm.locator('button[type="submit"]').click();
	await p.waitForSelector('form[action="?/removeGroupTeam"]', { timeout: 15000 });
	expect(true, 'team assigned to the group through its season entry');
	const athleteSelect = () =>
		p.locator('form[action="?/addGroupAthlete"] select[name="athlete-with-entry"]');
	let options = await athleteSelect().locator('option').allInnerTexts();
	expect(
		options.some((o) => o.includes('Ava Stone')) &&
			options.some((o) => o.includes('Sam Finch')) &&
			!options.some((o) => o.includes('Ben Reed')),
		'eligible athletes are the rostered ones — the reserve is absent without a substitution'
	);
	const addAthleteToGroup = async (label) => {
		const value = await athleteSelect()
			.locator('option', { hasText: label })
			.first()
			.getAttribute('value');
		await athleteSelect().selectOption(value);
		await p.locator('form[action="?/addGroupAthlete"] button[type="submit"]').click();
		await p.waitForSelector(`form[action="?/removeGroupAthlete"]`, { timeout: 15000 });
	};
	await addAthleteToGroup('Ava Stone');
	await p.waitForSelector('text=Ava Stone', { timeout: 15000 });
	expect(true, 'rostered athlete assigned to the group');

	console.log('Step 6: substitution makes the reserve eligible for THIS event only');
	await nav()
		.getByRole('link', { name: /Teams & rosters/ })
		.click();
	await p.waitForURL(/\/cap\/teams/, { timeout: 15000 });
	await p.selectOption('#sub-event', { label: 'Week 1' });
	await p.selectOption('#sub-entry', { label: 'Blue Heron Flyers' });
	await p.selectOption('#sub-out', { label: 'Sam Finch' });
	await p.selectOption('#sub-in', { label: 'Ben Reed' });
	await p.click('button:has-text("Record substitution")');
	await p.waitForSelector('text=replaced by', { timeout: 15000 });
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	await p.waitForURL(/\/cap\/events/, { timeout: 15000 });
	await p.waitForSelector('#ops-event', { timeout: 15000 });
	options = await athleteSelect().locator('option').allInnerTexts();
	expect(
		options.some((o) => o.includes('Ben Reed') && o.includes('reserve')),
		'reserve appears as eligible for the event with the substitution'
	);
	expect(
		!options.some((o) => o.includes('Sam Finch')),
		'the substituted-out athlete is no longer offered for this event'
	);
	await addAthleteToGroup('Ben Reed');
	await p.waitForSelector('text=Ben Reed', { timeout: 15000 });
	expect(true, 'reserve assigned to the group after the official substitution');
	await p.screenshot({ path: path.join(OUT, '1f-06-group.png') });

	console.log('Step 7: season roster preserved by group assignment');
	await nav()
		.getByRole('link', { name: /Teams & rosters/ })
		.click();
	await p.waitForURL(/\/cap\/teams/, { timeout: 15000 });
	await p.waitForSelector('text=Season roster — Summer 2026', { timeout: 15000 });
	const rosterCard = p.locator('[data-slot="card"]', { hasText: 'Season roster — Summer 2026' });
	const rosterText = await rosterCard.innerText();
	expect(
		rosterText.includes('Ava Stone') &&
			rosterText.includes('Sam Finch') &&
			!rosterText.includes('Past member'),
		'season roster unchanged: both rostered athletes still active, no past-member rows'
	);

	console.log('Step 8: viewer is read-only, in the UI and at the API');
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
	await v.goto(`${orgUrl}/cap/venues-courses`);
	await v.waitForSelector('text=Lakeside DGC', { timeout: 15000 });
	expect((await v.$('#course-name')) === null, 'viewer has no course form');
	await v.goto(`${orgUrl}/cap/events`);
	await v.waitForSelector('text=Group 1', { timeout: 15000 });
	expect((await v.$('#group-name')) === null, 'viewer has no group form');
	expect(
		(await v.$('form[action="?/addGroupAthlete"]')) === null,
		'viewer has no athlete assignment form'
	);
	const denied = await v.evaluate(
		async ({ pbUrl, oid, token: tok }) => {
			const res = await fetch(`${pbUrl}/api/collections/courses/records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: tok },
				body: JSON.stringify({ organization: oid, name: 'X', status: 'active' })
			});
			return res.status;
		},
		{ pbUrl: PB, oid: orgId, token: viewerAuth.token }
	);
	expect(denied === 400 || denied === 403, `viewer direct API write denied (${denied})`);

	console.log('Step 9: mobile');
	const ctxM = await browser.newContext({ viewport: { width: 375, height: 720 } });
	const m = await ctxM.newPage();
	await m.goto(`${APP}/login`);
	await m.fill('input[name="email"]', OWNER.email);
	await m.fill('input[name="password"]', PASS);
	await m.click('button[type="submit"]');
	await m.waitForURL(/\/organizations/, { timeout: 15000 });
	await m.goto(`${orgUrl}/cap/events`);
	await m.waitForSelector('text=Group 1', { timeout: 15000 });
	expect(true, 'event operations usable at 375px');
	await m.screenshot({ path: path.join(OUT, '1f-09-mobile.png') });

	console.log('Phase 1F browser acceptance: all steps passed');
} finally {
	await browser.close();
}
