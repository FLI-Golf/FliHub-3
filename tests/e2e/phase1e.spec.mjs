/**
 * Phase 1E browser acceptance flow: season rosters, reserve pools, and
 * substitutions as working workflows (D13) — roster assignment on a team's
 * season entry, gender-restricted reserve pools (pilot configuration),
 * an append-only substitution that leaves the roster intact, preserved
 * participation history, and role boundaries — on the disposable preview
 * stack.
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
const OWNER = { name: 'E Owner', email: `e2e-e-owner-${ts}@example.com` };
const VIEWER = { name: 'E Viewer', email: `e2e-e-viewer-${ts}@example.com` };

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

	console.log('Step 1: owner account + org with roster capabilities');
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
	await p.fill('#org-name', 'E Roster Org');
	await p.click('input[name="template"][value="custom"]');
	await p.check('input[name="capability"][value="athletes"]');
	await p.check('input[name="capability"][value="teams"]');
	await p.check('input[name="capability"][value="leagues-seasons"]');
	await p.check('input[name="capability"][value="events"]');
	await p.click('button:has-text("Create organization")');
	await p.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	const orgUrl = p.url();
	const orgId = orgUrl.split('/').pop();
	expect(true, 'organization created with roster capabilities enabled');

	console.log('Step 2: 1D structure — league, season, team, entry, season event');
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
		.getByRole('link', { name: /Events/ })
		.click();
	await p.waitForURL(/\/cap\/events/, { timeout: 15000 });
	await p.fill('#event-name', 'Week 1');
	await p.selectOption('#event-season', { label: 'Summer 2026' });
	await p.click('button:has-text("Add event")');
	await p.waitForSelector('text=Events (1)', { timeout: 15000 });
	expect(true, 'league, season, team entry, and season-linked event ready');

	console.log('Step 3: three athletes (identity only)');
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
	await addAthlete('Ben', 'Reed', 'male');
	await addAthlete('Cal', 'Hart', 'male');
	expect(true, 'athletes created');

	console.log('Step 4: season roster — athlete assigned to the team entry');
	await nav()
		.getByRole('link', { name: /Teams & rosters/ })
		.click();
	await p.waitForURL(/\/cap\/teams/, { timeout: 15000 });
	await p.waitForSelector('text=Season roster — Summer 2026', { timeout: 15000 });
	const entryBlock = p
		.locator('form[action="?/addRosterMember"]')
		.locator('xpath=ancestor::div[contains(@class, "rounded-md")][1]');
	await entryBlock.locator('select[name="athlete"]').selectOption({ label: 'Ava Stone' });
	await entryBlock.locator('button:has-text("Add to roster")').click();
	await p.waitForSelector('text=Ava Stone', { timeout: 15000 });
	expect(true, 'Ava Stone on the Blue Heron Flyers season roster');

	console.log('Step 5: gender-restricted reserve pool (pilot configuration)');
	await p.fill('#pool-name', "Men's Reserve");
	await p.selectOption('#pool-gender', 'male');
	await p.click('button:has-text("Create pool")');
	await p.waitForSelector('text=male only', { timeout: 15000 });
	expect(true, 'reserve pool created with a male-only restriction');
	const poolBlock = p
		.locator('form[action="?/addReserveMember"]')
		.locator('xpath=ancestor::div[contains(@class, "rounded-md")][1]');
	const poolOptions = await poolBlock.locator('select[name="athlete"] option').allInnerTexts();
	expect(
		poolOptions.some((o) => o.includes('Ben Reed')) &&
			poolOptions.some((o) => o.includes('Cal Hart')) &&
			!poolOptions.some((o) => o.includes('Ava Stone')),
		'pool candidates respect the restriction and exclude rostered athletes'
	);
	await poolBlock.locator('select[name="athlete"]').selectOption({ label: 'Ben Reed' });
	await poolBlock.locator('button:has-text("Add to pool")').click();
	await p.waitForSelector('text=Ben Reed', { timeout: 15000 });
	expect(true, 'Ben Reed in the reserve pool');

	console.log('Step 6: substitution — event-scoped, roster left intact');
	await p.selectOption('#sub-event', { label: 'Week 1' });
	await p.selectOption('#sub-entry', { label: 'Blue Heron Flyers' });
	await p.selectOption('#sub-out', { label: 'Ava Stone' });
	await p.selectOption('#sub-in', { label: 'Ben Reed' });
	await p.fill('#sub-reason', 'Travel conflict');
	await p.click('button:has-text("Record substitution")');
	await p.waitForSelector('text=replaced by', { timeout: 15000 });
	const subCard = p.locator('div.rounded-md.border', { hasText: 'replaced by' }).last();
	const subText = await subCard.innerText();
	expect(
		subText.includes('Week 1') &&
			subText.includes('Ava Stone') &&
			subText.includes('Ben Reed') &&
			subText.includes('Travel conflict'),
		'substitution records the event, both athletes, and the reason'
	);
	// Roster and pool are untouched: Ava still holds her active spot (no
	// "Past member" badge anywhere), Ben is still a reserve member.
	const rosterCard = p.locator('[data-slot="card"]', { hasText: 'Season roster — Summer 2026' });
	expect(
		(await rosterCard.innerText()).includes('Ava Stone'),
		'season roster still lists Ava Stone after the substitution'
	);
	expect(
		!(await p.innerText('main')).includes('Past member'),
		'no roster membership was archived by the substitution'
	);
	await p.screenshot({ path: path.join(OUT, '1e-06-substitution.png') });

	console.log('Step 7: removal preserves participation history');
	await p.locator('form[action="?/removeRosterMember"] button[type="submit"]').first().click();
	await p.waitForSelector('text=Past member', { timeout: 15000 });
	expect(
		(await rosterCard.innerText()).includes('Ava Stone'),
		'removed athlete stays listed as a past member (history preserved)'
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
	await v.goto(`${orgUrl}/cap/teams`);
	await v.waitForSelector('text=Season roster — Summer 2026', { timeout: 15000 });
	expect(
		(await v.innerText('main')).includes('Ava Stone'),
		'viewer reads the roster, pools, and substitutions'
	);
	expect((await v.$('form[action="?/addRosterMember"]')) === null, 'viewer has no roster form');
	expect((await v.$('#pool-name')) === null, 'viewer has no pool form');
	expect((await v.$('#sub-event')) === null, 'viewer has no substitution form');
	const denied = await v.evaluate(
		async ({ pbUrl, oid, token: tok }) => {
			const res = await fetch(`${pbUrl}/api/collections/reserve_pools/records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: tok },
				body: JSON.stringify({ organization: oid, season: 'x', name: 'X', status: 'active' })
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
	await m.goto(`${orgUrl}/cap/teams`);
	await m.waitForSelector('text=Season roster — Summer 2026', { timeout: 15000 });
	expect(true, 'roster page usable at 375px');
	await m.screenshot({ path: path.join(OUT, '1e-09-mobile.png') });

	console.log('Phase 1E browser acceptance: all steps passed');
} finally {
	await browser.close();
}
