import type {
	ApplicationCapability,
	ApplicationCapabilityId,
	ApplicationObjective
} from './contracts';

const objectives = ['prepare_event', 'assess_event_readiness'] as const;

const definitions = {
	review_participant_readiness: {
		id: 'review_participant_readiness',
		label: 'Review participant readiness',
		description: 'Review whether participant preparation requires attention.',
		objectives,
		effect: 'recommendation-only',
		execution: 'not-implemented'
	},
	plan_group_assignments: {
		id: 'plan_group_assignments',
		label: 'Plan group assignments',
		description: 'Recommend reviewing or preparing competition groups.',
		objectives,
		effect: 'recommendation-only',
		execution: 'not-implemented'
	},
	review_scoring_requirements: {
		id: 'review_scoring_requirements',
		label: 'Review scoring requirements',
		description: 'Identify scoring configuration that requires review.',
		objectives,
		effect: 'recommendation-only',
		execution: 'not-implemented'
	},
	review_event_prerequisites: {
		id: 'review_event_prerequisites',
		label: 'Review event prerequisites',
		description: 'Recommend reviewing mandatory event preparation requirements.',
		objectives,
		effect: 'recommendation-only',
		execution: 'not-implemented'
	},
	request_clarification: {
		id: 'request_clarification',
		label: 'Request clarification',
		description: 'Recommend obtaining additional information before proceeding.',
		objectives,
		effect: 'recommendation-only',
		execution: 'not-implemented'
	}
} as const satisfies Record<ApplicationCapabilityId, ApplicationCapability>;

export function isApplicationCapabilityId(value: unknown): value is ApplicationCapabilityId {
	return typeof value === 'string' && Object.hasOwn(definitions, value);
}

export function getApplicationCapability(id: unknown): ApplicationCapability | null {
	if (!isApplicationCapabilityId(id)) return null;

	const definition = definitions[id];

	return {
		...definition,
		objectives: [...definition.objectives]
	};
}

/**
 * Objective compatibility is not operational eligibility.
 *
 * Context, prerequisites, permissions, and authorization
 * must be evaluated separately before future execution.
 */
export function capabilitiesForObjective(objective: ApplicationObjective): ApplicationCapability[] {
	return Object.values(definitions)
		.filter((definition) => definition.objectives.some((candidate) => candidate === objective))
		.map((definition) => ({
			...definition,
			objectives: [...definition.objectives]
		}));
}
