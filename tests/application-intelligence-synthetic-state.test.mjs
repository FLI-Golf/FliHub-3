import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createSyntheticOperationState,
	syntheticActorIds
} from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { getSyntheticFixture } from '../src/lib/server/intelligence/application/fixtures.ts';

const fixture = () => createSyntheticOperationState('spring_invitational');

test('creates the registered disposable tournament state', () => {
	const state = fixture();

	assert.equal(state.source, 'synthetic');
	assert.equal(state.fixtureId, 'spring_invitational');
	assert.equal(state.revision, 0);
	assert.equal(state.event.status, 'draft');
	assert.equal(state.teams.length, 12);
	assert.equal(state.entries.length, 12);
	assert.equal(state.athletes.length, 24);
	assert.equal(state.rosters.length, 24);
	assert.equal(state.groups.length, 0);
});

test('matches the existing advisory fixture context', () => {
	const state = fixture();
	const context = getSyntheticFixture('spring_invitational');

	assert.deepEqual(
		{
			source: state.source,
			activity: state.event.activity,
			status: state.event.status,
			dateAssigned: state.event.dateAssigned,
			venueAssigned: state.event.venueAssigned,
			participantCount: state.athletes.length,
			groupCount: state.groups.length,
			scoringConfigured: state.event.scoringConfigured
		},
		context
	);
});

test('fixture generation is deterministic', () => {
	assert.deepEqual(fixture(), fixture());
});

test('fixture instances share no mutable nested state', () => {
	const first = fixture();
	const second = fixture();

	first.event.workflowLocks.scorecards = true;
	first.teams[0].name = 'Changed';
	first.organizations[0].capabilities.length = 0;
	first.actors[0].role = 'viewer';
	first.rosters.length = 0;

	assert.equal(second.event.workflowLocks.scorecards, false);
	assert.equal(second.teams[0].name, 'Synthetic Team 1');
	assert.equal(second.organizations[0].capabilities.length, 4);
	assert.equal(second.actors[0].role, 'owner');
	assert.equal(second.rosters.length, 24);
	assert.deepEqual(second, fixture());
});

test('every team has one active season entry', () => {
	const state = fixture();

	for (const team of state.teams) {
		const entries = state.entries.filter((entry) => entry.teamId === team.id);

		assert.equal(team.status, 'active');
		assert.equal(entries.length, 1);
		assert.equal(entries[0].status, 'active');
		assert.equal(entries[0].seasonId, state.event.seasonId);
	}
});

test('every entry has exactly two active roster athletes', () => {
	const state = fixture();

	for (const entry of state.entries) {
		const roster = state.rosters.filter((row) => row.entryId === entry.id);

		assert.equal(roster.length, 2);

		for (const row of roster) {
			const athlete = state.athletes.find((item) => item.id === row.athleteId);

			assert.ok(athlete);
			assert.equal(row.status, 'active');
			assert.equal(athlete.status, 'active');
			assert.equal(athlete.organizationId, state.event.organizationId);
		}
	}
});

test('every athlete appears in exactly one roster', () => {
	const state = fixture();

	assert.equal(new Set(state.rosters.map((row) => row.athleteId)).size, 24);

	assert.deepEqual(
		state.rosters.map((row) => row.athleteId).sort(),
		state.athletes.map((athlete) => athlete.id).sort()
	);
});

test('all event domain records belong to the synthetic organization', () => {
	const state = fixture();

	for (const records of [
		state.leagues,
		state.seasons,
		state.teams,
		state.entries,
		state.athletes,
		state.rosters
	]) {
		for (const record of records) {
			assert.equal(record.organizationId, state.event.organizationId);
		}
	}
});

test('synthetic league and season relationships are consistent', () => {
	const state = fixture();

	const season = state.seasons.find((item) => item.id === state.event.seasonId);

	assert.ok(season);
	assert.equal(season.status, 'planned');

	const league = state.leagues.find((item) => item.id === season.leagueId);

	assert.ok(league);
	assert.equal(league.status, 'active');
});

test('synthetic identities are unique and explicitly prefixed', () => {
	const state = fixture();

	const records = [
		...state.organizations,
		...state.actors,
		...state.leagues,
		...state.seasons,
		state.event,
		...state.teams,
		...state.entries,
		...state.athletes,
		...state.rosters
	];

	assert.equal(new Set(records.map((record) => record.id)).size, records.length);

	assert.ok(records.every((record) => record.id.startsWith('synthetic-')));
});

test('registers positive and negative authorization fixtures', () => {
	const state = fixture();

	const actor = (id) => state.actors.find((item) => item.id === id);

	assert.equal(actor(syntheticActorIds.owner).role, 'owner');
	assert.equal(actor(syntheticActorIds.admin).role, 'admin');

	assert.equal(actor(syntheticActorIds.scorekeeper).role, 'scorekeeper');

	assert.equal(actor(syntheticActorIds.viewer).role, 'viewer');

	assert.notEqual(actor(syntheticActorIds.outsider).organizationId, state.event.organizationId);

	assert.equal(actor(syntheticActorIds.inactive).status, 'inactive');
});

test('starts with no downstream workflow locks', () => {
	assert.deepEqual(fixture().event.workflowLocks, {
		scorecards: false,
		scores: false,
		eventResults: false,
		fantasyDrafts: false,
		substitutions: false
	});
});

test('registered actor identifiers cannot be modified', () => {
	assert.equal(Object.isFrozen(syntheticActorIds), true);

	assert.throws(() => {
		syntheticActorIds.owner = 'arbitrary-actor';
	}, TypeError);
});

for (const value of [
	null,
	undefined,
	42,
	{},
	'',
	'production',
	'real-event-id',
	'constructor',
	'__proto__',
	'groups_prepared'
]) {
	test(`rejects unsupported fixture: ${String(value)}`, () => {
		assert.equal(createSyntheticOperationState(value), null);
	});
}
