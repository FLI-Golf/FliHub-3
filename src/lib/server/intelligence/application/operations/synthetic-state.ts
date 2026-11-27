/**
 * Disposable synthetic operation state.
 *
 * These contracts are not persistent application records.
 * Synthetic identities confer no real application permissions.
 */

export type SyntheticActorRole = 'owner' | 'admin' | 'scorekeeper' | 'viewer';

export type SyntheticRecordStatus = 'active' | 'inactive';

export type SyntheticEventStatus = 'draft' | 'active' | 'completed' | 'archived';

export type SyntheticOrganizationCapability = 'events' | 'teams' | 'athletes' | 'leagues-seasons';

export interface SyntheticOrganization {
	readonly id: string;
	readonly name: string;
	readonly capabilities: readonly SyntheticOrganizationCapability[];
}

export interface SyntheticActor {
	readonly id: string;
	readonly organizationId: string;
	readonly role: SyntheticActorRole;
	readonly status: SyntheticRecordStatus;
}

export interface SyntheticLeague {
	readonly id: string;
	readonly organizationId: string;
	readonly status: SyntheticRecordStatus;
}

export interface SyntheticSeason {
	readonly id: string;
	readonly organizationId: string;
	readonly leagueId: string;
	readonly status: 'planned' | 'active' | 'archived';
}

export interface SyntheticWorkflowLocks {
	readonly scorecards: boolean;
	readonly scores: boolean;
	readonly eventResults: boolean;
	readonly fantasyDrafts: boolean;
	readonly substitutions: boolean;
}

export interface SyntheticEvent {
	readonly id: string;
	readonly organizationId: string;
	readonly seasonId: string;
	readonly name: string;
	readonly activity: 'disc-golf';
	readonly status: SyntheticEventStatus;
	readonly dateAssigned: boolean;
	readonly venueAssigned: boolean;
	readonly scoringConfigured: boolean;
	readonly workflowLocks: SyntheticWorkflowLocks;
}

export interface SyntheticTeam {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly status: SyntheticRecordStatus;
}

export interface SyntheticSeasonEntry {
	readonly id: string;
	readonly organizationId: string;
	readonly seasonId: string;
	readonly teamId: string;
	readonly status: SyntheticRecordStatus;
}

export interface SyntheticAthlete {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly status: SyntheticRecordStatus;
}

export interface SyntheticRosterMembership {
	readonly id: string;
	readonly organizationId: string;
	readonly entryId: string;
	readonly athleteId: string;
	readonly status: SyntheticRecordStatus;
}

export interface SyntheticGroupEntry {
	readonly entryId: string;
	readonly athleteIds: readonly string[];
}

export interface SyntheticGroup {
	readonly id: string;
	readonly organizationId: string;
	readonly eventId: string;
	readonly name: string;
	readonly entries: readonly SyntheticGroupEntry[];
}

export interface SyntheticOperationState {
	readonly source: 'synthetic';
	readonly fixtureId: 'spring_invitational';
	readonly revision: number;
	readonly organizations: readonly SyntheticOrganization[];
	readonly actors: readonly SyntheticActor[];
	readonly leagues: readonly SyntheticLeague[];
	readonly seasons: readonly SyntheticSeason[];
	readonly event: SyntheticEvent;
	readonly teams: readonly SyntheticTeam[];
	readonly entries: readonly SyntheticSeasonEntry[];
	readonly athletes: readonly SyntheticAthlete[];
	readonly rosters: readonly SyntheticRosterMembership[];
	readonly groups: readonly SyntheticGroup[];
}
