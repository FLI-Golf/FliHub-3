import assert from 'node:assert/strict';
import test from 'node:test';

import { syntheticActorIds } from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { createSyntheticApprovalSession } from '../src/lib/server/intelligence/application/operations/approval.ts';

const request = () => ({
	operationId: 'create_synthetic_group_assignments',
	fixtureId: 'spring_invitational'
});

function createSession() {
	const result = createSyntheticApprovalSession('spring_invitational', syntheticActorIds.owner);

	assert.equal(result.status, 'created');

	return result.session;
}

function prepare(session) {
	const result = session.prepare(request());

	assert.equal(result.status, 'prepared');

	const review = session.getReview();

	assert.ok(review);
	assert.equal(review.sessionId, session.sessionId);
	assert.equal(review.planDigest, result.plan.digest);

	return {
		action: 'approve-exact-plan',
		...review
	};
}

test('exact confirmation binds approval to current review', () => {
	const session = createSession();

	assert.equal(session.getReview(), null);

	const confirmation = prepare(session);
	const result = session.approve(confirmation);

	assert.equal(result.status, 'approved');

	assert.equal(result.receipt.reviewId, confirmation.reviewId);

	assert.equal(result.receipt.sessionId, confirmation.sessionId);

	assert.equal(result.receipt.planDigest, confirmation.planDigest);

	assert.equal(session.executeApprovedOperation(result.receipt).status, 'candidate_prepared');

	assert.equal(session.getReview(), null);
	assert.equal(session.getApproval(), null);
	assert.equal(session.getState().groups.length, 0);
});

test('legacy digest-only confirmation is rejected', () => {
	const session = createSession();
	const confirmation = prepare(session);

	assert.deepEqual(
		session.approve({
			action: 'approve-exact-plan',
			planDigest: confirmation.planDigest
		}),
		{
			status: 'rejected',
			reason: 'invalid_confirmation'
		}
	);

	assert.equal(session.getStatus(), 'review');
	assert.equal(session.getApproval(), null);
});

test('identical plans cannot reuse another session confirmation', () => {
	const first = createSession();
	const second = createSession();

	const a = prepare(first);
	const b = prepare(second);

	assert.equal(a.planDigest, b.planDigest);
	assert.notEqual(a.sessionId, b.sessionId);
	assert.notEqual(a.reviewId, b.reviewId);

	assert.deepEqual(second.approve(a), {
		status: 'rejected',
		reason: 'invalid_confirmation'
	});

	assert.equal(second.getApproval(), null);
	assert.equal(second.approve(b).status, 'approved');
	assert.equal(first.getStatus(), 'review');
});

test('preparing identical plan creates fresh review identity', () => {
	const session = createSession();

	const first = prepare(session);
	const second = prepare(session);

	assert.equal(first.planDigest, second.planDigest);
	assert.equal(first.sessionId, second.sessionId);
	assert.notEqual(first.reviewId, second.reviewId);

	assert.deepEqual(session.approve(first), {
		status: 'rejected',
		reason: 'invalid_confirmation'
	});

	assert.equal(session.approve(second).status, 'approved');
});

for (const field of ['action', 'sessionId', 'reviewId', 'planDigest']) {
	test(`rejects incorrect ${field}`, () => {
		const session = createSession();
		const confirmation = prepare(session);

		const invalid = {
			...confirmation,
			[field]: field === 'planDigest' ? '0'.repeat(64) : 'incorrect'
		};

		assert.deepEqual(session.approve(invalid), {
			status: 'rejected',
			reason: 'invalid_confirmation'
		});

		assert.equal(session.getApproval(), null);

		assert.equal(session.approve(confirmation).status, 'approved');
	});

	test(`rejects missing ${field}`, () => {
		const session = createSession();
		const confirmation = prepare(session);

		delete confirmation[field];

		assert.equal(session.approve(confirmation).status, 'rejected');
	});
}

test('rejects accessor review identifier without invoking it', () => {
	const session = createSession();
	const confirmation = prepare(session);

	let calls = 0;

	Object.defineProperty(confirmation, 'reviewId', {
		enumerable: true,
		get() {
			calls++;
			return session.getReview().reviewId;
		}
	});

	assert.equal(session.approve(confirmation).status, 'rejected');

	assert.equal(calls, 0);
	assert.equal(session.getApproval(), null);
});

test('review identity is immutable and independently copied', () => {
	const session = createSession();

	prepare(session);

	const first = session.getReview();
	const second = session.getReview();

	assert.equal(Object.isFrozen(first), true);
	assert.deepEqual(first, second);
	assert.notEqual(first, second);

	assert.throws(() => {
		first.reviewId = 'modified';
	}, TypeError);
});

test('failed preparation invalidates review identity', () => {
	const session = createSession();
	const confirmation = prepare(session);

	assert.equal(
		session.prepare({
			...request(),
			operationId: 'execute_sql'
		}).status,
		'rejected'
	);

	assert.equal(session.getReview(), null);
	assert.equal(session.getStatus(), 'open');

	assert.deepEqual(session.approve(confirmation), {
		status: 'rejected',
		reason: 'plan_required'
	});
});

test('proxy preparation invalidates previous review without invoking traps', () => {
	const session = createSession();
	const confirmation = prepare(session);

	let calls = 0;

	const proxy = new Proxy(request(), {
		ownKeys(target) {
			calls++;
			return Reflect.ownKeys(target);
		}
	});

	assert.deepEqual(session.prepare(proxy), {
		status: 'rejected',
		reason: 'invalid_request'
	});

	assert.equal(calls, 0);
	assert.equal(session.getReview(), null);
	assert.equal(session.getStatus(), 'open');

	assert.deepEqual(session.approve(confirmation), {
		status: 'rejected',
		reason: 'plan_required'
	});
});

test('cancellation clears review identity', () => {
	const session = createSession();
	const confirmation = prepare(session);

	session.cancel();

	assert.equal(session.getReview(), null);

	assert.deepEqual(session.approve(confirmation), {
		status: 'rejected',
		reason: 'session_closed'
	});
});

test('modified receipt review identifier cannot authorize execution', () => {
	const session = createSession();
	const confirmation = prepare(session);
	const approved = session.approve(confirmation);

	assert.equal(approved.status, 'approved');

	const modified = {
		...approved.receipt,
		reviewId: '00000000-0000-0000-0000-000000000000'
	};

	assert.deepEqual(session.executeApprovedOperation(modified), {
		status: 'rejected',
		reason: 'invalid_approval'
	});

	assert.equal(session.getStatus(), 'approved');

	assert.equal(session.executeApprovedOperation(approved.receipt).status, 'candidate_prepared');
});

test('standalone consumption clears review identity', () => {
	const session = createSession();
	const confirmation = prepare(session);
	const approved = session.approve(confirmation);

	assert.equal(approved.status, 'approved');

	assert.equal(session.consumeApproval(approved.receipt).status, 'consumed');

	assert.equal(session.getReview(), null);

	assert.deepEqual(session.executeApprovedOperation(approved.receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});
});
