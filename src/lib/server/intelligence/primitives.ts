/**
 * Bounded TypeSafe System One primitive contracts.
 *
 * This module performs offline response validation only.
 * It does not authorize operations or dispatch requests.
 */

import { probability } from './validation.ts';

export type ChoiceQuestion = {
	readonly type: 'choice';
	readonly instructions: string;
	readonly criteria: Readonly<Record<string, string>>;
};

export type ScoreQuestion = {
	readonly type: 'score';
	readonly instructions: string;
	readonly criteria: readonly string[];
};

export type NoulQuestion = {
	readonly type: 'noul';
	readonly instructions: string;
	readonly criteria?: Readonly<{
		true: string;
		false: string;
	}>;
};

export type PrimitiveQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export type ChoiceAnswer = {
	readonly type: 'choice';
	readonly choice: string;
	readonly confidence: number | null;
	readonly probabilities: Readonly<Record<string, number>>;
};

export type ScoreAnswer = {
	readonly type: 'score';
	readonly score: number;
	readonly confidence: number | null;
	readonly probabilities: Readonly<Record<string, number>>;
	readonly legend: Readonly<Record<string, string>>;
};

export type NoulAnswer = {
	readonly type: 'noul';
	readonly noul: number;
};

export type PrimitiveAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

const SUM_TOLERANCE = 0.001;

// Provisional tolerance for rounded provider scores.
const SCORE_TOLERANCE = 0.011;

function plainRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return null;
	}

	const prototype = Object.getPrototypeOf(value);

	if (prototype !== Object.prototype && prototype !== null) {
		return null;
	}

	const descriptors = Object.getOwnPropertyDescriptors(value);

	if (
		Reflect.ownKeys(descriptors).some(
			(key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value')
		)
	) {
		return null;
	}

	return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	return (
		Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
	);
}

function distributionFrom(value: unknown, keys: readonly string[]): Record<string, number> | null {
	const source = plainRecord(value);

	if (!source || !exactKeys(source, keys)) {
		return null;
	}

	const entries: [string, number][] = [];
	let sum = 0;

	for (const key of keys) {
		const weight = source[key];

		if (!probability(weight)) {
			return null;
		}

		entries.push([key, weight]);
		sum += weight;
	}

	if (Math.abs(sum - 1) > SUM_TOLERANCE) {
		return null;
	}

	return Object.fromEntries(entries);
}

export function choiceAnswerFrom(question: ChoiceQuestion, value: unknown): ChoiceAnswer | null {
	const answer = plainRecord(value);

	if (
		!answer ||
		!exactKeys(answer, ['type', 'choice', 'confidence', 'probabilities']) ||
		answer.type !== 'choice'
	) {
		return null;
	}

	const { choice, confidence } = answer;
	const keys = Object.keys(question.criteria);

	if (
		typeof choice !== 'string' ||
		!Object.hasOwn(question.criteria, choice) ||
		(confidence !== null && !probability(confidence))
	) {
		return null;
	}

	const probabilities = distributionFrom(answer.probabilities, keys);

	if (!probabilities || keys.some((key) => probabilities[key] > probabilities[choice])) {
		return null;
	}

	return {
		type: 'choice',
		choice,
		confidence,
		probabilities
	};
}

export function scoreAnswerFrom(question: ScoreQuestion, value: unknown): ScoreAnswer | null {
	const answer = plainRecord(value);
	const levels = question.criteria;

	if (
		levels.length < 2 ||
		levels.length > 10 ||
		!answer ||
		!exactKeys(answer, ['type', 'score', 'confidence', 'probabilities', 'legend']) ||
		answer.type !== 'score'
	) {
		return null;
	}

	const { score, confidence } = answer;

	if (
		typeof score !== 'number' ||
		!Number.isFinite(score) ||
		score < 0 ||
		score > levels.length - 1 ||
		(confidence !== null && !probability(confidence))
	) {
		return null;
	}

	const keys = levels.map((_, index) => String(index));
	const probabilities = distributionFrom(answer.probabilities, keys);
	const legend = plainRecord(answer.legend);

	if (
		!probabilities ||
		!legend ||
		!exactKeys(legend, keys) ||
		keys.some((key) => legend[key] !== levels[Number(key)])
	) {
		return null;
	}

	const expectedScore = keys.reduce((sum, key) => sum + Number(key) * probabilities[key], 0);

	if (Math.abs(score - expectedScore) > SCORE_TOLERANCE) {
		return null;
	}

	return {
		type: 'score',
		score,
		confidence,
		probabilities,
		legend: Object.fromEntries(levels.map((level, index) => [String(index), level]))
	};
}

export function noulAnswerFrom(value: unknown): NoulAnswer | null {
	const answer = plainRecord(value);

	if (
		!answer ||
		!exactKeys(answer, ['type', 'noul']) ||
		answer.type !== 'noul' ||
		!probability(answer.noul)
	) {
		return null;
	}

	return {
		type: 'noul',
		noul: answer.noul
	};
}

export function primitiveAnswerFrom(
	question: PrimitiveQuestion,
	value: unknown
): PrimitiveAnswer | null {
	switch (question.type) {
		case 'choice':
			return choiceAnswerFrom(question, value);

		case 'score':
			return scoreAnswerFrom(question, value);

		case 'noul':
			return noulAnswerFrom(value);

		default:
			return null;
	}
}
