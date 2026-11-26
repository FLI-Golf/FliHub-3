import { createSyntheticApprovalSession, type SyntheticApprovalSession } from './approval.ts';

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

/**
 * Review-only facade over the existing deterministic
 * operation engine.
 *
 * The underlying operation session remains private.
 * No approval or execution methods are exposed.
 *
 * Workspace ownership and expiration are enforced by
 * the protected workspace integration.
 */
export function prepareExactOperationReview(
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

		return {
			status: 'prepared',
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
