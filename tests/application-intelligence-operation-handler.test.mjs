import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalSha256 } from '../src/lib/server/intelligence/application/operations/canonical.ts';

import {
	createSyntheticOperationState,
	syntheticActorIds
} from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { prepareSyntheticExecutionPlan } from '../src/lib/server/intelligence/application/operations/execution-plan.ts';

import { prepareSyntheticOperationCandidate } from '../src/lib/server/intelligence/application/operations/handler.ts';

const fixture = () => createSyntheticOperationState('spring_invitational');

const request = () => ({
	operationId: 'create_synthetic_group_assignments',
	fixtureId: 'spring_invitational'
});

function prepare(state, actor = syntheticActorIds.owner) {
	const result = prepareSyntheticExecutionPlan(state, actor, request());

	assert.equal(result.status, 'prepared');

	return result.plan;
}

function construct(state, plan, actor = syntheticActorIds.owner) {
	return prepareSyntheticOperationCandidate(state, actor, plan);
}

test('constructs exact isolated candidate state', () => {
	const state = fixture();
	const before = structuredClone(state);
	const plan = prepare(state);

	const result = construct(state, plan);

	assert.equal(result.status, 'candidate_prepared');

	assert.equal(result.operationId, 'create_synthetic_group_assignments');

	assert.equal(result.planDigest, plan.digest);

	assert.equal(result.originalStateDigest, canonicalSha256(before));

	assert.equal(result.publication, 'not-permitted');

	assert.equal(result.verification, 'pending');

	assert.equal(result.candidate.revision, 1);

	assert.deepEqual(result.candidate.groups, plan.body.proposal.groups);

	assert.deepEqual(state, before);
	assert.equal(state.groups.length, 0);
	assert.equal(state.revision, 0);
});

test('candidate preserves unrelated state', () => {
	const state = fixture();
	const plan = prepare(state);

	const result = construct(state, plan);

	assert.equal(result.status, 'candidate_prepared');

	const expected = {
		...structuredClone(state),
		revision: 1,
		groups: structuredClone(plan.body.proposal.groups)
	};

	assert.deepEqual(result.candidate, expected);
});

test('candidate contains complete intact roster assignments', () => {
	const state = fixture();
	const result = construct(state, prepare(state));

	assert.equal(result.status, 'candidate_prepared');

	const groups = result.candidate.groups;

	assert.equal(groups.length, 6);

	const entries = groups.flatMap((group) => group.entries);

	const athletes = entries.flatMap((entry) => entry.athleteIds);

	assert.equal(entries.length, 12);
	assert.equal(athletes.length, 24);

	assert.equal(new Set(entries.map((entry) => entry.entryId)).size, 12);

	assert.equal(new Set(athletes).size, 24);

	assert.deepEqual(
		entries.map((entry) => entry.entryId).sort(),
		state.entries.map((entry) => entry.id).sort()
	);

	assert.deepEqual([...athletes].sort(), state.athletes.map((athlete) => athlete.id).sort());

	for (const group of groups) {
		assert.equal(group.entries.length, 2);

		assert.equal(group.organizationId, state.event.organizationId);

		assert.equal(group.eventId, state.event.id);

		for (const entry of group.entries) {
			assert.deepEqual(
				[...entry.athleteIds].sort(),
				state.rosters
					.filter((row) => row.entryId === entry.entryId)
					.map((row) => row.athleteId)
					.sort()
			);
		}
	}
});

test('candidate is independent of original state and plan', () => {
	const state = fixture();
	const before = structuredClone(state);
	const plan = prepare(state);
	const planBefore = structuredClone(plan);

	const result = construct(state, plan);

	assert.equal(result.status, 'candidate_prepared');

	result.candidate.teams[0].name = 'Changed candidate team';

	result.candidate.groups[0].entries[0].athleteIds[0] = 'synthetic-invented';

	result.candidate.groups.length = 0;

	assert.deepEqual(state, before);
	assert.deepEqual(plan, planBefore);
});

test('candidate construction is deterministic', () => {
	const state = fixture();
	const plan = prepare(state);

	const first = construct(state, plan);
	const second = construct(state, plan);

	assert.deepEqual(first, second);

	assert.notEqual(first.candidate, second.candidate);
});

test('rejects unauthorized actor', () => {
	const state = fixture();
	const plan = prepare(state);

	for (const actor of [
		syntheticActorIds.viewer,
		syntheticActorIds.scorekeeper,
		syntheticActorIds.outsider,
		syntheticActorIds.inactive,
		'unknown-actor'
	]) {
		assert.equal(construct(state, plan, actor).status, 'rejected');
	}

	assert.equal(state.groups.length, 0);
});

test('rejects plan belonging to another actor', () => {
	const state = fixture();
	const plan = prepare(state);

	assert.equal(construct(state, plan, syntheticActorIds.admin).status, 'rejected');
});

test('administrator can construct own valid candidate', () => {
	const state = fixture();
	const actor = syntheticActorIds.admin;
	const plan = prepare(state, actor);

	assert.equal(construct(state, plan, actor).status, 'candidate_prepared');
});

test('rejects stale state revision', () => {
	const state = fixture();
	const plan = prepare(state);

	state.revision++;

	const before = structuredClone(state);

	assert.deepEqual(construct(state, plan), {
		status: 'rejected',
		reason: 'stale_state'
	});

	assert.deepEqual(state, before);
});

test('rejects changed state without revision increment', () => {
	const state = fixture();
	const plan = prepare(state);

	state.event.workflowLocks.scorecards = true;

	assert.deepEqual(construct(state, plan), {
		status: 'rejected',
		reason: 'stale_state'
	});
});

test('rejects modified and rehashed assignments', () => {
	const state = fixture();
	const plan = structuredClone(prepare(state));

	plan.body.proposal.groups[0].entries[0].athleteIds[0] = 'synthetic-invented';

	plan.digest = canonicalSha256(plan.body);

	assert.equal(construct(state, plan).status, 'rejected');

	assert.equal(state.groups.length, 0);
});

test('rejects unregistered operation', () => {
	const state = fixture();
	const plan = structuredClone(prepare(state));

	plan.body.proposal.operationId = 'execute_sql';
	plan.digest = canonicalSha256(plan.body);

	assert.equal(construct(state, plan).status, 'rejected');
});

test('rejects caller supplied approval authority', () => {
	const state = fixture();
	const plan = structuredClone(prepare(state));

	plan.approved = true;

	assert.equal(construct(state, plan).status, 'rejected');
});

test('rejects existing groups', () => {
	const state = fixture();
	const plan = prepare(state);

	const first = construct(state, plan);

	assert.equal(first.status, 'candidate_prepared');

	assert.equal(construct(first.candidate, plan).status, 'rejected');

	assert.equal(
		prepareSyntheticExecutionPlan(first.candidate, syntheticActorIds.owner, request()).status,
		'rejected'
	);
});

test('rejects revision overflow without mutation', () => {
	const state = fixture();

	state.revision = Number.MAX_SAFE_INTEGER;

	const plan = prepare(state);
	const before = structuredClone(state);

	assert.deepEqual(construct(state, plan), {
		status: 'rejected',
		reason: 'execution_failed'
	});

	assert.deepEqual(state, before);
});

test('rejects malformed plans safely', () => {
	const state = fixture();
	const before = structuredClone(state);

	for (const plan of [null, undefined, {}, [], true, 'execute']) {
		assert.equal(construct(state, plan).status, 'rejected');
	}

	assert.deepEqual(state, before);
});
