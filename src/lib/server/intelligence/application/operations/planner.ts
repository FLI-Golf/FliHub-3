import { shuffled } from '../../../../event-setup/shuffle.ts';

import type { SyntheticGroup, SyntheticOperationState } from './synthetic-state.ts';

import { checkSyntheticGroupPrerequisites } from './prerequisites.ts';

import type { SyntheticPrerequisiteReason } from './prerequisites.ts';

export interface SyntheticGroupProposal {
	readonly kind: 'synthetic-group-proposal';
	readonly operationId: 'create_synthetic_group_assignments';
	readonly fixtureId: 'spring_invitational';
	readonly actorId: string;
	readonly organizationId: string;
	readonly eventId: string;
	readonly stateRevision: number;
	readonly algorithm: 'team-pairing-v1';
	readonly groups: readonly SyntheticGroup[];
	readonly summary: {
		readonly groupsBefore: 0;
		readonly groupsAfter: number;
		readonly teamsAssigned: number;
		readonly athletesAssigned: number;
	};
	readonly approvalRequired: true;
	readonly execution: 'not-implemented';
}

export type SyntheticGroupPlanningOutcome =
	| {
			readonly status: 'proposed';
			readonly proposal: SyntheticGroupProposal;
	  }
	| {
			readonly status: 'rejected';
			readonly reason: SyntheticPrerequisiteReason | 'planning_failed';
	  };

/**
 * Stable non-cryptographic seed for reproducible
 * synthetic group ordering.
 *
 * This is not an approval digest or security token.
 */
function stableSeed(value: string): number {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index++) {
		hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	}

	return hash >>> 0;
}

/**
 * Deterministic random source for the existing
 * Fisher-Yates shuffle utility.
 *
 * Not suitable for security-sensitive randomness.
 */
function seededRandom(seed: number): () => number {
	let current = seed >>> 0;

	return () => {
		current = (Math.imul(current, 1664525) + 1013904223) >>> 0;

		return current / 4294967296;
	};
}

/**
 * Construct a bounded group proposal from trusted
 * locally owned synthetic state.
 *
 * Planning does not grant execution authority,
 * mutate state, or invoke persistent services.
 */
export function planSyntheticGroupAssignments(
	state: SyntheticOperationState,
	actorId: unknown,
	request: unknown
): SyntheticGroupPlanningOutcome {
	try {
		const eligible = checkSyntheticGroupPrerequisites(state, actorId, request);

		if (eligible.status !== 'eligible') {
			return {
				status: 'rejected',
				reason: eligible.reason
			};
		}

		const seed = stableSeed(
			JSON.stringify([
				'team-pairing-v1',
				state.fixtureId,
				eligible.organizationId,
				eligible.eventId,
				eligible.revision,
				eligible.entries
			])
		);

		const ordered = shuffled([...eligible.entries], seededRandom(seed));

		const groups: SyntheticGroup[] = [];

		for (let offset = 0; offset < ordered.length; offset += 2) {
			const number = groups.length + 1;

			const groupId = `synthetic-group-${String(number).padStart(2, '0')}`;

			groups.push({
				id: groupId,
				organizationId: eligible.organizationId,
				eventId: eligible.eventId,
				name: `Group ${number}`,
				entries: ordered.slice(offset, offset + 2).map((entry) => ({
					entryId: entry.entryId,
					athleteIds: [...entry.athleteIds]
				}))
			});
		}

		const entries = groups.flatMap((group) => group.entries);

		const athletes = entries.flatMap((entry) => entry.athleteIds);

		const existingIds = new Set([
			...state.organizations.map((row) => row.id),
			...state.actors.map((row) => row.id),
			...state.leagues.map((row) => row.id),
			...state.seasons.map((row) => row.id),
			...state.teams.map((row) => row.id),
			...state.entries.map((row) => row.id),
			...state.athletes.map((row) => row.id),
			...state.rosters.map((row) => row.id),
			state.event.id
		]);

		if (
			groups.length !== 6 ||
			groups.some((group) => group.entries.length !== 2 || existingIds.has(group.id)) ||
			entries.length !== 12 ||
			new Set(entries.map((entry) => entry.entryId)).size !== 12 ||
			entries.some((entry) => entry.athleteIds.length !== 2) ||
			athletes.length !== 24 ||
			new Set(athletes).size !== 24
		) {
			return {
				status: 'rejected',
				reason: 'planning_failed'
			};
		}

		return {
			status: 'proposed',
			proposal: {
				kind: 'synthetic-group-proposal',
				operationId: 'create_synthetic_group_assignments',
				fixtureId: 'spring_invitational',
				actorId: eligible.actorId,
				organizationId: eligible.organizationId,
				eventId: eligible.eventId,
				stateRevision: eligible.revision,
				algorithm: 'team-pairing-v1',
				groups,
				summary: {
					groupsBefore: 0,
					groupsAfter: groups.length,
					teamsAssigned: entries.length,
					athletesAssigned: athletes.length
				},
				approvalRequired: true,
				execution: 'not-implemented'
			}
		};
	} catch {
		return {
			status: 'rejected',
			reason: 'planning_failed'
		};
	}
}
