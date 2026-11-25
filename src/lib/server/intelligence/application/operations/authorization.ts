import type { SyntheticOperationState } from './synthetic-state.ts';

export type SyntheticAuthorizationOutcome =
	| {
			readonly status: 'authorized';
			readonly actorId: string;
			readonly organizationId: string;
			readonly role: 'owner' | 'admin';
	  }
	| {
			readonly status: 'denied';
			readonly reason: 'unauthorized_actor' | 'invalid_scope';
	  };

/**
 * Resolve simulated permissions from local synthetic state.
 *
 * This is not production authentication. The caller must
 * supply trusted, locally owned synthetic state.
 *
 * Authorization permits consideration for planning only.
 */
export function authorizeSyntheticOperation(
	state: SyntheticOperationState,
	actorId: unknown
): SyntheticAuthorizationOutcome {
	try {
		if (state.source !== 'synthetic' || state.fixtureId !== 'spring_invitational') {
			return {
				status: 'denied',
				reason: 'invalid_scope'
			};
		}

		if (typeof actorId !== 'string') {
			return {
				status: 'denied',
				reason: 'unauthorized_actor'
			};
		}

		const matches = state.actors.filter((actor) => actor.id === actorId);

		if (matches.length !== 1) {
			return {
				status: 'denied',
				reason: 'unauthorized_actor'
			};
		}

		const actor = matches[0];

		if (
			actor.status !== 'active' ||
			actor.organizationId !== state.event.organizationId ||
			(actor.role !== 'owner' && actor.role !== 'admin')
		) {
			return {
				status: 'denied',
				reason: 'unauthorized_actor'
			};
		}

		const organizations = state.organizations.filter(
			(organization) => organization.id === actor.organizationId
		);

		if (organizations.length !== 1) {
			return {
				status: 'denied',
				reason: 'invalid_scope'
			};
		}

		return {
			status: 'authorized',
			actorId: actor.id,
			organizationId: actor.organizationId,
			role: actor.role
		};
	} catch {
		return {
			status: 'denied',
			reason: 'invalid_scope'
		};
	}
}
