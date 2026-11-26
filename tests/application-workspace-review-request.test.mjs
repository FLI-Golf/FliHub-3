import assert from 'node:assert/strict';
import test from 'node:test';

import { parseWorkspaceReviewRequest } from '../src/lib/server/intelligence/workspace/review-request.ts';

const origin = 'https://workspace.example.test';

function request(body, options = {}) {
	return new Request(`${origin}/operations`, {
		method: 'POST',
		headers: {
			origin,
			'content-type': 'application/x-www-form-urlencoded',
			...options.headers
		},
		body,
		...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'headers'))
	});
}

test('prepare accepts exactly one valid generation', async () => {
	const generation = 'a'.repeat(64);
	const result = await parseWorkspaceReviewRequest(
		request(`generation=${generation}`),
		origin,
		'prepare'
	);

	assert.deepEqual(result, {
		status: 'valid',
		input: { action: 'prepare', generation }
	});
});

test('cancel accepts exactly one bounded review identity', async () => {
	const result = await parseWorkspaceReviewRequest(
		request('reviewId=review-123'),
		origin,
		'cancel'
	);

	assert.deepEqual(result, {
		status: 'valid',
		input: { action: 'cancel', reviewId: 'review-123' }
	});
});

for (const body of [
	'',
	'sequence=',
	'sequence=0',
	'generation=',
	'generation=1',
	`generation=${'a'.repeat(63)}`,
	`generation=${'a'.repeat(65)}`,
	`generation=${'A'.repeat(64)}`,
	`generation=${'g'.repeat(64)}`,
	`generation=${'a'.repeat(64)}&generation=${'b'.repeat(64)}`,
	`generation=${'a'.repeat(64)}&sequence=1`,
	`generation=${'a'.repeat(64)}&approval=true`,
	`generation=${'a'.repeat(64)}&operationId=create_synthetic_group_assignments`,
	'sequence=-1',
	'sequence=01',
	'sequence=1.5',
	'sequence=1e2',
	'sequence=9007199254740992',
	'sequence=1&sequence=2',
	'sequence=1&actorId=synthetic-actor-owner',
	'sequence=1&fixtureId=spring_invitational',
	'sequence=1&operationId=create_synthetic_group_assignments',
	'sequence=1&plan=anything',
	'sequence=1&approval=true',
	'sequence=1&',
	'sequence=%ZZ',
	'reviewId=review-123'
]) {
	test(`prepare rejects invalid input: ${body}`, async () => {
		assert.deepEqual(await parseWorkspaceReviewRequest(request(body), origin, 'prepare'), {
			status: 'invalid',
			code: 400
		});
	});
}

for (const body of [
	'reviewId=',
	'reviewId=%20',
	'reviewId=../review',
	'reviewId=one&reviewId=two',
	'reviewId=one&planDigest=anything',
	'reviewId=one&approval=true',
	'reviewId=%ZZ',
	`reviewId=${'a'.repeat(129)}`,
	'sequence=1'
]) {
	test(`cancel rejects invalid input: ${body}`, async () => {
		assert.deepEqual(await parseWorkspaceReviewRequest(request(body), origin, 'cancel'), {
			status: 'invalid',
			code: 400
		});
	});
}

test('cross-origin requests are rejected', async () => {
	assert.deepEqual(
		await parseWorkspaceReviewRequest(
			request('sequence=1', {
				headers: { origin: 'https://outside.example.test' }
			}),
			origin,
			'prepare'
		),
		{ status: 'invalid', code: 403 }
	);
});

test('unsupported content type is rejected', async () => {
	assert.deepEqual(
		await parseWorkspaceReviewRequest(
			request('sequence=1', {
				headers: { 'content-type': 'application/json' }
			}),
			origin,
			'prepare'
		),
		{ status: 'invalid', code: 415 }
	);
});

test('non-POST requests are rejected', async () => {
	assert.deepEqual(
		await parseWorkspaceReviewRequest(new Request(`${origin}/operations`), origin, 'prepare'),
		{ status: 'invalid', code: 405 }
	);
});

test('oversized bodies are rejected', async () => {
	assert.deepEqual(
		await parseWorkspaceReviewRequest(request(`sequence=${'1'.repeat(8192)}`), origin, 'prepare'),
		{ status: 'invalid', code: 413 }
	);
});

test('inconsistent declared body length is rejected', async () => {
	assert.deepEqual(
		await parseWorkspaceReviewRequest(
			request('sequence=1', {
				headers: { 'content-length': '100' }
			}),
			origin,
			'prepare'
		),
		{ status: 'invalid', code: 400 }
	);
});

test('stalled body reading is bounded', async () => {
	const body = new ReadableStream({
		pull() {}
	});

	const input = request(body, { duplex: 'half' });

	assert.deepEqual(await parseWorkspaceReviewRequest(input, origin, 'prepare', 20), {
		status: 'invalid',
		code: 408
	});
});
