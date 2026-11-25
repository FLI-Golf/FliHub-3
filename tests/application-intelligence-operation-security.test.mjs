import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createSyntheticOperationState,
	syntheticActorIds
} from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { authorizeSyntheticOperation } from '../src/lib/server/intelligence/application/operations/authorization.ts';

import { checkSyntheticGroupPrerequisites } from '../src/lib/server/intelligence/application/operations/prerequisites.ts';

const fixture = () => createSyntheticOperationState('spring_invitational');

const request = () => ({
	operationId: 'create_synthetic_group_assignments',
	fixtureId: 'spring_invitational'
});

const check = (state, actor = syntheticActorIds.owner, input = request()) =>
	checkSyntheticGroupPrerequisites(state, actor, input);

for (const role of ['owner', 'admin']) {
	test(`allows eligible synthetic ${role} to prepare a plan`, () => {
		const state = fixture();
		const before = structuredClone(state);

		const result = check(state, syntheticActorIds[role]);

		assert.equal(result.status, 'eligible');
		assert.equal(result.entries.length, 12);
		assert.equal(result.entries.flatMap((entry) => entry.athleteIds).length, 24);

		assert.deepEqual(state, before);
	});
}

for (const actor of [
	syntheticActorIds.scorekeeper,
	syntheticActorIds.viewer,
	syntheticActorIds.outsider,
	syntheticActorIds.inactive,
	'unknown-actor',
	null,
	42,
	{ role: 'owner' }
]) {
	test(`denies restricted actor: ${String(actor)}`, () => {
		const state = fixture();
		const before = structuredClone(state);

		assert.equal(authorizeSyntheticOperation(state, actor).status, 'denied');

		assert.deepEqual(check(state, actor), {
			status: 'rejected',
			reason: 'unauthorized_actor'
		});

		assert.deepEqual(state, before);
	});
}

test('rejects caller-supplied authority claims', () => {
	assert.deepEqual(
		check(fixture(), syntheticActorIds.owner, {
			...request(),
			approved: true,
			role: 'owner'
		}),
		{
			status: 'rejected',
			reason: 'invalid_request'
		}
	);
});

test('rejects duplicate actor identities', () => {
	const state = fixture();

	state.actors.push(structuredClone(state.actors[0]));

	assert.equal(authorizeSyntheticOperation(state, syntheticActorIds.owner).status, 'denied');
});

test('rejects unknown actor roles', () => {
	const state = fixture();
	state.actors[0].role = 'superuser';

	assert.equal(authorizeSyntheticOperation(state, syntheticActorIds.owner).status, 'denied');
});

for (const capability of ['events', 'teams', 'athletes', 'leagues-seasons']) {
	test(`requires organization capability: ${capability}`, () => {
		const state = fixture();

		state.organizations[0].capabilities = state.organizations[0].capabilities.filter(
			(item) => item !== capability
		);

		assert.deepEqual(check(state), {
			status: 'rejected',
			reason: 'missing_capabilities'
		});
	});
}

for (const lock of ['scorecards', 'scores', 'eventResults', 'fantasyDrafts', 'substitutions']) {
	test(`rejects started workflow: ${lock}`, () => {
		const state = fixture();

		state.event.workflowLocks[lock] = true;

		assert.deepEqual(check(state), {
			status: 'rejected',
			reason: 'workflow_locked'
		});
	});
}

const invalidStates = [
	[
		'persistent state',
		(state) => {
			state.source = 'production';
		},
		'invalid_scope'
	],
	[
		'unsupported fixture',
		(state) => {
			state.fixtureId = 'unknown';
		},
		'invalid_scope'
	],
	[
		'negative revision',
		(state) => {
			state.revision = -1;
		},
		'invalid_state'
	],
	[
		'fractional revision',
		(state) => {
			state.revision = 1.5;
		},
		'invalid_state'
	],
	[
		'duplicate record identity',
		(state) => {
			state.teams[1].id = state.teams[0].id;
		},
		'invalid_state'
	],
	[
		'non-synthetic identity',
		(state) => {
			state.teams[0].id = 'real-team';
		},
		'invalid_state'
	],
	[
		'active event',
		(state) => {
			state.event.status = 'active';
		},
		'invalid_event'
	],
	[
		'archived event',
		(state) => {
			state.event.status = 'archived';
		},
		'invalid_event'
	],
	[
		'missing event date',
		(state) => {
			state.event.dateAssigned = false;
		},
		'invalid_event'
	],
	[
		'missing event venue',
		(state) => {
			state.event.venueAssigned = false;
		},
		'invalid_event'
	],
	[
		'configured scoring',
		(state) => {
			state.event.scoringConfigured = true;
		},
		'invalid_event'
	],
	[
		'missing season',
		(state) => {
			state.event.seasonId = 'missing';
		},
		'invalid_season'
	],
	[
		'archived season',
		(state) => {
			state.seasons[0].status = 'archived';
		},
		'invalid_season'
	],
	[
		'inactive league',
		(state) => {
			state.leagues[0].status = 'inactive';
		},
		'invalid_league'
	],
	[
		'missing league',
		(state) => {
			state.seasons[0].leagueId = 'missing';
		},
		'invalid_league'
	],
	[
		'existing group',
		(state) => {
			state.groups.push({
				id: 'synthetic-group-existing',
				organizationId: state.event.organizationId,
				eventId: state.event.id,
				name: 'Existing group',
				entries: []
			});
		},
		'existing_groups'
	],
	[
		'missing workflow lock',
		(state) => {
			delete state.event.workflowLocks.scorecards;
		},
		'workflow_locked'
	],
	[
		'nonboolean workflow lock',
		(state) => {
			state.event.workflowLocks.scorecards = 0;
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
		'inactive team',
		(state) => {
			state.teams[0].status = 'inactive';
		},
		'invalid_roster'
	],
	[
		'inactive entry',
		(state) => {
			state.entries[0].status = 'inactive';
		},
		'invalid_roster'
	],
	[
		'inactive athlete',
		(state) => {
			state.athletes[0].status = 'inactive';
		},
		'invalid_roster'
	],
	[
		'inactive roster membership',
		(state) => {
			state.rosters[0].status = 'inactive';
		},
		'invalid_roster'
	],
	[
		'duplicate athlete assignment',
		(state) => {
			state.rosters[1].athleteId = state.rosters[0].athleteId;
		},
		'invalid_roster'
	],
	[
		'duplicate team assignment',
		(state) => {
			state.entries[1].teamId = state.entries[0].teamId;
		},
		'invalid_roster'
	],
	[
		'unknown athlete',
		(state) => {
			state.rosters[0].athleteId = 'synthetic-unknown';
		},
		'invalid_roster'
	],
	[
		'unknown team',
		(state) => {
			state.entries[0].teamId = 'synthetic-unknown';
		},
		'invalid_roster'
	],
	[
		'unknown roster entry',
		(state) => {
			state.rosters[0].entryId = 'synthetic-unknown';
		},
		'invalid_roster'
	],
	[
		'wrong entry season',
		(state) => {
			state.entries[0].seasonId = 'synthetic-unknown';
		},
		'invalid_roster'
	]
];

for (const [name, mutate, reason] of invalidStates) {
	test(`rejects ${name} without changing state`, () => {
		const state = fixture();

		mutate(state);

		const before = structuredClone(state);

		assert.deepEqual(check(state), {
			status: 'rejected',
			reason
		});

		assert.deepEqual(state, before);
	});
}

for (const collection of ['leagues', 'seasons', 'teams', 'entries', 'athletes', 'rosters']) {
	test(`rejects cross-organization ${collection}`, () => {
		const state = fixture();

		state[collection][0].organizationId = 'synthetic-org-outside';

		assert.deepEqual(check(state), {
			status: 'rejected',
			reason: 'invalid_scope'
		});
	});
}

test('returns independent eligible roster data', () => {
	const state = fixture();
	const before = structuredClone(state);

	const result = check(state);

	assert.equal(result.status, 'eligible');

	result.entries[0].athleteIds.length = 0;
	result.entries.length = 0;

	assert.deepEqual(state, before);
	assert.equal(check(state).entries.length, 12);
});

test('normalizes input ordering deterministically', () => {
	const first = fixture();
	const second = fixture();

	second.entries.reverse();
	second.rosters.reverse();
	second.athletes.reverse();
	second.teams.reverse();

	assert.deepEqual(check(first), check(second));
});

test('fails closed on malformed local state', () => {
	for (const state of [null, undefined, {}, { source: 'synthetic' }]) {
		assert.equal(check(state).status, 'rejected');
	}
});
