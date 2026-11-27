import { canonicalJson, canonicalSha256 } from './canonical.ts';

import { planSyntheticGroupAssignments } from './planner.ts';

import type { SyntheticGroupProposal, SyntheticGroupPlanningOutcome } from './planner.ts';

import type { SyntheticOperationState } from './synthetic-state.ts';

type PlanningFailureReason = Extract<
	SyntheticGroupPlanningOutcome,
	{ status: 'rejected' }
>['reason'];

export interface SyntheticExecutionPlanBody {
	readonly kind: 'synthetic-execution-plan';
	readonly version: 1;
	readonly scope: 'synthetic-only';
	readonly stateDigest: string;
	readonly proposal: SyntheticGroupProposal;
	readonly approvalRequired: true;
}

export interface SyntheticExecutionPlan {
	readonly body: SyntheticExecutionPlanBody;
	readonly digest: string;
}

export type SyntheticExecutionPlanOutcome =
	| {
			readonly status: 'prepared';
			readonly plan: SyntheticExecutionPlan;
	  }
	| {
			readonly status: 'rejected';
			readonly reason: PlanningFailureReason | 'invalid_plan';
	  };

export type SyntheticPlanValidationOutcome =
	| {
			readonly status: 'valid';
			readonly plan: SyntheticExecutionPlan;
	  }
	| {
			readonly status: 'rejected';
			readonly reason: 'invalid_plan' | 'stale_state' | PlanningFailureReason;
	  };

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
 * Create a canonical, immutable plan from the registered
 * deterministic planner and trusted local synthetic state.
 *
 * This does not grant approval or execution authority.
 */
export function prepareSyntheticExecutionPlan(
	state: SyntheticOperationState,
	actorId: unknown,
	request: unknown
): SyntheticExecutionPlanOutcome {
	try {
		const before = canonicalJson(state);

		const result = planSyntheticGroupAssignments(state, actorId, request);

		if (result.status !== 'proposed') {
			return result;
		}

		if (canonicalJson(state) !== before) {
			return {
				status: 'rejected',
				reason: 'invalid_plan'
			};
		}

		const body: SyntheticExecutionPlanBody = {
			kind: 'synthetic-execution-plan',
			version: 1,
			scope: 'synthetic-only',
			stateDigest: canonicalSha256(state),
			proposal: result.proposal,
			approvalRequired: true
		};

		const plan: SyntheticExecutionPlan = {
			body,
			digest: canonicalSha256(body)
		};

		return {
			status: 'prepared',
			plan: freezeDeep(plan)
		};
	} catch {
		return {
			status: 'rejected',
			reason: 'invalid_plan'
		};
	}
}

/**
 * Rebuild the expected plan from current trusted state.
 *
 * A caller cannot make an arbitrary plan valid merely
 * by calculating a new digest for it.
 *
 * Validation is not approval.
 */
export function validateSyntheticExecutionPlan(
	state: SyntheticOperationState,
	actorId: unknown,
	candidate: unknown
): SyntheticPlanValidationOutcome {
	try {
		const serialized = canonicalJson(candidate);

		const input = JSON.parse(serialized);

		if (
			!input ||
			typeof input !== 'object' ||
			!input.body ||
			typeof input.digest !== 'string' ||
			!/^[a-f0-9]{64}$/.test(input.digest) ||
			canonicalSha256(input.body) !== input.digest
		) {
			return {
				status: 'rejected',
				reason: 'invalid_plan'
			};
		}

		if (input.body.stateDigest !== canonicalSha256(state)) {
			return {
				status: 'rejected',
				reason: 'stale_state'
			};
		}

		const expected = prepareSyntheticExecutionPlan(state, actorId, {
			operationId: 'create_synthetic_group_assignments',
			fixtureId: 'spring_invitational'
		});

		if (expected.status !== 'prepared') {
			return expected;
		}

		if (canonicalJson(expected.plan) !== serialized) {
			return {
				status: 'rejected',
				reason: 'invalid_plan'
			};
		}

		return {
			status: 'valid',
			plan: expected.plan
		};
	} catch {
		return {
			status: 'rejected',
			reason: 'invalid_plan'
		};
	}
}
