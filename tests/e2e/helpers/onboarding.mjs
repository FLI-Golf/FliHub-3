/**
 * Shared browser helpers for the current guided organization onboarding.
 * Uses the real application UI and does not bypass authorization.
 */

export async function openOrganizationSetup(page) {
	await page.waitForURL((url) => url.pathname === '/account', {
		timeout: 15000
	});

	await page.locator('input[name="activity"][value="organization"]').check();
	await page.getByRole('button', { name: 'Continue', exact: true }).click();

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
}

export async function completeGuidedSetup(
	page,
	name,
	selections = ['disc-golf', 'league', 'team', 'strokes']
) {
	await page.getByLabel('Organization name').fill(name);
	await page.getByRole('button', { name: 'Next', exact: true }).click();

	for (let i = 0; i < selections.length; i++) {
		await page.locator(`input[type="radio"][value="${selections[i]}"]`).check();

		await page
			.getByRole('button', {
				name: i === selections.length - 1 ? 'Review setup' : 'Next',
				exact: true
			})
			.click();
	}
}

export async function createGuidedOrganization(page, name) {
	await completeGuidedSetup(page, name);

	await page.getByText('Ready to create the organization', { exact: true }).first().waitFor();

	await page
		.getByRole('button', {
			name: 'Create organization',
			exact: true
		})
		.click();

	await page.waitForURL(/\/organizations\/[a-z0-9]{15}$/, { timeout: 15000 });

	return page.url();
}

/** Create through the guided UI and configure the fixture's exact capabilities. */
export async function createOrganizationWithCapabilities(page, name, capabilities) {
	await openOrganizationSetup(page);
	const organizationUrl = await createGuidedOrganization(page, name);
	await page.goto(`${organizationUrl}/settings`);
	await page.locator('input[name="template"][value="custom"]').check();
	for (const capability of capabilities) {
		await page.locator(`input[name="capability"][value="${capability}"]`).check();
	}
	await page.getByRole('button', { name: 'Save settings', exact: true }).click();
	await page.getByText('Settings saved', { exact: true }).waitFor();
	await page.reload();
	const selected = await page
		.locator('input[name="capability"]:checked')
		.evaluateAll((inputs) => inputs.map((input) => input.value));
	if (JSON.stringify(selected.sort()) !== JSON.stringify([...capabilities].sort())) {
		throw new Error('Fixture capability configuration did not persist exactly');
	}
	await page.goto(organizationUrl);
	return organizationUrl;
}

/**
 * Open a native disclosure section through its visible summary.
 * Leave an already-open section unchanged.
 */
export async function openSection(page, label) {
	const summary = page.locator('summary').filter({ hasText: label });

	await summary.waitFor({ state: 'visible' });

	const isOpen = await summary.evaluate((element) => element.parentElement.open);

	if (!isOpen) {
		await summary.click();
	}
}
