import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { ClientResponseError } from 'pocketbase';

const playground = '/(app)/development/intelligence';
const ordinaryRoute = '/(app)/organizations';

const fixtureModule = `
export const AUTH_COOKIE_NAME = 'pb_auth';
let client = null;
export function setClient(value) {
	client = value;
}
export function createPocketBaseClient() {
	return client;
}
`;

const fixtureUrl = 'data:text/javascript,' + encodeURIComponent(fixtureModule);

const fixture = await import(fixtureUrl);

const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$app/env') {
			return {
				url: 'data:text/javascript,export const dev = true;',
				shortCircuit: true
			};
		}

		if (specifier === '$lib/server/pocketbase') {
			return {
				url: fixtureUrl,
				shortCircuit: true
			};
		}

		return nextResolve(specifier, context);
	}
});

const { handle } = await import(pathToFileURL(path.resolve('src/hooks.server.ts')).href);

hooks.deregister();

const user = { id: 'synthetic-user' };

function mockPocketBase({ valid = true, refreshError = null } = {}) {
	const calls = {
		refresh: 0,
		clear: 0,
		load: 0,
		export: 0
	};

	const authStore = {
		isValid: valid,
		record: valid ? user : null,

		loadFromCookie() {
			calls.load++;
		},

		clear() {
			calls.clear++;
			this.isValid = false;
			this.record = null;
		},

		exportToCookie(options, name) {
			calls.export++;
			assert.equal(name, 'pb_auth');
			assert.equal(options.httpOnly, true);
			assert.equal(options.sameSite, 'Strict');
			assert.equal(options.path, '/');
			return 'pb_auth=synthetic; HttpOnly; SameSite=Strict; Path=/';
		}
	};

	return {
		calls,
		authStore,

		collection(name) {
			assert.equal(name, 'users');

			return {
				async authRefresh() {
					calls.refresh++;

					if (refreshError) {
						throw refreshError;
					}

					return { record: user };
				}
			};
		}
	};
}

async function request({
	client = null,
	route = playground,
	status = 200,
	method = 'GET',
	cache = 'public, max-age=60'
} = {}) {
	fixture.setClient(client);

	const event = {
		locals: {
			sessionVerified: true
		},
		route: { id: route },
		request: new Request('http://localhost/development/intelligence', { method })
	};

	let resolved = false;

	const response = await handle({
		event,
		resolve: async (current) => {
			assert.equal(current, event);
			resolved = true;

			return new Response('synthetic response', {
				status,
				headers: {
					'cache-control': cache
				}
			});
		}
	});

	assert.equal(resolved, true);

	return {
		locals: event.locals,
		response
	};
}

test('successful refresh verifies the current session', async () => {
	const client = mockPocketBase();
	const { locals } = await request({ client });

	assert.equal(locals.sessionVerified, true);
	assert.equal(locals.user, user);
	assert.equal(client.calls.refresh, 1);
	assert.equal(client.calls.clear, 0);
});

test('missing PocketBase configuration cannot verify a session', async () => {
	const { locals } = await request();

	assert.equal(locals.sessionVerified, false);
	assert.equal(locals.user, null);
	assert.equal(locals.pb, null);
});

test('signed-out or expired session cannot verify', async () => {
	const client = mockPocketBase({ valid: false });
	const { locals } = await request({ client });

	assert.equal(locals.sessionVerified, false);
	assert.equal(locals.user, null);
	assert.equal(client.calls.refresh, 0);
});

for (const status of [400, 401, 403]) {
	test(`PocketBase rejection ${status} clears the session`, async () => {
		const client = mockPocketBase({
			refreshError: new ClientResponseError({ status })
		});

		const { locals } = await request({ client });

		assert.equal(locals.sessionVerified, false);
		assert.equal(locals.user, null);
		assert.equal(client.calls.clear, 1);
	});
}

for (const status of [0, 429, 500, 503]) {
	test(`PocketBase failure ${status} never verifies retained session`, async () => {
		const client = mockPocketBase({
			refreshError: new ClientResponseError({ status })
		});

		const { locals } = await request({ client });

		assert.equal(locals.sessionVerified, false);
		assert.equal(locals.user, user);
		assert.equal(client.calls.clear, 0);
	});
}

test('unexpected refresh failure never verifies retained session', async () => {
	const client = mockPocketBase({
		refreshError: new Error('Synthetic network failure')
	});

	const { locals } = await request({ client });

	assert.equal(locals.sessionVerified, false);
	assert.equal(client.calls.clear, 0);
});

for (const status of [200, 303, 400, 401, 403, 404, 500]) {
	test(`playground response ${status} is non-cacheable`, async () => {
		const { response } = await request({ status });

		assert.equal(response.status, status);
		assert.equal(response.headers.get('cache-control'), 'no-store');
	});
}

test('playground POST response is non-cacheable', async () => {
	const { response } = await request({
		client: mockPocketBase(),
		method: 'POST'
	});

	assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('ordinary application cache behavior is preserved', async () => {
	const { response } = await request({
		route: ordinaryRoute
	});

	assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
});

test('unmatched route cache behavior is preserved', async () => {
	const { response } = await request({
		route: null,
		status: 404
	});

	assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
});

test('existing session cookie behavior is preserved', async () => {
	const client = mockPocketBase();
	const { response } = await request({ client });

	assert.equal(client.calls.load, 1);
	assert.equal(client.calls.export, 1);
	assert.match(response.headers.get('set-cookie'), /pb_auth=synthetic/);
});

test('verification does not leak between consecutive requests', async () => {
	const first = await request({
		client: mockPocketBase()
	});

	const second = await request({
		client: mockPocketBase({ valid: false })
	});

	const third = await request();

	assert.equal(first.locals.sessionVerified, true);
	assert.equal(second.locals.sessionVerified, false);
	assert.equal(third.locals.sessionVerified, false);
	assert.notEqual(first.locals, second.locals);
});
