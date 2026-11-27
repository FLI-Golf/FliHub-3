/**
 * Structured synthetic advisory plans.
 *
 * Observed facts come from registered local fixtures.
 * Recommendations come through the deterministic director.
 * Alternatives are not an execution sequence.
 */

import { applicationBatchFrom, applicationAnswersFrom } from './batch.ts';

import { applicationDirectorFrom, type ApplicationDirectorDecision } from './director.ts';

import { getSyntheticFixture } from './fixtures.ts';
import { eligibleSyntheticRecommendations } from './eligibility.ts';
import { getApplicationCapability } from './capabilities.ts';
import { APPLICATION_MIN_CONFIDENCE } from './validation.ts';

import type { ApplicationCapabilityId } from './contracts.ts';
import type { SyntheticEventContext } from './context.ts';

export interface AdvisoryPlanStep {
	readonly capability: ApplicationCapabilityId;
	readonly label: string;
	readonly description: string;
	readonly effect: 'recommendation-only';
}

export interface AdvisoryReadiness {
	readonly score: number;
	readonly maximum: number;
	readonly confidence: number;
	readonly interpretation: 'qualitative-only';
}

export interface ApplicationAdvisoryPlan {
	readonly kind: 'synthetic-advisory-plan';
	readonly facts: SyntheticEventContext;
	readonly decision: Exclude<ApplicationDirectorDecision, { status: 'unavailable' }>;
	readonly nextStep: AdvisoryPlanStep | null;
	readonly alternatives: readonly AdvisoryPlanStep[];
	readonly readiness: AdvisoryReadiness | null;
	readonly prerequisiteReviewSuggested: boolean;
	readonly effect: 'recommendation-only';
	readonly execution: 'not-implemented';
}

function stepFrom(id: ApplicationCapabilityId): AdvisoryPlanStep | null {
	const capability = getApplicationCapability(id);

	if (!capability) return null;

	return {
		capability: capability.id,
		label: capability.label,
		description: capability.description,
		effect: 'recommendation-only'
	};
}

export function applicationAdvisoryPlanFrom(
	input: unknown,
	value: unknown
): ApplicationAdvisoryPlan | null {
	try {
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

		const request = {
			objectiveId: descriptors.objectiveId.value,
			fixtureId: descriptors.fixtureId.value
		};

		const batch = applicationBatchFrom(request);
		const answers = applicationAnswersFrom(request, value);

		if (!batch || !answers) return null;

		const decision = applicationDirectorFrom(request, answers);

		if (decision.status === 'unavailable') return null;

		const facts = getSyntheticFixture(request.fixtureId);

		if (!facts) return null;

		const eligible = eligibleSyntheticRecommendations(facts);

		if (!eligible) return null;

		let nextStep: AdvisoryPlanStep | null = null;
		const alternatives: AdvisoryPlanStep[] = [];

		if (decision.status === 'recommended') {
			if (!eligible.includes(decision.capability)) {
				return null;
			}

			nextStep = stepFrom(decision.capability);

			if (!nextStep) return null;

			for (const id of eligible) {
				if (id === decision.capability) continue;

				const alternative = stepFrom(id);

				if (!alternative) return null;

				alternatives.push(alternative);
			}
		}

		if (decision.status === 'clarification') {
			nextStep = stepFrom('request_clarification');

			if (!nextStep) return null;
		}

		const score = answers.preparation_readiness;

		const readiness: AdvisoryReadiness | null =
			decision.status === 'recommended' &&
			score.confidence !== null &&
			score.confidence >= APPLICATION_MIN_CONFIDENCE
				? {
						score: score.score,
						maximum: batch.questions.preparation_readiness.criteria.length - 1,
						confidence: score.confidence,
						interpretation: 'qualitative-only'
					}
				: null;

		return {
			kind: 'synthetic-advisory-plan',
			facts,
			decision,
			nextStep,
			alternatives,
			readiness,
			prerequisiteReviewSuggested: answers.prerequisite_review_needed.noul >= 0.8,
			effect: 'recommendation-only',
			execution: 'not-implemented'
		};
	} catch {
		return null;
	}
}
