import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareExactOperationReview } from '../src/lib/server/intelligence/application/operations/review.ts';

import { syntheticActorIds } from '../src/lib/server/intelligence/application/operations/fixtures.ts';

const fixture = 'spring_invitational';
const operation = 'create_synthetic_group_assignments';

function prepare(actor = syntheticActorIds.owner) {
	const result = prepareExactOperationReview(fixture, actor, operation);

	assert.equal(result.status, 'prepared');
	return result.handle;
}

test('exact review contains all proposed assignments', () => {
	const handle = prepare();
	const review = handle.read();

	assert.ok(review);
	assert.equal(review.kind, 'exact-operation-review');
	assert.equal(review.scope, 'synthetic-only');
	assert.equal(review.event.name, 'Spring Invitational');
	assert.equal(review.organization.name, 'Synthetic FLI Golf');
	assert.equal(review.stateRevision, 0);

	assert.deepEqual(review.summary, {
		groupsBefore: 0,
		groupsAfter: 6,
		teamsAssigned: 12,
		athletesAssigned: 24
	});

	assert.equal(review.groups.length, 6);

	const teams = review.groups.flatMap((group) => {
		assert.equal(group.teams.length, 2);
		return group.teams;
	});

	const athletes = teams.flatMap((team) => {
		assert.equal(team.athletes.length, 2);
		assert.match(team.name, /^Synthetic Team /);
		return team.athletes;
	});

	assert.equal(new Set(teams.map((team) => team.teamId)).size, 12);
	assert.equal(new Set(athletes.map((athlete) => athlete.id)).size, 24);

	for (const athlete of athletes) {
		assert.match(athlete.name, /^Synthetic Athlete /);
	}

	handle.cancel();
});

test('review facade exposes no approval or execution authority', () => {
	const handle = prepare();
	const review = handle.read();

	assert.deepEqual(Object.keys(handle).sort(), ['cancel', 'read']);

	assert.equal(review.boundaries.approvalRequired, true);
	assert.equal(review.boundaries.approvalGranted, false);
	assert.equal(review.boundaries.execution, 'disabled');
	assert.equal(review.boundaries.persistentMutation, false);
	assert.equal(review.boundaries.externalProviderAccess, false);

	assert.equal(Object.hasOwn(review, 'sessionId'), false);
	assert.equal(Object.hasOwn(review, 'receipt'), false);
	assert.equal(Object.hasOwn(review, 'plan'), false);

	handle.cancel();
});

test('exact review is deeply immutable', () => {
	const handle = prepare();
	const review = handle.read();

	assert.equal(Object.isFrozen(review), true);
	assert.equal(Object.isFrozen(review.groups), true);
	assert.equal(Object.isFrozen(review.groups[0].teams), true);
	assert.equal(Object.isFrozen(review.groups[0].teams[0].athletes[0]), true);

	assert.throws(() => {
		review.groups[0].teams[0].name = 'Modified';
	}, TypeError);

	assert.throws(() => {
		review.boundaries.approvalGranted = true;
	}, TypeError);

	handle.cancel();
});

test('identical plans receive independent review identities', () => {
	const first = prepare();
	const second = prepare();

	const a = first.read();
	const b = second.read();

	assert.equal(a.planDigest, b.planDigest);
	assert.notEqual(a.reviewId, b.reviewId);
	assert.deepEqual(a.groups, b.groups);

	first.cancel();

	assert.equal(first.read(), null);
	assert.ok(second.read());

	second.cancel();
});

test('cancellation permanently invalidates the review handle', () => {
	const handle = prepare();

	assert.ok(handle.read());

	handle.cancel();
	handle.cancel();

	assert.equal(handle.read(), null);
});

test('active organization administrator can prepare a review', () => {
	const handle = prepare(syntheticActorIds.admin);

	assert.equal(handle.read().operator.role, 'admin');
	assert.equal(handle.read().operator.simulated, true);

	handle.cancel();
});

for (const actor of [
	syntheticActorIds.scorekeeper,
	syntheticActorIds.viewer,
	syntheticActorIds.outsider,
	syntheticActorIds.inactive,
	'unknown-actor',
	null
]) {
	test(`unauthorized operator cannot prepare: ${actor}`, () => {
		const result = prepareExactOperationReview(fixture, actor, operation);

		assert.equal(result.status, 'rejected');
		assert.equal(result.reason, 'unauthorized_actor');
		assert.equal(Object.hasOwn(result, 'handle'), false);
	});
}

test('unsupported fixtures cannot prepare an operation review', () => {
	for (const scenario of [
		'participants_missing',
		'groups_prepared',
		'preparation_review',
		'venue_missing',
		'information_missing',
		'unknown',
		null
	]) {
		const result = prepareExactOperationReview(scenario, syntheticActorIds.owner, operation);

		assert.equal(result.status, 'rejected');
		assert.equal(result.reason, 'unsupported_fixture');
	}
});

test('unregistered operations cannot prepare a review', () => {
	for (const candidate of [
		'delete_all_events',
		'execute_sql',
		'plan_group_assignments',
		'constructor',
		'__proto__',
		null,
		{}
	]) {
		const result = prepareExactOperationReview(fixture, syntheticActorIds.owner, candidate);

		assert.deepEqual(result, {
			status: 'rejected',
			reason: 'unknown_operation'
		});
	}
});
