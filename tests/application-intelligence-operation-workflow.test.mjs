import test from 'node:test';
import assert from 'node:assert/strict';

import { createOfflineOperationWorkflow } from '../tools/application/operation-workflow.mjs';

import { syntheticActorIds } from '../src/lib/server/intelligence/application/operations/fixtures.ts';

function prepare(
	workflow,
	objective = 'prepare_tournament',
	fixture = 'spring_invitational',
	actor = syntheticActorIds.owner
) {
	return workflow.prepare(objective, fixture, actor);
}

test('mock recommendation resolves a registered operation', async () => {
	const result = await prepare(createOfflineOperationWorkflow());

	assert.equal(result.status, 'review_required');
	assert.equal(result.advisory.plan.decision.status, 'recommended');
	assert.equal(result.advisory.plan.decision.capability, 'plan_group_assignments');
	assert.equal(result.operation.id, 'create_synthetic_group_assignments');
	assert.equal(result.operation.scope, 'synthetic-only');
	assert.equal(result.operation.approvalRequired, true);
});

test('workflow prepares six groups without changing state', async () => {
	const result = await prepare(createOfflineOperationWorkflow());

	assert.equal(result.status, 'review_required');

	const proposal = result.plan.body.proposal;

	assert.equal(proposal.groups.length, 6);
	assert.equal(proposal.summary.teamsAssigned, 12);
	assert.equal(proposal.summary.athletesAssigned, 24);

	assert.equal(result.session.getState().groups.length, 0);
	assert.equal(result.session.getState().revision, 0);
	assert.equal(result.session.getStatus(), 'review');
	assert.equal(result.session.getApproval(), null);
	assert.equal(result.session.getAuditHistory().length, 0);
});

test('review identity matches the exact execution plan', async () => {
	const result = await prepare(createOfflineOperationWorkflow());

	assert.equal(result.status, 'review_required');
	assert.equal(result.review.planDigest, result.plan.digest);
	assert.deepEqual(result.review, result.session.getReview());
	assert.equal(result.review.sessionId, result.session.sessionId);
});

test('preparation never automatically grants execution approval', async () => {
	const result = await prepare(createOfflineOperationWorkflow());

	assert.equal(result.status, 'review_required');

	const attempted = result.session.executeAndPublishApprovedOperation(null);

	assert.equal(attempted.status, 'rejected');
	assert.equal(attempted.reason, 'approval_required');
	assert.equal(result.session.getState().revision, 0);
	assert.equal(result.session.getState().groups.length, 0);
});

test('readiness objective remains advisory only', async () => {
	const result = await prepare(createOfflineOperationWorkflow(), 'assess_readiness');

	assert.equal(result.status, 'advisory_only');
	assert.equal(Object.hasOwn(result, 'session'), false);
	assert.equal(Object.hasOwn(result, 'plan'), false);
});

for (const fixture of [
	'participants_missing',
	'groups_prepared',
	'preparation_review',
	'venue_missing',
	'information_missing'
]) {
	test(`${fixture} does not expose an executable operation`, async () => {
		const result = await prepare(createOfflineOperationWorkflow(), 'prepare_tournament', fixture);

		assert.equal(result.status, 'advisory_only');
		assert.equal(Object.hasOwn(result, 'session'), false);
	});
}

test('administrator may prepare a synthetic operation', async () => {
	const result = await prepare(
		createOfflineOperationWorkflow(),
		'prepare_tournament',
		'spring_invitational',
		syntheticActorIds.admin
	);

	assert.equal(result.status, 'review_required');
	assert.equal(result.plan.body.proposal.actorId, syntheticActorIds.admin);
	assert.equal(result.session.getApproval(), null);
});

for (const role of ['scorekeeper', 'viewer', 'outsider', 'inactive']) {
	test(`${role} cannot prepare an operation`, async () => {
		const result = await prepare(
			createOfflineOperationWorkflow(),
			'prepare_tournament',
			'spring_invitational',
			syntheticActorIds[role]
		);

		assert.equal(result.status, 'rejected');
		assert.equal(result.reason, 'unauthorized_actor');
		assert.equal(Object.hasOwn(result, 'session'), false);
	});
}

test('unknown objectives are rejected before assessment', async () => {
	const workflow = createOfflineOperationWorkflow();

	const result = await prepare(workflow, 'arbitrary_command');

	assert.equal(result.status, 'rejected');
	assert.equal(result.reason, 'unsupported_objective');
	assert.equal(workflow.getUsage().assessmentAttempts, 0);
});

test('unknown fixtures are rejected before assessment', async () => {
	const workflow = createOfflineOperationWorkflow();

	const result = await prepare(workflow, 'prepare_tournament', 'production_event');

	assert.equal(result.status, 'rejected');
	assert.equal(result.reason, 'unsupported_fixture');
	assert.equal(workflow.getUsage().assessmentAttempts, 0);
});

test('unknown actors are rejected before assessment', async () => {
	const workflow = createOfflineOperationWorkflow();

	const result = await prepare(
		workflow,
		'prepare_tournament',
		'spring_invitational',
		'unknown-actor'
	);

	assert.equal(result.status, 'rejected');
	assert.equal(result.reason, 'unauthorized_actor');
	assert.equal(workflow.getUsage().assessmentAttempts, 0);
});

test('independent preparations have independent review identities', async () => {
	const workflow = createOfflineOperationWorkflow();

	const first = await prepare(workflow);
	const second = await prepare(workflow);

	assert.equal(first.status, 'review_required');
	assert.equal(second.status, 'review_required');

	assert.equal(first.plan.digest, second.plan.digest);
	assert.notEqual(first.review.sessionId, second.review.sessionId);
	assert.notEqual(first.review.reviewId, second.review.reviewId);

	first.session.cancel();

	assert.equal(first.session.getStatus(), 'cancelled');
	assert.equal(second.session.getStatus(), 'review');
});

test('offline workflow reports no paid provider requests', async () => {
	const workflow = createOfflineOperationWorkflow();

	await prepare(workflow);

	const usage = workflow.getUsage();

	assert.equal(usage.provider, 'mock');
	assert.equal(usage.assessmentAttempts, 1);
	assert.equal(usage.blockedFetchAttempts, 0);
	assert.equal(usage.paidProviderRequests, 0);
	assert.equal(usage.persistentStorage, false);
	assert.equal(Object.isFrozen(usage), true);
});

test('workflow exposes no automatic execution method', () => {
	const workflow = createOfflineOperationWorkflow();

	assert.deepEqual(Object.keys(workflow).sort(), ['getUsage', 'prepare']);
	assert.equal(Object.isFrozen(workflow), true);
});
