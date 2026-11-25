/**
 * Registered synthetic application intelligence batches.
 *
 * No arbitrary prompts, provider context, questions,
 * candidate lists, database access or operation execution.
 */

import {
	primitiveAnswerFrom,
	type ChoiceQuestion,
	type ScoreQuestion,
	type NoulQuestion,
	type ChoiceAnswer,
	type ScoreAnswer,
	type NoulAnswer
} from '../primitives.ts';

import { getSyntheticFixture } from './fixtures.ts';
import { syntheticEventContextFrom } from './context.ts';
import { eligibleSyntheticRecommendations } from './eligibility.ts';
import { getApplicationCapability } from './capabilities.ts';

const objectives = {
	prepare_tournament: 'Help me prepare our next tournament.',
	assess_readiness: 'How prepared is our next tournament?'
} as const;

export type SyntheticObjectiveId = keyof typeof objectives;

export const APPLICATION_BATCH_ID = 'synthetic_event_assessment';

export interface ApplicationQuestions {
	readonly objective: ChoiceQuestion;
	readonly next_recommendation: ChoiceQuestion;
	readonly preparation_readiness: ScoreQuestion;
	readonly clarification_needed: NoulQuestion;
	readonly prerequisite_review_needed: NoulQuestion;
}

export interface ApplicationAnswers {
	readonly objective: ChoiceAnswer;
	readonly next_recommendation: ChoiceAnswer;
	readonly preparation_readiness: ScoreAnswer;
	readonly clarification_needed: NoulAnswer;
	readonly prerequisite_review_needed: NoulAnswer;
}

export interface ApplicationBatch {
	readonly id: typeof APPLICATION_BATCH_ID;
	readonly state: string;
	readonly questions: ApplicationQuestions;
}

const questionIds = [
	'objective',
	'next_recommendation',
	'preparation_readiness',
	'clarification_needed',
	'prerequisite_review_needed'
] as const;

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return null;
	}

	const prototype = Object.getPrototypeOf(value);

	if (prototype !== Object.prototype && prototype !== null) {
		return null;
	}

	const descriptors = Object.getOwnPropertyDescriptors(value);

	if (
		Reflect.ownKeys(descriptors).length !== keys.length ||
		!keys.every(
			(key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value')
		)
	) {
		return null;
	}

	return value as Record<string, unknown>;
}

export function syntheticObjectiveIds(): SyntheticObjectiveId[] {
	return Object.keys(objectives) as SyntheticObjectiveId[];
}

export function applicationBatchFrom(input: unknown): ApplicationBatch | null {
	const request = exactRecord(input, ['objectiveId', 'fixtureId']);

	if (!request) return null;

	const { objectiveId, fixtureId } = request;

	if (typeof objectiveId !== 'string' || !Object.hasOwn(objectives, objectiveId)) {
		return null;
	}

	const context = syntheticEventContextFrom(getSyntheticFixture(fixtureId));

	if (!context) return null;

	const candidates = eligibleSyntheticRecommendations(context);

	if (!candidates || candidates.length === 0) {
		return null;
	}

	const entries: [string, string][] = [];

	for (const candidate of candidates) {
		const capability = getApplicationCapability(candidate);

		if (!capability) return null;

		entries.push([capability.id, capability.description]);
	}

	entries.push(['abstain', 'The available evidence does not support a recommendation.']);

	const state = JSON.stringify({
		purpose: 'Synthetic advisory event preparation assessment',
		objective: objectives[objectiveId as SyntheticObjectiveId],
		context
	});

	const questions: ApplicationQuestions = {
		objective: {
			type: 'choice',
			instructions: 'Classify the registered user objective. Do not infer authorization.',
			criteria: {
				prepare_event: 'The user wants help preparing an event.',
				assess_event_readiness: 'The user wants an assessment of event preparation.',
				abstain: 'The objective cannot be determined.'
			}
		},

		next_recommendation: {
			type: 'choice',
			instructions:
				'Select the most useful advisory recommendation from the eligible alternatives using only the supplied context. Never authorize execution.',
			criteria: Object.fromEntries(entries)
		},

		preparation_readiness: {
			type: 'score',
			instructions:
				'Assess qualitative preparation from the supplied synthetic context. This is not official readiness, completion or authorization.',
			criteria: [
				'Little preparation is evident',
				'Early preparation is evident',
				'Partial preparation is evident',
				'Substantial preparation is evident',
				'Preparation appears comprehensive within the limited context'
			]
		},

		clarification_needed: {
			type: 'noul',
			instructions:
				'Is additional information needed to provide a useful advisory recommendation from the supplied context?'
		},

		prerequisite_review_needed: {
			type: 'noul',
			instructions:
				'Does the supplied context suggest that event preparation prerequisites require further review?'
		}
	};

	return {
		id: APPLICATION_BATCH_ID,
		state,
		questions
	};
}

/**
 * Validate the entire answer set against a reconstructed
 * registered request. Partial batches are not accepted.
 */
export function applicationAnswersFrom(input: unknown, value: unknown): ApplicationAnswers | null {
	const batch = applicationBatchFrom(input);

	if (!batch) return null;

	const answers = exactRecord(value, questionIds);

	if (!answers) return null;

	const objective = primitiveAnswerFrom(batch.questions.objective, answers.objective);

	const recommendation = primitiveAnswerFrom(
		batch.questions.next_recommendation,
		answers.next_recommendation
	);

	const readiness = primitiveAnswerFrom(
		batch.questions.preparation_readiness,
		answers.preparation_readiness
	);

	const clarification = primitiveAnswerFrom(
		batch.questions.clarification_needed,
		answers.clarification_needed
	);

	const prerequisites = primitiveAnswerFrom(
		batch.questions.prerequisite_review_needed,
		answers.prerequisite_review_needed
	);

	if (
		objective?.type !== 'choice' ||
		recommendation?.type !== 'choice' ||
		readiness?.type !== 'score' ||
		clarification?.type !== 'noul' ||
		prerequisites?.type !== 'noul'
	) {
		return null;
	}

	return {
		objective,
		next_recommendation: recommendation,
		preparation_readiness: readiness,
		clarification_needed: clarification,
		prerequisite_review_needed: prerequisites
	};
}
