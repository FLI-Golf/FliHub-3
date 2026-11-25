import test from 'node:test';
import assert from 'node:assert/strict';

import {
	providerUsageFrom,
	estimatedUsageCostNanodollars
} from '../src/lib/server/intelligence/usage-accounting.ts';

import {
	MODEL,
	RESERVED_TOKENS,
	NANODOLLARS_PER_TOKEN
} from '../src/lib/server/intelligence/providers.ts';

function response(inputTokens = 500, outputTokens = 50) {
	return {
		model: MODEL,
		usage: { inputTokens, outputTokens }
	};
}

test('extracts usage for the pinned provider model', () => {
	assert.deepEqual(providerUsageFrom(response(), RESERVED_TOKENS), {
		model: MODEL,
		usage: {
			inputTokens: 500,
			outputTokens: 50
		}
	});
});

test('does not account for mock dispatch without reservation', () => {
	assert.deepEqual(providerUsageFrom(response(), 0), {});
});

test('rejects an unrecognized provider model', () => {
	assert.deepEqual(
		providerUsageFrom({ ...response(), model: 'unknown-model' }, RESERVED_TOKENS),
		{}
	);
});

test('handles missing provider results', () => {
	assert.deepEqual(providerUsageFrom(undefined, RESERVED_TOKENS), {});
});

test('preserves model identity when usage is missing', () => {
	assert.deepEqual(providerUsageFrom({ model: MODEL }, RESERVED_TOKENS), {
		model: MODEL,
		usage: undefined
	});
});

test('rejects malformed provider usage', () => {
	for (const inputTokens of [-1, NaN, Infinity, 0.5, '500', Number.MAX_SAFE_INTEGER + 1]) {
		const result = providerUsageFrom(response(inputTokens), RESERVED_TOKENS);

		assert.equal(result.usage, undefined);
	}
});

test('preserves reported usage above the reservation', () => {
	const result = providerUsageFrom(response(RESERVED_TOKENS + 1), RESERVED_TOKENS);

	assert.equal(result.usage.inputTokens, RESERVED_TOKENS + 1);
});

test('estimates cost from input tokens', () => {
	assert.equal(estimatedUsageCostNanodollars(response().usage), 500 * NANODOLLARS_PER_TOKEN);
});

test('output tokens do not increase the current cost estimate', () => {
	assert.equal(
		estimatedUsageCostNanodollars(response(500, 10000).usage),
		estimatedUsageCostNanodollars(response(500, 0).usage)
	);
});

test('estimates cost at the reservation boundary', () => {
	assert.equal(
		estimatedUsageCostNanodollars(response(RESERVED_TOKENS).usage),
		RESERVED_TOKENS * NANODOLLARS_PER_TOKEN
	);
});

test('does not estimate cost above the reservation', () => {
	assert.equal(estimatedUsageCostNanodollars(response(RESERVED_TOKENS + 1).usage), undefined);
});

test('does not estimate cost for missing or invalid usage', () => {
	for (const usage of [
		undefined,
		null,
		{},
		{ inputTokens: -1, outputTokens: 0 },
		{ inputTokens: 500, outputTokens: -1 },
		{ inputTokens: Infinity, outputTokens: 0 }
	]) {
		assert.equal(estimatedUsageCostNanodollars(usage), undefined);
	}
});
