import { randomUUID } from 'node:crypto';
import { types } from 'node:util';

import { canonicalJson, canonicalSha256 } from './canonical.ts';

import { appendSyntheticPublicationAudit } from './audit.ts';

import type {
	SyntheticSessionSnapshot,
	SyntheticPublicationAuditRecord,
	SyntheticAuditIdentity
} from './audit.ts';

import { verifySyntheticOperationCandidate } from './verification.ts';

import { prepareSyntheticOperationCandidate } from './handler.ts';

import type { SyntheticCandidateOutcome } from './handler.ts';

import { createSyntheticOperationState } from './fixtures.ts';

import { authorizeSyntheticOperation } from './authorization.ts';

import { prepareSyntheticExecutionPlan, validateSyntheticExecutionPlan } from './execution-plan.ts';

import type { SyntheticExecutionPlan, SyntheticExecutionPlanOutcome } from './execution-plan.ts';

import type { SyntheticOperationState } from './synthetic-state.ts';

export interface SyntheticReviewIdentity {
	readonly sessionId: string;
	readonly reviewId: string;
	readonly planDigest: string;
}

export interface SyntheticApprovalReceipt {
	readonly kind: 'synthetic-approval-receipt';
	readonly approvalId: string;
	readonly reviewId: string;
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

export type SyntheticPublicationOutcome =
	| {
			readonly status: 'published';
			readonly operationId: 'create_synthetic_group_assignments';
			readonly planDigest: string;
			readonly originalStateDigest: string;
			readonly publishedStateDigest: string;
			readonly revisionBefore: number;
			readonly revisionAfter: number;
			readonly groupsCreated: number;
			readonly teamsAssigned: number;
			readonly athletesAssigned: number;
			readonly scope: 'synthetic-only';
	  }
	| Extract<SyntheticAuthorizedExecutionOutcome, { status: 'rejected' }>
	| {
			readonly status: 'rejected';
			readonly reason: 'verification_failed' | 'publication_failed';
	  };

export interface SyntheticApprovalSession {
	readonly sessionId: string;

	prepare(request: unknown): SyntheticExecutionPlanOutcome;

	approve(confirmation: unknown): SyntheticApprovalOutcome;

	consumeApproval(receipt: unknown): SyntheticApprovalConsumptionOutcome;

	executeApprovedOperation(receipt: unknown): SyntheticAuthorizedExecutionOutcome;

	executeAndPublishApprovedOperation(receipt: unknown): SyntheticPublicationOutcome;

	getStatus(): SyntheticApprovalSessionStatus;

	getState(): SyntheticOperationState;

	getAuditHistory(): readonly SyntheticPublicationAuditRecord[];

	getApproval(): SyntheticApprovalReceipt | null;

	getReview(): SyntheticReviewIdentity | null;

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

function readConfirmation(input: unknown): SyntheticReviewIdentity | null {
	try {
		if (
			input === null ||
			typeof input !== 'object' ||
			types.isProxy(input) ||
			Array.isArray(input)
		) {
			return null;
		}

		const prototype = Object.getPrototypeOf(input);

		if (prototype !== Object.prototype && prototype !== null) {
			return null;
		}

		const descriptors = Object.getOwnPropertyDescriptors(input);

		const required = ['action', 'sessionId', 'reviewId', 'planDigest'] as const;

		if (
			Reflect.ownKeys(descriptors).length !== required.length ||
			!required.every(
				(key) =>
					Object.hasOwn(descriptors, key) &&
					Object.hasOwn(descriptors[key], 'value') &&
					descriptors[key].enumerable
			)
		) {
			return null;
		}

		const action = descriptors.action.value;
		const sessionId = descriptors.sessionId.value;
		const reviewId = descriptors.reviewId.value;
		const planDigest = descriptors.planDigest.value;

		const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

		if (
			action !== 'approve-exact-plan' ||
			typeof sessionId !== 'string' ||
			!uuidPattern.test(sessionId) ||
			typeof reviewId !== 'string' ||
			!uuidPattern.test(reviewId) ||
			typeof planDigest !== 'string' ||
			!/^[a-f0-9]{64}$/.test(planDigest)
		) {
			return null;
		}

		return {
			sessionId,
			reviewId,
			planDigest
		};
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
 * No persistent state is exposed.
 * Synthetic publication is permitted only through
 * the protected execution and verification boundary.
 */
export function createSyntheticApprovalSession(
	fixtureId: unknown,
	actorId: unknown
): SyntheticApprovalSessionOutcome {
	try {
		const initialState = createSyntheticOperationState(fixtureId);

		if (!initialState) {
			return {
				status: 'rejected',
				reason: 'unsupported_fixture'
			};
		}

		let snapshot: SyntheticSessionSnapshot = Object.freeze({
			state: initialState,
			audit: Object.freeze([]),
			lastSequence: 0
		});

		const authorization = authorizeSyntheticOperation(snapshot.state, actorId);

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

		let review: SyntheticReviewIdentity | null = null;

		let approval: SyntheticApprovalReceipt | null = null;

		const session: SyntheticApprovalSession = {
			sessionId,

			prepare(request) {
				if (status === 'cancelled' || status === 'approved' || status === 'consumed') {
					return {
						status: 'rejected',
						reason: 'invalid_plan'
					};
				}

				// Any new preparation invalidates the old review,
				// including an unsuccessful preparation attempt.
				reviewedPlan = null;
				review = null;
				status = 'open';

				if (types.isProxy(request)) {
					return {
						status: 'rejected',
						reason: 'invalid_request'
					};
				}

				const result = prepareSyntheticExecutionPlan(snapshot.state, registeredActorId, request);

				if (result.status === 'prepared') {
					review = Object.freeze({
						sessionId,
						reviewId: randomUUID(),
						planDigest: result.plan.digest
					});

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

				if (!reviewedPlan || !review || status !== 'review') {
					return {
						status: 'rejected',
						reason: 'plan_required'
					};
				}

				const confirmed = readConfirmation(confirmation);

				if (
					confirmed === null ||
					confirmed.sessionId !== sessionId ||
					confirmed.sessionId !== review.sessionId ||
					confirmed.reviewId !== review.reviewId ||
					confirmed.planDigest !== review.planDigest ||
					confirmed.planDigest !== reviewedPlan.digest
				) {
					return {
						status: 'rejected',
						reason: 'invalid_confirmation'
					};
				}

				const validation = validateSyntheticExecutionPlan(
					snapshot.state,
					registeredActorId,
					reviewedPlan
				);

				if (validation.status !== 'valid') {
					reviewedPlan = null;
					review = null;
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
					reviewId: review.reviewId,
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

				if (status !== 'approved' || !approval || !reviewedPlan || !review) {
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

					const validation = validateSyntheticExecutionPlan(
						snapshot.state,
						registeredActorId,
						reviewedPlan
					);

					if (validation.status !== 'valid') {
						approval = null;
						reviewedPlan = null;
						review = null;
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
						approval.sessionId !== review.sessionId ||
						approval.reviewId !== review.reviewId ||
						approval.planDigest !== review.planDigest ||
						approval.actorId !== registeredActorId ||
						approval.planDigest !== plan.digest ||
						approval.stateDigest !== plan.body.stateDigest ||
						approval.stateRevision !== snapshot.state.revision ||
						approval.organizationId !== proposal.organizationId ||
						approval.eventId !== proposal.eventId ||
						approval.operationId !== proposal.operationId ||
						approval.scope !== 'synthetic-only'
					) {
						approval = null;
						reviewedPlan = null;
						review = null;
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
					review = null;
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
					return prepareSyntheticOperationCandidate(snapshot.state, registeredActorId, plan);
				} catch {
					// Approval remains consumed after failure.
					return {
						status: 'rejected',
						reason: 'execution_failed'
					};
				}
			},

			executeAndPublishApprovedOperation(receipt) {
				// Capture trusted review metadata before consumption.
				// Never read audit identifiers from a supplied receipt.
				const plan = reviewedPlan;

				const original = snapshot.state;

				const identity: SyntheticAuditIdentity = {
					sessionId,
					reviewId: review?.reviewId ?? null,
					planDigest: plan?.digest ?? null,
					actorId: registeredActorId
				};

				let verification: SyntheticPublicationAuditRecord['verification'] = 'not-performed';

				function reject(
					outcome: Extract<SyntheticPublicationOutcome, { status: 'rejected' }>
				): SyntheticPublicationOutcome {
					try {
						snapshot = appendSyntheticPublicationAudit(
							snapshot,
							snapshot.state,
							identity,
							outcome,
							verification
						);

						return outcome;
					} catch {
						// An audit construction failure must never
						// cause an authoritative application mutation.
						return {
							status: 'rejected',
							reason: 'publication_failed'
						};
					}
				}

				try {
					const executed = session.executeApprovedOperation(receipt);

					if (executed.status !== 'candidate_prepared') {
						return reject(executed);
					}

					if (!plan) {
						return reject({
							status: 'rejected',
							reason: 'invalid_approval'
						});
					}

					// Treat verification as failed until the
					// independent verifier positively confirms it.
					verification = 'failed';

					const verified = verifySyntheticOperationCandidate(original, plan, executed.candidate);

					if (verified.status !== 'verified') {
						return reject({
							status: 'rejected',
							reason: 'verification_failed'
						});
					}

					verification = 'passed';

					const nextState = JSON.parse(
						canonicalJson(executed.candidate)
					) as SyntheticOperationState;

					if (
						snapshot.state !== original ||
						canonicalSha256(original) !== verified.originalStateDigest ||
						canonicalSha256(nextState) !== verified.candidateStateDigest ||
						executed.originalStateDigest !== verified.originalStateDigest ||
						executed.planDigest !== verified.planDigest ||
						verified.planDigest !== plan.digest ||
						nextState.revision !== original.revision + 1
					) {
						return reject({
							status: 'rejected',
							reason: 'publication_failed'
						});
					}

					const outcome = Object.freeze({
						status: 'published' as const,
						operationId: verified.operationId,
						planDigest: verified.planDigest,
						originalStateDigest: verified.originalStateDigest,
						publishedStateDigest: verified.candidateStateDigest,
						revisionBefore: verified.revisionBefore,
						revisionAfter: verified.revisionAfter,
						groupsCreated: verified.groupsCreated,
						teamsAssigned: verified.teamsAssigned,
						athletesAssigned: verified.athletesAssigned,
						scope: 'synthetic-only' as const
					});

					// Construct both state and audit before committing.
					const nextSnapshot = appendSyntheticPublicationAudit(
						snapshot,
						nextState,
						identity,
						outcome,
						verification
					);

					// One synchronous authoritative replacement.
					// No fallible work follows this assignment.
					snapshot = nextSnapshot;

					return outcome;
				} catch {
					return reject({
						status: 'rejected',
						reason: 'publication_failed'
					});
				}
			},

			getStatus() {
				return status;
			},

			getState() {
				return structuredClone(snapshot.state);
			},

			getAuditHistory() {
				return Object.freeze(snapshot.audit.map((record) => Object.freeze({ ...record })));
			},

			getReview() {
				return review ? Object.freeze({ ...review }) : null;
			},

			getApproval() {
				return approval ? Object.freeze({ ...approval }) : null;
			},

			cancel() {
				if (status === 'consumed') return;
				reviewedPlan = null;
				review = null;
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
