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
	maxStartsPerWindow: 32
});

type Session = {
	id: string;
	owner: string;
	createdAt: number;
	lastActivityAt: number;
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

	function cleanupAdmissions(time: number) {
		while (
			admissions.length > 0 &&
			time - admissions[0].time >= workspaceLimits.admissionWindowMs
		) {
			admissions.shift();
		}
	}

	function cleanup(time: number) {
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
				lastActivityAt: time
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
