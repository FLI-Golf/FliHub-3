import { syntheticObjectiveIds, type SyntheticObjectiveId } from '../application/batch.ts';

/**
 * Resolve bounded workspace objectives without provider access.
 *
 * Complete registered phrases only. No substring matching,
 * arbitrary prompts, execution authorization or raw input retention.
 */

export const WORKSPACE_OBJECTIVE_MAX_LENGTH = 256;

export type WorkspaceObjectiveResolution =
	| {
			readonly status: 'resolved';
			readonly objectiveId: SyntheticObjectiveId;
			readonly effect: 'recommendation-only';
	  }
	| {
			readonly status: 'clarification';
			readonly reason: 'empty_objective' | 'ambiguous_objective';
	  }
	| {
			readonly status: 'rejected';
			readonly reason: 'invalid_objective' | 'objective_too_long' | 'unsupported_objective';
	  };

const phrases = {
	prepare_tournament: [
		'help me prepare our next tournament',
		'help me prepare the tournament',
		'help me prepare this tournament',
		'prepare our next tournament',
		'prepare the tournament',
		'prepare this tournament',
		'prepare tournament',
		'help me prepare our next event',
		'help me prepare this event',
		'help me prepare the event',
		'prepare the event'
	],
	assess_readiness: [
		'how prepared is our next tournament',
		'how prepared is this tournament',
		'how prepared is the tournament',
		'is this tournament ready',
		'is our next tournament ready',
		'is the tournament ready',
		'assess tournament readiness',
		'assess event readiness',
		'assess readiness',
		'how prepared is this event',
		'is this event ready',
		'is the event ready'
	]
} as const satisfies Record<SyntheticObjectiveId, readonly string[]>;

const ambiguousPhrases = new Set([
	'help',
	'help me',
	'help me with something',
	'help me with the tournament',
	'help me with this event',
	'what should i do',
	'what should i do next',
	'what is next',
	'what next',
	'tournament',
	'event',
	'readiness'
]);

function resolved(objectiveId: SyntheticObjectiveId): WorkspaceObjectiveResolution {
	return {
		status: 'resolved',
		objectiveId,
		effect: 'recommendation-only'
	};
}

export function resolveRegisteredWorkspaceObjective(value: unknown): WorkspaceObjectiveResolution {
	if (typeof value !== 'string') {
		return { status: 'rejected', reason: 'invalid_objective' };
	}

	if (value.length > WORKSPACE_OBJECTIVE_MAX_LENGTH) {
		return { status: 'rejected', reason: 'objective_too_long' };
	}

	const objective = syntheticObjectiveIds().find((id) => id === value);

	return objective ? resolved(objective) : { status: 'rejected', reason: 'unsupported_objective' };
}

export function resolveWorkspaceObjective(value: unknown): WorkspaceObjectiveResolution {
	if (typeof value !== 'string') {
		return { status: 'rejected', reason: 'invalid_objective' };
	}

	if (value.length > WORKSPACE_OBJECTIVE_MAX_LENGTH) {
		return { status: 'rejected', reason: 'objective_too_long' };
	}

	// Reject control characters, invisible Unicode and unexpected
	// punctuation instead of silently transforming them.
	if (!/^[a-zA-Z .?!]*$/.test(value)) {
		return { status: 'rejected', reason: 'invalid_objective' };
	}

	const trimmed = value.trim();

	if (!trimmed) {
		return { status: 'clarification', reason: 'empty_objective' };
	}

	const normalized = trimmed
		.toLowerCase()
		.replace(/ +/g, ' ')
		.replace(/[.?!]$/, '')
		.trim();

	if (ambiguousPhrases.has(normalized)) {
		return { status: 'clarification', reason: 'ambiguous_objective' };
	}

	for (const objectiveId of syntheticObjectiveIds()) {
		const accepted: readonly string[] = phrases[objectiveId];

		if (accepted.includes(normalized)) {
			return resolved(objectiveId);
		}
	}

	return { status: 'rejected', reason: 'unsupported_objective' };
}
