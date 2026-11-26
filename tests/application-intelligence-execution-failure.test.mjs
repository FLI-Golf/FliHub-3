import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalSha256 } from '../src/lib/server/intelligence/application/operations/canonical.ts';

import { syntheticActorIds } from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { createSyntheticApprovalSession } from '../src/lib/server/intelligence/application/operations/approval.ts';

function createSession(actor = syntheticActorIds.owner) {
	const result = createSyntheticApprovalSession('spring_invitational', actor);

	assert.equal(result.status, 'created');

	return result.session;
}

function approve(session) {
	const prepared = session.prepare({
		operationId: 'create_synthetic_group_assignments',
		fixtureId: 'spring_invitational'
	});

	assert.equal(prepared.status, 'prepared');

	const approved = session.approve({
		...session.getReview(),
		action: 'approve-exact-plan',
		planDigest: prepared.plan.digest
	});

	assert.equal(approved.status, 'approved');

	return {
		plan: prepared.plan,
		receipt: approved.receipt
	};
}

for (const failurePoint of [1, 2]) {
	test(`isolates candidate cloning failure ${failurePoint}`, (t) => {
		const session = createSession();

		const before = session.getState();
		const beforeDigest = canonicalSha256(before);

		const { plan, receipt } = approve(session);

		const originalClone = globalThis.structuredClone;

		let calls = 0;

		const mock = t.mock.method(globalThis, 'structuredClone', (value, options) => {
			calls++;

			if (calls === failurePoint) {
				throw new Error('Synthetic test-only candidate failure');
			}

			return originalClone(value, options);
		});

		let result;

		try {
			result = session.executeApprovedOperation(receipt);
		} finally {
			mock.mock.restore();
		}

		assert.equal(calls, failurePoint);

		assert.deepEqual(result, {
			status: 'rejected',
			reason: 'execution_failed'
		});

		assert.equal(session.getStatus(), 'consumed');

		assert.equal(session.getApproval(), null);

		assert.deepEqual(session.getState(), before);

		assert.equal(canonicalSha256(session.getState()), beforeDigest);

		assert.equal(session.getState().groups.length, 0);

		assert.equal(session.getState().revision, 0);

		assert.deepEqual(session.executeApprovedOperation(receipt), {
			status: 'rejected',
			reason: 'replay_detected'
		});

		assert.deepEqual(session.consumeApproval(receipt), {
			status: 'rejected',
			reason: 'replay_detected'
		});

		assert.equal(
			session.approve({
				...session.getReview(),
				action: 'approve-exact-plan',
				planDigest: plan.digest
			}).status,
			'rejected'
		);

		session.cancel();

		assert.equal(session.getStatus(), 'consumed');
	});
}

test('failed execution does not affect independent sessions', (t) => {
	const first = createSession();
	const second = createSession();

	const firstBefore = first.getState();
	const secondBefore = second.getState();

	const a = approve(first);
	const b = approve(second);

	const mock = t.mock.method(globalThis, 'structuredClone', () => {
		throw new Error('Synthetic test-only handler failure');
	});

	let failed;

	try {
		failed = first.executeApprovedOperation(a.receipt);
	} finally {
		mock.mock.restore();
	}

	assert.deepEqual(failed, {
		status: 'rejected',
		reason: 'execution_failed'
	});

	assert.equal(first.getStatus(), 'consumed');
	assert.equal(second.getStatus(), 'approved');

	assert.deepEqual(first.getState(), firstBefore);

	assert.deepEqual(second.getState(), secondBefore);

	const successful = second.executeApprovedOperation(b.receipt);

	assert.equal(successful.status, 'candidate_prepared');

	assert.equal(successful.candidate.groups.length, 6);

	assert.equal(successful.candidate.revision, 1);

	assert.deepEqual(second.getState(), secondBefore);
});

test('failed execution exposes no partial candidate or internal error', (t) => {
	const session = createSession();
	const { receipt } = approve(session);

	const mock = t.mock.method(globalThis, 'structuredClone', () => {
		throw new Error('INTERNAL_TEST_ERROR_NOT_FOR_OUTPUT');
	});

	let result;

	try {
		result = session.executeApprovedOperation(receipt);
	} finally {
		mock.mock.restore();
	}

	assert.deepEqual(result, {
		status: 'rejected',
		reason: 'execution_failed'
	});

	assert.equal(Object.hasOwn(result, 'candidate'), false);

	assert.equal(Object.hasOwn(result, 'error'), false);

	assert.equal(JSON.stringify(result).includes('INTERNAL_TEST_ERROR_NOT_FOR_OUTPUT'), false);
});

test('successful candidate remains unpublished and disposable', () => {
	const session = createSession();

	const before = session.getState();

	const { receipt } = approve(session);

	const result = session.executeApprovedOperation(receipt);

	assert.equal(result.status, 'candidate_prepared');

	assert.equal(result.publication, 'not-permitted');

	assert.equal(result.verification, 'pending');

	result.candidate.groups[0].name = 'Externally modified candidate';

	result.candidate.teams.length = 0;
	result.candidate.revision = 100;

	assert.deepEqual(session.getState(), before);

	for (const method of ['publish', 'commit', 'setState', 'setHandler', 'setApproval']) {
		assert.equal(Object.hasOwn(session, method), false);
	}
});
