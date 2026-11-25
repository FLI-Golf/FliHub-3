import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();

const route = pathToFileURL(
	path.join(root, 'src/routes/(app)/development/intelligence/+page.server.ts')
).href;

const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$app/env') {
			return {
				url: `data:text/javascript,export const dev = ${context.parentURL.includes('production') ? 'false' : 'true'};`,
				shortCircuit: true
			};
		}

		if (specifier.startsWith('$lib/')) {
			return nextResolve(
				pathToFileURL(path.join(root, 'src/lib', specifier.slice(5) + '.ts')).href,
				context
			);
		}

		return nextResolve(specifier, context);
	}
});

const development = await import(route + '?development');
const production = await import(route + '?production');

hooks.deregister();

const user = { id: 'synthetic-authenticated-user' };

const validInput = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

function event({
	actor = user,
	verified = true,
	origin = 'http://localhost',
	fields = validInput,
	enhanced = true,
	rawRequest
} = {}) {
	const headers = new Map();

	const request =
		rawRequest ??
		new Request('http://localhost/development/intelligence?/assess', {
			method: 'POST',
			headers: {
				...(enhanced ? { 'x-sveltekit-action': 'true' } : {}),
				...(origin === null ? {} : { origin })
			},
			body: new URLSearchParams(fields)
		});

	return {
		locals: { user: actor, sessionVerified: verified },
		url: new URL(request.url),
		request,
		headers,
		setHeaders(values) {
			for (const [key, value] of Object.entries(values)) {
				assert.equal(headers.has(key), false, 'Duplicate response header');
				headers.set(key, value);
			}
		}
	};
}

test('authenticated development load exposes only registered options', () => {
	const context = event();
	const data = development.load(context);

	assert.equal(data.objectives.length, 2);
	assert.equal(data.scenarios.length, 6);
	assert.equal(data.capabilities.length, 5);

	assert.deepEqual(data.limits, {
		requestsPerMinute: 10,
		concurrency: 1,
		historyLimit: 50
	});
});

test('unauthenticated development load is rejected', () => {
	assert.throws(() => development.load(event({ actor: null })), { status: 401 });
});

test('production load is rejected even with an authenticated actor', () => {
	assert.throws(() => production.load(event()), { status: 404 });
});

test('production assessment is rejected', async () => {
	await assert.rejects(production.actions.assess(event()), { status: 404 });
});

test('unauthenticated assessment is rejected', async () => {
	await assert.rejects(development.actions.assess(event({ actor: null })), { status: 401 });
});

test('unknown objective is rejected', async () => {
	const result = await development.actions.assess(
		event({
			fields: { ...validInput, objectiveId: 'execute_operation' }
		})
	);

	assert.equal(result.status, 400);
});

test('unknown scenario is rejected', async () => {
	const result = await development.actions.assess(
		event({
			fields: { ...validInput, fixtureId: 'real_organization' }
		})
	);

	assert.equal(result.status, 400);
});

test('unexpected fields are rejected', async () => {
	const result = await development.actions.assess(
		event({
			fields: { ...validInput, operation: 'activate_event' }
		})
	);

	assert.equal(result.status, 400);
});

test('duplicate fields are rejected', async () => {
	const result = await development.actions.assess(
		event({
			fields: [...Object.entries(validInput), ['fixtureId', 'venue_missing']]
		})
	);

	assert.equal(result.status, 400);
});

test('missing fields are rejected', async () => {
	const result = await development.actions.assess(
		event({ fields: { objectiveId: validInput.objectiveId } })
	);

	assert.equal(result.status, 400);
});

test('malformed multipart form is rejected safely', async () => {
	const request = new Request('http://localhost/development/intelligence?/assess', {
		method: 'POST',
		headers: {
			'content-type': 'multipart/form-data',
			origin: 'http://localhost',
			'x-sveltekit-action': 'true'
		},
		body: 'invalid multipart content'
	});

	const result = await development.actions.assess(event({ rawRequest: request }));

	assert.equal(result.status, 400);
});

test('enhanced assessment returns mock advice', async () => {
	const context = event();
	const response = await development.actions.assess(context);

	assert.equal(response.result.status, 'advised');
	assert.equal(response.result.source, 'mock');
	assert.equal(response.result.plan.execution, 'not-implemented');
	assert.equal(response.result.plan.facts.participantCount, 24);
});

test('ordinary assessment and load both succeed', async () => {
	const context = event({ enhanced: false });
	const response = await development.actions.assess(context);

	assert.equal(response.result.status, 'advised');

	development.load(context);
});

test('missing information produces clarification rather than execution', async () => {
	const response = await development.actions.assess(
		event({
			fields: { ...validInput, fixtureId: 'information_missing' }
		})
	);

	assert.equal(response.result.status, 'advised');
	assert.equal(response.result.plan.facts.participantCount, null);
	assert.equal(response.result.plan.readiness, null);
	assert.equal(response.result.plan.execution, 'not-implemented');
});

test('playground does not import persistent application services', async () => {
	const source = await readFile(new URL(route), 'utf8');

	assert.doesNotMatch(source, /locals\.pb\b/);
	assert.doesNotMatch(source, /process\.env\b/);
	assert.match(source, /FLIHUB_INTELLIGENCE_PROVIDER:\s*'mock'/);
	assert.match(source, /External provider access is disabled/);
});

test('unverified retained session cannot load playground', () => {
	assert.throws(() => development.load(event({ verified: false })), { status: 401 });
});

test('unverified retained session cannot request assessment', async () => {
	await assert.rejects(development.actions.assess(event({ verified: false })), { status: 401 });
});

test('cross-origin assessment is rejected', async () => {
	await assert.rejects(development.actions.assess(event({ origin: 'https://untrusted.example' })), {
		status: 403
	});
});

test('assessment without origin is rejected', async () => {
	await assert.rejects(development.actions.assess(event({ origin: null })), { status: 403 });
});

test('opaque origin is rejected', async () => {
	await assert.rejects(development.actions.assess(event({ origin: 'null' })), { status: 403 });
});

test('different port is rejected as a different origin', async () => {
	await assert.rejects(development.actions.assess(event({ origin: 'http://localhost:9999' })), {
		status: 403
	});
});

test('different protocol is rejected as a different origin', async () => {
	await assert.rejects(development.actions.assess(event({ origin: 'https://localhost' })), {
		status: 403
	});
});

test('ordinary cross-origin form submission is rejected', async () => {
	await assert.rejects(
		development.actions.assess(
			event({
				enhanced: false,
				origin: 'https://untrusted.example'
			})
		),
		{ status: 403 }
	);
});
