import { randomBytes } from 'node:crypto';
import type { ApplicationCapabilityId } from '../application/contracts.ts';
import { operationsForRecommendation } from '../application/operations/registry.ts';
import {
	failedExecution,
	prepareProtectedOperationReview,
	projectExecutionOutcome,
	type ProtectedExecutionOutcome,
	type ExactOperationReview
} from '../application/operations/review.ts';

type ProtectedReview = Extract<
	ReturnType<typeof prepareProtectedOperationReview>,
	{ status: 'prepared' }
>;

type ActiveReview = {
	readonly generation: string;
	readonly handle: ProtectedReview['handle'];
	readonly execute: ProtectedReview['execute'];
	readonly readEvidence: ProtectedReview['readEvidence'];
};

export const workspaceLimits = Object.freeze({
	maxSessionsPerUser: 2,
	maxSessions: 32,
	idleMs: 15 * 60 * 1000,
	absoluteMs: 60 * 60 * 1000,
	bodyBytes: 8192,
	requestReadMs: 5000,
	admissionWindowMs: 60000,
	maxStartsPerUserPerWindow: 4,
	maxStartsPerWindow: 32,
	maxConcurrentAssessmentsPerSession: 1,
	maxAssessmentsPerUserPerWindow: 10,
	maxAssessmentsPerWindow: 320,
	maxAssessmentHistory: 50
});

export type WorkspaceAssessmentOutcome = 'advised' | 'clarification' | 'rejected' | 'unavailable';

export type WorkspaceAssessmentRecord = {
	readonly sequence: number;
	readonly startedAt: number;
	readonly completedAt: number;
	readonly outcome: WorkspaceAssessmentOutcome;
};

type AssessmentLifecycle = {
	readonly objective: string | null;
	readonly recommendation: string | null;
	reviewPreparedAt?: number;
	reviewCancelledAt?: number;
	executionAdmittedAt?: number;
};

type RetainedAssessment = WorkspaceAssessmentRecord & { lifecycle: AssessmentLifecycle };

export type WorkspaceRecommendationContext = {
	readonly objectiveId: string;
	readonly fixtureId: string;
	readonly actorId: string;
	readonly capability: ApplicationCapabilityId;
};

export type WorkspaceCurrentRecommendation = WorkspaceRecommendationContext & {
	readonly sequence: number;
	readonly generation: string;
};

type AssessmentTicket = {
	readonly sequence: number;
	readonly startedAt: number;
};

type Session = {
	id: string;
	owner: string;
	createdAt: number;
	lastActivityAt: number;
	assessmentSequence: number;
	activeAssessment: AssessmentTicket | null;
	assessmentHistory: RetainedAssessment[];
	currentRecommendation: WorkspaceCurrentRecommendation | null;
	activeReview: ActiveReview | null;
	reviewAttempted: boolean;
	execution: ProtectedExecutionOutcome | 'admitted' | null;
};

export type WorkspaceSessionView = {
	createdAt: number;
	idleExpiresAt: number;
	absoluteExpiresAt: number;
};

const sessionIdPattern = /^[a-f0-9]{64}$/;

export function createWorkspaceSessions(now: () => number = Date.now) {
	const sessions = new Map<string, Session>();
	const admissions: { owner: string; time: number }[] = [];
	const assessmentAdmissions: { owner: string; time: number }[] = [];

	function cleanupAssessmentAdmissions(time: number) {
		while (
			assessmentAdmissions.length > 0 &&
			time - assessmentAdmissions[0].time >= workspaceLimits.admissionWindowMs
		) {
			assessmentAdmissions.shift();
		}
	}

	function cleanupAdmissions(time: number) {
		while (
			admissions.length > 0 &&
			time - admissions[0].time >= workspaceLimits.admissionWindowMs
		) {
			admissions.shift();
		}
	}

	function invalidateReview(session: Session): void {
		session.activeReview?.handle.cancel();
		session.activeReview = null;
	}

	function discardSession(session: Session): boolean {
		invalidateReview(session);
		session.currentRecommendation = null;
		return sessions.delete(session.id);
	}

	function cleanup(time: number) {
		cleanupAssessmentAdmissions(time);
		for (const session of sessions.values()) {
			if (
				time >= session.createdAt + workspaceLimits.absoluteMs ||
				time >= session.lastActivityAt + workspaceLimits.idleMs
			) {
				discardSession(session);
			}
		}
	}

	function view(session: Session): WorkspaceSessionView {
		return {
			createdAt: session.createdAt,
			idleExpiresAt: Math.min(
				session.lastActivityAt + workspaceLimits.idleMs,
				session.createdAt + workspaceLimits.absoluteMs
			),
			absoluteExpiresAt: session.createdAt + workspaceLimits.absoluteMs
		};
	}

	function owned(owner: string, id: string | undefined) {
		if (!id || !sessionIdPattern.test(id)) return null;
		const session = sessions.get(id);
		return session?.owner === owner ? session : null;
	}

	return {
		beginAssessment(owner: string, id: string | undefined) {
			const time = now();
			cleanup(time);

			const session = owned(owner, id);

			if (!session) {
				return { status: 'missing_session' } as const;
			}

			if (session.execution) return { status: 'concluded' } as const;

			if (session.activeAssessment) {
				return { status: 'busy' } as const;
			}

			const ownerAdmissions = assessmentAdmissions.filter(
				(admission) => admission.owner === owner
			).length;

			if (
				ownerAdmissions >= workspaceLimits.maxAssessmentsPerUserPerWindow ||
				assessmentAdmissions.length >= workspaceLimits.maxAssessmentsPerWindow
			) {
				return { status: 'rate_limited' } as const;
			}

			const ticket: AssessmentTicket = {
				sequence: ++session.assessmentSequence,
				startedAt: time
			};

			invalidateReview(session);
			session.reviewAttempted = false;
			session.currentRecommendation = null;
			session.activeAssessment = ticket;
			session.lastActivityAt = time;
			assessmentAdmissions.push({ owner, time });

			// The ticket and completion function remain server-side.
			// Object identity prevents stale or replayed completion.
			const finish = (
				outcome: WorkspaceAssessmentOutcome,
				recommendation: WorkspaceRecommendationContext | null = null,
				labels?: Pick<AssessmentLifecycle, 'objective' | 'recommendation'>
			): boolean => {
				const completedAt = now();
				cleanup(completedAt);

				const current = owned(owner, id);

				if (current !== session || current.activeAssessment !== ticket) {
					return false;
				}

				if (
					outcome !== 'advised' &&
					outcome !== 'clarification' &&
					outcome !== 'rejected' &&
					outcome !== 'unavailable'
				) {
					outcome = 'unavailable';
				}

				current.currentRecommendation =
					outcome === 'advised' && recommendation
						? Object.freeze({
								objectiveId: recommendation.objectiveId,
								fixtureId: recommendation.fixtureId,
								actorId: recommendation.actorId,
								capability: recommendation.capability,
								sequence: ticket.sequence,
								generation: randomBytes(32).toString('hex')
							})
						: null;

				current.activeAssessment = null;
				current.lastActivityAt = completedAt;

				current.assessmentHistory.push({
					sequence: ticket.sequence,
					startedAt: ticket.startedAt,
					completedAt,
					outcome,
					lifecycle: labels ? { ...labels } : { objective: null, recommendation: null }
				});

				if (current.assessmentHistory.length > workspaceLimits.maxAssessmentHistory) {
					current.assessmentHistory.shift();
				}

				return true;
			};

			return {
				status: 'admitted',
				finish
			} as const;
		},

		readCurrentRecommendation(owner: string, id: string | undefined) {
			cleanup(now());

			const session = owned(owner, id);

			if (!session || session.execution || session.activeAssessment) return null;

			return session.currentRecommendation;
		},

		readReview(owner: string, id: string | undefined): ExactOperationReview | null {
			cleanup(now());

			const session = owned(owner, id);

			if (!session || session.execution || session.activeAssessment || !session.activeReview) {
				return null;
			}

			if (session.activeReview.generation !== session.currentRecommendation?.generation) {
				invalidateReview(session);
				return null;
			}

			return session.activeReview.handle.read();
		},

		readReviewAvailability(owner: string, id: string | undefined) {
			cleanup(now());

			const session = owned(owner, id);

			if (
				!session ||
				session.execution ||
				session.activeAssessment ||
				!session.currentRecommendation
			) {
				return null;
			}

			const context = session.currentRecommendation;

			const operations = operationsForRecommendation(context.capability).filter(
				(operation) => operation.scope === 'synthetic-only'
			);

			if (operations.length !== 1 || session.reviewAttempted || session.activeReview) {
				return null;
			}

			return Object.freeze({
				sequence: context.sequence,
				generation: context.generation,
				label: operations[0].label
			});
		},

		prepareReview(owner: string, id: string | undefined, expectedGeneration: unknown) {
			const time = now();
			cleanup(time);

			const session = owned(owner, id);

			if (!session) {
				return { status: 'missing_session' } as const;
			}

			if (session.execution) return { status: 'concluded' } as const;

			if (session.activeAssessment) {
				return { status: 'busy' } as const;
			}

			const context = session.currentRecommendation;

			if (
				!context ||
				typeof expectedGeneration !== 'string' ||
				!/^[a-f0-9]{64}$/.test(expectedGeneration) ||
				expectedGeneration !== context.generation
			) {
				return { status: 'stale_context' } as const;
			}

			if (session.activeReview) {
				const review = session.activeReview.handle.read();

				if (review && session.activeReview.generation === context.generation) {
					return { status: 'prepared', review } as const;
				}

				invalidateReview(session);
			}

			if (session.reviewAttempted) {
				return { status: 'review_consumed' } as const;
			}

			const operations = operationsForRecommendation(context.capability).filter(
				(operation) => operation.scope === 'synthetic-only'
			);

			if (operations.length !== 1) {
				return { status: 'no_operation' } as const;
			}

			// At most one preparation attempt per admitted assessment.
			// No client-supplied actor, fixture, operation or plan.
			session.reviewAttempted = true;

			try {
				const result = prepareProtectedOperationReview(
					context.fixtureId,
					context.actorId,
					operations[0].id
				);

				if (result.status !== 'prepared') {
					return { status: 'review_rejected' } as const;
				}

				const review = result.handle.read();

				if (!review) {
					result.handle.cancel();
					return { status: 'review_rejected' } as const;
				}

				session.activeReview = {
					generation: context.generation,
					handle: result.handle,
					execute: result.execute,
					readEvidence: result.readEvidence
				};

				const assessment = session.assessmentHistory.at(-1);
				if (assessment) assessment.lifecycle.reviewPreparedAt = time;
				session.lastActivityAt = time;

				return { status: 'prepared', review } as const;
			} catch {
				invalidateReview(session);
				return { status: 'review_rejected' } as const;
			}
		},

		readExecution(owner: string, id: string | undefined) {
			cleanup(now());
			const outcome = owned(owner, id)?.execution;
			return outcome && outcome !== 'admitted' ? projectExecutionOutcome(outcome) : null;
		},

		readExecutionEvidence(owner: string, id: string | undefined) {
			cleanup(now());
			const session = owned(owner, id);
			const outcome = session?.execution;
			if (!outcome || outcome === 'admitted') return null;

			try {
				return session.activeReview?.readEvidence(outcome) ?? null;
			} catch {
				// Evidence projection must never reclassify a committed publication.
				return null;
			}
		},

		readLifecycle(owner: string, id: string | undefined) {
			cleanup(now());
			const session = owned(owner, id);
			return Object.fromEntries(
				session?.assessmentHistory.map(({ sequence, lifecycle }) => [sequence, { ...lifecycle }]) ??
					[]
			);
		},

		executeReview(
			owner: string,
			id: string | undefined,
			input: {
				confirmation: unknown;
				generation: unknown;
				reviewId: unknown;
				planDigest: unknown;
			}
		) {
			const time = now();
			cleanup(time);

			const session = owned(owner, id);
			if (!session) return { status: 'missing_session' } as const;
			if (session.execution) return { status: 'concluded' } as const;
			if (session.activeAssessment) return { status: 'busy' } as const;

			const retained = session.activeReview;
			const review = retained?.handle.read();
			if (
				input.confirmation !== 'approve-and-execute' ||
				!retained ||
				!review ||
				retained.generation !== session.currentRecommendation?.generation ||
				input.generation !== retained.generation ||
				input.reviewId !== review.reviewId ||
				input.planDigest !== review.planDigest
			)
				return { status: 'stale_confirmation' } as const;

			session.execution = 'admitted';
			const assessment = session.assessmentHistory.at(-1);
			if (assessment) assessment.lifecycle.executionAdmittedAt = time;
			session.lastActivityAt = time;
			try {
				session.execution = retained.execute();
			} catch {
				session.execution = failedExecution;
			}
			return { status: 'completed' } as const;
		},

		cancelReview(owner: string, id: string | undefined, expectedReviewId: unknown) {
			const time = now();
			cleanup(time);

			const session = owned(owner, id);

			if (!session) {
				return { status: 'missing_session' } as const;
			}

			if (session.execution) return { status: 'concluded' } as const;

			const review = session.activeReview?.handle.read();

			if (!review || typeof expectedReviewId !== 'string' || expectedReviewId !== review.reviewId) {
				return { status: 'stale_review' } as const;
			}

			invalidateReview(session);
			const assessment = session.assessmentHistory.at(-1);
			if (assessment) assessment.lifecycle.reviewCancelledAt = time;
			session.lastActivityAt = time;

			return { status: 'cancelled' } as const;
		},

		readAssessmentHistory(owner: string, id: string | undefined) {
			cleanup(now());

			const session = owned(owner, id);

			return session
				? session.assessmentHistory.map(({ sequence, startedAt, completedAt, outcome }) => ({
						sequence,
						startedAt,
						completedAt,
						outcome
					}))
				: null;
		},

		revokeOwner(owner: string) {
			let removed = 0;

			for (const session of sessions.values()) {
				if (session.owner === owner) {
					discardSession(session);
					removed++;
				}
			}

			return removed;
		},

		revokeExcept(allowedOwners: ReadonlySet<string>) {
			let removed = 0;

			for (const session of sessions.values()) {
				if (!allowedOwners.has(session.owner)) {
					discardSession(session);
					removed++;
				}
			}

			return removed;
		},

		read(owner: string, id: string | undefined) {
			cleanup(now());
			const session = owned(owner, id);
			return session ? view(session) : null;
		},

		start(owner: string, existingId: string | undefined) {
			const time = now();
			cleanup(time);

			const existing = owned(owner, existingId);
			if (existing) {
				return { id: existing.id, session: view(existing) };
			}

			const ownerCount = [...sessions.values()].filter((session) => session.owner === owner).length;

			if (
				sessions.size >= workspaceLimits.maxSessions ||
				ownerCount >= workspaceLimits.maxSessionsPerUser
			) {
				return null;
			}

			cleanupAdmissions(time);

			const ownerAdmissions = admissions.filter((admission) => admission.owner === owner).length;

			if (
				admissions.length >= workspaceLimits.maxStartsPerWindow ||
				ownerAdmissions >= workspaceLimits.maxStartsPerUserPerWindow
			) {
				return null;
			}

			let id: string;
			do {
				id = randomBytes(32).toString('hex');
			} while (sessions.has(id));

			const session: Session = {
				id,
				owner,
				createdAt: time,
				lastActivityAt: time,
				assessmentSequence: 0,
				activeAssessment: null,
				assessmentHistory: [],
				currentRecommendation: null,
				activeReview: null,
				reviewAttempted: false,
				execution: null
			};

			sessions.set(id, session);
			admissions.push({ owner, time });
			return { id, session: view(session) };
		},

		close(owner: string, id: string | undefined) {
			cleanup(now());
			const session = owned(owner, id);
			return session ? discardSession(session) : false;
		}
	};
}

export const workspaceSessions = createWorkspaceSessions();
