/**
 * Application intelligence contracts.
 *
 * Recommendations are advisory. They never authorize
 * operations or grant application permissions.
 */

export const applicationObjectives = ['prepare_event', 'assess_event_readiness'] as const;

export type ApplicationObjective = (typeof applicationObjectives)[number];

export const applicationCapabilityIds = [
	'review_participant_readiness',
	'plan_group_assignments',
	'review_scoring_requirements',
	'review_event_prerequisites',
	'request_clarification'
] as const;

export type ApplicationCapabilityId = (typeof applicationCapabilityIds)[number];

export interface ApplicationCapability {
	readonly id: ApplicationCapabilityId;
	readonly label: string;
	readonly description: string;
	readonly objectives: readonly ApplicationObjective[];
	readonly effect: 'recommendation-only';
	readonly execution: 'not-implemented';
}

export interface ApplicationDecisionRequest {
	readonly objective: ApplicationObjective;
	readonly candidates: readonly ApplicationCapabilityId[];
}

export type ApplicationDecisionOutcome =
	| {
			readonly status: 'suggested';
			readonly capability: ApplicationCapabilityId;
			readonly confidence: number;
	  }
	| {
			readonly status: 'abstained';
			readonly reason:
				'explicit' | 'confidence_missing' | 'confidence_below_threshold' | 'no_eligible_capability';
	  }
	| {
			readonly status: 'disabled';
	  }
	| {
			readonly status: 'unavailable';
			readonly reason: 'invalid_request' | 'invalid_response' | 'provider_unavailable';
	  };
