import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const { FLIHUB_E2E_APP_URL: app, FLIHUB_E2E_PB_URL: pb, FLIHUB_E2E_MAILPIT_URL: mailpit } = process.env;
if (!app || !pb || !mailpit) throw new Error('Run npm run test:e2e -- funding-condition.');

const email = `funding-owner-${Date.now()}@example.com`;
const password = 'funding-e2e-password-123';
const signedOn = '2026-01-01';
const deadline = '2099-12-31';

async function post(path, body, token) {
	const response = await fetch(pb + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: JSON.stringify(body)
	});
	const result = response.status === 204 ? null : await response.json();
	assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`);
	return result;
}

async function verificationToken() {
	for (let attempt = 0; attempt < 40; attempt++) {
		const { messages } = await fetch(mailpit + '/api/v1/messages?limit=50').then((res) => res.json());
		const message = messages?.find((row) => row.To.some((recipient) => recipient.Address === email));
		if (message) {
			const detail = await fetch(mailpit + '/api/v1/message/' + message.ID).then((res) => res.json());
			const match = `${detail.HTML ?? ''}\n${detail.Text ?? ''}`.match(/verify-email\/([A-Za-z0-9_.-]+)/);
			if (match) return match[1];
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error('No verification email for ' + email);
}

const users = '/api/collections/users/';
await post(users + 'records', { email, password, passwordConfirm: password, name: 'Funding Owner' });
await post(users + 'request-verification', { email });
await post(users + 'confirm-verification', { token: await verificationToken() });
const { token } = await post(users + 'auth-with-password', { identity: email, password });
const org = await post('/api/flihub/organizations', {
	name: 'Funding Condition Test', template: 'custom', capabilities: ['sponsorships']
}, token);

const create = (collection, fields) =>
	post(`/api/collections/${collection}/records`, { organization: org.id, ...fields }, token);
const sponsor = await create('sponsors', { name: 'Demo Sponsor', stage: 'signed' });
const agreement = await create('sponsorship_agreements', {
	sponsor: sponsor.id, title: 'Basket Partner', coverage: 'organization',
	amountCents: 12_500_000, currency: 'USD', signedOn
});
for (const entry of [
	{ kind: 'installment', amountCents: 12_500_000 },
	{ kind: 'payment', amountCents: 2_000_000, method: 'bank-transfer' }
]) {
	await create('sponsorship_funding_entries', { agreement: agreement.id, entryDate: signedOn, ...entry });
}

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	const path = `/organizations/${org.id}/cap/sponsorships`;
	await page.goto(app + '/login?next=' + encodeURIComponent(path));
	await page.locator('input[name="email"]').fill(email);
	await page.locator('input[name="password"]').fill(password);
	await page.locator('button[type="submit"]').click();
	await page.waitForURL(app + path);

	const basket = page.locator('#sponsorship-agreement-' + agreement.id);
	const condition = basket.getByRole('region', { name: 'Funding condition', exact: true });
	await condition.getByText('Set funding condition', { exact: true }).click();
	await condition.getByLabel('Sponsorship funding target').fill('250,000.00');
	await condition.getByLabel('Threshold (%)').fill('50');
	await condition.getByLabel('Currency').selectOption('USD');
	await condition.getByLabel('Funding deadline').fill(deadline);
	await condition.getByRole('checkbox', { name: /Demo Sponsor · Basket Partner/ }).check();
	await condition.getByText('Preview · Met', { exact: true }).waitFor();
	await condition.getByRole('button', { name: 'Save funding condition' }).click();
	await page.waitForURL(app + path + '#sponsorship-agreement-' + agreement.id);

	await page.reload();
	const saved = condition.getByRole('group', { name: 'Saved funding condition' });
	await saved.getByText('Funding condition · Met', { exact: true }).waitFor();
	await saved.getByText('$250,000.00 USD', { exact: true }).waitFor();
	await saved.getByText('Threshold (50%)', { exact: true }).waitFor();
	await saved.getByText(deadline, { exact: true }).waitFor();
	await saved.getByRole('link', { name: 'Demo Sponsor · Basket Partner' }).waitFor();
	const commitment = saved.locator('dl div').filter({ hasText: 'Qualifying commitments' });
	assert.equal(await commitment.locator('dd').textContent(), '$125,000.00 USD');

	for (const [label, amount] of [
		['Scheduled', '$125,000.00'],
		['Unscheduled', '$0.00'],
		['Received', '$20,000.00'],
		['Outstanding', '$105,000.00']
	]) {
		const row = basket.locator('dl div').filter({ has: page.getByText(label, { exact: true }) });
		assert.equal(await row.locator('dd').textContent(), amount);
	}
	console.log('✓ Saved Basket Partner condition is Met after refresh, with commitments and receipts shown separately.');
} finally {
	await browser.close();
}
