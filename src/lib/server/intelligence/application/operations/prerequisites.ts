import type {
	SyntheticOperationState,
	SyntheticOrganizationCapability
} from './synthetic-state.ts';

import { authorizeSyntheticOperation } from './authorization.ts';

import { validateApplicationOperationRequest } from './validation.ts';

const requiredCapabilities: readonly SyntheticOrganizationCapability[] = Object.freeze([
	'events',
	'teams',
	'athletes',
	'leagues-seasons'
]);

const workflowKeys = Object.freeze([
	'scorecards',
	'scores',
	'eventResults',
	'fantasyDrafts',
	'substitutions'
] as const);

export type SyntheticPrerequisiteReason =
	| 'invalid_request'
	| 'unknown_operation'
	| 'unsupported_fixture'
	| 'invalid_scope'
	| 'unauthorized_actor'
	| 'invalid_state'
	| 'missing_capabilities'
	| 'invalid_event'
	| 'invalid_season'
	| 'invalid_league'
	| 'existing_groups'
	| 'workflow_locked'
	| 'invalid_roster';

export interface EligibleSyntheticEntry {
	readonly entryId: string;
	readonly athleteIds: readonly string[];
}

export type SyntheticPrerequisiteOutcome =
	| {
			readonly status: 'eligible';
			readonly actorId: string;
			readonly organizationId: string;
			readonly eventId: string;
			readonly revision: number;
			readonly entries: readonly EligibleSyntheticEntry[];
	  }
	| {
			readonly status: 'rejected';
			readonly reason: SyntheticPrerequisiteReason;
	  };

function reject(reason: SyntheticPrerequisiteReason): SyntheticPrerequisiteOutcome {
	return { status: 'rejected', reason };
}

function uniqueIds(records: readonly { readonly id: string }[]): boolean {
	return (
		records.every(
			(record) =>
				typeof record.id === 'string' &&
				record.id.startsWith('synthetic-') &&
				record.id.length <= 128
		) && new Set(records.map((record) => record.id)).size === records.length
	);
}

/**
 * Validate the bounded Spring Invitational demonstration.
 *
 * This validates trusted local synthetic state, not arbitrary
 * serialized production records or caller-supplied authority.
 *
 * The fixed roster counts are demonstration constraints,
 * not general FliHub production grouping rules.
 */
export function checkSyntheticGroupPrerequisites(
	state: SyntheticOperationState,
	actorId: unknown,
	request: unknown
): SyntheticPrerequisiteOutcome {
	try {
		const validated = validateApplicationOperationRequest(request);

		if (validated.status !== 'recognized') {
			switch (validated.reason) {
				case 'unknown_operation':
				case 'unsupported_fixture':
					return reject(validated.reason);
				default:
					return reject('invalid_request');
			}
		}

		const authorization = authorizeSyntheticOperation(state, actorId);

		if (authorization.status !== 'authorized') {
			return reject(authorization.reason);
		}

		if (
			!Number.isSafeInteger(state.revision) ||
			state.revision < 0 ||
			state.fixtureId !== validated.request.fixtureId
		) {
			return reject('invalid_state');
		}

		const collections = [
			state.organizations,
			state.actors,
			state.leagues,
			state.seasons,
			state.teams,
			state.entries,
			state.athletes,
			state.rosters,
			state.groups
		];

		if (collections.some((records) => !Array.isArray(records) || records.length > 128)) {
			return reject('invalid_state');
		}

		if (!uniqueIds([...collections.flat(), state.event])) {
			return reject('invalid_state');
		}

		const organizationId = authorization.organizationId;

		const organization = state.organizations.find((item) => item.id === organizationId);

		if (
			!organization ||
			!Array.isArray(organization.capabilities) ||
			!requiredCapabilities.every((capability) => organization.capabilities.includes(capability))
		) {
			return reject('missing_capabilities');
		}

		if (
			state.event.activity !== 'disc-golf' ||
			state.event.status !== 'draft' ||
			state.event.dateAssigned !== true ||
			state.event.venueAssigned !== true ||
			state.event.scoringConfigured !== false
		) {
			return reject('invalid_event');
		}

		const domainCollections = [
			state.leagues,
			state.seasons,
			state.teams,
			state.entries,
			state.athletes,
			state.rosters,
			state.groups
		];

		if (
			domainCollections.some((records) =>
				records.some((record) => record.organizationId !== organizationId)
			)
		) {
			return reject('invalid_scope');
		}

		const season = state.seasons.find((item) => item.id === state.event.seasonId);

		if (!season || (season.status !== 'planned' && season.status !== 'active')) {
			return reject('invalid_season');
		}

		const league = state.leagues.find((item) => item.id === season.leagueId);

		if (!league || league.status !== 'active') {
			return reject('invalid_league');
		}

		if (state.groups.length !== 0) {
			return reject('existing_groups');
		}

		const locks = state.event.workflowLocks;

		if (
			!locks ||
			typeof locks !== 'object' ||
			Reflect.ownKeys(locks).length !== workflowKeys.length ||
			!workflowKeys.every((key) => Object.hasOwn(locks, key) && locks[key] === false)
		) {
			return reject('workflow_locked');
		}

		if (
			state.teams.length !== 12 ||
			state.entries.length !== 12 ||
			state.athletes.length !== 24 ||
			state.rosters.length !== 24
		) {
			return reject('invalid_roster');
		}

		if (
			state.teams.some((team) => team.status !== 'active') ||
			state.entries.some((entry) => entry.status !== 'active' || entry.seasonId !== season.id) ||
			state.athletes.some((athlete) => athlete.status !== 'active') ||
			state.rosters.some((row) => row.status !== 'active')
		) {
			return reject('invalid_roster');
		}

		const teamIds = new Set(state.teams.map((team) => team.id));

		const athleteIds = new Set(state.athletes.map((athlete) => athlete.id));

		const seenTeams = new Set<string>();
		const seenAthletes = new Set<string>();

		const entries: EligibleSyntheticEntry[] = [];

		for (const entry of state.entries) {
			if (!teamIds.has(entry.teamId) || seenTeams.has(entry.teamId)) {
				return reject('invalid_roster');
			}

			seenTeams.add(entry.teamId);

			const roster = state.rosters.filter((row) => row.entryId === entry.id);

			if (roster.length !== 2) {
				return reject('invalid_roster');
			}

			const members: string[] = [];

			for (const row of roster) {
				if (!athleteIds.has(row.athleteId) || seenAthletes.has(row.athleteId)) {
					return reject('invalid_roster');
				}

				seenAthletes.add(row.athleteId);
				members.push(row.athleteId);
			}

			entries.push({
				entryId: entry.id,
				athleteIds: members.sort()
			});
		}

		if (seenTeams.size !== teamIds.size || seenAthletes.size !== athleteIds.size) {
			return reject('invalid_roster');
		}

		entries.sort((left, right) =>
			left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0
		);

		return {
			status: 'eligible',
			actorId: authorization.actorId,
			organizationId,
			eventId: state.event.id,
			revision: state.revision,
			entries
		};
	} catch {
		return reject('invalid_state');
	}
}
