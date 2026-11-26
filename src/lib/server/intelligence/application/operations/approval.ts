import { randomUUID } from 'node:crypto';
import { types } from 'node:util';

import { canonicalJson } from './canonical.ts';

import { prepareSyntheticOperationCandidate } from './handler.ts';

import type { SyntheticCandidateOutcome } from './handler.ts';

import { createSyntheticOperationState } from './fixtures.ts';

import { authorizeSyntheticOperation } from './authorization.ts';

import { prepareSyntheticExecutionPlan, validateSyntheticExecutionPlan } from './execution-plan.ts';

import type { SyntheticExecutionPlan, SyntheticExecutionPlanOutcome } from './execution-plan.ts';

import type { SyntheticOperationState } from './synthetic-state.ts';

export interface SyntheticApprovalReceipt {
	readonly kind: 'synthetic-approval-receipt';
	readonly approvalId: string;
	readonly sessionId: string;
	readonly planDigest: string;
	readonly stateDigest: string;
	readonly stateRevision: number;
	readonly actorId: string;
	readonly organizationId: string;
	readonly eventId: string;
	readonly operationId: 'create_synthetic_group_assignments';
	readonly scope: 'synthetic-only';
}

export type SyntheticApprovalOutcome =
	| {
			readonly status: 'approved';
			readonly receipt: SyntheticApprovalReceipt;
	  }
	| {
			readonly status: 'rejected';
			readonly reason:
				| 'invalid_confirmation'
				| 'plan_required'
				| 'invalid_plan'
				| 'already_approved'
				| 'session_closed';
	  };

export type SyntheticApprovalSessionStatus =
	'open' | 'review' | 'approved' | 'cancelled' | 'consumed';

export type SyntheticApprovalConsumptionOutcome =
	| {
			readonly status: 'consumed';
			readonly planDigest: string;
			readonly execution: 'not-implemented';
	  }
	| {
			readonly status: 'rejected';
			readonly reason:
				'approval_required' | 'invalid_approval' | 'replay_detected' | 'session_closed';
	  };

export type SyntheticAuthorizedExecutionOutcome =
	| Extract<SyntheticCandidateOutcome, { status: 'candidate_prepared' }>
	| {
			readonly status: 'rejected';
			readonly reason:
				| 'approval_required'
				| 'invalid_approval'
				| 'replay_detected'
				| 'session_closed'
				| 'invalid_plan'
				| 'stale_state'
				| 'operation_unavailable'
				| 'execution_failed';
	  };

export interface SyntheticApprovalSession {
	readonly sessionId: string;

	prepare(request: unknown): SyntheticExecutionPlanOutcome;

	approve(confirmation: unknown): SyntheticApprovalOutcome;

	consumeApproval(receipt: unknown): SyntheticApprovalConsumptionOutcome;

	executeApprovedOperation(receipt: unknown): SyntheticAuthorizedExecutionOutcome;

	getStatus(): SyntheticApprovalSessionStatus;

	getState(): SyntheticOperationState;

	getApproval(): SyntheticApprovalReceipt | null;

	cancel(): void;
}

export type SyntheticApprovalSessionOutcome =
	| {
			readonly status: 'created';
			readonly session: SyntheticApprovalSession;
	  }
	| {
			readonly status: 'rejected';
			readonly reason: 'unsupported_fixture' | 'unauthorized_actor' | 'operation_unavailable';
	  };

function readConfirmation(input: unknown): string | null {
	try {
		if (input === null || typeof input !== 'object' || Array.isArray(input)) {
			return null;
		}

		if (types.isProxy(input)) {
			return null;
		}

		const prototype = Object.getPrototypeOf(input);

		if (prototype !== Object.prototype && prototype !== null) {
			return null;
		}

		const descriptors = Object.getOwnPropertyDescriptors(input);

		const keys = Reflect.ownKeys(descriptors);

		if (
			keys.length !== 2 ||
			!Object.hasOwn(descriptors, 'action') ||
			!Object.hasOwn(descriptors, 'planDigest')
		) {
			return null;
		}

		const action = descriptors.action;
		const digest = descriptors.planDigest;

		if (
			!Object.hasOwn(action, 'value') ||
			!Object.hasOwn(digest, 'value') ||
			!action.enumerable ||
			!digest.enumerable ||
			action.value !== 'approve-exact-plan' ||
			typeof digest.value !== 'string' ||
			!/^[a-f0-9]{64}$/.test(digest.value)
		) {
			return null;
		}

		return digest.value;
	} catch {
		return null;
	}
}

/**
 * Create a disposable local operator session.
 *
 * Actor selection is simulated, not authenticated
 * production identity.
 *
 * State, reviewed plan and approval authority remain
 * private to this closure.
 *
 * Returned approval receipts are informational copies,
 * not bearer credentials or execution authorization.
 *
 * No persistent state or candidate publication is exposed.
 */
export function createSyntheticApprovalSession(
	fixtureId: unknown,
	actorId: unknown
): SyntheticApprovalSessionOutcome {
	try {
		const state = createSyntheticOperationState(fixtureId);

		if (!state) {
			return {
				status: 'rejected',
				reason: 'unsupported_fixture'
			};
		}

		const authorization = authorizeSyntheticOperation(state, actorId);

		if (authorization.status !== 'authorized') {
			return {
				status: 'rejected',
				reason: 'unauthorized_actor'
			};
		}

		const registeredActorId = authorization.actorId;

		const sessionId = randomUUID();

		let status: SyntheticApprovalSessionStatus = 'open';

		let reviewedPlan: SyntheticExecutionPlan | null = null;

		let approval: SyntheticApprovalReceipt | null = null;

		const session: SyntheticApprovalSession = {
			sessionId,

			prepare(request) {
				if (types.isProxy(request)) {
					return {
						status: 'rejected',
						reason: 'invalid_request'
					};
				}
				if (status === 'cancelled' || status === 'approved' || status === 'consumed') {
					return {
						status: 'rejected',
						reason: 'invalid_plan'
					};
				}

				// Any new preparation invalidates the old review,
				// including an unsuccessful preparation attempt.
				reviewedPlan = null;
				status = 'open';

				const result = prepareSyntheticExecutionPlan(state, registeredActorId, request);

				if (result.status === 'prepared') {
					reviewedPlan = result.plan;
					status = 'review';
				}

				return result;
			},

			approve(confirmation) {
				if (status === 'consumed') {
					return {
						status: 'rejected',
						reason: 'session_closed'
					};
				}
				if (status === 'cancelled') {
					return {
						status: 'rejected',
						reason: 'session_closed'
					};
				}

				if (status === 'approved') {
					return {
						status: 'rejected',
						reason: 'already_approved'
					};
				}

				if (!reviewedPlan || status !== 'review') {
					return {
						status: 'rejected',
						reason: 'plan_required'
					};
				}

				const confirmedDigest = readConfirmation(confirmation);

				if (confirmedDigest === null || confirmedDigest !== reviewedPlan.digest) {
					return {
						status: 'rejected',
						reason: 'invalid_confirmation'
					};
				}

				const validation = validateSyntheticExecutionPlan(state, registeredActorId, reviewedPlan);

				if (validation.status !== 'valid') {
					reviewedPlan = null;
					status = 'open';

					return {
						status: 'rejected',
						reason: 'invalid_plan'
					};
				}

				const plan = validation.plan;
				const proposal = plan.body.proposal;

				approval = Object.freeze({
					kind: 'synthetic-approval-receipt',
					approvalId: randomUUID(),
					sessionId,
					planDigest: plan.digest,
					stateDigest: plan.body.stateDigest,
					stateRevision: proposal.stateRevision,
					actorId: registeredActorId,
					organizationId: proposal.organizationId,
					eventId: proposal.eventId,
					operationId: proposal.operationId,
					scope: 'synthetic-only'
				});

				status = 'approved';

				return {
					status: 'approved',
					receipt: Object.freeze({ ...approval })
				};
			},

			consumeApproval(receipt) {
				if (status === 'consumed') {
					return {
						status: 'rejected',
						reason: 'replay_detected'
					};
				}

				if (status === 'cancelled') {
					return {
						status: 'rejected',
						reason: 'session_closed'
					};
				}

				if (status !== 'approved' || !approval || !reviewedPlan) {
					return {
						status: 'rejected',
						reason: 'approval_required'
					};
				}

				try {
					if (canonicalJson(receipt) !== canonicalJson(approval)) {
						return {
							status: 'rejected',
							reason: 'invalid_approval'
						};
					}

					const validation = validateSyntheticExecutionPlan(state, registeredActorId, reviewedPlan);

					if (validation.status !== 'valid') {
						approval = null;
						reviewedPlan = null;
						status = 'cancelled';

						return {
							status: 'rejected',
							reason: 'invalid_approval'
						};
					}

					const plan = validation.plan;
					const proposal = plan.body.proposal;

					if (
						approval.sessionId !== sessionId ||
						approval.actorId !== registeredActorId ||
						approval.planDigest !== plan.digest ||
						approval.stateDigest !== plan.body.stateDigest ||
						approval.stateRevision !== state.revision ||
						approval.organizationId !== proposal.organizationId ||
						approval.eventId !== proposal.eventId ||
						approval.operationId !== proposal.operationId ||
						approval.scope !== 'synthetic-only'
					) {
						approval = null;
						reviewedPlan = null;
						status = 'cancelled';

						return {
							status: 'rejected',
							reason: 'invalid_approval'
						};
					}

					// Consume before returning. No asynchronous work
					// or application mutation occurs at this boundary.
					approval = null;
					reviewedPlan = null;
					status = 'consumed';

					return {
						status: 'consumed',
						planDigest: plan.digest,
						execution: 'not-implemented'
					};
				} catch {
					return {
						status: 'rejected',
						reason: 'invalid_approval'
					};
				}
			},

			executeApprovedOperation(receipt) {
				// Capture only the privately retained plan.
				// No caller-supplied plan, handler or state is used.
				const plan = reviewedPlan;

				// The existing protected boundary revalidates
				// and consumes approval before candidate work.
				const consumed = session.consumeApproval(receipt);

				if (consumed.status !== 'consumed') {
					return consumed;
				}

				if (!plan || consumed.planDigest !== plan.digest) {
					return {
						status: 'rejected',
						reason: 'invalid_approval'
					};
				}

				try {
					return prepareSyntheticOperationCandidate(state, registeredActorId, plan);
				} catch {
					// Approval remains consumed after failure.
					return {
						status: 'rejected',
						reason: 'execution_failed'
					};
				}
			},

			getStatus() {
				return status;
			},

			getState() {
				return structuredClone(state);
			},

			getApproval() {
				return approval ? Object.freeze({ ...approval }) : null;
			},

			cancel() {
				if (status === 'consumed') return;
				reviewedPlan = null;
				approval = null;
				status = 'cancelled';
			}
		};

		return {
			status: 'created',
			session: Object.freeze(session)
		};
	} catch {
		return {
			status: 'rejected',
			reason: 'operation_unavailable'
		};
	}
}
