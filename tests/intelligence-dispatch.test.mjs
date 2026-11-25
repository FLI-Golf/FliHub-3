import test from 'node:test';
import assert from 'node:assert/strict';

import { createDispatchResources } from '../src/lib/server/intelligence/dispatch.ts';
import { MODEL, RESERVED_TOKENS } from '../src/lib/server/intelligence/providers.ts';

function resources(overrides = {}) {
	return createDispatchResources({
		timeoutMs: 1000,
		requestsPerMinute: 60,
		concurrency: 2,
		budget: RESERVED_TOKENS,
		reservation: RESERVED_TOKENS,
		...overrides
	});
}

function response(inputTokens = 100) {
	return {
		model: MODEL,
		usage: { inputTokens, outputTokens: 0 }
	};
}

function dispatch(controller, result = response()) {
	return controller.dispatch(performance.now(), async () => result);
}

test('duplicate reconciliation cannot reclaim a reservation twice', async () => {
	const controller = resources();
	const first = await dispatch(controller);

	assert.equal(first.status, 'settled');

	first.reconcile(100);
	first.reconcile(100);

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'budget'
	});
});

test('reconciliation rejects incorrect reported usage', async () => {
	const controller = resources({
		budget: RESERVED_TOKENS + 99
	});

	const first = await dispatch(controller);

	assert.equal(first.status, 'settled');

	first.reconcile(99);

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'budget'
	});
});

test('valid reconciliation releases unused reservation', async () => {
	const controller = resources({
		budget: RESERVED_TOKENS + 100
	});

	const first = await dispatch(controller);

	assert.equal(first.status, 'settled');

	first.reconcile(100);

	assert.equal((await dispatch(controller)).status, 'settled');
});

test('invalid token counts cannot release a reservation', async () => {
	const controller = resources();
	const first = await dispatch(controller);

	assert.equal(first.status, 'settled');

	for (const value of [0, -1, NaN, Infinity, 0.5, RESERVED_TOKENS + 1]) {
		first.reconcile(value);
	}

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'budget'
	});
});

test('unrecognized model cannot release a reservation', async () => {
	const controller = resources();

	const first = await dispatch(controller, {
		...response(),
		model: 'unknown-model'
	});

	assert.equal(first.status, 'settled');

	first.reconcile(100);

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'budget'
	});
});

test('missing usage cannot release a reservation', async () => {
	const controller = resources();

	const first = await dispatch(controller, {
		model: MODEL
	});

	assert.equal(first.status, 'settled');

	first.reconcile(100);

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'budget'
	});
});

test('over-reservation usage permanently closes dispatch', async () => {
	const controller = resources({
		budget: RESERVED_TOKENS * 3
	});

	const first = await dispatch(controller, response(RESERVED_TOKENS + 1));

	assert.equal(first.status, 'settled');

	first.reconcile(100);

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'budget'
	});
});

test('shared rate limit prevents a second dispatch', async () => {
	const controller = resources({
		reservation: 0,
		budget: 0,
		requestsPerMinute: 1
	});

	assert.equal((await dispatch(controller)).status, 'settled');

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'rate'
	});
});

test('result mutation cannot increase budget reclamation', async () => {
	const controller = resources({
		budget: RESERVED_TOKENS + 99
	});

	const first = await dispatch(controller);

	assert.equal(first.status, 'settled');

	first.result.usage.inputTokens = 99;
	first.reconcile(99);

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'budget'
	});
});

test('original reported usage remains valid after result mutation', async () => {
	const controller = resources({
		budget: RESERVED_TOKENS + 100
	});

	const first = await dispatch(controller);

	assert.equal(first.status, 'settled');

	first.result.usage.inputTokens = 999;
	first.reconcile(100);

	assert.equal((await dispatch(controller)).status, 'settled');
});

test('result mutation cannot introduce missing usage', async () => {
	const controller = resources({
		budget: RESERVED_TOKENS + 100
	});

	const first = await dispatch(controller, {
		model: MODEL
	});

	assert.equal(first.status, 'settled');

	first.result.usage = {
		inputTokens: 100,
		outputTokens: 0
	};

	first.reconcile(100);

	assert.deepEqual(await dispatch(controller), {
		status: 'unavailable',
		reason: 'budget'
	});
});
