import {
	createSyntheticApprovalSession,
	type SyntheticApprovalSession,
	type SyntheticPublicationOutcome
} from './approval.ts';

import { validateSyntheticExecutionPlan } from './execution-plan.ts';
import { authorizeSyntheticOperation } from './authorization.ts';
import { getApplicationOperation } from './registry.ts';

import type { SyntheticExecutionPlan } from './execution-plan.ts';

function freezeDeep<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		for (const child of Object.values(value)) {
			freezeDeep(child);
		}

		Object.freeze(value);
	}

	return value;
}

/**
 * Construct a presentation-safe exact review from a
 * server-owned operation session and its prepared plan.
 *
 * No provider calls, approval, execution or persistent writes.
 */
function projectReview(session: SyntheticApprovalSession, plan: SyntheticExecutionPlan) {
	const identity = session.getReview();
	const state = session.getState();
	const proposal = plan.body.proposal;

	if (
		session.getStatus() !== 'review' ||
		!identity ||
		identity.sessionId !== session.sessionId ||
		identity.planDigest !== plan.digest ||
		session.getApproval() !== null
	) {
		throw new Error('Review unavailable');
	}

	const validation = validateSyntheticExecutionPlan(state, proposal.actorId, plan);

	const authorization = authorizeSyntheticOperation(state, proposal.actorId);

	const operation = getApplicationOperation(proposal.operationId);

	if (
		validation.status !== 'valid' ||
		authorization.status !== 'authorized' ||
		!operation ||
		operation.scope !== 'synthetic-only'
	) {
		throw new Error('Review unavailable');
	}

	const organization = state.organizations.find((row) => row.id === proposal.organizationId);

	if (!organization || state.event.id !== proposal.eventId) {
		throw new Error('Review unavailable');
	}

	const groups = proposal.groups.map((group) => ({
		id: group.id,
		name: group.name,
		teams: group.entries.map((assignment) => {
			const entry = state.entries.find((row) => row.id === assignment.entryId);

			const team = state.teams.find((row) => row.id === entry?.teamId);

			if (!entry || !team) {
				throw new Error('Review unavailable');
			}

			const athletes = assignment.athleteIds.map((id) => {
				const athlete = state.athletes.find((row) => row.id === id);

				if (!athlete) {
					throw new Error('Review unavailable');
				}

				return {
					id: athlete.id,
					name: athlete.name
				};
			});

			return {
				entryId: entry.id,
				teamId: team.id,
				name: team.name,
				athletes
			};
		})
	}));

	return freezeDeep({
		kind: 'exact-operation-review',
		version: 1,
		reviewId: identity.reviewId,
		planDigest: identity.planDigest,
		scope: 'synthetic-only',
		source: 'synthetic',
		operation: {
			id: operation.id,
			label: operation.label,
			description: operation.description,
			effect: operation.effect
		},
		organization: {
			id: organization.id,
			name: organization.name
		},
		event: {
			id: state.event.id,
			name: state.event.name
		},
		operator: {
			id: authorization.actorId,
			role: authorization.role,
			simulated: true
		},
		stateRevision: state.revision,
		summary: {
			...proposal.summary
		},
		groups,
		boundaries: {
			approvalRequired: true,
			approvalGranted: false,
			execution: 'disabled',
			persistentMutation: false,
			externalProviderAccess: false,
			unchanged: [
				'Organizations',
				'Leagues and seasons',
				'Teams and rosters',
				'Athlete records',
				'Event configuration',
				'Scorecards and scores',
				'Published results',
				'Fantasy drafts',
				'Substitutions'
			]
		}
	} as const);
}

export type ExactOperationReview = ReturnType<typeof projectReview>;

export const failedExecution = Object.freeze({ status: 'failed' } as const);

export type ProtectedExecutionOutcome =
	typeof failedExecution | Extract<SyntheticPublicationOutcome, { status: 'published' }>;

export function projectExecutionOutcome(outcome: ProtectedExecutionOutcome) {
	if (outcome.status === 'failed') return outcome;

	return Object.freeze({
		status: 'published',
		revisionBefore: outcome.revisionBefore,
		revisionAfter: outcome.revisionAfter,
		groupsCreated: outcome.groupsCreated,
		teamsAssigned: outcome.teamsAssigned,
		athletesAssigned: outcome.athletesAssigned,
		verification: 'passed',
		persistentMutation: false,
		paidProviderRequests: 0,
		paidProviderCost: 0
	} as const);
}

/** Keep the original review-only handle free of execution authority. */
export function prepareExactOperationReview(
	fixtureId: unknown,
	actorId: unknown,
	operationId: unknown
) {
	const result = prepareProtectedOperationReview(fixtureId, actorId, operationId);
	return result.status === 'prepared'
		? ({ status: 'prepared', handle: result.handle } as const)
		: result;
}

/** Prepare a review and a separate execution capability for the protected workspace. */
export function prepareProtectedOperationReview(
	fixtureId: unknown,
	actorId: unknown,
	operationId: unknown
) {
	const operation = getApplicationOperation(operationId);

	if (!operation) {
		return {
			status: 'rejected',
			reason: 'unknown_operation'
		} as const;
	}

	const created = createSyntheticApprovalSession(fixtureId, actorId);

	if (created.status !== 'created') {
		return created;
	}

	const session = created.session;

	try {
		const prepared = session.prepare({
			operationId: operation.id,
			fixtureId
		});

		if (prepared.status !== 'prepared') {
			session.cancel();
			return prepared;
		}

		const review = projectReview(session, prepared.plan);

		const identity = session.getReview();
		if (!identity) throw new Error('Review unavailable');

		return {
			status: 'prepared',
			execute(): ProtectedExecutionOutcome {
				const approval = session.approve({ action: 'approve-exact-plan', ...identity });
				if (approval.status !== 'approved') return failedExecution;

				const result = session.executeAndPublishApprovedOperation(approval.receipt);
				// Preserve the engine's committed result before shaping any response.
				return result.status === 'published' ? result : failedExecution;
			},
			handle: Object.freeze({
				read(): ExactOperationReview | null {
					if (session.getStatus() !== 'review') {
						return null;
					}

					return review;
				},

				cancel(): void {
					session.cancel();
				}
			})
		} as const;
	} catch {
		session.cancel();

		return {
			status: 'rejected',
			reason: 'operation_unavailable'
		} as const;
	}
}
