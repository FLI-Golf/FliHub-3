import type {
	SyntheticActor,
	SyntheticAthlete,
	SyntheticOperationState,
	SyntheticRosterMembership,
	SyntheticSeasonEntry,
	SyntheticTeam
} from './synthetic-state.ts';

const organizationId = 'synthetic-org-fli';
const outsideOrganizationId = 'synthetic-org-outside';
const leagueId = 'synthetic-league-01';
const seasonId = 'synthetic-season-01';

export const syntheticActorIds = Object.freeze({
	owner: 'synthetic-actor-owner',
	admin: 'synthetic-actor-admin',
	scorekeeper: 'synthetic-actor-scorekeeper',
	viewer: 'synthetic-actor-viewer',
	outsider: 'synthetic-actor-outsider',
	inactive: 'synthetic-actor-inactive'
} as const);

function numbered(prefix: string, number: number): string {
	return `synthetic-${prefix}-${String(number).padStart(2, '0')}`;
}

/**
 * Construct a fresh independent synthetic state.
 *
 * No external records, credentials, randomness,
 * persistent storage or network access.
 */
export function createSyntheticOperationState(fixtureId: unknown): SyntheticOperationState | null {
	if (fixtureId !== 'spring_invitational') {
		return null;
	}

	const teams: SyntheticTeam[] = [];
	const entries: SyntheticSeasonEntry[] = [];
	const athletes: SyntheticAthlete[] = [];
	const rosters: SyntheticRosterMembership[] = [];

	for (let number = 1; number <= 12; number++) {
		const teamId = numbered('team', number);
		const entryId = numbered('entry', number);

		teams.push({
			id: teamId,
			organizationId,
			name: `Synthetic Team ${number}`,
			status: 'active'
		});

		entries.push({
			id: entryId,
			organizationId,
			seasonId,
			teamId,
			status: 'active'
		});

		for (let member = 1; member <= 2; member++) {
			const athleteNumber = (number - 1) * 2 + member;
			const athleteId = numbered('athlete', athleteNumber);

			athletes.push({
				id: athleteId,
				organizationId,
				name: `Synthetic Athlete ${athleteNumber}`,
				status: 'active'
			});

			rosters.push({
				id: numbered('roster', athleteNumber),
				organizationId,
				entryId,
				athleteId,
				status: 'active'
			});
		}
	}

	const actors: SyntheticActor[] = [
		{
			id: syntheticActorIds.owner,
			organizationId,
			role: 'owner',
			status: 'active'
		},
		{
			id: syntheticActorIds.admin,
			organizationId,
			role: 'admin',
			status: 'active'
		},
		{
			id: syntheticActorIds.scorekeeper,
			organizationId,
			role: 'scorekeeper',
			status: 'active'
		},
		{
			id: syntheticActorIds.viewer,
			organizationId,
			role: 'viewer',
			status: 'active'
		},
		{
			id: syntheticActorIds.outsider,
			organizationId: outsideOrganizationId,
			role: 'owner',
			status: 'active'
		},
		{
			id: syntheticActorIds.inactive,
			organizationId,
			role: 'admin',
			status: 'inactive'
		}
	];

	return {
		source: 'synthetic',
		fixtureId,
		revision: 0,
		organizations: [
			{
				id: organizationId,
				name: 'Synthetic FLI Golf',
				capabilities: ['events', 'teams', 'athletes', 'leagues-seasons']
			},
			{
				id: outsideOrganizationId,
				name: 'Synthetic Outside Organization',
				capabilities: []
			}
		],
		actors,
		leagues: [
			{
				id: leagueId,
				organizationId,
				status: 'active'
			}
		],
		seasons: [
			{
				id: seasonId,
				organizationId,
				leagueId,
				status: 'planned'
			}
		],
		event: {
			id: 'synthetic-event-spring-invitational',
			organizationId,
			seasonId,
			name: 'Spring Invitational',
			activity: 'disc-golf',
			status: 'draft',
			dateAssigned: true,
			venueAssigned: true,
			scoringConfigured: false,
			workflowLocks: {
				scorecards: false,
				scores: false,
				eventResults: false,
				fantasyDrafts: false,
				substitutions: false
			}
		},
		teams,
		entries,
		athletes,
		rosters,
		groups: []
	};
}
