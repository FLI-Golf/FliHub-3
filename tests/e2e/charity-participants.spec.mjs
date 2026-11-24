/**
 * CE-3C: Charity participant interface and privacy acceptance.
 *
 * Runs exclusively against the disposable E2E stack.
 * Superuser access is used only for fixture preparation.
 * Application security assertions use ordinary user sessions.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import PocketBase from 'pocketbase';

const APP = process.env.FLIHUB_E2E_APP_URL;
const PB = process.env.FLIHUB_E2E_PB_URL;

assert.equal(APP, 'http://127.0.0.1:5174');
assert.equal(PB, 'http://127.0.0.1:8098');

const PASS = 'e2e-password-123';
const stamp = Date.now();

const contact = {
	email: 'ce3-private-marker@example.com',
	phone: '555-0187',
	eligibilityNotes: 'CE3-CONFIDENTIAL-TEST-NOTE'
};

function expect(condition, label) {
	assert.ok(condition, label);
	console.log(`  ✓ ${label}`);
}

const root = new PocketBase(PB);

await root
	.collection('_superusers')
	.authWithPassword('e2e-admin@flihub.test', 'e2e-test-only-not-a-secret');

async function createUser(label) {
	const email = `ce3-${label}-${stamp}@example.com`;

	await root.collection('users').create({
		name: `CE3 ${label}`,
		email,
		password: PASS,
		passwordConfirm: PASS,
		verified: true
	});

	const client = new PocketBase(PB);

	await client.collection('users').authWithPassword(email, PASS);

	return { email, client };
}

async function createOrganization(owner, label) {
	const org = await owner.client.send('/api/flihub/organizations', {
		method: 'POST',
		body: {
			name: `CE3 Charity ${label} ${stamp}`,
			guidedSetup: {
				version: 1,
				activity: 'charity-run-walk',
				format: 'single',
				competitors: 'individual',
				result: 'participation'
			}
		}
	});

	const before = await root.collection('organizations').getOne(org.id);

	assert.equal(before.profile, 'charity-run-walk');
	assert.deepEqual(before.capabilities, []);

	// Disposable fixture only. Persistent activation belongs to CE-3E.
	await root.collection('organizations').update(org.id, {
		capabilities: ['athletes']
	});

	return org;
}

async function invite(owner, org, member, role) {
	const invitation = await owner.client.send('/api/flihub/invitations', {
		method: 'POST',
		body: {
			organization: org.id,
			email: member.email,
			role
		}
	});

	await member.client.send('/api/flihub/invitations/accept', {
		method: 'POST',
		body: { token: invitation.token }
	});
}

async function createParticipant(owner, org, firstName, privateFields) {
	const body = {
		operation: 'create',
		identity: {
			firstName,
			lastName: 'Fixture'
		}
	};

	if (privateFields) body.contact = privateFields;

	return owner.client.send(`/api/flihub/organizations/${org.id}/participants`, {
		method: 'POST',
		body
	});
}

function directory(org) {
	return `${APP}/organizations/${org.id}/cap/athletes`;
}

function privateUrl(org, participant) {
	return `${directory(org)}/participants/${participant.id}/private`;
}

function assertNoPrivateMarkers(text, label) {
	expect(
		Object.values(contact).every((value) => !text.includes(value)),
		label
	);
}

async function signIn(browser, user) {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 }
	});

	const page = await context.newPage();

	await page.goto(`${APP}/login`);
	await page.fill('input[name="email"]', user.email);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');

	await page.waitForURL((url) => url.pathname !== '/login', {
		timeout: 15000
	});

	return { context, page };
}

async function assertDenied(context, url, label) {
	const response = await context.request.get(url, {
		maxRedirects: 0
	});

	expect(
		[301, 302, 303, 307, 308, 401, 403, 404].includes(response.status()),
		`${label}: access denied (${response.status()})`
	);

	assertNoPrivateMarkers(await response.text(), `${label}: no private data`);
}

async function assertAllowed(context, url, expected, label) {
	const response = await context.request.get(url, {
		maxRedirects: 0
	});

	expect(response.status() === 200, `${label}: access allowed`);

	assert.deepEqual(await response.json(), expected);

	const cache = response.headers()['cache-control'] ?? '';

	expect(
		cache.includes('private') && cache.includes('no-store'),
		`${label}: private, no-store cache policy`
	);

	expect(
		response.headers()['x-content-type-options'] === 'nosniff',
		`${label}: nosniff response header`
	);
}

const browser = await chromium.launch({
	args: ['--disable-dev-shm-usage']
});

try {
	console.log('Step 1: disposable charity fixtures');

	const owner = await createUser('owner');
	const foreignOwner = await createUser('foreign-owner');
	const admin = await createUser('admin');
	const viewer = await createUser('viewer');
	const scorekeeper = await createUser('scorekeeper');
	const outsider = await createUser('outsider');

	const org = await createOrganization(owner, 'A');
	const foreignOrg = await createOrganization(foreignOwner, 'B');

	await invite(owner, org, admin, 'admin');
	await invite(owner, org, viewer, 'viewer');
	await invite(owner, org, scorekeeper, 'scorekeeper');

	// Admin in A, Viewer in B: privileges must not cross organizations.
	await invite(foreignOwner, foreignOrg, admin, 'viewer');

	const person = await createParticipant(owner, org, 'Riley', contact);
	const empty = await createParticipant(owner, org, 'Morgan');
	const foreignPerson = await createParticipant(foreignOwner, foreignOrg, 'Foreign', contact);

	console.log('Step 2: authenticated browser sessions');

	const ownerSession = await signIn(browser, owner);
	const adminSession = await signIn(browser, admin);
	const viewerSession = await signIn(browser, viewer);
	const scorekeeperSession = await signIn(browser, scorekeeper);
	const outsiderSession = await signIn(browser, outsider);

	const anonymous = await browser.newContext();

	console.log('Step 3: private endpoint authorization');

	await assertAllowed(ownerSession.context, privateUrl(org, person), contact, 'Owner');

	await assertAllowed(adminSession.context, privateUrl(org, person), contact, 'Admin');

	await assertAllowed(
		ownerSession.context,
		privateUrl(org, empty),
		{ email: '', phone: '', eligibilityNotes: '' },
		'Participant without private companion'
	);

	for (const [label, context] of [
		['Viewer', viewerSession.context],
		['Scorekeeper', scorekeeperSession.context],
		['Nonmember', outsiderSession.context],
		['Anonymous', anonymous]
	]) {
		await assertDenied(context, privateUrl(org, person), label);
	}

	await assertDenied(
		ownerSession.context,
		privateUrl(org, foreignPerson),
		'Foreign participant ID'
	);

	await assertDenied(
		ownerSession.context,
		privateUrl(foreignOrg, foreignPerson),
		'Foreign organization'
	);

	await assertDenied(
		adminSession.context,
		privateUrl(foreignOrg, foreignPerson),
		'Mixed-role membership'
	);

	console.log('Step 4: directory payload privacy');

	for (const [label, session] of [
		['Owner', ownerSession],
		['Admin', adminSession],
		['Viewer', viewerSession],
		['Scorekeeper', scorekeeperSession]
	]) {
		const { page, context } = session;

		await page.goto(directory(org));
		await page.getByText('Riley Fixture', { exact: true }).waitFor();

		assertNoPrivateMarkers(
			await page.content(),
			`${label}: initial document and DOM omit private markers`
		);

		const response = await context.request.get(`${directory(org)}/__data.json`);

		expect(response.status() === 200, `${label}: page data accessible`);

		const data = await response.text();

		expect(data.includes('Riley'), `${label}: identity present`);

		assertNoPrivateMarkers(data, `${label}: page-data payload omits private markers`);
	}

	console.log('Step 5: disabled capability enforcement');

	await root.collection('organizations').update(org.id, {
		capabilities: []
	});

	await assertDenied(
		ownerSession.context,
		privateUrl(org, person),
		'Owner with disabled capability'
	);

	await assertDenied(
		adminSession.context,
		privateUrl(org, person),
		'Admin with disabled capability'
	);

	await root.collection('organizations').update(org.id, {
		capabilities: ['athletes']
	});

	await assertAllowed(
		ownerSession.context,
		privateUrl(org, person),
		contact,
		'Re-enabled capability preserves private data'
	);

	console.log('CE-3C CHARITY SECURITY E2E OK');

	console.log('Step 6: charity participant interface');

	const page = ownerSession.page;

	await page.goto(directory(org));
	await page.getByText('Riley Fixture', { exact: true }).waitFor();

	const list = page.locator('details').filter({
		has: page.locator('#participant-search')
	});

	function participantRow(name) {
		return list.locator('div.rounded-md.bg-white').filter({
			has: page.getByText(name, { exact: true })
		});
	}

	await page.getByText('Add a participant', { exact: true }).click();

	expect(await page.locator('#firstName').isVisible(), 'Create form available');
	expect((await page.locator('#gender').count()) === 0, 'Gender omitted');
	expect((await page.locator('#nationality').count()) === 0, 'Nationality omitted');

	expect(
		await page.getByText('Private participant notes', { exact: false }).first().isVisible(),
		'Charity private notes terminology'
	);

	console.log('Step 7: participant creation and validation');

	await page.locator('#firstName').fill('   ');
	await page.locator('#lastName').fill('Acceptance');
	await page.locator('#displayName').fill('Acceptance Participant');
	await page.locator('#email').fill('acceptance@example.com');
	await page.locator('#phone').fill('555-0191');
	await page.locator('#eligibilityNotes').fill('Acceptance private note');

	await page
		.getByRole('button', {
			name: 'Add participant',
			exact: true
		})
		.click();

	await page.getByText('Unable to create participant', { exact: true }).waitFor();

	expect(
		(await page.locator('#lastName').inputValue()) === 'Acceptance',
		'Failed creation preserves identity'
	);

	expect(
		(await page.locator('#email').inputValue()) === 'acceptance@example.com',
		'Failed creation preserves contact information'
	);

	await page.locator('#firstName').fill('Taylor');

	await page
		.getByRole('button', {
			name: 'Add participant',
			exact: true
		})
		.click();

	await page.getByText('Participant created successfully.', { exact: true }).waitFor();

	await participantRow('Acceptance Participant').waitFor();

	expect((await page.locator('#firstName').inputValue()) === '', 'Successful creation resets form');

	expect(
		(await page.locator('#email').inputValue()) === '',
		'Successful creation clears private form values'
	);

	expect(
		!(await list.innerText()).includes('acceptance@example.com'),
		'Created participant contact omitted from directory'
	);

	console.log('Step 8: identity search and filters');

	await page.locator('#participant-search').fill('taylor acceptance');

	expect(
		await participantRow('Acceptance Participant').isVisible(),
		'Search matches first and last name'
	);

	expect(
		(await participantRow('Riley Fixture').count()) === 0,
		'Search excludes unrelated participants'
	);

	await page.locator('#participant-search').fill('acceptance@example.com');

	await page
		.getByText('No participants match your search and status filters.', { exact: true })
		.waitFor();

	expect(true, 'Search does not match private contact information');

	await page.getByRole('button', { name: 'Reset', exact: true }).click();

	expect((await page.locator('#participant-search').inputValue()) === '', 'Reset clears search');

	await participantRow('Riley Fixture').waitFor();

	console.log('Step 9: authorized editing and validation');

	await participantRow('Riley Fixture').getByRole('button', { name: 'Edit', exact: true }).click();

	const dialog = page.getByRole('dialog');

	await dialog.locator('#edit-email').waitFor();

	expect(
		(await dialog.locator('#edit-email').inputValue()) === contact.email,
		'Edit retrieves authorized private contact'
	);

	expect(
		(await dialog.locator('#edit-eligibility').inputValue()) === contact.eligibilityNotes,
		'Edit retrieves authorized private notes'
	);

	expect(
		(await dialog.locator('#edit-nationality').count()) === 0,
		'Charity edit omits nationality'
	);

	await dialog.locator('#edit-firstName').fill('   ');
	await dialog.locator('#edit-displayName').fill('Riley Updated');

	await dialog.getByRole('button', { name: 'Save changes' }).click();

	await dialog.getByText('Unable to update participant', { exact: true }).waitFor();

	expect(await dialog.isVisible(), 'Failed update keeps dialog open');

	expect(
		(await dialog.locator('#edit-displayName').inputValue()) === 'Riley Updated',
		'Failed update preserves entered values'
	);

	expect(
		(await dialog.locator('#edit-email').inputValue()) === contact.email,
		'Failed update preserves private contact'
	);

	await dialog.locator('#edit-firstName').fill('Riley');

	await dialog.getByRole('button', { name: 'Save changes' }).click();

	await page.getByText('Participant updated successfully.', { exact: true }).waitFor();
	await dialog.waitFor({ state: 'hidden' });
	await participantRow('Riley Updated').waitFor();

	assertNoPrivateMarkers(await page.content(), 'Private edit values removed from DOM after saving');

	console.log('Step 10: unsaved edit protection');

	await participantRow('Riley Updated').getByRole('button', { name: 'Edit', exact: true }).click();

	await dialog.locator('#edit-displayName').fill('Unsaved change');

	page.once('dialog', (confirmation) => confirmation.dismiss());

	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

	expect(await dialog.isVisible(), 'Rejecting discard keeps dialog open');

	expect(
		(await dialog.locator('#edit-displayName').inputValue()) === 'Unsaved change',
		'Rejecting discard preserves draft'
	);

	page.once('dialog', (confirmation) => confirmation.accept());

	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

	await dialog.waitFor({ state: 'hidden' });
	await participantRow('Riley Updated').waitFor();

	assertNoPrivateMarkers(await page.content(), 'Discarding edit removes private values from DOM');

	console.log('Step 11: archive, restore and status filters');

	page.once('dialog', (confirmation) => confirmation.accept());

	await participantRow('Riley Updated')
		.getByRole('button', { name: 'Archive', exact: true })
		.click();

	await participantRow('Riley Updated').getByText('Archived', { exact: true }).waitFor();

	await page.locator('#participant-status').selectOption('active');

	expect(
		(await participantRow('Riley Updated').count()) === 0,
		'Active filter excludes archived participant'
	);

	await page.locator('#participant-status').selectOption('archived');

	await participantRow('Riley Updated').waitFor();

	expect(
		(await participantRow('Morgan Fixture').count()) === 0,
		'Archived filter excludes active participants'
	);

	await participantRow('Riley Updated')
		.getByRole('button', { name: 'Restore', exact: true })
		.click();

	await page.locator('#participant-status').selectOption('all');

	await participantRow('Riley Updated').getByText('Active', { exact: true }).waitFor();

	expect(true, 'Archived participant restored');

	console.log('Step 12: charity CSV presentation and preview');

	const addSummary = page.locator('details.group\\/add-athlete > summary');

	if (!(await page.locator('#firstName').isVisible())) {
		await addSummary.click();
	}

	const prompt = await page
		.getByRole('textbox', {
			name: 'Participant CSV chat prompt with three example rows'
		})
		.inputValue();

	expect(
		prompt.includes('firstName,lastName,displayName,email,phone'),
		'Charity CSV prompt uses correct columns'
	);

	expect(
		!prompt.includes('firstName,lastName,gender,nationality,email'),
		'Charity CSV prompt omits sporting columns'
	);

	await page.getByRole('button', { name: 'Import CSV', exact: true }).click();

	await dialog.getByText('Import participants from CSV', { exact: true }).waitFor();

	await dialog.locator('textarea[name="csv"]').fill('Jamie,Preview,,jamie@example.com,555-0192');

	await dialog.getByRole('button', { name: 'Preview CSV', exact: true }).click();

	await dialog.getByText('1 valid row', { exact: true }).waitFor();

	expect(
		await dialog.getByRole('button', { name: 'Confirm import' }).isEnabled(),
		'Valid charity CSV preview permits confirmation'
	);

	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

	await dialog.waitFor({ state: 'hidden' });

	expect(
		(await participantRow('Jamie Preview').count()) === 0,
		'Cancel preview does not create participants'
	);

	console.log('Step 13: read-only participant interface');

	for (const [label, session] of [
		['Viewer', viewerSession],
		['Scorekeeper', scorekeeperSession]
	]) {
		await session.page.goto(directory(org));

		await session.page.getByText('Riley Updated', { exact: true }).waitFor();

		expect(
			(await session.page.getByRole('button', { name: 'Edit', exact: true }).count()) === 0,
			`${label}: no edit controls`
		);

		expect(
			(await session.page.getByText('Add a participant', { exact: true }).count()) === 0,
			`${label}: no creation controls`
		);

		expect(
			await session.page.locator('#participant-search').isVisible(),
			`${label}: identity search available`
		);

		assertNoPrivateMarkers(
			await session.page.content(),
			`${label}: no private data after participant updates`
		);
	}

	console.log('CE-3C CHARITY INTERFACE E2E OK');

	console.log('Step 14: navigation privacy');

	await invite(foreignOwner, foreignOrg, owner, 'admin');

	await page.goto(directory(org));

	await participantRow('Riley Updated').getByRole('button', { name: 'Edit', exact: true }).click();

	await dialog.locator('#edit-email').waitFor();

	expect(
		(await dialog.locator('#edit-email').inputValue()) === contact.email,
		'Private information loaded before navigation'
	);

	// Use SvelteKit client-side navigation, not a full page reload.
	await page.evaluate(async (destination) => {
		const link = document.createElement('a');
		link.href = destination;
		document.body.appendChild(link);
		link.click();
		link.remove();
	}, directory(foreignOrg));

	await page.waitForURL(directory(foreignOrg));

	await page.getByText('Foreign Fixture', { exact: true }).waitFor();

	await dialog.waitFor({ state: 'hidden' });

	expect(
		(await page.locator('#edit-email').count()) === 0,
		'Organization navigation removes private edit fields'
	);

	assertNoPrivateMarkers(
		await page.content(),
		'Organization navigation clears previous private values'
	);

	expect(
		(await page.getByText('Riley Updated', { exact: true }).count()) === 0,
		'Previous organization identity removed'
	);

	console.log('Step 15: mobile participant interface');

	await page.setViewportSize({ width: 375, height: 800 });

	await page.goto(directory(org));

	await participantRow('Riley Updated').waitFor();

	async function assertNoHorizontalOverflow(label) {
		const fits = await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth + 1
		);

		expect(fits, label);
	}

	await assertNoHorizontalOverflow('Mobile directory has no horizontal overflow');

	expect(
		await page.locator('#participant-search').isVisible(),
		'Mobile participant search available'
	);

	await participantRow('Riley Updated').getByRole('button', { name: 'Edit', exact: true }).click();

	await dialog.locator('#edit-email').waitFor();

	await assertNoHorizontalOverflow('Mobile edit has no horizontal page overflow');

	expect(
		await dialog.getByRole('button', { name: 'Save changes' }).isVisible(),
		'Mobile save control available'
	);

	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

	await dialog.waitFor({ state: 'hidden' });

	await page.getByText('Add a participant', { exact: true }).click();

	await page.locator('#firstName').waitFor();

	await assertNoHorizontalOverflow('Mobile create form has no horizontal overflow');

	await page.getByRole('button', { name: 'Import CSV', exact: true }).click();

	await dialog.locator('textarea[name="csv"]').waitFor();

	await assertNoHorizontalOverflow('Mobile CSV dialog has no horizontal page overflow');

	await page.keyboard.press('Escape');

	await dialog.waitFor({ state: 'hidden' });

	console.log('CE-3C CHARITY NAVIGATION AND MOBILE E2E OK');

	console.log('Step 16: interrupted private request');

	const securityPage = adminSession.page;
	await securityPage.goto(directory(org));

	await securityPage
		.getByText('Riley Updated', {
			exact: true
		})
		.waitFor();

	await securityPage.evaluate(() => {
		document.documentElement.dataset.ce3NavigationProof = 'same-document';
	});

	const pendingUrl = privateUrl(org, person);

	let releaseRequest;
	let markIntercepted;

	const requestGate = new Promise((resolve) => {
		releaseRequest = resolve;
	});

	const intercepted = new Promise((resolve) => {
		markIntercepted = resolve;
	});

	await securityPage.route(pendingUrl, async (route) => {
		markIntercepted();
		await requestGate;
		await route.abort().catch(() => {});
	});

	async function navigateWithinApp(targetPage, destination) {
		await targetPage.evaluate((url) => {
			const link = document.createElement('a');
			link.href = url;
			document.body.appendChild(link);
			link.click();
			link.remove();
		}, destination);
	}

	try {
		const failedRequest = securityPage.waitForEvent('requestfailed', {
			predicate: (request) => request.url() === pendingUrl,
			timeout: 15000
		});

		// Prevent an unhandled rejection if an earlier assertion fails.
		failedRequest.catch(() => {});

		await securityPage
			.locator('div.rounded-md.bg-white')
			.filter({
				has: securityPage.getByText('Riley Updated', {
					exact: true
				})
			})
			.getByRole('button', { name: 'Edit', exact: true })
			.click();

		await securityPage
			.getByText('Loading private participant information…', { exact: true })
			.waitFor();

		await intercepted;

		expect(true, 'Private request intercepted while loading');

		await navigateWithinApp(securityPage, directory(foreignOrg));

		await securityPage.waitForURL(directory(foreignOrg));

		await securityPage
			.getByText('Foreign Fixture', {
				exact: true
			})
			.waitFor();

		expect(
			await securityPage.evaluate(
				() => document.documentElement.dataset.ce3NavigationProof === 'same-document'
			),
			'Organization switch uses client-side navigation'
		);

		await failedRequest;

		expect(true, 'Pending private request cancelled before release');

		await securityPage.getByRole('dialog').waitFor({
			state: 'hidden'
		});

		expect(
			(await securityPage.locator('#edit-email').count()) === 0,
			'Private edit fields removed after interrupted request'
		);

		expect(
			(await securityPage
				.getByRole('button', {
					name: 'Edit',
					exact: true
				})
				.count()) === 0,
			'Destination viewer cannot edit participants'
		);

		assertNoPrivateMarkers(
			await securityPage.content(),
			'Interrupted request exposes no private markers'
		);
	} finally {
		releaseRequest();
		await securityPage.unrouteAll({ behavior: 'wait' });
	}

	console.log('Step 17: unsaved creation navigation protection');

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(directory(org));

	await page
		.getByText('Add a participant', {
			exact: true
		})
		.click();

	await page.locator('#firstName').fill('Unsaved');
	await page.locator('#lastName').fill('Navigation');
	await page.locator('#email').fill('unsaved@example.com');

	const rejectDiscard = page.waitForEvent('dialog');
	const rejectedNavigation = navigateWithinApp(page, directory(foreignOrg));

	const rejectedConfirmation = await rejectDiscard;

	expect(
		rejectedConfirmation.message().includes('Discard unsaved participant changes'),
		'Unsaved creation prompts before navigation'
	);

	await rejectedConfirmation.dismiss();
	await rejectedNavigation;

	expect(page.url() === directory(org), 'Rejecting discard prevents organization navigation');

	expect(
		(await page.locator('#firstName').inputValue()) === 'Unsaved',
		'Rejecting discard preserves participant identity'
	);

	expect(
		(await page.locator('#email').inputValue()) === 'unsaved@example.com',
		'Rejecting discard preserves unsaved contact information'
	);

	const acceptDiscard = page.waitForEvent('dialog');
	const acceptedNavigation = navigateWithinApp(page, directory(foreignOrg));

	const acceptedConfirmation = await acceptDiscard;
	await acceptedConfirmation.accept();
	await acceptedNavigation;

	await page.waitForURL(directory(foreignOrg));

	await page
		.getByText('Foreign Fixture', {
			exact: true
		})
		.waitFor();

	expect(
		!(await page.content()).includes('unsaved@example.com'),
		'Discarded contact information absent from destination'
	);

	await page.goto(directory(org));

	expect(
		(await page
			.getByText('Unsaved Navigation', {
				exact: true
			})
			.count()) === 0,
		'Discarded participant was not created'
	);

	console.log('CE-3C FINAL NAVIGATION SECURITY E2E OK');

	console.log('Step 18: pending save input protection');

	await page.goto(directory(org));

	await page
		.getByText('Add a participant', {
			exact: true
		})
		.click();

	await page.locator('#firstName').fill('   ');
	await page.locator('#lastName').fill('Busy Protection');
	await page.locator('#email').fill('busy@example.com');

	async function verifyPendingSave({ action, fields, submit, error, label }) {
		let release;
		let markIntercepted;

		const gate = new Promise((resolve) => {
			release = resolve;
		});

		const intercepted = new Promise((resolve) => {
			markIntercepted = resolve;
		});

		const matcher = (url) => url.search === `?/${action}`;

		await page.route(matcher, async (route) => {
			if (route.request().method() !== 'POST') {
				await route.continue();
				return;
			}

			markIntercepted();
			await gate;
			await route.continue();
		});

		try {
			await submit.click();

			let timeout;

			try {
				await Promise.race([
					intercepted,
					new Promise((_, reject) => {
						timeout = setTimeout(
							() => reject(new Error(`${label}: save request not intercepted`)),
							15000
						);
					})
				]);
			} finally {
				clearTimeout(timeout);
			}

			await page
				.getByRole('button', {
					name: 'Saving…',
					exact: true
				})
				.waitFor();

			for (const id of fields) {
				const field = page.locator(`#${id}`);

				expect(
					await field.evaluate((element) => element.readOnly),
					`${label}: ${id} read-only while saving`
				);
			}

			expect(
				await page
					.getByRole('button', {
						name: 'Saving…',
						exact: true
					})
					.isDisabled(),
				`${label}: duplicate submission prevented`
			);

			release();

			await error.waitFor();

			for (const id of fields) {
				const field = page.locator(`#${id}`);

				expect(await field.isEditable(), `${label}: ${id} editable after validation failure`);
			}
		} finally {
			release();
			await page.unrouteAll({ behavior: 'wait' });
		}
	}

	await verifyPendingSave({
		action: 'createAthlete',
		fields: ['firstName', 'lastName', 'displayName', 'email', 'phone', 'eligibilityNotes'],
		submit: page.getByRole('button', {
			name: 'Add participant',
			exact: true
		}),
		error: page.getByText('Unable to create participant', {
			exact: true
		}),
		label: 'Create'
	});

	expect(
		(await page.locator('#email').inputValue()) === 'busy@example.com',
		'Create failure preserves contact information'
	);

	// Discard the intentionally invalid creation draft.
	page.once('dialog', (confirmation) => confirmation.accept());

	await navigateWithinApp(page, directory(foreignOrg));
	await page.waitForURL(directory(foreignOrg));

	await page.goto(directory(org));

	await participantRow('Riley Updated')
		.getByRole('button', {
			name: 'Edit',
			exact: true
		})
		.click();

	await dialog.locator('#edit-email').waitFor();
	await dialog.locator('#edit-firstName').fill('   ');

	await verifyPendingSave({
		action: 'updateAthlete',
		fields: [
			'edit-firstName',
			'edit-lastName',
			'edit-displayName',
			'edit-email',
			'edit-phone',
			'edit-eligibility'
		],
		submit: dialog.getByRole('button', {
			name: 'Save changes',
			exact: true
		}),
		error: dialog.getByText('Unable to update participant', {
			exact: true
		}),
		label: 'Edit'
	});

	expect(
		(await dialog.locator('#edit-email').inputValue()) === contact.email,
		'Edit failure preserves private contact information'
	);

	page.once('dialog', (confirmation) => confirmation.accept());

	await dialog
		.getByRole('button', {
			name: 'Cancel',
			exact: true
		})
		.click();

	await dialog.waitFor({ state: 'hidden' });

	assertNoPrivateMarkers(await page.content(), 'Discarded edit clears private information');

	console.log('CE-3C PENDING SAVE PROTECTION E2E OK');
} finally {
	await browser.close();
}
