import { randomBytes } from 'node:crypto';

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
	assessmentHistory: WorkspaceAssessmentRecord[];
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

	function cleanup(time: number) {
		cleanupAssessmentAdmissions(time);
		for (const [id, session] of sessions) {
			if (
				time >= session.createdAt + workspaceLimits.absoluteMs ||
				time >= session.lastActivityAt + workspaceLimits.idleMs
			) {
				sessions.delete(id);
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

			session.activeAssessment = ticket;
			session.lastActivityAt = time;
			assessmentAdmissions.push({ owner, time });

			// The ticket and completion function remain server-side.
			// Object identity prevents stale or replayed completion.
			const finish = (outcome: WorkspaceAssessmentOutcome): boolean => {
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

				current.activeAssessment = null;
				current.lastActivityAt = completedAt;

				current.assessmentHistory.push({
					sequence: ticket.sequence,
					startedAt: ticket.startedAt,
					completedAt,
					outcome
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

		readAssessmentHistory(owner: string, id: string | undefined) {
			cleanup(now());

			const session = owned(owner, id);

			return session ? session.assessmentHistory.map((record) => ({ ...record })) : null;
		},

		revokeOwner(owner: string) {
			let removed = 0;

			for (const [id, session] of sessions) {
				if (session.owner === owner) {
					sessions.delete(id);
					removed++;
				}
			}

			return removed;
		},

		revokeExcept(allowedOwners: ReadonlySet<string>) {
			let removed = 0;

			for (const [id, session] of sessions) {
				if (!allowedOwners.has(session.owner)) {
					sessions.delete(id);
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
				assessmentHistory: []
			};

			sessions.set(id, session);
			admissions.push({ owner, time });
			return { id, session: view(session) };
		},

		close(owner: string, id: string | undefined) {
			cleanup(now());
			const session = owned(owner, id);
			return session ? sessions.delete(session.id) : false;
		}
	};
}

export const workspaceSessions = createWorkspaceSessions();
