import test from 'node:test';
import assert from 'node:assert/strict';

import {
	experimentRequestDigest,
	experimentAuthorizationFrom
} from '../tools/application/experiment-authorization.ts';

const body = '{"synthetic":true}';
const digest = experimentRequestDigest(body);
const args = ['--live', '--authorize-sha256', digest];

test('generates the expected SHA-256 format', () => {
	assert.match(digest, /^[a-f0-9]{64}$/);
	assert.equal(digest, experimentRequestDigest(body));
});

test('defaults to offline preview', () => {
	assert.deepEqual(experimentAuthorizationFrom([], body), { status: 'preview' });
});

test('requires explicit live authorization', () => {
	assert.equal(experimentAuthorizationFrom(['--live'], body).status, 'rejected');
});

test('accepts an exact matching request digest', () => {
	assert.deepEqual(experimentAuthorizationFrom(args, body), { status: 'authorized' });
});

test('rejects authorization for a changed request', () => {
	assert.deepEqual(experimentAuthorizationFrom(args, body + ' '), {
		status: 'rejected',
		reason: 'digest_mismatch'
	});
});

test('rejects an incorrect digest', () => {
	assert.equal(
		experimentAuthorizationFrom(['--live', '--authorize-sha256', '0'.repeat(64)], body).status,
		'rejected'
	);
});

test('rejects malformed digests', () => {
	for (const value of ['', 'abc', 'z'.repeat(64), digest.toUpperCase(), digest + ' ']) {
		assert.equal(
			experimentAuthorizationFrom(['--live', '--authorize-sha256', value], body).status,
			'rejected'
		);
	}
});

test('rejects extra or unsupported arguments', () => {
	for (const value of [
		[...args, '--retry'],
		[...args, '--live'],
		[...args, '--model', 'other'],
		['--authorize-sha256', digest],
		['--live', '--force', digest],
		['--live', '--authorize-sha256']
	]) {
		assert.equal(experimentAuthorizationFrom(value, body).status, 'rejected');
	}
});
