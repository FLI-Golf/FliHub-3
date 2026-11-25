/**
 * Deterministic application intelligence director.
 *
 * All results are advisory. No result authorizes execution,
 * changes application state or establishes official readiness.
 */

import { applicationBatchFrom, applicationAnswersFrom } from './batch.ts';
import { getSyntheticFixture } from './fixtures.ts';
import { syntheticDecisionRequest } from './eligibility.ts';
import { APPLICATION_MIN_CONFIDENCE, applicationOutcomeFrom } from './validation.ts';
import type { ApplicationCapabilityId, ApplicationObjective } from './contracts.ts';

export const APPLICATION_CLARIFICATION_THRESHOLD = 0.8;

export type ApplicationDirectorDecision =
	| {
			readonly status: 'recommended';
			readonly objective: ApplicationObjective;
			readonly capability: ApplicationCapabilityId;
			readonly confidence: number;
			readonly effect: 'recommendation-only';
	  }
	| {
			readonly status: 'clarification';
			readonly reason: 'missing_context' | 'provider_clarification' | 'clarification_recommended';
	  }
	| {
			readonly status: 'abstained';
			readonly reason:
				| 'objective_abstention'
				| 'objective_mismatch'
				| 'objective_confidence'
				| 'recommendation_abstention'
				| 'recommendation_confidence';
	  }
	| {
			readonly status: 'unavailable';
			readonly reason: 'invalid_request' | 'invalid_response';
	  };

function requestSnapshot(input: unknown) {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		return null;
	}

	const prototype = Object.getPrototypeOf(input);

	if (prototype !== Object.prototype && prototype !== null) {
		return null;
	}

	const descriptors = Object.getOwnPropertyDescriptors(input);

	if (
		Reflect.ownKeys(descriptors).length !== 2 ||
		!['objectiveId', 'fixtureId'].every(
			(key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value')
		)
	) {
		return null;
	}

	return {
		objectiveId: descriptors.objectiveId.value,
		fixtureId: descriptors.fixtureId.value
	};
}

export function applicationDirectorFrom(
	input: unknown,
	value: unknown
): ApplicationDirectorDecision {
	let request: ReturnType<typeof requestSnapshot>;

	try {
		request = requestSnapshot(input);

		if (!request || !applicationBatchFrom(request)) {
			return {
				status: 'unavailable',
				reason: 'invalid_request'
			};
		}
	} catch {
		return {
			status: 'unavailable',
			reason: 'invalid_request'
		};
	}

	try {
		const answers = applicationAnswersFrom(request, value);

		if (!answers) {
			return {
				status: 'unavailable',
				reason: 'invalid_response'
			};
		}

		const objective: ApplicationObjective =
			request.objectiveId === 'prepare_tournament' ? 'prepare_event' : 'assess_event_readiness';

		const context = getSyntheticFixture(request.fixtureId);
		const decision = syntheticDecisionRequest(objective, context);

		if (!decision) {
			return {
				status: 'unavailable',
				reason: 'invalid_request'
			};
		}

		if (decision.candidates.length === 1 && decision.candidates[0] === 'request_clarification') {
			return {
				status: 'clarification',
				reason: 'missing_context'
			};
		}

		if (answers.objective.choice === 'abstain') {
			return {
				status: 'abstained',
				reason: 'objective_abstention'
			};
		}

		if (answers.objective.choice !== objective) {
			return {
				status: 'abstained',
				reason: 'objective_mismatch'
			};
		}

		if (
			answers.objective.confidence === null ||
			answers.objective.confidence < APPLICATION_MIN_CONFIDENCE
		) {
			return {
				status: 'abstained',
				reason: 'objective_confidence'
			};
		}

		if (answers.clarification_needed.noul >= APPLICATION_CLARIFICATION_THRESHOLD) {
			return {
				status: 'clarification',
				reason: 'provider_clarification'
			};
		}

		const recommendation = applicationOutcomeFrom(decision, {
			choice: answers.next_recommendation.choice,
			confidence: answers.next_recommendation.confidence
		});

		if (recommendation.status === 'abstained') {
			return {
				status: 'abstained',
				reason:
					recommendation.reason === 'explicit'
						? 'recommendation_abstention'
						: 'recommendation_confidence'
			};
		}

		if (recommendation.status !== 'suggested') {
			return {
				status: 'unavailable',
				reason: 'invalid_response'
			};
		}

		if (recommendation.capability === 'request_clarification') {
			return {
				status: 'clarification',
				reason: 'clarification_recommended'
			};
		}

		return {
			status: 'recommended',
			objective,
			capability: recommendation.capability,
			confidence: recommendation.confidence,
			effect: 'recommendation-only'
		};
	} catch {
		return {
			status: 'unavailable',
			reason: 'invalid_response'
		};
	}
}
