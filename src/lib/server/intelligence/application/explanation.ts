/**
 * Deterministic explanations for synthetic advisory plans.
 *
 * No additional provider requests or generated free-form text.
 * Construct explanations from validated assessments and
 * registered local context.
 */

import { applicationAdvisoryPlanFrom } from './plan.ts';
import type { ApplicationCapabilityId } from './contracts.ts';

export interface ApplicationExplanation {
	readonly heading: string;
	readonly summary: string;
	readonly recommendation: string | null;
	readonly reasoning: string | null;
	readonly alternatives: readonly string[];
	readonly readiness: string | null;
	readonly notices: readonly string[];
	readonly disclaimer: string;
}

const reasoningTemplates = {
	review_participant_readiness:
		'No participants are registered in the supplied context. Review participant preparation before organizing competition groups.',
	plan_group_assignments:
		'Participants are registered, but no competition groups are recorded. Review how participants should be organized.',
	review_scoring_requirements:
		'Scoring is not configured in the supplied context. Review the scoring requirements before proceeding.',
	review_event_prerequisites:
		'Review the applicable event preparation requirements. The supplied context does not establish official event readiness.',
	request_clarification:
		'Additional information or clarification is needed before presenting further preparation advice.'
} as const satisfies Record<ApplicationCapabilityId, string>;

function describeAssignment(label: string, value: boolean | null): string {
	if (value === null) {
		return `${label} assignment is unknown.`;
	}

	return value ? `${label} is assigned.` : `${label} is not assigned.`;
}

function describeCount(label: string, value: number | null): string {
	return value === null ? `${label} count is unknown.` : `${label} count: ${value}.`;
}

export function applicationExplanationFrom(
	input: unknown,
	value: unknown
): ApplicationExplanation | null {
	const plan = applicationAdvisoryPlanFrom(input, value);

	if (!plan) return null;

	const facts = plan.facts;

	const summary = [
		describeAssignment('Event date', facts.dateAssigned),
		describeAssignment('Venue', facts.venueAssigned),
		describeCount('Registered participant', facts.participantCount),
		describeCount('Competition group', facts.groupCount),
		facts.scoringConfigured === null
			? 'Scoring configuration is unknown.'
			: facts.scoringConfigured
				? 'Scoring is configured.'
				: 'Scoring is not configured.'
	].join(' ');

	const notices: string[] = [];

	let heading = 'Event preparation assessment';
	let reasoning: string | null = null;

	if (plan.decision.status === 'recommended' && plan.nextStep) {
		reasoning = reasoningTemplates[plan.nextStep.capability];

		if (
			plan.nextStep.capability === 'review_event_prerequisites' &&
			(facts.dateAssigned === false || facts.venueAssigned === false)
		) {
			reasoning =
				'An essential date or venue prerequisite is missing. Review these requirements before other preparation recommendations.';
		}

		if (plan.prerequisiteReviewSuggested) {
			notices.push('The assessment also suggests reviewing event prerequisites.');
		}
	}

	if (plan.decision.status === 'clarification') {
		heading = 'Clarification needed';

		reasoning = reasoningTemplates.request_clarification;

		if (plan.decision.reason === 'missing_context') {
			notices.push('Required information is missing from the supplied context.');
		} else {
			notices.push('The assessment indicates that clarification may be needed.');
		}
	}

	if (plan.decision.status === 'abstained') {
		heading = 'No recommendation available';

		switch (plan.decision.reason) {
			case 'objective_abstention':
				reasoning = 'The assessment did not establish the intended objective.';
				break;

			case 'objective_mismatch':
				reasoning = 'The assessed objective did not match the registered objective.';
				break;

			case 'objective_confidence':
				reasoning = 'Confidence in the objective was insufficient.';
				break;

			case 'recommendation_abstention':
				reasoning = 'The assessment did not select a recommendation.';
				break;

			case 'recommendation_confidence':
				reasoning = 'Confidence in the recommendation was insufficient.';
				break;
		}

		notices.push('Continue with manual review rather than relying on this assessment.');
	}

	const readiness = plan.readiness
		? `Qualitative preparation assessment: ${plan.readiness.score.toFixed(2)} on a 0–${plan.readiness.maximum} rubric. This is not an official completion measurement.`
		: null;

	return {
		heading,
		summary,
		recommendation: plan.nextStep?.label ?? null,
		reasoning,
		alternatives: plan.alternatives.map((step) => step.label),
		readiness,
		notices,
		disclaimer:
			'Synthetic advisory assessment only. No execution or application changes are authorized.'
	};
}
