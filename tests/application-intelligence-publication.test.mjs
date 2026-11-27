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

function approve(session) {
	const prepared = session.prepare(request());

	assert.equal(prepared.status, 'prepared');

	const approved = session.approve({
		action: 'approve-exact-plan',
		...session.getReview()
	});

	assert.equal(approved.status, 'approved');

	return {
		plan: prepared.plan,
		receipt: approved.receipt
	};
}

for (const role of ['owner', 'admin']) {
	test(`publishes independently verified ${role} operation`, () => {
		const session = createSession(syntheticActorIds[role]);

		const original = session.getState();

		const { plan, receipt } = approve(session);

		const result = session.executeAndPublishApprovedOperation(receipt);

		assert.equal(result.status, 'published');
		assert.equal(result.scope, 'synthetic-only');

		assert.equal(result.groupsCreated, 6);
		assert.equal(result.teamsAssigned, 12);
		assert.equal(result.athletesAssigned, 24);

		assert.equal(result.revisionBefore, 0);
		assert.equal(result.revisionAfter, 1);

		assert.equal(result.planDigest, plan.digest);

		assert.equal(result.originalStateDigest, canonicalSha256(original));

		const published = session.getState();

		assert.equal(published.revision, 1);
		assert.equal(published.groups.length, 6);

		assert.deepEqual(published.groups, plan.body.proposal.groups);

		assert.equal(result.publishedStateDigest, canonicalSha256(published));

		assert.deepEqual(
			{
				...published,
				revision: original.revision,
				groups: original.groups
			},
			original
		);

		assert.equal(session.getStatus(), 'consumed');
		assert.equal(session.getApproval(), null);
		assert.equal(session.getReview(), null);
		assert.equal(Object.isFrozen(result), true);
		assert.equal(Object.hasOwn(result, 'candidate'), false);
	});
}

test('publication requires prior explicit approval', () => {
	const session = createSession();
	const before = session.getState();

	assert.deepEqual(session.executeAndPublishApprovedOperation(null), {
		status: 'rejected',
		reason: 'approval_required'
	});

	session.prepare(request());

	assert.deepEqual(session.executeAndPublishApprovedOperation({}), {
		status: 'rejected',
		reason: 'approval_required'
	});

	assert.deepEqual(session.getState(), before);
});

test('rejects forged approval without publishing', () => {
	const session = createSession();
	const before = session.getState();

	const { receipt } = approve(session);

	assert.deepEqual(
		session.executeAndPublishApprovedOperation({
			...receipt,
			planDigest: '0'.repeat(64)
		}),
		{
			status: 'rejected',
			reason: 'invalid_approval'
		}
	);

	assert.deepEqual(session.getState(), before);

	assert.equal(session.getStatus(), 'approved');

	assert.equal(session.executeAndPublishApprovedOperation(receipt).status, 'published');
});

test('published operation cannot be repeated', () => {
	const session = createSession();

	const { receipt } = approve(session);

	assert.equal(session.executeAndPublishApprovedOperation(receipt).status, 'published');

	const published = session.getState();

	for (const execute of [
		session.executeAndPublishApprovedOperation,
		session.executeApprovedOperation,
		session.consumeApproval
	]) {
		assert.deepEqual(execute(receipt), {
			status: 'rejected',
			reason: 'replay_detected'
		});
	}

	assert.equal(session.prepare(request()).status, 'rejected');

	session.cancel();

	assert.deepEqual(session.getState(), published);
	assert.equal(session.getState().revision, 1);
});

test('candidate-only execution cannot later publish', () => {
	const session = createSession();
	const before = session.getState();

	const { receipt } = approve(session);

	assert.equal(session.executeApprovedOperation(receipt).status, 'candidate_prepared');

	assert.deepEqual(session.executeAndPublishApprovedOperation(receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});

	assert.deepEqual(session.getState(), before);
});

test('standalone approval consumption cannot publish', () => {
	const session = createSession();
	const before = session.getState();

	const { receipt } = approve(session);

	assert.equal(session.consumeApproval(receipt).status, 'consumed');

	assert.deepEqual(session.executeAndPublishApprovedOperation(receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});

	assert.deepEqual(session.getState(), before);
});

test('cancelled approval cannot publish', () => {
	const session = createSession();
	const before = session.getState();

	const { receipt } = approve(session);

	session.cancel();

	assert.deepEqual(session.executeAndPublishApprovedOperation(receipt), {
		status: 'rejected',
		reason: 'session_closed'
	});

	assert.deepEqual(session.getState(), before);
});

test('another session receipt cannot publish', () => {
	const first = createSession();
	const second = createSession();

	const a = approve(first);
	const b = approve(second);

	const before = second.getState();

	assert.deepEqual(second.executeAndPublishApprovedOperation(a.receipt), {
		status: 'rejected',
		reason: 'invalid_approval'
	});

	assert.deepEqual(second.getState(), before);

	assert.equal(second.executeAndPublishApprovedOperation(b.receipt).status, 'published');

	assert.equal(first.getState().groups.length, 0);
});

test('published state remains private and isolated', () => {
	const session = createSession();
	const independent = createSession();

	const { receipt } = approve(session);

	assert.equal(session.executeAndPublishApprovedOperation(receipt).status, 'published');

	const before = session.getState();
	const copy = session.getState();

	copy.groups.length = 0;
	copy.teams[0].name = 'Changed Team';
	copy.revision = 100;

	assert.deepEqual(session.getState(), before);

	assert.equal(independent.getState().groups.length, 0);

	assert.equal(independent.getState().revision, 0);
});

test('handler failure preserves original state', (t) => {
	const session = createSession();
	const before = session.getState();

	const { receipt } = approve(session);

	const mock = t.mock.method(globalThis, 'structuredClone', () => {
		throw new Error('Test-only handler failure');
	});

	let result;

	try {
		result = session.executeAndPublishApprovedOperation(receipt);
	} finally {
		mock.mock.restore();
	}

	assert.deepEqual(result, {
		status: 'rejected',
		reason: 'execution_failed'
	});

	assert.deepEqual(session.getState(), before);
	assert.equal(session.getStatus(), 'consumed');

	assert.deepEqual(session.executeAndPublishApprovedOperation(receipt), {
		status: 'rejected',
		reason: 'replay_detected'
	});
});

for (const corruption of ['roster', 'unrelated-record', 'unapproved-assignment']) {
	test(`rejects candidate corruption: ${corruption}`, (t) => {
		const session = createSession();
		const before = session.getState();

		const { receipt } = approve(session);

		const originalClone = globalThis.structuredClone;

		let injected = false;

		const mock = t.mock.method(globalThis, 'structuredClone', (value, options) => {
			const copy = originalClone(value, options);

			if (corruption === 'unrelated-record' && copy?.source === 'synthetic') {
				copy.teams[0].name = 'Corrupted Team';
				injected = true;
			}

			if (Array.isArray(copy) && copy.length === 6 && copy[0]?.entries) {
				if (corruption === 'roster') {
					copy[0].entries[0].athleteIds[0] = 'synthetic-invented';

					injected = true;
				}

				if (corruption === 'unapproved-assignment') {
					const a = copy[0].entries;
					const b = copy[1].entries;

					[a[0], b[0]] = [b[0], a[0]];

					injected = true;
				}
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

		assert.deepEqual(result, {
			status: 'rejected',
			reason: 'verification_failed'
		});

		assert.deepEqual(session.getState(), before);

		assert.equal(session.getStatus(), 'consumed');
		assert.equal(session.getApproval(), null);

		assert.deepEqual(session.executeAndPublishApprovedOperation(receipt), {
			status: 'rejected',
			reason: 'replay_detected'
		});
	});
}

test('competing publication attempts succeed only once', async () => {
	const session = createSession();

	const { receipt } = approve(session);

	const results = await Promise.all(
		Array.from({ length: 10 }, () =>
			Promise.resolve().then(() => session.executeAndPublishApprovedOperation(receipt))
		)
	);

	assert.equal(results.filter((result) => result.status === 'published').length, 1);

	assert.equal(
		results.filter((result) => result.status === 'rejected' && result.reason === 'replay_detected')
			.length,
		9
	);

	assert.equal(session.getState().revision, 1);
	assert.equal(session.getState().groups.length, 6);
});

test('no generic publication or state replacement method exists', () => {
	const session = createSession();

	assert.equal(Object.isFrozen(session), true);

	for (const method of [
		'publish',
		'commit',
		'setState',
		'setApproval',
		'setHandler',
		'setVerifier'
	]) {
		assert.equal(Object.hasOwn(session, method), false);
	}
});
