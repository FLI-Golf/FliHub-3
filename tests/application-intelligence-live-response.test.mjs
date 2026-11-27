import assert from 'node:assert/strict';
import test from 'node:test';

import { applicationJevResponseFrom } from '../src/lib/server/intelligence/application/jev-adapter.ts';

import { applicationAdvisoryPlanFrom } from '../src/lib/server/intelligence/application/plan.ts';

import { applicationExplanationFrom } from '../src/lib/server/intelligence/application/explanation.ts';

import { estimatedUsageCostNanodollars } from '../src/lib/server/intelligence/usage-accounting.ts';

// Sanitized synthetic response observed during the first authorized
// live application experiment on November 25, 2026.
// This fixture performs no network requests.

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

function liveResponse() {
	return {
		model: 'jev-1.14.0',
		answers: {
			objective: {
				type: 'choice',
				choice: 'assess_event_readiness',
				confidence: 0.48,
				probabilities: {
					prepare_event: 0.35,
					assess_event_readiness: 0.65,
					abstain: 0
				}
			},
			next_recommendation: {
				type: 'choice',
				choice: 'review_scoring_requirements',
				confidence: 0.53,
				probabilities: {
					review_event_prerequisites: 0.13,
					plan_group_assignments: 0.22,
					review_scoring_requirements: 0.65,
					abstain: 0
				}
			},
			preparation_readiness: {
				type: 'score',
				score: 1.68,
				confidence: 0.69,
				probabilities: {
					0: 0.01,
					1: 0.33,
					2: 0.64,
					3: 0.02,
					4: 0
				},
				legend: {
					0: 'Little preparation is evident',
					1: 'Early preparation is evident',
					2: 'Partial preparation is evident',
					3: 'Substantial preparation is evident',
					4: 'Preparation appears comprehensive within the limited context'
				}
			},
			clarification_needed: {
				type: 'noul',
				noul: 0.93
			},
			prerequisite_review_needed: {
				type: 'noul',
				noul: 0.9
			}
		},
		usage: {
			input_tokens: 684,
			output_tokens: 179
		}
	};
}

function validatedAssessment() {
	const result = applicationJevResponseFrom(input, liveResponse());
	assert.equal(result.status, 'assessed');
	return result;
}

test('observed live response validates all five registered judgments', () => {
	const result = validatedAssessment();

	assert.equal(result.model, 'jev-1.14.0');
	assert.equal(Object.keys(result.answers).length, 5);
	assert.equal(result.answers.objective.confidence, 0.48);
	assert.equal(result.answers.next_recommendation.confidence, 0.53);
	assert.equal(result.answers.preparation_readiness.score, 1.68);
	assert.equal(result.answers.clarification_needed.noul, 0.93);
	assert.equal(result.answers.prerequisite_review_needed.noul, 0.9);
});

test('observed objective mismatch produces deterministic abstention', () => {
	const result = validatedAssessment();
	const plan = applicationAdvisoryPlanFrom(input, result.answers);

	assert.ok(plan);
	assert.deepEqual(plan.decision, {
		status: 'abstained',
		reason: 'objective_mismatch'
	});
	assert.equal(plan.nextStep, null);
	assert.deepEqual(plan.alternatives, []);
});

test('observed live assessment cannot authorize execution', () => {
	const result = validatedAssessment();
	const plan = applicationAdvisoryPlanFrom(input, result.answers);

	assert.ok(plan);
	assert.equal(plan.effect, 'recommendation-only');
	assert.equal(plan.execution, 'not-implemented');
	assert.equal(plan.readiness, null);
	assert.equal(plan.prerequisiteReviewSuggested, true);
});

test('observed abstention produces a safe manual-review explanation', () => {
	const result = validatedAssessment();
	const explanation = applicationExplanationFrom(input, result.answers);

	assert.ok(explanation);
	assert.equal(explanation.heading, 'No recommendation available');
	assert.equal(explanation.recommendation, null);
	assert.equal(explanation.readiness, null);
	assert.equal(
		explanation.reasoning,
		'The assessed objective did not match the registered objective.'
	);
	assert.ok(
		explanation.notices.includes(
			'Continue with manual review rather than relying on this assessment.'
		)
	);
});

test('observed live usage produces the recorded estimated cost', () => {
	const result = validatedAssessment();

	assert.deepEqual(result.usage, {
		inputTokens: 684,
		outputTokens: 179
	});

	assert.equal(estimatedUsageCostNanodollars(result.usage), 28728);
});

test('observed rounded weighted score remains valid', () => {
	const response = liveResponse();
	const score = response.answers.preparation_readiness;

	const weighted = Object.entries(score.probabilities).reduce(
		(sum, [index, probability]) => sum + Number(index) * probability,
		0
	);

	assert.ok(Math.abs(weighted - 1.67) < 0.000001);
	assert.ok(Math.abs(score.score - weighted) <= 0.011);

	assert.equal(applicationJevResponseFrom(input, response).status, 'assessed');
});
