import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalSha256 } from '../src/lib/server/intelligence/application/operations/canonical.ts';

import { syntheticActorIds } from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { createSyntheticApprovalSession } from '../src/lib/server/intelligence/application/operations/approval.ts';

const request = () => ({
	operationId: 'create_synthetic_group_assignments',
	fixtureId: 'spring_invitational'
});

function createSession(actor = syntheticActorIds.owner) {
	const result = createSyntheticApprovalSession('spring_invitational', actor);

	assert.equal(result.status, 'created');

	return result.session;
}

function prepare(session) {
	const result = session.prepare(request());

	assert.equal(result.status, 'prepared');

	return result.plan;
}

function approve(session) {
	const plan = prepare(session);

	const result = session.approve({
		...session.getReview(),
		action: 'approve-exact-plan',
		planDigest: plan.digest
	});

	assert.equal(result.status, 'approved');

	return {
		plan,
		receipt: result.receipt
	};
}

for (const role of ['owner', 'admin']) {
	test(`approved ${role} can construct candidate`, () => {
		const session = createSession(syntheticActorIds[role]);

		const before = session.getState();

		const { plan, receipt } = approve(session);

		const result = session.executeApprovedOperation(receipt);

		assert.equal(result.status, 'candidate_prepared');

		assert.equal(result.operationId, 'create_synthetic_group_assignments');

		assert.equal(result.planDigest, plan.digest);

		assert.equal(result.originalStateDigest, canonicalSha256(before));

		assert.equal(result.publication, 'not-permitted');

		assert.equal(result.verification, 'pending');

		assert.equal(result.candidate.groups.length, 6);

		assert.equal(result.candidate.revision, 1);

		assert.deepEqual(result.candidate.groups, plan.body.proposal.groups);

		assert.equal(session.getStatus(), 'consumed');

		assert.equal(session.getApproval(), null);
		assert.deepEqual(session.getState(), before);
	});
}

test('rejects execution before plan preparation', () => {
	const session = createSession();

	assert.deepEqual(session.executeApprovedOperation({}), {
		status: 'rejected',
		reason: 'approval_required'
	});
});

test('rejects execution after review without approval', () => {
	const session = createSession();
	const plan = prepare(session);

	assert.deepEqual(session.executeApprovedOperation(plan), {
		status: 'rejected',
		reason: 'approval_required'
	});

	assert.equal(session.getStatus(), 'review');
	assert.equal(session.getState().groups.length, 0);
});

test('rejects repeated execution', () => {
	const session = createSession();
	const { receipt } = approve(session);

	assert.equal(session.executeApprovedOperation(receipt).status, 'candidate_prepared');

	assert.deepEqual(session.executeApprovedOperation(receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});
});

test('standalone consumption cannot authorize later execution', () => {
	const session = createSession();
	const { receipt } = approve(session);

	assert.equal(session.consumeApproval(receipt).status, 'consumed');

	assert.deepEqual(session.executeApprovedOperation(receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});

	assert.equal(session.getState().groups.length, 0);
});

test('execution prevents subsequent standalone consumption', () => {
	const session = createSession();
	const { receipt } = approve(session);

	session.executeApprovedOperation(receipt);

	assert.deepEqual(session.consumeApproval(receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});
});

test('rejects cancelled approval', () => {
	const session = createSession();
	const { receipt } = approve(session);

	session.cancel();

	assert.deepEqual(session.executeApprovedOperation(receipt), {
		status: 'rejected',
		reason: 'session_closed'
	});
});

test('rejects approval from another session', () => {
	const first = createSession();
	const second = createSession();

	const a = approve(first);
	const b = approve(second);

	assert.equal(a.plan.digest, b.plan.digest);

	assert.deepEqual(second.executeApprovedOperation(a.receipt), {
		status: 'rejected',
		reason: 'invalid_approval'
	});

	assert.equal(second.getStatus(), 'approved');

	assert.equal(second.executeApprovedOperation(b.receipt).status, 'candidate_prepared');

	assert.equal(first.getStatus(), 'approved');
});

test('rejects forged authority and arbitrary parameters', () => {
	const session = createSession();
	const { receipt } = approve(session);

	for (const input of [
		true,
		{ approved: true },
		receipt.planDigest,
		{ ...receipt, operationId: 'execute_sql' },
		{ ...receipt, scope: 'production' },
		{ ...receipt, state: {} },
		{ ...receipt, handler: 'arbitrary-handler' },
		{ ...receipt, parameters: {} }
	]) {
		assert.equal(session.executeApprovedOperation(input).status, 'rejected');
	}

	assert.equal(session.getStatus(), 'approved');

	assert.equal(session.executeApprovedOperation(receipt).status, 'candidate_prepared');
});

test('proxy receipt cannot reenter execution', () => {
	const session = createSession();
	const { receipt } = approve(session);

	let calls = 0;

	const proxy = new Proxy(receipt, {
		ownKeys(target) {
			calls++;

			session.executeApprovedOperation(receipt);

			return Reflect.ownKeys(target);
		}
	});

	assert.equal(session.executeApprovedOperation(proxy).status, 'rejected');

	assert.equal(calls, 0);
	assert.equal(session.getStatus(), 'approved');

	assert.equal(session.executeApprovedOperation(receipt).status, 'candidate_prepared');
});

test('candidate cannot mutate protected session state', () => {
	const session = createSession();
	const before = session.getState();

	const { plan, receipt } = approve(session);
	const planBefore = structuredClone(plan);

	const result = session.executeApprovedOperation(receipt);

	assert.equal(result.status, 'candidate_prepared');

	result.candidate.teams[0].name = 'Changed candidate team';

	result.candidate.groups.length = 0;
	result.candidate.revision = 99;

	assert.deepEqual(session.getState(), before);
	assert.deepEqual(plan, planBefore);
});

test('competing execution calls construct only one candidate', async () => {
	const session = createSession();
	const { receipt } = approve(session);

	const results = await Promise.all(
		Array.from({ length: 10 }, () =>
			Promise.resolve().then(() => session.executeApprovedOperation(receipt))
		)
	);

	assert.equal(results.filter((result) => result.status === 'candidate_prepared').length, 1);

	assert.equal(
		results.filter((result) => result.status === 'rejected' && result.reason === 'replay_detected')
			.length,
		9
	);

	assert.equal(session.getStatus(), 'consumed');
	assert.equal(session.getState().groups.length, 0);
});

test('session exposes no candidate publication method', () => {
	const session = createSession();

	assert.equal(Object.isFrozen(session), true);

	for (const method of ['publish', 'commit', 'setState', 'setApproval', 'setHandler']) {
		assert.equal(Object.hasOwn(session, method), false);
	}
});
