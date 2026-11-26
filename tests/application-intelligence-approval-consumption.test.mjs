import assert from 'node:assert/strict';
import test from 'node:test';

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
	test(`consumes exact approval for ${role}`, () => {
		const session = createSession(syntheticActorIds[role]);

		const before = session.getState();

		const { plan, receipt } = approve(session);

		assert.deepEqual(session.consumeApproval(receipt), {
			status: 'consumed',
			planDigest: plan.digest,
			execution: 'not-implemented'
		});

		assert.equal(session.getStatus(), 'consumed');

		assert.equal(session.getApproval(), null);
		assert.deepEqual(session.getState(), before);
		assert.equal(session.getState().groups.length, 0);
		assert.equal(session.getState().revision, 0);
	});
}

test('cannot consume before approval', () => {
	const session = createSession();

	assert.deepEqual(session.consumeApproval({}), {
		status: 'rejected',
		reason: 'approval_required'
	});

	prepare(session);

	assert.deepEqual(session.consumeApproval({}), {
		status: 'rejected',
		reason: 'approval_required'
	});
});

test('rejects repeated consumption', () => {
	const session = createSession();
	const { receipt } = approve(session);

	assert.equal(session.consumeApproval(receipt).status, 'consumed');

	for (let index = 0; index < 5; index++) {
		assert.deepEqual(session.consumeApproval(receipt), {
			status: 'rejected',
			reason: 'replay_detected'
		});
	}
});

test('consumed session cannot prepare or approve again', () => {
	const session = createSession();
	const { plan, receipt } = approve(session);

	session.consumeApproval(receipt);

	assert.equal(session.prepare(request()).status, 'rejected');

	assert.equal(
		session.approve({
			action: 'approve-exact-plan',
			planDigest: plan.digest
		}).status,
		'rejected'
	);

	assert.equal(session.getStatus(), 'consumed');
});

test('cancellation cannot reset consumed session', () => {
	const session = createSession();
	const { receipt } = approve(session);

	session.consumeApproval(receipt);
	session.cancel();

	assert.equal(session.getStatus(), 'consumed');

	assert.deepEqual(session.consumeApproval(receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});
});

test('cancelled approval cannot be consumed', () => {
	const session = createSession();
	const { receipt } = approve(session);

	session.cancel();

	assert.deepEqual(session.consumeApproval(receipt), {
		status: 'rejected',
		reason: 'session_closed'
	});

	assert.equal(session.getApproval(), null);
});

test('rejects approval from another session', () => {
	const first = createSession();
	const second = createSession();

	const a = approve(first);
	const b = approve(second);

	assert.equal(a.plan.digest, b.plan.digest);

	assert.deepEqual(second.consumeApproval(a.receipt), {
		status: 'rejected',
		reason: 'invalid_approval'
	});

	assert.equal(second.getStatus(), 'approved');

	assert.equal(second.consumeApproval(b.receipt).status, 'consumed');

	assert.equal(first.getStatus(), 'approved');
});

test('rejects approval belonging to another actor', () => {
	const owner = createSession(syntheticActorIds.owner);

	const admin = createSession(syntheticActorIds.admin);

	const a = approve(owner);
	const b = approve(admin);

	assert.equal(admin.consumeApproval(a.receipt).status, 'rejected');

	assert.equal(admin.consumeApproval(b.receipt).status, 'consumed');
});

const modifications = [
	['approvalId', 'invented-approval'],
	['sessionId', 'invented-session'],
	['planDigest', '0'.repeat(64)],
	['stateDigest', '0'.repeat(64)],
	['stateRevision', 99],
	['actorId', syntheticActorIds.admin],
	['organizationId', 'synthetic-org-outside'],
	['eventId', 'synthetic-event-other'],
	['operationId', 'execute_sql'],
	['scope', 'production'],
	['kind', 'invented-receipt']
];

for (const [field, value] of modifications) {
	test(`rejects modified approval field: ${field}`, () => {
		const session = createSession();
		const { receipt } = approve(session);

		const modified = {
			...receipt,
			[field]: value
		};

		assert.deepEqual(session.consumeApproval(modified), {
			status: 'rejected',
			reason: 'invalid_approval'
		});

		assert.equal(session.getStatus(), 'approved');

		assert.deepEqual(session.getApproval(), receipt);

		assert.equal(session.consumeApproval(receipt).status, 'consumed');
	});
}

test('rejects forged approval and unexpected properties', () => {
	const session = createSession();
	const { receipt } = approve(session);

	for (const input of [
		null,
		undefined,
		true,
		{},
		receipt.planDigest,
		{ approved: true },
		{ ...receipt, approved: true },
		{ ...receipt, execute: true }
	]) {
		assert.equal(session.consumeApproval(input).status, 'rejected');
	}

	assert.equal(session.getStatus(), 'approved');
});

test('rejects accessor receipt without invoking getter', () => {
	const session = createSession();
	const { receipt } = approve(session);

	let invoked = false;

	const input = {
		...receipt,
		get planDigest() {
			invoked = true;
			return receipt.planDigest;
		}
	};

	assert.equal(session.consumeApproval(input).status, 'rejected');

	assert.equal(invoked, false);
	assert.equal(session.getStatus(), 'approved');
});

test('rejects hidden and symbolic receipt properties', () => {
	const session = createSession();
	const { receipt } = approve(session);

	const hidden = { ...receipt };

	Object.defineProperty(hidden, 'extra', {
		value: true,
		enumerable: false
	});

	const symbolic = {
		...receipt,
		[Symbol('extra')]: true
	};

	assert.equal(session.consumeApproval(hidden).status, 'rejected');

	assert.equal(session.consumeApproval(symbolic).status, 'rejected');
});

test('same-session competing consumption succeeds only once', async () => {
	const session = createSession();
	const { receipt } = approve(session);

	const results = await Promise.all(
		Array.from({ length: 10 }, () => Promise.resolve().then(() => session.consumeApproval(receipt)))
	);

	assert.equal(results.filter((result) => result.status === 'consumed').length, 1);

	assert.equal(
		results.filter((result) => result.status === 'rejected' && result.reason === 'replay_detected')
			.length,
		9
	);

	assert.equal(session.getStatus(), 'consumed');

	assert.equal(session.getState().groups.length, 0);
});

test('consumption never enables application execution', () => {
	const session = createSession();
	const before = session.getState();

	const { receipt } = approve(session);

	const result = session.consumeApproval(receipt);

	assert.equal(result.status, 'consumed');
	assert.equal(result.execution, 'not-implemented');

	assert.equal(Object.hasOwn(session, 'execute'), false);

	assert.deepEqual(session.getState(), before);
});
