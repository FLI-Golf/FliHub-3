/**
 * CE-2 browser acceptance:
 * Charity guided creation, profile persistence, configuration,
 * navigation restrictions, mobile layout and disc golf regression.
 *
 * Run: npm run test:e2e -- charity-organization
 *
 * The existing runner supplies a disposable application stack.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_E2E_APP_URL;
const MAILPIT = process.env.FLIHUB_E2E_MAILPIT_URL;

if (!APP || !MAILPIT) {
	throw new Error('Run through tests/e2e/run-e2e.mjs');
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');

const OWNER = {
	name: 'Charity E2E Owner',
	email: `charity-owner-${Date.now()}@example.com`
};

const PASS = 'e2e-password-123';
const CHARITY = 'Community Steps Foundation';
const DISC_GOLF = 'CE-2 Disc Golf Regression';

function passed(label) {
	console.log(`  PASS: ${label}`);
}

async function verificationToken(email) {
	for (let i = 0; i < 60; i++) {
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

		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	throw new Error(`No verification email for ${email}`);
}

async function signIn(page, firstTime = false) {
	await page.goto(`${APP}/login`);
	await page.fill('input[name="email"]', OWNER.email);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');

	if (firstTime) {
		await page.waitForURL((url) => url.pathname === '/account', { timeout: 15000 });

		await page.locator('input[name="activity"][value="organization"]').check();

		await page
			.getByRole('button', {
				name: 'Continue',
				exact: true
			})
			.click();

		await page.waitForURL(
			(url) => url.pathname === '/account' && url.searchParams.get('activity') === 'organization',
			{ timeout: 15000 }
		);

		await page
			.getByRole('link', {
				name: 'Create an organization',
				exact: true
			})
			.click();

		await page.waitForURL((url) => url.pathname === '/organizations/new', { timeout: 15000 });

		passed('New account reached guided organization creation');
	} else {
		await page.waitForURL((url) => url.pathname === '/organizations', { timeout: 15000 });

		passed('Existing member reached organizations');
	}
}

async function registerOwner(page) {
	await page.goto(`${APP}/register`);

	await page.fill('input[name="name"]', OWNER.name);
	await page.fill('input[name="email"]', OWNER.email);
	await page.fill('input[name="password"]', PASS);
	await page.fill('input[name="passwordConfirm"]', PASS);

	await page.click('button[type="submit"]');

	await page.waitForSelector('text=We sent a verification email', { timeout: 15000 });

	const token = await verificationToken(OWNER.email);

	await page.goto(`${APP}/verify-email/${token}`);
	await page.waitForLoadState('networkidle');

	await signIn(page, true);
}

async function visibleText(page, text) {
	await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
}

async function screenshot(page, name) {
	await page.screenshot({
		path: path.join(OUT, `ce2-${name}.png`),
		fullPage: true
	});
}

async function guidedCreate(page, name, selections) {
	if (new URL(page.url()).pathname !== '/organizations/new') {
		await page.goto(`${APP}/organizations`);

		await page
			.getByRole('link', {
				name: 'Create an organization',
				exact: true
			})
			.click();
	}

	await page.waitForURL((url) => url.pathname === '/organizations/new', { timeout: 15000 });

	await page.getByLabel('Organization name').fill(name);

	await page
		.getByRole('button', {
			name: 'Next',
			exact: true
		})
		.click();

	for (let i = 0; i < selections.length; i++) {
		const value = selections[i];

		await page.locator(`input[type="radio"][value="${value}"]`).check();

		await page
			.getByRole('button', {
				name: i === selections.length - 1 ? 'Review setup' : 'Next',
				exact: true
			})
			.click();
	}

	await visibleText(page, 'Ready to create the organization');
}

async function submitOrganization(page) {
	await page
		.getByRole('button', {
			name: 'Create organization',
			exact: true
		})
		.click();

	await page.waitForURL(/\/organizations\/[a-z0-9]{15}$/, { timeout: 20000 });

	await visibleText(page, 'Your role: Owner');

	return new URL(page.url()).pathname;
}

async function verifyCharityNavigation(page) {
	const nav = page.getByRole('navigation', {
		name: 'Organization sections'
	});

	await nav.waitFor({ state: 'visible' });

	const links = await nav
		.getByRole('link')
		.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')));

	assert.equal(links.length, 2);
	assert.ok(links.some((href) => href.endsWith('/settings')));
	assert.ok(links.every((href) => !href.includes('/cap/')));
	assert.ok(links.every((href) => !href.endsWith('/public')));

	passed('Only overview and settings navigation is available');
}

async function verifyDashboard(page) {
	await page
		.getByRole('heading', {
			name: CHARITY,
			exact: true
		})
		.waitFor();

	await visibleText(page, 'Your role: Owner');
	await visibleText(page, 'Noncompetitive');
	await visibleText(page, 'Upcoming workflows');

	for (const label of [
		'Participants',
		'Events & registrations',
		'Routes & distances',
		'Sponsorships',
		'Reimbursements & expenses',
		'Donations & pledges'
	]) {
		await visibleText(page, label);
	}

	assert.equal(
		await page
			.getByText('Setup pending', {
				exact: true
			})
			.count(),
		0
	);

	passed('Charity dashboard and planned workflows verified');
}

let browser;
let page;

try {
	browser = await chromium.launch({
		headless: true,
		args: ['--disable-dev-shm-usage']
	});

	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 }
	});

	page = await context.newPage();

	console.log('Step 1: register and verify Owner');

	await registerOwner(page);
	assert.equal(new URL(page.url()).pathname, '/organizations/new');

	passed('Verified new account reached the creation wizard');

	console.log('Step 2: guided charity creation');

	await guidedCreate(page, CHARITY, ['charity-run-walk', 'single', 'individual', 'participation']);

	const review = await page.locator('main').innerText();

	assert.ok(review.includes('default 5K distance'));
	assert.ok(review.includes('noncompetitive participation'));
	assert.ok(review.includes('No operational capabilities are enabled yet'));

	await screenshot(page, '01-charity-review');

	const charityPath = await submitOrganization(page);

	console.log('Step 3: dashboard and navigation');

	await verifyDashboard(page);
	await visibleText(page, '5K');
	await verifyCharityNavigation(page);

	await screenshot(page, '02-charity-dashboard');

	console.log('Step 4: settings and default distances');

	await page.goto(`${APP}${charityPath}/settings`);

	await visibleText(page, 'Organization profile');
	await visibleText(page, 'Operational workflows');
	await visibleText(page, 'Default event distances');

	assert.equal(await page.locator('input[name="template"]').inputValue(), 'race-event');

	assert.equal(await page.locator('input[name="capability"]').count(), 0);

	const labels = page.getByPlaceholder('Label (e.g. 10K)');
	const distances = page.getByPlaceholder('Distance', {
		exact: true
	});

	assert.equal(await labels.count(), 1);
	assert.equal(await labels.first().inputValue(), '5K');
	assert.equal(await distances.first().inputValue(), '5');

	await page
		.getByRole('button', {
			name: 'Add distance',
			exact: true
		})
		.click();

	await labels.nth(1).fill('10K');
	await distances.nth(1).fill('10');

	await page
		.getByRole('button', {
			name: 'Save settings',
			exact: true
		})
		.click();

	await visibleText(page, 'Settings saved');

	await page.reload();

	assert.equal(await labels.count(), 2);
	assert.equal(await labels.nth(0).inputValue(), '5K');
	assert.equal(await labels.nth(1).inputValue(), '10K');
	assert.equal(await distances.nth(1).inputValue(), '10');

	passed('Default distances persist after refresh');

	await screenshot(page, '03-charity-settings');

	console.log('Step 5: disabled workflow routes');

	for (const capability of [
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'events',
		'scoring-results',
		'standings',
		'fantasy',
		'sponsorships',
		'reimbursements'
	]) {
		const response = await page.goto(`${APP}${charityPath}/cap/${capability}`);

		assert.equal(
			response?.status(),
			200,
			`Disabled capability ${capability} must render its informational page`
		);

		await page
			.getByText(/is not enabled$/)
			.first()
			.waitFor({
				state: 'visible',
				timeout: 15000
			});

		await page
			.getByText(`This capability is disabled for ${CHARITY}, so its workflows are hidden.`, {
				exact: false
			})
			.first()
			.waitFor({
				state: 'visible',
				timeout: 15000
			});

		const content = page
			.locator('section')
			.filter({
				has: page.getByRole('heading', { level: 1 })
			})
			.last();

		assert.equal(
			await content.locator('form').count(),
			0,
			`Disabled capability ${capability} must not render operational forms`
		);

		assert.equal(
			await content.locator('input, textarea, select, [contenteditable="true"]').count(),
			0,
			`Disabled capability ${capability} must not render editable fields`
		);

		await page
			.getByText(
				'This capability is not currently available for charity run / walk organizations.',
				{ exact: false }
			)
			.first()
			.waitFor({
				state: 'visible',
				timeout: 15000
			});

		assert.equal(
			await content
				.getByRole('link', {
					name: 'Return to overview',
					exact: true
				})
				.count(),
			1
		);

		assert.equal(
			await content
				.getByText('Enable it in organization settings', {
					exact: false
				})
				.count(),
			0
		);

		assert.equal(
			await content
				.getByRole('link', {
					name: 'Open settings',
					exact: true
				})
				.count(),
			0
		);

		passed(`Disabled capability ${capability}: informational page only`);
	}

	passed('All ten disabled capabilities hide operational workflows');

	const publicResponse = await page.goto(`${APP}${charityPath}/public`);

	assert.ok(
		publicResponse && [403, 404].includes(publicResponse.status()),
		'Charity public management route must be denied'
	);

	passed('Direct public management route is denied');

	console.log('Step 6: mobile charity dashboard');

	await page.setViewportSize({
		width: 375,
		height: 800
	});

	await page.goto(`${APP}${charityPath}`);

	await verifyDashboard(page);
	await visibleText(page, '5K, 10K');

	await page
		.getByRole('button', {
			name: 'Show navigation',
			exact: true
		})
		.click();

	await verifyCharityNavigation(page);

	assert.ok(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
		'Mobile dashboard must not overflow horizontally'
	);

	await screenshot(page, '04-charity-mobile');

	passed('Mobile navigation and dashboard verified at 375px');

	console.log('Step 7: profile persists across sessions');

	const secondContext = await browser.newContext({
		viewport: { width: 1280, height: 900 }
	});

	const secondPage = await secondContext.newPage();

	await signIn(secondPage);
	await secondPage.goto(`${APP}${charityPath}`);

	await verifyDashboard(secondPage);
	await visibleText(secondPage, '5K, 10K');
	await verifyCharityNavigation(secondPage);

	await secondContext.close();

	passed('Charity profile persists in a new browser session');

	console.log('Step 8: disc golf guided creation regression');

	await page.setViewportSize({
		width: 1280,
		height: 900
	});

	await guidedCreate(page, DISC_GOLF, ['disc-golf', 'league', 'team', 'strokes']);

	await screenshot(page, '05-disc-golf-review');

	const discGolfPath = await submitOrganization(page);

	assert.notEqual(discGolfPath, charityPath);

	const golfNav = page.getByRole('navigation', {
		name: 'Organization sections'
	});

	await golfNav.waitFor({ state: 'visible' });

	for (const capability of [
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'events',
		'scoring-results',
		'standings'
	]) {
		assert.equal(
			await golfNav.locator(`a[href="${discGolfPath}/cap/${capability}"]`).count(),
			1,
			`Disc golf capability ${capability} must remain enabled`
		);
	}

	assert.equal(await golfNav.locator(`a[href="${discGolfPath}/cap/fantasy"]`).count(), 0);

	assert.equal(await golfNav.locator(`a[href="${discGolfPath}/public"]`).count(), 1);

	await screenshot(page, '06-disc-golf-dashboard');

	passed('Existing disc golf guided creation remains compatible');

	await page.goto(`${APP}${charityPath}`);

	await verifyDashboard(page);
	await verifyCharityNavigation(page);
	await visibleText(page, '5K, 10K');

	passed('Creating disc golf does not change charity configuration');

	console.log('CE-2 CHARITY E2E OK');
} catch (error) {
	console.error(error);

	if (page) {
		await screenshot(page, 'failure').catch(() => {});
	}

	process.exitCode = 1;
} finally {
	await browser?.close();
}
