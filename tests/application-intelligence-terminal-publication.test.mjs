import test from 'node:test';
import assert from 'node:assert/strict';

import { createOfflineOperationWorkflow } from '../tools/application/operation-workflow.mjs';

import { reviewSyntheticOperation } from '../tools/application/operation-interaction.mjs';

import { syntheticActorIds } from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { canonicalSha256 } from '../src/lib/server/intelligence/application/operations/canonical.ts';

async function scenario(actor = syntheticActorIds.owner) {
	const workflow = createOfflineOperationWorkflow();

	const result = await workflow.prepare('prepare_tournament', 'spring_invitational', actor);

	assert.equal(result.status, 'review_required');

	return { workflow, result };
}

function confirm(result, answer = 'APPROVE') {
	return reviewSyntheticOperation(result, {
		write: () => {},
		question: async () => answer
	});
}

for (const role of ['owner', 'admin']) {
	test(`${role} publishes exact reviewed synthetic assignments`, async () => {
		const { result } = await scenario(syntheticActorIds[role]);

		const before = result.session.getState();
		const outcome = await confirm(result);
		const after = result.session.getState();

		assert.equal(outcome.status, 'published');
		assert.equal(outcome.groupsCreated, 6);
		assert.equal(outcome.teamsAssigned, 12);
		assert.equal(outcome.athletesAssigned, 24);
		assert.equal(outcome.planDigest, result.plan.digest);
		assert.equal(outcome.originalStateDigest, canonicalSha256(before));
		assert.equal(outcome.publishedStateDigest, canonicalSha256(after));

		assert.equal(after.revision, 1);

		assert.deepEqual(after.groups, result.plan.body.proposal.groups);

		assert.deepEqual({ ...after, revision: before.revision, groups: before.groups }, before);
	});
}

test('successful terminal publication creates one verified audit record', async () => {
	const { result } = await scenario();

	const outcome = await confirm(result);

	assert.equal(outcome.status, 'published');

	const audit = result.session.getAuditHistory();

	assert.equal(audit.length, 1);
	assert.equal(audit[0].outcome, 'published');
	assert.equal(audit[0].verification, 'passed');
	assert.equal(audit[0].stateChanged, true);
	assert.equal(audit[0].planDigest, result.plan.digest);
	assert.equal(audit[0].reviewId, result.review.reviewId);
	assert.equal(audit[0].revisionBefore, 0);
	assert.equal(audit[0].revisionAfter, 1);
	assert.equal(audit[0].groupsCreated, 6);
});

test('cancellation preserves original state and creates no publication attempt', async () => {
	const { result } = await scenario();

	const before = result.session.getState();
	const outcome = await confirm(result, 'CANCEL');

	assert.equal(outcome.status, 'cancelled');
	assert.deepEqual(result.session.getState(), before);
	assert.equal(result.session.getAuditHistory().length, 0);
	assert.equal(result.session.getApproval(), null);
});

test('repeated terminal review cannot publish twice', async () => {
	const { result } = await scenario();

	assert.equal((await confirm(result)).status, 'published');

	const before = result.session.getState();
	const outcome = await confirm(result);

	assert.equal(outcome.status, 'rejected');
	assert.deepEqual(result.session.getState(), before);
	assert.equal(result.session.getAuditHistory().length, 1);
});

test('competing confirmations publish at most once', async () => {
	const { result } = await scenario();

	const outcomes = await Promise.all([confirm(result), confirm(result)]);

	assert.equal(outcomes.filter((item) => item.status === 'published').length, 1);

	assert.equal(result.session.getState().revision, 1);
	assert.equal(result.session.getState().groups.length, 6);

	assert.equal(
		result.session.getAuditHistory().filter((item) => item.outcome === 'published').length,
		1
	);
});

test('handler failure preserves original state', async (t) => {
	const { result } = await scenario();

	const before = result.session.getState();
	let calls = 0;

	const clone = globalThis.structuredClone;

	const mock = t.mock.method(globalThis, 'structuredClone', (...args) => {
		calls++;

		if (calls === 1) {
			throw new Error('private handler diagnostic');
		}

		return clone(...args);
	});

	let outcome;

	try {
		outcome = await confirm(result);
	} finally {
		mock.mock.restore();
	}

	assert.equal(outcome.status, 'rejected');
	assert.equal(outcome.reason, 'execution_failed');
	assert.deepEqual(result.session.getState(), before);
	assert.equal(result.session.getApproval(), null);

	const audit = result.session.getAuditHistory();

	assert.equal(audit.length, 1);
	assert.equal(audit[0].outcome, 'rejected');
	assert.equal(audit[0].stateChanged, false);

	assert.ok(!JSON.stringify(audit).includes('private handler diagnostic'));
});

test('published scenario does not affect a fresh assessment', async () => {
	const { workflow, result } = await scenario();

	assert.equal((await confirm(result)).status, 'published');

	const fresh = await workflow.prepare(
		'prepare_tournament',
		'spring_invitational',
		syntheticActorIds.owner
	);

	assert.equal(fresh.status, 'review_required');
	assert.equal(fresh.session.getState().revision, 0);
	assert.equal(fresh.session.getState().groups.length, 0);
	assert.equal(fresh.session.getApproval(), null);

	assert.equal(result.session.getState().groups.length, 6);
	assert.notEqual(fresh.review.sessionId, result.review.sessionId);
});

test('verified publication makes no additional assessment requests', async () => {
	const { workflow, result } = await scenario();

	const before = workflow.getUsage();

	assert.equal((await confirm(result)).status, 'published');

	assert.deepEqual(workflow.getUsage(), before);
	assert.equal(before.paidProviderRequests, 0);
	assert.equal(before.blockedFetchAttempts, 0);
	assert.equal(before.persistentStorage, false);
});
