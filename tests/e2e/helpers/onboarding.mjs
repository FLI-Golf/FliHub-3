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
