import { canonicalJson, canonicalSha256 } from './canonical.ts';

import type { SyntheticExecutionPlan } from './execution-plan.ts';

import type { SyntheticOperationState } from './synthetic-state.ts';

export type SyntheticVerificationReason =
	| 'invalid_plan'
	| 'original_state_mismatch'
	| 'invalid_revision'
	| 'unexpected_state_change'
	| 'invalid_groups'
	| 'invalid_scope'
	| 'invalid_roster'
	| 'assignment_mismatch'
	| 'verification_failed';

export type SyntheticVerificationOutcome =
	| {
			readonly status: 'verified';
			readonly operationId: 'create_synthetic_group_assignments';
			readonly planDigest: string;
			readonly originalStateDigest: string;
			readonly candidateStateDigest: string;
			readonly revisionBefore: number;
			readonly revisionAfter: number;
			readonly groupsCreated: number;
			readonly teamsAssigned: number;
			readonly athletesAssigned: number;
			readonly publication: 'not-permitted';
	  }
	| {
			readonly status: 'rejected';
			readonly reason: SyntheticVerificationReason;
	  };

function reject(reason: SyntheticVerificationReason): SyntheticVerificationOutcome {
	return {
		status: 'rejected',
		reason
	};
}

function equal(first: unknown, second: unknown): boolean {
	return canonicalJson(first) === canonicalJson(second);
}

function unique(values: readonly string[]): boolean {
	return new Set(values).size === values.length;
}

/**
 * Independent postcondition verification.
 *
 * Inputs originate from the protected local execution
 * boundary. This function does not grant approval,
 * authenticate an actor or publish application state.
 *
 * It does not invoke the planner or operation handler.
 */
export function verifySyntheticOperationCandidate(
	originalInput: SyntheticOperationState,
	planInput: SyntheticExecutionPlan,
	candidateInput: unknown
): SyntheticVerificationOutcome {
	try {
		// Canonical snapshots reject unsupported values,
		// accessors, proxies and malformed object structures.
		const original = JSON.parse(canonicalJson(originalInput)) as SyntheticOperationState;

		const plan = JSON.parse(canonicalJson(planInput)) as SyntheticExecutionPlan;

		const candidate = JSON.parse(canonicalJson(candidateInput)) as SyntheticOperationState;

		const originalStateDigest = canonicalSha256(original);

		if (
			!plan ||
			!plan.body ||
			!plan.body.proposal ||
			plan.body.kind !== 'synthetic-execution-plan' ||
			plan.body.version !== 1 ||
			plan.body.scope !== 'synthetic-only' ||
			plan.body.approvalRequired !== true ||
			plan.digest !== canonicalSha256(plan.body)
		) {
			return reject('invalid_plan');
		}

		const proposal = plan.body.proposal;

		if (
			proposal.kind !== 'synthetic-group-proposal' ||
			proposal.operationId !== 'create_synthetic_group_assignments' ||
			proposal.fixtureId !== 'spring_invitational' ||
			proposal.approvalRequired !== true ||
			proposal.algorithm !== 'team-pairing-v1' ||
			proposal.execution !== 'requires-approval'
		) {
			return reject('invalid_plan');
		}

		if (
			plan.body.stateDigest !== originalStateDigest ||
			proposal.stateRevision !== original.revision
		) {
			return reject('original_state_mismatch');
		}

		if (
			original.source !== 'synthetic' ||
			original.fixtureId !== 'spring_invitational' ||
			candidate.source !== 'synthetic' ||
			candidate.fixtureId !== original.fixtureId ||
			proposal.organizationId !== original.event.organizationId ||
			proposal.eventId !== original.event.id
		) {
			return reject('invalid_scope');
		}

		if (
			!Number.isSafeInteger(original.revision) ||
			original.revision < 0 ||
			original.revision >= Number.MAX_SAFE_INTEGER ||
			candidate.revision !== original.revision + 1
		) {
			return reject('invalid_revision');
		}

		if (
			!Array.isArray(original.groups) ||
			original.groups.length !== 0 ||
			!Array.isArray(candidate.groups) ||
			candidate.groups.length !== 6
		) {
			return reject('invalid_groups');
		}

		// Only groups and revision may change.
		const restored = {
			...candidate,
			revision: original.revision,
			groups: original.groups
		};

		if (!equal(restored, original)) {
			return reject('unexpected_state_change');
		}

		if (
			original.event.status !== 'draft' ||
			original.event.activity !== 'disc-golf' ||
			original.event.dateAssigned !== true ||
			original.event.venueAssigned !== true ||
			original.event.scoringConfigured !== false ||
			!equal(original.event.workflowLocks, {
				scorecards: false,
				scores: false,
				eventResults: false,
				fantasyDrafts: false,
				substitutions: false
			})
		) {
			return reject('invalid_scope');
		}

		const organizationId = original.event.organizationId;

		const organization = original.organizations.find((row) => row.id === organizationId);

		const actor = original.actors.find((row) => row.id === proposal.actorId);

		const season = original.seasons.find((row) => row.id === original.event.seasonId);

		const league = original.leagues.find((row) => row.id === season?.leagueId);

		if (
			!organization ||
			!actor ||
			actor.organizationId !== organizationId ||
			actor.status !== 'active' ||
			!['owner', 'admin'].includes(actor.role) ||
			!season ||
			season.organizationId !== organizationId ||
			!['planned', 'active'].includes(season.status) ||
			!league ||
			league.organizationId !== organizationId ||
			league.status !== 'active'
		) {
			return reject('invalid_scope');
		}

		if (
			!['events', 'teams', 'athletes', 'leagues-seasons'].every((capability) =>
				organization.capabilities.some((value) => value === capability)
			)
		) {
			return reject('invalid_scope');
		}

		if (
			original.entries.length !== 12 ||
			original.teams.length !== 12 ||
			original.athletes.length !== 24 ||
			original.rosters.length !== 24
		) {
			return reject('invalid_roster');
		}

		const existingIds = [
			original.event.id,
			...original.organizations.map((row) => row.id),
			...original.actors.map((row) => row.id),
			...original.leagues.map((row) => row.id),
			...original.seasons.map((row) => row.id),
			...original.entries.map((row) => row.id),
			...original.teams.map((row) => row.id),
			...original.athletes.map((row) => row.id),
			...original.rosters.map((row) => row.id)
		];

		if (
			!unique(existingIds) ||
			existingIds.some(
				(id) => typeof id !== 'string' || !id.startsWith('synthetic-') || id.length > 128
			)
		) {
			return reject('invalid_roster');
		}

		const entryIds: string[] = [];
		const teamIds: string[] = [];
		const athleteIds: string[] = [];
		const groupIds: string[] = [];
		const groupNames: string[] = [];

		for (const group of candidate.groups) {
			if (
				typeof group.id !== 'string' ||
				!group.id.startsWith('synthetic-group-') ||
				group.id.length > 128 ||
				typeof group.name !== 'string' ||
				group.name.length === 0 ||
				group.name.length > 128 ||
				existingIds.includes(group.id) ||
				!Array.isArray(group.entries) ||
				group.entries.length !== 2
			) {
				return reject('invalid_groups');
			}

			if (group.organizationId !== organizationId || group.eventId !== original.event.id) {
				return reject('invalid_scope');
			}

			groupIds.push(group.id);
			groupNames.push(group.name);

			for (const assignment of group.entries) {
				const entry = original.entries.find((row) => row.id === assignment.entryId);

				if (
					!entry ||
					entry.status !== 'active' ||
					entry.organizationId !== organizationId ||
					entry.seasonId !== original.event.seasonId
				) {
					return reject('invalid_roster');
				}

				const team = original.teams.find((row) => row.id === entry.teamId);

				if (!team || team.status !== 'active' || team.organizationId !== organizationId) {
					return reject('invalid_roster');
				}

				const roster = original.rosters.filter((row) => row.entryId === entry.id);

				if (
					roster.length !== 2 ||
					roster.some((row) => row.status !== 'active' || row.organizationId !== organizationId) ||
					!Array.isArray(assignment.athleteIds) ||
					assignment.athleteIds.length !== 2 ||
					!unique(assignment.athleteIds)
				) {
					return reject('invalid_roster');
				}

				const expectedAthletes = roster.map((row) => row.athleteId).sort();

				if (!equal([...assignment.athleteIds].sort(), expectedAthletes)) {
					return reject('invalid_roster');
				}

				for (const athleteId of assignment.athleteIds) {
					const athlete = original.athletes.find((row) => row.id === athleteId);

					if (
						!athlete ||
						athlete.status !== 'active' ||
						athlete.organizationId !== organizationId
					) {
						return reject('invalid_roster');
					}

					athleteIds.push(athleteId);
				}

				entryIds.push(entry.id);
				teamIds.push(team.id);
			}
		}

		if (!unique(groupIds) || !unique(groupNames)) {
			return reject('invalid_groups');
		}

		if (
			entryIds.length !== 12 ||
			teamIds.length !== 12 ||
			athleteIds.length !== 24 ||
			!unique(entryIds) ||
			!unique(teamIds) ||
			!unique(athleteIds) ||
			!equal([...entryIds].sort(), original.entries.map((row) => row.id).sort()) ||
			!equal([...teamIds].sort(), original.teams.map((row) => row.id).sort()) ||
			!equal([...athleteIds].sort(), original.athletes.map((row) => row.id).sort())
		) {
			return reject('invalid_roster');
		}

		// Structural validity is not sufficient:
		// the candidate must match the exact approved plan.
		if (!equal(candidate.groups, proposal.groups)) {
			return reject('assignment_mismatch');
		}

		if (
			!equal(proposal.summary, {
				groupsBefore: 0,
				groupsAfter: 6,
				teamsAssigned: 12,
				athletesAssigned: 24
			})
		) {
			return reject('invalid_plan');
		}

		return Object.freeze({
			status: 'verified',
			operationId: proposal.operationId,
			planDigest: plan.digest,
			originalStateDigest,
			candidateStateDigest: canonicalSha256(candidate),
			revisionBefore: original.revision,
			revisionAfter: candidate.revision,
			groupsCreated: groupIds.length,
			teamsAssigned: teamIds.length,
			athletesAssigned: athleteIds.length,
			publication: 'not-permitted'
		});
	} catch {
		return reject('verification_failed');
	}
}
