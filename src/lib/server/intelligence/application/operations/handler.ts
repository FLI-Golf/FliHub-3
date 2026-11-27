import { canonicalSha256 } from './canonical.ts';

import { validateSyntheticExecutionPlan } from './execution-plan.ts';

import type { SyntheticExecutionPlan } from './execution-plan.ts';

import type { SyntheticOperationState } from './synthetic-state.ts';

import type { ApplicationOperationId } from './contracts.ts';

export type SyntheticCandidateOutcome =
	| {
			readonly status: 'candidate_prepared';
			readonly operationId: ApplicationOperationId;
			readonly planDigest: string;
			readonly originalStateDigest: string;
			readonly candidate: SyntheticOperationState;
			readonly publication: 'not-permitted';
			readonly verification: 'pending';
	  }
	| {
			readonly status: 'rejected';
			readonly reason:
				'invalid_plan' | 'stale_state' | 'operation_unavailable' | 'execution_failed';
	  };

type CandidateHandler = (
	state: SyntheticOperationState,
	plan: SyntheticExecutionPlan
) => SyntheticOperationState;

/**
 * Construct a disposable candidate only.
 *
 * This handler cannot publish state or grant approval.
 * It has no persistent application dependencies.
 */
function createSyntheticGroups(
	state: SyntheticOperationState,
	plan: SyntheticExecutionPlan
): SyntheticOperationState {
	if (state.groups.length !== 0 || state.revision >= Number.MAX_SAFE_INTEGER) {
		throw new Error('Invalid candidate prerequisites');
	}

	const copy = structuredClone(state);

	return {
		...copy,
		revision: state.revision + 1,
		groups: structuredClone(plan.body.proposal.groups)
	};
}

const handlers = Object.freeze({
	create_synthetic_group_assignments: createSyntheticGroups
} satisfies Record<ApplicationOperationId, CandidateHandler>);

/**
 * Internal candidate construction primitive.
 *
 * Trusted local synthetic state only.
 * Plan validation is not approval authorization.
 *
 * The protected session must independently authorize
 * and consume approval before invoking this primitive.
 *
 * Returned candidates are unverified disposable data.
 * They must never be published without independent
 * verification.
 */
export function prepareSyntheticOperationCandidate(
	state: SyntheticOperationState,
	actorId: unknown,
	candidatePlan: unknown
): SyntheticCandidateOutcome {
	try {
		const originalStateDigest = canonicalSha256(state);

		const validation = validateSyntheticExecutionPlan(state, actorId, candidatePlan);

		if (validation.status !== 'valid') {
			return {
				status: 'rejected',
				reason: validation.reason === 'stale_state' ? 'stale_state' : 'invalid_plan'
			};
		}

		const plan = validation.plan;

		const operationId = plan.body.proposal.operationId;

		if (!Object.hasOwn(handlers, operationId)) {
			return {
				status: 'rejected',
				reason: 'operation_unavailable'
			};
		}

		const handler = handlers[operationId];

		const candidate = handler(state, plan);

		if (canonicalSha256(state) !== originalStateDigest) {
			return {
				status: 'rejected',
				reason: 'execution_failed'
			};
		}

		return {
			status: 'candidate_prepared',
			operationId,
			planDigest: plan.digest,
			originalStateDigest,
			candidate,
			publication: 'not-permitted',
			verification: 'pending'
		};
	} catch {
		return {
			status: 'rejected',
			reason: 'execution_failed'
		};
	}
}
