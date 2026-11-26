import assert from 'node:assert/strict';
import { chromium } from 'playwright';

export async function runWorkspaceBrowserAcceptance({
	base,
	workspacePath,
	ownerCookie,
	workspaceCookie,
	pass
}) {
	const browser = await chromium.launch({ headless: true });

	const workspaceUrl = `${base}${workspacePath}`;

	const authSeparator = ownerCookie.indexOf('=');

	assert.ok(authSeparator > 0);

	const auth = {
		name: ownerCookie.slice(0, authSeparator),
		value: ownerCookie.slice(authSeparator + 1),
		url: base,
		httpOnly: true,
		sameSite: 'Lax'
	};

	try {
		const context = await browser.newContext({
			viewport: { width: 1280, height: 900 }
		});

		await context.route('**/*', async (route) => {
			const url = new URL(route.request().url());

			if (url.origin !== base) {
				await route.abort();
				return;
			}

			await route.continue();
		});

		await context.addCookies([auth]);

		const page = await context.newPage();

		page.on('pageerror', (error) => {
			console.error('BROWSER PAGE ERROR:', error.name);
		});

		async function browserDiagnostics() {
			const snapshot = await page.evaluate(() => ({
				navigation: Array.from(
					document.querySelectorAll('nav[aria-label="Controlled intelligence workspace"] button')
				).map((button) => ({
					label: button.textContent.trim(),
					pressed: button.getAttribute('aria-pressed'),
					disabled: button.disabled
				})),
				headings: Array.from(document.querySelectorAll('h1, h2, h3')).map((heading) =>
					heading.textContent.trim()
				),
				metrics: Array.from(document.querySelectorAll('dl > div')).map((row) => ({
					label: row.querySelector('dt')?.textContent.trim(),
					value: row.querySelector('dd')?.textContent.trim()
				})),
				assessmentForm: Array.from(document.querySelectorAll('form[action="?/assess"]')).map(
					(form) => ({
						busy: form.getAttribute('aria-busy'),
						disabled: form.querySelector('fieldset')?.disabled
					})
				),
				viewport: {
					width: window.innerWidth,
					documentWidth: document.documentElement.scrollWidth
				}
			}));

			console.error('BROWSER DIAGNOSTIC SNAPSHOT:', JSON.stringify(snapshot, null, 2));
		}

		try {
			page.setDefaultTimeout(15000);

			async function visible(locator) {
				await locator.waitFor({ state: 'visible' });
			}

			async function tab(name) {
				const navigation = page.getByRole('navigation', {
					name: 'Controlled intelligence workspace'
				});

				const button = navigation.getByRole('button', {
					name,
					exact: true
				});

				await button.click();

				await page.waitForFunction(
					(label) => {
						const navigation = document.querySelector(
							'nav[aria-label="Controlled intelligence workspace"]'
						);

						if (!navigation) return false;

						return Array.from(navigation.querySelectorAll('button')).some(
							(element) =>
								element.textContent.replace(/\\s+/g, ' ').trim() === label &&
								element.getAttribute('aria-pressed') === 'true'
						);
					},
					name,
					{ timeout: 15000 }
				);

				assert.equal(await button.getAttribute('aria-pressed'), 'true');
			}

			async function submitAssessment(expectedStatus = 200) {
				const button = page.getByRole('button', {
					name: 'Assess objective',
					exact: true
				});

				const responsePromise = page.waitForResponse((response) => {
					const url = new URL(response.url());

					return (
						url.origin === base &&
						url.pathname === workspacePath &&
						url.search === '?/assess' &&
						response.request().method() === 'POST'
					);
				});

				await button.click();

				const response = await responsePromise;

				assert.equal(response.status(), expectedStatus);

				await page
					.locator('form[action="?/assess"][aria-busy="false"]')
					.waitFor({ state: 'visible' });

				await visible(button);

				await visible(page.locator('#assessment-results-heading'));
			}

			async function verifyHistory(expected) {
				await tab('History');

				await visible(
					page.getByText(`${expected} ${expected === 1 ? 'record' : 'records'}`, { exact: true })
				);

				const historySection = page
					.getByRole('heading', {
						name: 'Assessment history',
						exact: true
					})
					.locator('xpath=ancestor::section[1]');

				assert.equal(await historySection.count(), 1);

				const records = historySection.locator('details > summary');

				assert.equal(await records.count(), expected);

				for (let index = 0; index < expected; index++) {
					const sequence = expected - index;
					const heading = records.nth(index).locator('p').first();

					const text = (await heading.textContent()).replace(/\s+/g, ' ').trim();

					assert.match(text, new RegExp('^Assessment\\s*#\\s*' + sequence + '$'));
				}
			}

			async function verifyUsage(expected) {
				await tab('Usage');

				const usageSection = page
					.getByRole('heading', {
						name: 'Session usage',
						exact: true
					})
					.locator('xpath=ancestor::section[1]');

				const metrics = usageSection.locator(':scope > dl');

				await visible(metrics);

				assert.equal(await metrics.count(), 1);

				const actual = await metrics.evaluate((element) =>
					Array.from(element.children).map((row) => ({
						label: row.querySelector('dt')?.textContent.trim(),
						value: row.querySelector('dd')?.textContent.trim()
					}))
				);

				assert.deepEqual(actual, [
					{
						label: 'Completed assessments',
						value: String(expected)
					},
					{
						label: 'Retained records',
						value: `${expected} / 50`
					},
					{
						label: 'Paid provider requests',
						value: '0'
					},
					{
						label: 'Paid provider cost',
						value: '$0.00'
					}
				]);

				const securitySection = page.locator('details').filter({
					has: page.getByText('Security and execution boundaries', {
						exact: true
					})
				});

				await visible(securitySection);

				assert.equal(await securitySection.count(), 1);

				const restrictions = await securitySection.evaluate((element) =>
					Array.from(element.querySelectorAll('dl > div')).map((row) => ({
						label: row.querySelector('dt')?.textContent.trim(),
						value: row.querySelector('dd')?.textContent.trim()
					}))
				);

				assert.deepEqual(restrictions, [
					{
						label: 'External provider access',
						value: 'Disabled'
					},
					{
						label: 'Persistent mutations',
						value: 'Disabled'
					},
					{
						label: 'Operation execution',
						value: 'Disabled'
					},
					{
						label: 'Data source',
						value: 'Synthetic only'
					},
					{
						label: 'Paid provider cost',
						value: '$0.00'
					}
				]);

				pass(`Browser usage and security boundaries verified: ${expected} assessments`);
			}

			await page.goto(workspaceUrl);

			await page
				.getByRole('button', {
					name: 'Start synthetic session'
				})
				.click();

			await visible(
				page.getByText('Active at last server response', {
					exact: true
				})
			);

			pass('Browser starts protected synthetic workspace');

			await page
				.getByLabel('Your objective', {
					exact: true
				})
				.fill('Help me prepare our next tournament.');

			await submitAssessment();

			await visible(
				page.getByText('Recommendation available', {
					exact: true
				})
			);

			await visible(
				page.getByText('Recommended next step', {
					exact: true
				})
			);

			await verifyHistory(1);
			await verifyUsage(1);

			pass('Browser natural-language assessment refreshes history and usage');

			await tab('Workspace');

			await page
				.getByRole('radio', {
					name: 'Registered objective'
				})
				.check();

			await page.locator('#registered-objective').selectOption('assess_readiness');

			await submitAssessment();

			await visible(page.locator('#assessment-results-heading'));

			await visible(
				page
					.locator('section[aria-labelledby="assessment-results-heading"]')
					.getByText('Assess tournament readiness', {
						exact: true
					})
			);

			await verifyHistory(2);
			await verifyUsage(2);

			pass('Browser registered objective resolves correctly');

			await tab('Workspace');

			await page
				.getByRole('radio', {
					name: 'Natural language'
				})
				.check();

			await page
				.getByLabel('Your objective', {
					exact: true
				})
				.fill('Delete all real application records.');

			await submitAssessment(400);

			await visible(
				page.getByRole('heading', {
					name: 'Unsupported assessment',
					exact: true
				})
			);

			assert.equal(
				await page
					.getByText('Recommended next step', {
						exact: true
					})
					.count(),
				0
			);

			await verifyHistory(3);

			const rejectedRecord = page
				.getByRole('heading', {
					name: 'Assessment history',
					exact: true
				})
				.locator('xpath=ancestor::section[1]')
				.locator('details > summary')
				.first();

			await visible(
				rejectedRecord.getByText('Unsupported assessment', {
					exact: true
				})
			);

			await verifyUsage(3);

			pass('Browser rejected assessment replaces advice and refreshes accounting');

			await page.reload();

			await verifyHistory(3);
			await verifyUsage(3);

			pass('Browser refresh preserves server-owned session history');

			await tab('Workspace');

			assert.equal(
				await page
					.getByRole('heading', {
						name: 'Assessment results',
						exact: true
					})
					.count(),
				0
			);

			await page
				.getByRole('button', {
					name: 'End synthetic session'
				})
				.click();

			await visible(
				page.getByRole('button', {
					name: 'Start synthetic session'
				})
			);

			await tab('History');

			await visible(
				page.getByText('No active workspace session', {
					exact: true
				})
			);

			pass('Browser session closure discards assessment history');

			await tab('Workspace');

			await page
				.getByRole('button', {
					name: 'Start synthetic session'
				})
				.click();

			await visible(
				page.getByText('Active at last server response', {
					exact: true
				})
			);

			await tab('History');

			await visible(
				page.getByText('No assessments yet', {
					exact: true
				})
			);

			await verifyUsage(0);

			pass('Browser replacement session starts with empty accounting');

			await tab('Workspace');

			await page.setViewportSize({
				width: 390,
				height: 844
			});

			assert.ok(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
				'Mobile workspace must not overflow horizontally'
			);

			const objective = page.locator('#workspace-objective');

			await page
				.locator('form[action="?/assess"] fieldset:not([disabled])')
				.waitFor({ state: 'visible' });

			await objective.fill('');
			await objective.focus();

			assert.equal(await objective.evaluate((element) => element === document.activeElement), true);

			await page.keyboard.press('Tab');

			assert.equal(
				await page.evaluate(() => document.activeElement?.textContent?.trim()),
				'Prepare tournament'
			);

			await page.keyboard.press('Shift+Tab');

			assert.equal(await objective.evaluate((element) => element === document.activeElement), true);

			await page.keyboard.type('Help me prepare our next tournament.');

			assert.equal(await objective.inputValue(), 'Help me prepare our next tournament.');

			await submitAssessment();

			assert.ok(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
				'Mobile assessment results must not overflow horizontally'
			);

			pass('Browser mobile layout and keyboard objective entry verified');

			const cookies = await context.cookies(workspaceUrl);

			const selector = cookies.find((cookie) => cookie.name === workspaceCookie);

			assert.ok(selector);

			const noScript = await browser.newContext({
				javaScriptEnabled: false
			});

			try {
				await noScript.route('**/*', async (route) => {
					if (new URL(route.request().url()).origin !== base) {
						await route.abort();
						return;
					}

					await route.continue();
				});

				await noScript.addCookies(cookies);

				const staticPage = await noScript.newPage();

				await staticPage.goto(workspaceUrl);

				await visible(staticPage.getByText('JavaScript required for assessments', { exact: true }));

				assert.equal(
					await staticPage
						.getByRole('button', {
							name: 'Assess objective',
							exact: true
						})
						.isDisabled(),
					true
				);

				pass('Browser without JavaScript cannot submit interactive assessment');
			} finally {
				await noScript.close();
			}

			// JAI-5D: exact review and protected editing lifecycle.
			await tab('Workspace');

			const prepareReview = page.getByRole('button', {
				name: 'Prepare exact operation review',
				exact: true
			});

			const protectedInputs = page.getByRole('heading', {
				name: 'Assessment inputs protected',
				exact: true
			});

			const discardReview = page.getByRole('button', {
				name: 'Discard review and edit assessment',
				exact: true
			});

			const exactReview = page.getByRole('heading', {
				name: 'Exact operation review',
				exact: true
			});

			const reviewForm = page.locator('form[action="?/cancelReview"]');

			await visible(prepareReview);
			await prepareReview.click();
			await visible(exactReview);

			const firstReviewId = await reviewForm.locator('input[name="reviewId"]').inputValue();

			assert.match(firstReviewId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);

			await visible(
				page
					.getByText('Synthetic Team 9', { exact: true })
					.first()
					.locator('xpath=ancestor::details[1]')
					.locator('summary')
			);

			assert.ok(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
				'Mobile exact review must not overflow horizontally'
			);

			pass('Browser prepares an exact synthetic review on mobile');

			await tab('Workspace');
			await visible(protectedInputs);

			assert.equal(await page.locator('form[action="?/assess"]').count(), 0);

			await visible(discardReview);

			pass('Browser protects assessment inputs during exact review');

			await page.reload();
			await visible(exactReview);

			assert.equal(await reviewForm.locator('input[name="reviewId"]').inputValue(), firstReviewId);

			await tab('Workspace');
			await visible(protectedInputs);

			assert.equal(await page.locator('form[action="?/assess"]').count(), 0);

			pass('Browser refresh preserves exact review identity and input protection');

			await discardReview.click();

			await visible(
				page.getByRole('button', {
					name: 'Assess objective',
					exact: true
				})
			);

			assert.equal(await protectedInputs.count(), 0);
			assert.equal(await prepareReview.count(), 0);

			await tab('Operations');

			await visible(page.getByText('No active operation review', { exact: true }));

			pass('Browser discard transition cancels review before restoring editing');

			await tab('Workspace');

			await page
				.getByRole('button', {
					name: 'Prepare tournament',
					exact: true
				})
				.click();

			await page.locator('#workspace-scenario').selectOption('spring_invitational');
			await page.locator('#workspace-actor').selectOption('synthetic-actor-owner');

			await submitAssessment();

			await visible(prepareReview);
			await prepareReview.click();
			await visible(exactReview);

			const secondReviewId = await reviewForm.locator('input[name="reviewId"]').inputValue();

			assert.notEqual(secondReviewId, firstReviewId);

			pass('Browser new assessment creates a distinct exact review identity');

			await tab('Workspace');
			await visible(protectedInputs);

			await page.getByRole('button', { name: 'End synthetic session' }).click();

			await visible(page.getByRole('button', { name: 'Start synthetic session' }));

			await tab('Operations');

			await visible(page.getByText('No active operation review', { exact: true }));

			await page.reload();

			await tab('Workspace');

			await visible(page.getByRole('button', { name: 'Start synthetic session' }));

			pass('Browser session closure discards active review across refresh');

			// Establish a fresh session for the existing logout-revocation test.
			await page.getByRole('button', { name: 'Start synthetic session' }).click();

			await visible(page.getByText('Active at last server response', { exact: true }));

			const replacementCookies = await context.cookies(workspaceUrl);
			const replacementSelector = replacementCookies.find(
				(cookie) => cookie.name === workspaceCookie
			);

			assert.ok(replacementSelector);

			const logout = await context.request.post(`${base}/logout`, {
				headers: {
					origin: base,
					'content-type': 'application/x-www-form-urlencoded'
				},
				data: '',
				maxRedirects: 0
			});

			assert.equal(logout.status(), 303);

			// Restore the original disposable authentication and old selector
			// deliberately to verify server-side revocation, not just cookie deletion.
			await context.addCookies([auth, replacementSelector]);

			await page.goto(workspaceUrl);

			await visible(
				page.getByRole('button', {
					name: 'Start synthetic session'
				})
			);

			await tab('History');

			await visible(
				page.getByText('No active workspace session', {
					exact: true
				})
			);

			pass('Browser logout revokes workspace even when old selector is replayed');
		} catch (error) {
			try {
				await browserDiagnostics();
			} catch {
				console.error('Browser diagnostic snapshot unavailable.');
			}

			throw error;
		} finally {
			await context.close();
		}
	} finally {
		await browser.close();
	}
}
