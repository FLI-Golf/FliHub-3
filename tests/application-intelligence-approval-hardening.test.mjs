import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/lib/server/intelligence/application/operations/canonical.ts';

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

	return result.plan;
}

function hostileProxy(target, callback) {
	return new Proxy(target, {
		getPrototypeOf(object) {
			callback();
			return Reflect.getPrototypeOf(object);
		},
		ownKeys(object) {
			callback();
			return Reflect.ownKeys(object);
		},
		getOwnPropertyDescriptor(object, key) {
			callback();
			return Reflect.getOwnPropertyDescriptor(object, key);
		},
		get(object, key, receiver) {
			callback();
			return Reflect.get(object, key, receiver);
		}
	});
}

test('canonical serialization rejects proxy without invoking traps', () => {
	let calls = 0;

	const proxy = hostileProxy({ value: 1 }, () => calls++);

	assert.throws(() => canonicalJson(proxy));
	assert.equal(calls, 0);
});

test('canonical serialization rejects nested proxy values', () => {
	let calls = 0;

	const proxy = hostileProxy({ value: 1 }, () => calls++);

	assert.throws(() => canonicalJson({ nested: proxy }));

	assert.equal(calls, 0);
});

test('canonical serialization rejects revoked proxy', () => {
	const { proxy, revoke } = Proxy.revocable({}, {});

	revoke();

	assert.throws(() => canonicalJson(proxy));
});

test('proxy request cannot reenter preparation', () => {
	const session = createSession();

	let calls = 0;

	const proxy = hostileProxy(request(), () => {
		calls++;
		session.cancel();
	});

	assert.equal(session.prepare(proxy).status, 'rejected');

	assert.equal(calls, 0);
	assert.equal(session.getStatus(), 'open');
	assert.equal(session.getApproval(), null);
});

test('proxy confirmation cannot reenter approval', () => {
	const session = createSession();
	const plan = prepare(session);

	const confirmation = {
		action: 'approve-exact-plan',
		planDigest: plan.digest
	};

	let calls = 0;

	const proxy = hostileProxy(confirmation, () => {
		calls++;
		session.cancel();
	});

	assert.equal(session.approve(proxy).status, 'rejected');

	assert.equal(calls, 0);
	assert.equal(session.getStatus(), 'review');
	assert.equal(session.getApproval(), null);

	assert.equal(session.approve(confirmation).status, 'approved');
});

test('proxy receipt cannot reenter consumption', () => {
	const session = createSession();
	const plan = prepare(session);

	const approved = session.approve({
		action: 'approve-exact-plan',
		planDigest: plan.digest
	});

	assert.equal(approved.status, 'approved');

	const receipt = approved.receipt;

	let calls = 0;

	const proxy = hostileProxy({ ...receipt }, () => {
		calls++;
		session.consumeApproval(receipt);
	});

	assert.equal(session.consumeApproval(proxy).status, 'rejected');

	assert.equal(calls, 0);
	assert.equal(session.getStatus(), 'approved');

	assert.equal(session.consumeApproval(receipt).status, 'consumed');

	assert.deepEqual(session.consumeApproval(receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});

	assert.equal(session.getState().groups.length, 0);
});
