import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createSyntheticOperationState,
	syntheticActorIds
} from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { planSyntheticGroupAssignments } from '../src/lib/server/intelligence/application/operations/planner.ts';

const fixture = () => createSyntheticOperationState('spring_invitational');

const request = () => ({
	operationId: 'create_synthetic_group_assignments',
	fixtureId: 'spring_invitational'
});

const plan = (state, actor = syntheticActorIds.owner, input = request()) =>
	planSyntheticGroupAssignments(state, actor, input);

function proposal(state = fixture()) {
	const result = plan(state);

	assert.equal(result.status, 'proposed');

	return result.proposal;
}

test('proposes six groups without executing anything', () => {
	const state = fixture();
	const before = structuredClone(state);

	const result = proposal(state);

	assert.equal(result.kind, 'synthetic-group-proposal');
	assert.equal(result.approvalRequired, true);
	assert.equal(result.execution, 'requires-approval');
	assert.equal(result.algorithm, 'team-pairing-v1');

	assert.deepEqual(result.summary, {
		groupsBefore: 0,
		groupsAfter: 6,
		teamsAssigned: 12,
		athletesAssigned: 24
	});

	assert.equal(result.groups.length, 6);
	assert.deepEqual(state, before);
	assert.equal(state.groups.length, 0);
	assert.equal(state.revision, 0);
});

test('identical state produces identical proposals', () => {
	assert.deepEqual(proposal(), proposal());
});

test('input collection ordering does not change the proposal', () => {
	const first = fixture();
	const second = fixture();

	for (const collection of ['organizations', 'actors', 'teams', 'entries', 'athletes', 'rosters']) {
		second[collection].reverse();
	}

	assert.deepEqual(proposal(first), proposal(second));
});

test('each group contains exactly two intact teams', () => {
	const state = fixture();
	const result = proposal(state);

	for (const group of result.groups) {
		assert.equal(group.entries.length, 2);

		for (const entry of group.entries) {
			const expected = state.rosters
				.filter((row) => row.entryId === entry.entryId)
				.map((row) => row.athleteId)
				.sort();

			assert.equal(entry.athleteIds.length, 2);

			assert.deepEqual([...entry.athleteIds].sort(), expected);
		}
	}
});

test('every season entry appears exactly once', () => {
	const state = fixture();
	const result = proposal(state);

	const assigned = result.groups.flatMap((group) => group.entries).map((entry) => entry.entryId);

	assert.equal(assigned.length, 12);
	assert.equal(new Set(assigned).size, 12);

	assert.deepEqual(assigned.sort(), state.entries.map((entry) => entry.id).sort());
});

test('every athlete appears exactly once', () => {
	const state = fixture();
	const result = proposal(state);

	const assigned = result.groups
		.flatMap((group) => group.entries)
		.flatMap((entry) => entry.athleteIds);

	assert.equal(assigned.length, 24);
	assert.equal(new Set(assigned).size, 24);

	assert.deepEqual(assigned.sort(), state.athletes.map((athlete) => athlete.id).sort());
});

test('proposed groups remain within the event scope', () => {
	const state = fixture();
	const result = proposal(state);

	for (const group of result.groups) {
		assert.equal(group.organizationId, state.event.organizationId);

		assert.equal(group.eventId, state.event.id);
		assert.ok(group.id.startsWith('synthetic-group-'));
	}

	assert.equal(new Set(result.groups.map((group) => group.id)).size, 6);
});

test('proposal binds actor, event, organization and revision', () => {
	const state = fixture();
	state.revision = 3;

	const result = plan(state, syntheticActorIds.admin);

	assert.equal(result.status, 'proposed');

	assert.equal(result.proposal.actorId, syntheticActorIds.admin);

	assert.equal(result.proposal.organizationId, state.event.organizationId);

	assert.equal(result.proposal.eventId, state.event.id);

	assert.equal(result.proposal.stateRevision, 3);
});

test('owner and admin receive the same group assignments', () => {
	const state = fixture();

	const owner = plan(state, syntheticActorIds.owner);

	const admin = plan(state, syntheticActorIds.admin);

	assert.equal(owner.status, 'proposed');
	assert.equal(admin.status, 'proposed');

	assert.deepEqual(owner.proposal.groups, admin.proposal.groups);

	assert.notEqual(owner.proposal.actorId, admin.proposal.actorId);
});

test('returned proposals share no mutable state', () => {
	const state = fixture();
	const before = structuredClone(state);

	const first = proposal(state);
	const second = proposal(state);
	const expected = structuredClone(second);

	first.groups[0].entries[0].athleteIds.length = 0;
	first.groups[0].entries.length = 0;
	first.groups.length = 0;

	assert.deepEqual(second, expected);
	assert.deepEqual(state, before);
	assert.deepEqual(proposal(state), expected);
});

test('rejects generated group identity collisions', () => {
	const state = fixture();

	state.actors[2].id = 'synthetic-group-01';

	assert.deepEqual(plan(state), {
		status: 'rejected',
		reason: 'planning_failed'
	});
});

for (const actor of [
	syntheticActorIds.viewer,
	syntheticActorIds.scorekeeper,
	syntheticActorIds.outsider,
	syntheticActorIds.inactive,
	'unknown-actor'
]) {
	test(`planner denies actor: ${actor}`, () => {
		const state = fixture();
		const before = structuredClone(state);

		assert.deepEqual(plan(state, actor), {
			status: 'rejected',
			reason: 'unauthorized_actor'
		});

		assert.deepEqual(state, before);
	});
}

const invalidStates = [
	[
		'locked workflow',
		(state) => {
			state.event.workflowLocks.scorecards = true;
		},
		'workflow_locked'
	],
	[
		'missing roster',
		(state) => {
			state.rosters.pop();
		},
		'invalid_roster'
	],
	[
		'cross-organization athlete',
		(state) => {
			state.athletes[0].organizationId = 'synthetic-org-outside';
		},
		'invalid_scope'
	],
	[
		'existing groups',
		(state) => {
			state.groups.push({
				id: 'synthetic-group-existing',
				organizationId: state.event.organizationId,
				eventId: state.event.id,
				name: 'Existing',
				entries: []
			});
		},
		'existing_groups'
	],
	[
		'missing capabilities',
		(state) => {
			state.organizations[0].capabilities = [];
		},
		'missing_capabilities'
	],
	[
		'active event',
		(state) => {
			state.event.status = 'active';
		},
		'invalid_event'
	]
];

for (const [name, mutate, reason] of invalidStates) {
	test(`planner rejects ${name}`, () => {
		const state = fixture();

		mutate(state);

		const before = structuredClone(state);

		assert.deepEqual(plan(state), {
			status: 'rejected',
			reason
		});

		assert.deepEqual(state, before);
	});
}

test('planner rejects arbitrary operation identifiers', () => {
	assert.deepEqual(
		plan(fixture(), syntheticActorIds.owner, {
			...request(),
			operationId: 'execute_sql'
		}),
		{
			status: 'rejected',
			reason: 'unknown_operation'
		}
	);
});

test('planner rejects caller-supplied grouping parameters', () => {
	assert.deepEqual(
		plan(fixture(), syntheticActorIds.owner, {
			...request(),
			groups: []
		}),
		{
			status: 'rejected',
			reason: 'invalid_request'
		}
	);
});

test('planner rejects caller-supplied approval', () => {
	assert.deepEqual(
		plan(fixture(), syntheticActorIds.owner, {
			...request(),
			approved: true
		}),
		{
			status: 'rejected',
			reason: 'invalid_request'
		}
	);
});

test('planning does not depend on Math.random', () => {
	const original = Math.random;

	try {
		Math.random = () => {
			throw new Error('Unexpected random source');
		};

		assert.equal(plan(fixture()).status, 'proposed');
	} finally {
		Math.random = original;
	}
});
