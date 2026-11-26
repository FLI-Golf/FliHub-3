import assert from 'node:assert/strict';
import test from 'node:test';

import { SYNTHETIC_AUDIT_LIMIT } from '../src/lib/server/intelligence/application/operations/audit.ts';

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
		action: 'approve-exact-plan',
		...session.getReview()
	});

	assert.equal(approved.status, 'approved');

	return approved.receipt;
}

test('new session has empty audit history', () => {
	const session = createSession();

	assert.deepEqual(session.getAuditHistory(), []);
	assert.equal(session.getState().revision, 0);
});

for (const role of ['owner', 'admin']) {
	test(`records verified ${role} publication`, () => {
		const session = createSession(syntheticActorIds[role]);

		const receipt = approve(session);

		const result = session.executeAndPublishApprovedOperation(receipt);

		assert.equal(result.status, 'published');

		const history = session.getAuditHistory();

		assert.equal(history.length, 1);

		assert.deepEqual(history[0], {
			sequence: 1,
			scope: 'synthetic-only',
			operationId: 'create_synthetic_group_assignments',
			sessionId: session.sessionId,
			reviewId: receipt.reviewId,
			planDigest: receipt.planDigest,
			actorId: syntheticActorIds[role],
			outcome: 'published',
			failureReason: null,
			verification: 'passed',
			revisionBefore: 0,
			revisionAfter: 1,
			stateChanged: true,
			groupsCreated: 6,
			teamsAssigned: 12,
			athletesAssigned: 24
		});

		assert.equal(session.getState().revision, 1);
		assert.equal(session.getState().groups.length, 6);
	});
}

test('missing approval is audited without mutation', () => {
	const session = createSession();
	const before = session.getState();

	const result = session.executeAndPublishApprovedOperation(null);

	assert.equal(result.reason, 'approval_required');

	const [record] = session.getAuditHistory();

	assert.equal(record.outcome, 'rejected');
	assert.equal(record.failureReason, 'approval_required');
	assert.equal(record.verification, 'not-performed');
	assert.equal(record.reviewId, null);
	assert.equal(record.planDigest, null);
	assert.equal(record.stateChanged, false);
	assert.equal(record.revisionBefore, 0);
	assert.equal(record.revisionAfter, 0);
	assert.equal(record.groupsCreated, 0);

	assert.deepEqual(session.getState(), before);
});

test('forged receipt cannot inject audit content', () => {
	const session = createSession();
	const receipt = approve(session);

	const result = session.executeAndPublishApprovedOperation({
		...receipt,
		actorId: 'UNTRUSTED_ACTOR',
		sessionId: 'UNTRUSTED_SESSION',
		reviewId: 'UNTRUSTED_REVIEW',
		planDigest: 'UNTRUSTED_DIGEST',
		arbitrary: 'UNTRUSTED_CONTENT'
	});

	assert.equal(result.reason, 'invalid_approval');

	const [record] = session.getAuditHistory();

	assert.equal(record.actorId, syntheticActorIds.owner);
	assert.equal(record.sessionId, session.sessionId);
	assert.equal(record.reviewId, receipt.reviewId);
	assert.equal(record.planDigest, receipt.planDigest);

	assert.equal(JSON.stringify(record).includes('UNTRUSTED'), false);

	assert.equal(session.getState().revision, 0);
	assert.equal(session.getStatus(), 'approved');

	assert.equal(session.executeAndPublishApprovedOperation(receipt).status, 'published');

	assert.equal(session.getAuditHistory().length, 2);
});

test('proxy receipt cannot inject audit content', () => {
	const session = createSession();
	const receipt = approve(session);

	let calls = 0;

	const proxy = new Proxy(receipt, {
		ownKeys(target) {
			calls++;
			return Reflect.ownKeys(target);
		}
	});

	assert.equal(session.executeAndPublishApprovedOperation(proxy).reason, 'invalid_approval');

	assert.equal(calls, 0);

	const [record] = session.getAuditHistory();

	assert.equal(record.reviewId, receipt.reviewId);
	assert.equal(record.stateChanged, false);
});

test('replay rejection preserves published state', () => {
	const session = createSession();
	const receipt = approve(session);

	assert.equal(session.executeAndPublishApprovedOperation(receipt).status, 'published');

	const published = session.getState();

	assert.equal(session.executeAndPublishApprovedOperation(receipt).reason, 'replay_detected');

	const history = session.getAuditHistory();

	assert.equal(history.length, 2);
	assert.equal(history[1].sequence, 2);
	assert.equal(history[1].outcome, 'rejected');
	assert.equal(history[1].failureReason, 'replay_detected');
	assert.equal(history[1].revisionBefore, 1);
	assert.equal(history[1].revisionAfter, 1);
	assert.equal(history[1].stateChanged, false);
	assert.equal(history[1].verification, 'not-performed');

	assert.deepEqual(session.getState(), published);
});

test('handler failure produces sanitized failure audit', (t) => {
	const session = createSession();
	const before = session.getState();
	const receipt = approve(session);

	const mock = t.mock.method(globalThis, 'structuredClone', () => {
		throw new Error('PRIVATE_TEST_ERROR');
	});

	let result;

	try {
		result = session.executeAndPublishApprovedOperation(receipt);
	} finally {
		mock.mock.restore();
	}

	assert.equal(result.reason, 'execution_failed');

	const [record] = session.getAuditHistory();

	assert.equal(record.failureReason, 'execution_failed');
	assert.equal(record.verification, 'not-performed');
	assert.equal(record.stateChanged, false);
	assert.equal(record.revisionAfter, 0);

	assert.equal(JSON.stringify(record).includes('PRIVATE_TEST_ERROR'), false);

	assert.deepEqual(session.getState(), before);
	assert.equal(session.getStatus(), 'consumed');
});

test('verification failure is audited without publication', (t) => {
	const session = createSession();
	const before = session.getState();
	const receipt = approve(session);

	const originalClone = globalThis.structuredClone;

	let injected = false;

	const mock = t.mock.method(globalThis, 'structuredClone', (value, options) => {
		const copy = originalClone(value, options);

		if (Array.isArray(copy) && copy.length === 6 && copy[0]?.entries) {
			copy[0].entries[0].athleteIds[0] = 'PRIVATE_CORRUPTED_ATHLETE';

			injected = true;
		}

		return copy;
	});

	let result;

	try {
		result = session.executeAndPublishApprovedOperation(receipt);
	} finally {
		mock.mock.restore();
	}

	assert.equal(injected, true);
	assert.equal(result.reason, 'verification_failed');

	const [record] = session.getAuditHistory();

	assert.equal(record.verification, 'failed');
	assert.equal(record.failureReason, 'verification_failed');
	assert.equal(record.stateChanged, false);
	assert.equal(record.groupsCreated, 0);

	assert.equal(JSON.stringify(record).includes('PRIVATE_CORRUPTED_ATHLETE'), false);

	assert.deepEqual(session.getState(), before);
});

test('audit construction failure prevents publication', (t) => {
	const session = createSession();
	const before = session.getState();
	const receipt = approve(session);

	const originalFreeze = Object.freeze;

	let injected = false;

	const mock = t.mock.method(Object, 'freeze', (value) => {
		if (
			value?.outcome === 'published' &&
			value?.stateChanged === true &&
			Object.hasOwn(value, 'sequence')
		) {
			injected = true;
			throw new Error('PRIVATE_AUDIT_FAILURE');
		}

		return originalFreeze(value);
	});

	let result;

	try {
		result = session.executeAndPublishApprovedOperation(receipt);
	} finally {
		mock.mock.restore();
	}

	assert.equal(injected, true);
	assert.equal(result.reason, 'publication_failed');
	assert.deepEqual(session.getState(), before);
	assert.equal(session.getStatus(), 'consumed');

	const [record] = session.getAuditHistory();

	assert.equal(record.outcome, 'rejected');
	assert.equal(record.failureReason, 'publication_failed');
	assert.equal(record.verification, 'passed');
	assert.equal(record.stateChanged, false);
	assert.equal(record.revisionAfter, 0);
});

test('audit history is immutable and detached', () => {
	const session = createSession();

	session.executeAndPublishApprovedOperation(null);

	const first = session.getAuditHistory();
	const second = session.getAuditHistory();

	assert.deepEqual(first, second);
	assert.notEqual(first, second);
	assert.notEqual(first[0], second[0]);

	assert.equal(Object.isFrozen(first), true);
	assert.equal(Object.isFrozen(first[0]), true);

	assert.throws(() => {
		first.push({});
	}, TypeError);

	assert.throws(() => {
		first[0].stateChanged = true;
	}, TypeError);

	assert.deepEqual(session.getAuditHistory(), second);
});

test('audit history is bounded with monotonic sequences', () => {
	const session = createSession();

	const attempts = SYNTHETIC_AUDIT_LIMIT + 25;

	for (let i = 0; i < attempts; i++) {
		assert.equal(session.executeAndPublishApprovedOperation(null).reason, 'approval_required');
	}

	const history = session.getAuditHistory();

	assert.equal(history.length, SYNTHETIC_AUDIT_LIMIT);
	assert.equal(history[0].sequence, 26);
	assert.equal(history.at(-1).sequence, attempts);

	assert.ok(history.every((record, index) => record.sequence === index + 26));

	assert.equal(session.getState().revision, 0);
});

test('audit histories remain isolated between sessions', () => {
	const first = createSession();
	const second = createSession();

	first.executeAndPublishApprovedOperation(null);

	assert.equal(first.getAuditHistory().length, 1);
	assert.equal(second.getAuditHistory().length, 0);

	const receipt = approve(second);

	assert.equal(second.executeAndPublishApprovedOperation(receipt).status, 'published');

	assert.equal(first.getState().revision, 0);
	assert.equal(second.getState().revision, 1);

	assert.equal(first.getAuditHistory()[0].sessionId, first.sessionId);

	assert.equal(second.getAuditHistory()[0].sessionId, second.sessionId);
});

test('candidate-only execution is not publication', () => {
	const session = createSession();
	const receipt = approve(session);

	assert.equal(session.executeApprovedOperation(receipt).status, 'candidate_prepared');

	assert.deepEqual(session.getAuditHistory(), []);
	assert.equal(session.getState().revision, 0);
});

test('competing publication attempts are individually audited', async () => {
	const session = createSession();
	const receipt = approve(session);

	await Promise.all(
		Array.from({ length: 10 }, () =>
			Promise.resolve().then(() => session.executeAndPublishApprovedOperation(receipt))
		)
	);

	const history = session.getAuditHistory();

	assert.equal(history.length, 10);

	assert.equal(history.filter((record) => record.outcome === 'published').length, 1);

	assert.equal(history.filter((record) => record.failureReason === 'replay_detected').length, 9);

	assert.equal(session.getState().revision, 1);
});
