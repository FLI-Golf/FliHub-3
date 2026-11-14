import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { creationPlan } from '../src/lib/setup/creation.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalog = JSON.parse(read('../src/lib/capabilities/catalog.json'));
const rulesModule = { exports: {} };
vm.runInNewContext(read('../pocketbase/pb_hooks/guided_organization_rules.js'), {
	module: rulesModule
});
const { guidedOrganizationPlan } = rulesModule.exports;
const supported = {
	activity: 'disc-golf',
	format: 'league',
	competitors: 'team',
	result: 'strokes'
};
const plain = (value) => JSON.parse(JSON.stringify(value));

function backend(body, verified = true) {
	let handler;
	let transactions = 0;
	const saved = [];
	class Record {
		constructor(collection) {
			this.collection = collection;
			this.values = {};
			this.id = 'org123456789012';
		}
		set(key, value) {
			this.values[key] = value;
		}
		getString(key) {
			return String(this.values[key] ?? '');
		}
	}
	const app = {
		findCollectionByNameOrId: (name) => name,
		save: (record) => saved.push(record),
		runInTransaction(callback) {
			transactions++;
			callback(app);
		}
	};
	vm.runInNewContext(read('../pocketbase/pb_hooks/flihub.pb.js'), {
		routerAdd: (method, path, callback) => {
			if (method === 'POST' && path === '/api/flihub/organizations') handler = callback;
		},
		$apis: { requireAuth: () => 'auth-middleware' },
		__hooks: '/hooks',
		Record,
		require: (path) => (path.endsWith('catalog.json') ? catalog : rulesModule.exports)
	});
	const response = handler({
		auth: { id: 'bob', getBool: (key) => key === 'verified' && verified },
		app,
		requestInfo: () => ({ body }),
		json: (status, data) => ({ status, data })
	});
	return { response, saved, transactions };
}

test('browser and PocketBase agree on the exact supported mapping', () => {
	const actual = guidedOrganizationPlan({ version: 1, ...supported }, catalog);
	assert.deepEqual(plain(actual), { ...creationPlan(supported), raceDistances: [] });
	for (const id of actual.capabilities) {
		const capability = catalog.capabilities.find((item) => item.id === id);
		assert.equal(capability.availability, 'available');
		assert.ok(capability.dependsOn.every((dependency) => actual.capabilities.includes(dependency)));
	}
	assert.ok(!actual.capabilities.includes('fantasy'));
});

test('guided creation writes only organization, Owner membership and provenance audit', () => {
	const { response, saved, transactions } = backend({
		name: 'New Disc Golf Org',
		guidedSetup: { version: 1, ...supported }
	});
	assert.equal(response.status, 200);
	assert.equal(transactions, 1);
	assert.deepEqual(
		saved.map((record) => record.collection),
		['organizations', 'memberships', 'membership_events']
	);
	assert.equal(saved[0].values.template, 'league');
	assert.equal(saved[0].values.onboarded, true);
	assert.deepEqual(JSON.parse(saved[0].values.capabilities), creationPlan(supported).capabilities);
	assert.equal(saved[1].values.role, 'owner');
	assert.equal(saved[1].values.user, 'bob');
	assert.deepEqual(JSON.parse(saved[2].values.details).guidedSetup, { version: 1, ...supported });
});

for (const [field, values] of Object.entries({
	activity: ['running', 'golf', 'pageant', 'dog-show', 'forged'],
	format: ['single', 'tournament', 'series', 'show'],
	competitors: ['individual', 'pair', 'animal', 'vehicle'],
	result: ['time', 'points', 'judging', 'matches']
})) {
	for (const value of values)
		test(`direct PocketBase rejects unsupported ${field}=${value} before writes`, () => {
			const selection = { ...supported, [field]: value };
			assert.equal(creationPlan(selection), null);
			const { response, saved, transactions } = backend({
				name: 'Forged',
				guidedSetup: { version: 1, ...selection }
			});
			assert.equal(response.status, 400);
			assert.equal(saved.length, 0);
			assert.equal(transactions, 0);
		});
}
for (const setup of [
	null,
	[],
	{},
	{ ...supported },
	{ version: 2, ...supported },
	{ version: 1, ...supported, extra: true }
]) {
	test(`rejects malformed guided setup ${JSON.stringify(setup)}`, () => {
		const { response, saved } = backend({ name: 'New org', guidedSetup: setup });
		assert.equal(response.status, 400);
		assert.equal(saved.length, 0);
	});
}
test('guided creation cannot override template, capabilities or race configuration', () => {
	for (const extra of [
		{ template: 'race-event' },
		{ capabilities: ['fantasy'] },
		{ raceDistances: [] }
	]) {
		const { response, saved } = backend({
			name: 'New org',
			guidedSetup: { version: 1, ...supported },
			...extra
		});
		assert.equal(response.status, 400);
		assert.equal(saved.length, 0);
	}
});
test('guided creation requires verified email', () => {
	const { response, saved } = backend(
		{ name: 'New org', guidedSetup: { version: 1, ...supported } },
		false
	);
	assert.equal(response.status, 403);
	assert.equal(saved.length, 0);
});
test('legacy API creation remains compatible without claiming a guided profile', () => {
	const { response, saved } = backend({ name: 'Legacy org' });
	assert.equal(response.status, 200);
	assert.equal(saved[0].values.onboarded, false);
	assert.equal(JSON.parse(saved[2].values.details).guidedSetup, undefined);
});

function action() {
	const sandbox = {
		fail: (status, data) => ({ status, data }),
		creationPlan,
		pbErrorMessage: () => 'Creation failed.',
		pbErrorStatus: () => 400,
		setActiveOrgCookie: (cookies, id) => cookies.push(id),
		redirect: (status, location) => {
			throw { status, location };
		}
	};
	let code = stripTypeScriptTypes(read('../src/routes/(app)/organizations/new/+page.server.ts'));
	code = code
		.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
		.replace('export const actions', 'const actions');
	vm.runInNewContext(code + '\nglobalThis.actions = actions;', sandbox);
	return sandbox.actions.default;
}
function request(selection = supported) {
	const form = new FormData();
	form.set('name', '  Wizard Org  ');
	for (const [key, value] of Object.entries(selection)) form.set(key, value);
	return { formData: async () => form };
}
test('action refuses forged unsupported selections without calling PocketBase', async () => {
	let calls = 0;
	const result = await action()({
		locals: {
			user: { verified: true },
			pb: {
				send: () => {
					calls++;
				}
			}
		},
		request: request({ ...supported, result: 'time' }),
		cookies: []
	});
	assert.equal(result.status, 400);
	assert.equal(calls, 0);
});
test('action preserves input on backend failure and never sets active organization', async () => {
	const cookies = [];
	const result = await action()({
		locals: {
			user: { verified: true },
			pb: {
				send: async () => {
					throw new Error('failure');
				}
			}
		},
		request: request(),
		cookies
	});
	assert.equal(result.status, 400);
	assert.equal(result.data.name, 'Wizard Org');
	assert.deepEqual(plain(result.data.selection), supported);
	assert.deepEqual(cookies, []);
});
test('successful action sends only guided answers, sets active organization, and redirects', async () => {
	const calls = [],
		cookies = [];
	await assert.rejects(
		async () =>
			action()({
				locals: {
					user: { verified: true },
					pb: {
						send: async (path, options) => {
							calls.push({ path, options });
							return { id: 'neworg' };
						}
					}
				},
				request: request(),
				cookies
			}),
		(err) => err.status === 303 && err.location === '/organizations/neworg'
	);
	assert.deepEqual(plain(calls[0].options.body), {
		name: 'Wizard Org',
		guidedSetup: { version: 1, ...supported }
	});
	assert.deepEqual(cookies, ['neworg']);
});
