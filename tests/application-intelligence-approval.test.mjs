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

function confirmation(plan) {
	return {
		action: 'approve-exact-plan',
		planDigest: plan.digest
	};
}

for (const role of ['owner', 'admin']) {
	test(`registered ${role} can approve exact reviewed plan`, () => {
		const session = createSession(syntheticActorIds[role]);

		const before = session.getState();

		assert.equal(session.getStatus(), 'open');
		assert.equal(session.getApproval(), null);

		const plan = prepare(session);

		assert.equal(session.getStatus(), 'review');
		assert.equal(session.getApproval(), null);

		const result = session.approve(confirmation(plan));

		assert.equal(result.status, 'approved');
		assert.equal(session.getStatus(), 'approved');

		const receipt = result.receipt;

		assert.equal(receipt.actorId, syntheticActorIds[role]);

		assert.equal(receipt.sessionId, session.sessionId);

		assert.equal(receipt.planDigest, plan.digest);

		assert.equal(receipt.stateDigest, plan.body.stateDigest);

		assert.equal(receipt.stateRevision, 0);

		assert.equal(receipt.organizationId, plan.body.proposal.organizationId);

		assert.equal(receipt.eventId, plan.body.proposal.eventId);

		assert.equal(receipt.operationId, 'create_synthetic_group_assignments');

		assert.equal(receipt.scope, 'synthetic-only');

		assert.deepEqual(session.getState(), before);
		assert.equal(session.getState().groups.length, 0);
	});
}

for (const actor of [
	syntheticActorIds.viewer,
	syntheticActorIds.scorekeeper,
	syntheticActorIds.outsider,
	syntheticActorIds.inactive,
	'unknown-actor',
	null,
	{ role: 'owner' }
]) {
	test(`restricted actor cannot open approval session: ${String(actor)}`, () => {
		assert.deepEqual(createSyntheticApprovalSession('spring_invitational', actor), {
			status: 'rejected',
			reason: 'unauthorized_actor'
		});
	});
}

test('rejects unsupported fixture', () => {
	assert.deepEqual(createSyntheticApprovalSession('production', syntheticActorIds.owner), {
		status: 'rejected',
		reason: 'unsupported_fixture'
	});
});

test('cannot approve before preparing a plan', () => {
	const session = createSession();

	assert.deepEqual(
		session.approve({
			action: 'approve-exact-plan',
			planDigest: '0'.repeat(64)
		}),
		{
			status: 'rejected',
			reason: 'plan_required'
		}
	);
});

test('rejects incorrect plan digest', () => {
	const session = createSession();

	prepare(session);

	assert.deepEqual(
		session.approve({
			action: 'approve-exact-plan',
			planDigest: '0'.repeat(64)
		}),
		{
			status: 'rejected',
			reason: 'invalid_confirmation'
		}
	);

	assert.equal(session.getApproval(), null);
	assert.equal(session.getStatus(), 'review');
});

test('requires explicit confirmation action', () => {
	const session = createSession();
	const plan = prepare(session);

	for (const input of [
		true,
		plan.digest,
		{ approved: true },
		{ planDigest: plan.digest },
		{
			action: 'review',
			planDigest: plan.digest
		},
		{
			...confirmation(plan),
			approved: true
		},
		{
			...confirmation(plan),
			actorId: syntheticActorIds.owner
		},
		{
			...confirmation(plan),
			operationId: 'execute_sql'
		}
	]) {
		assert.deepEqual(session.approve(input), {
			status: 'rejected',
			reason: 'invalid_confirmation'
		});
	}

	assert.equal(session.getApproval(), null);
});

test('rejects accessor confirmation without invoking getter', () => {
	const session = createSession();
	const plan = prepare(session);

	let invoked = false;

	const input = {
		action: 'approve-exact-plan',
		get planDigest() {
			invoked = true;
			return plan.digest;
		}
	};

	assert.equal(session.approve(input).status, 'rejected');

	assert.equal(invoked, false);
	assert.equal(session.getApproval(), null);
});

test('rejects hidden and symbolic confirmation properties', () => {
	const session = createSession();
	const plan = prepare(session);

	const hidden = confirmation(plan);

	Object.defineProperty(hidden, 'extra', {
		value: true,
		enumerable: false
	});

	const symbolic = {
		...confirmation(plan),
		[Symbol('extra')]: true
	};

	assert.equal(session.approve(hidden).status, 'rejected');

	assert.equal(session.approve(symbolic).status, 'rejected');
});

test('session state cannot be modified externally', () => {
	const session = createSession();
	const before = session.getState();

	const copy = session.getState();

	copy.revision = 99;
	copy.actors[0].role = 'viewer';
	copy.teams[0].name = 'Modified team';
	copy.rosters.length = 0;

	assert.deepEqual(session.getState(), before);

	const plan = prepare(session);

	assert.equal(session.approve(confirmation(plan)).status, 'approved');
});

test('session retains an immutable reviewed plan', () => {
	const session = createSession();
	const plan = prepare(session);

	assert.throws(() => {
		plan.body.proposal.groups.length = 0;
	}, TypeError);

	assert.equal(session.approve(confirmation(plan)).status, 'approved');
});

test('approval receipts cannot modify private authority', () => {
	const session = createSession();
	const plan = prepare(session);

	const result = session.approve(confirmation(plan));

	assert.equal(result.status, 'approved');

	const receipt = result.receipt;

	assert.equal(Object.isFrozen(receipt), true);

	assert.throws(() => {
		receipt.planDigest = '0'.repeat(64);
	}, TypeError);

	const copy = structuredClone(receipt);
	copy.actorId = 'invented-actor';

	assert.deepEqual(session.getApproval(), receipt);

	assert.notEqual(session.getApproval(), receipt);
});

test('identical plans do not share session approval authority', () => {
	const first = createSession();
	const second = createSession();

	const firstPlan = prepare(first);
	const secondPlan = prepare(second);

	assert.equal(firstPlan.digest, secondPlan.digest);

	assert.notEqual(first.sessionId, second.sessionId);

	const result = first.approve(confirmation(firstPlan));

	assert.equal(result.status, 'approved');

	assert.equal(second.getApproval(), null);
	assert.equal(second.getStatus(), 'review');

	assert.equal(second.approve(result.receipt).status, 'rejected');

	assert.equal(second.getApproval(), null);
});

test('rejects repeated approval in the same session', () => {
	const session = createSession();
	const plan = prepare(session);

	assert.equal(session.approve(confirmation(plan)).status, 'approved');

	const before = session.getApproval();

	assert.deepEqual(session.approve(confirmation(plan)), {
		status: 'rejected',
		reason: 'already_approved'
	});

	assert.deepEqual(session.getApproval(), before);
});

test('approved session cannot replace its reviewed plan', () => {
	const session = createSession();
	const plan = prepare(session);

	session.approve(confirmation(plan));

	assert.equal(session.prepare(request()).status, 'rejected');

	assert.equal(session.getApproval().planDigest, plan.digest);
});

test('failed preparation invalidates previous review', () => {
	const session = createSession();
	const plan = prepare(session);

	assert.equal(
		session.prepare({
			operationId: 'execute_sql',
			fixtureId: 'spring_invitational'
		}).status,
		'rejected'
	);

	assert.equal(session.getStatus(), 'open');

	assert.deepEqual(session.approve(confirmation(plan)), {
		status: 'rejected',
		reason: 'plan_required'
	});
});

test('cancellation invalidates a pending review', () => {
	const session = createSession();
	const plan = prepare(session);

	session.cancel();

	assert.equal(session.getStatus(), 'cancelled');
	assert.equal(session.getApproval(), null);

	assert.deepEqual(session.approve(confirmation(plan)), {
		status: 'rejected',
		reason: 'session_closed'
	});

	assert.equal(session.prepare(request()).status, 'rejected');
});

test('cancellation invalidates an existing approval', () => {
	const session = createSession();
	const plan = prepare(session);

	session.approve(confirmation(plan));

	assert.notEqual(session.getApproval(), null);

	session.cancel();
	session.cancel();

	assert.equal(session.getStatus(), 'cancelled');
	assert.equal(session.getApproval(), null);
	assert.equal(session.getState().groups.length, 0);
});

test('session exposes no operation execution method', () => {
	const session = createSession();

	assert.equal(Object.isFrozen(session), true);

	assert.equal(Object.hasOwn(session, 'execute'), false);

	assert.equal(Object.hasOwn(session, 'setState'), false);

	assert.equal(Object.hasOwn(session, 'setApproval'), false);
});
