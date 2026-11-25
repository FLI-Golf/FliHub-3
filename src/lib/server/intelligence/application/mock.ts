/**
 * Deterministic synthetic application assessment.
 * No network, credentials, database access or execution.
 */

import type { ApplicationBatch } from './batch.ts';
import type { ChoiceQuestion } from '../primitives.ts';

function choice(question: ChoiceQuestion, preferred: string) {
	const selected = Object.hasOwn(question.criteria, preferred) ? preferred : 'abstain';

	return {
		type: 'choice',
		choice: selected,
		confidence: 1,
		probabilities: Object.fromEntries(
			Object.keys(question.criteria).map((key) => [key, key === selected ? 1 : 0])
		)
	};
}

export async function mockApplicationAssessment(batch: ApplicationBatch) {
	const questions = batch.questions;
	const state = JSON.parse(batch.state);
	const context = state.context;

	const objective =
		state.objective === 'How prepared is our next tournament?'
			? 'assess_event_readiness'
			: 'prepare_event';

	const criteria = questions.next_recommendation.criteria;

	const recommendation =
		[
			'request_clarification',
			'review_participant_readiness',
			'plan_group_assignments',
			'review_scoring_requirements',
			'review_event_prerequisites'
		].find((id) => Object.hasOwn(criteria, id)) ?? 'abstain';

	const readinessChecks = [
		context.dateAssigned === true && context.venueAssigned === true,
		context.participantCount > 0,
		context.groupCount > 0,
		context.scoringConfigured === true
	];

	const score = readinessChecks.filter(Boolean).length;

	return {
		answers: {
			objective: choice(questions.objective, objective),
			next_recommendation: choice(questions.next_recommendation, recommendation),
			preparation_readiness: {
				type: 'score',
				score,
				confidence: 1,
				probabilities: Object.fromEntries(
					questions.preparation_readiness.criteria.map((_, index) => [
						String(index),
						index === score ? 1 : 0
					])
				),
				legend: Object.fromEntries(
					questions.preparation_readiness.criteria.map((label, index) => [String(index), label])
				)
			},
			clarification_needed: {
				type: 'noul',
				noul: recommendation === 'request_clarification' ? 1 : 0
			},
			prerequisite_review_needed: {
				type: 'noul',
				noul: score < 4 ? 1 : 0
			}
		}
	};
}
