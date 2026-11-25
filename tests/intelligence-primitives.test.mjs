import test from 'node:test';
import assert from 'node:assert/strict';

import {
	choiceAnswerFrom,
	scoreAnswerFrom,
	noulAnswerFrom,
	primitiveAnswerFrom
} from '../src/lib/server/intelligence/primitives.ts';

const choiceQuestion = {
	type: 'choice',
	instructions: 'Select an eligible preparation recommendation.',
	criteria: {
		plan_group_assignments: 'Prepare competition groups',
		review_scoring_requirements: 'Review scoring configuration',
		abstain: 'Insufficient information'
	}
};

const choiceAnswer = {
	type: 'choice',
	choice: 'plan_group_assignments',
	confidence: 0.94,
	probabilities: {
		plan_group_assignments: 0.94,
		review_scoring_requirements: 0.04,
		abstain: 0.02
	}
};

const scoreQuestion = {
	type: 'score',
	instructions: 'Assess qualitative event preparation.',
	criteria: [
		'Not prepared',
		'Early preparation',
		'Partially prepared',
		'Mostly prepared',
		'Preparation appears complete'
	]
};

const scoreAnswer = {
	type: 'score',
	score: 2.4,
	confidence: 0.85,
	probabilities: {
		0: 0,
		1: 0.1,
		2: 0.5,
		3: 0.3,
		4: 0.1
	},
	legend: {
		0: 'Not prepared',
		1: 'Early preparation',
		2: 'Partially prepared',
		3: 'Mostly prepared',
		4: 'Preparation appears complete'
	}
};

const noulQuestion = {
	type: 'noul',
	instructions: 'Does the context require clarification?'
};

const noulAnswer = {
	type: 'noul',
	noul: 0.92
};

// Choice

test('Choice accepts a valid registered judgment', () => {
	assert.deepEqual(choiceAnswerFrom(choiceQuestion, choiceAnswer), choiceAnswer);
});

test('Choice rejects unknown or unregistered selections', () => {
	for (const choice of ['activate_event', 'execute_command', 'constructor', '__proto__', null]) {
		assert.equal(
			choiceAnswerFrom(choiceQuestion, {
				...choiceAnswer,
				choice
			}),
			null
		);
	}
});

test('Choice rejects a selection below the maximum probability', () => {
	assert.equal(
		choiceAnswerFrom(choiceQuestion, {
			...choiceAnswer,
			choice: 'review_scoring_requirements'
		}),
		null
	);
});

test('Choice rejects malformed probability distributions', () => {
	for (const probabilities of [
		{},
		null,
		[],
		{
			...choiceAnswer.probabilities,
			unregistered: 0
		},
		{
			...choiceAnswer.probabilities,
			plan_group_assignments: 0.5
		},
		{
			...choiceAnswer.probabilities,
			abstain: -0.02
		},
		{
			...choiceAnswer.probabilities,
			abstain: NaN
		},
		{
			...choiceAnswer.probabilities,
			abstain: '0.02'
		}
	]) {
		assert.equal(
			choiceAnswerFrom(choiceQuestion, {
				...choiceAnswer,
				probabilities
			}),
			null
		);
	}
});

test('Choice preserves formally valid null and low confidence', () => {
	for (const confidence of [null, 0, 0.2, 1]) {
		assert.equal(
			choiceAnswerFrom(choiceQuestion, {
				...choiceAnswer,
				confidence
			}).confidence,
			confidence
		);
	}
});

test('Choice rejects invalid confidence values', () => {
	for (const confidence of [undefined, -1, 1.1, NaN, Infinity, '0.9', true]) {
		assert.equal(
			choiceAnswerFrom(choiceQuestion, {
				...choiceAnswer,
				confidence
			}),
			null
		);
	}
});

test('Choice preserves explicit abstention as a valid judgment', () => {
	const answer = {
		...choiceAnswer,
		choice: 'abstain',
		probabilities: {
			plan_group_assignments: 0.02,
			review_scoring_requirements: 0.04,
			abstain: 0.94
		}
	};

	assert.deepEqual(choiceAnswerFrom(choiceQuestion, answer), answer);
});

// Score

test('Score accepts a valid fractional weighted score', () => {
	assert.deepEqual(scoreAnswerFrom(scoreQuestion, scoreAnswer), scoreAnswer);
});

test('Score accepts consistent lower and upper boundaries', () => {
	for (const boundary of [0, 4]) {
		const probabilities = Object.fromEntries(
			scoreQuestion.criteria.map((_, index) => [String(index), index === boundary ? 1 : 0])
		);

		const answer = {
			...scoreAnswer,
			score: boundary,
			probabilities
		};

		assert.deepEqual(scoreAnswerFrom(scoreQuestion, answer), answer);
	}
});

test('Score rejects values outside the rubric range', () => {
	for (const score of [-1, 4.01, 100, NaN, Infinity, '2.4', null]) {
		assert.equal(
			scoreAnswerFrom(scoreQuestion, {
				...scoreAnswer,
				score
			}),
			null
		);
	}
});

test('Score rejects inconsistent weighted means', () => {
	assert.equal(
		scoreAnswerFrom(scoreQuestion, {
			...scoreAnswer,
			score: 3.5
		}),
		null
	);
});

test('Score accepts bounded rounding differences', () => {
	assert.ok(
		scoreAnswerFrom(scoreQuestion, {
			...scoreAnswer,
			score: 2.41
		})
	);

	assert.equal(
		scoreAnswerFrom(scoreQuestion, {
			...scoreAnswer,
			score: 2.42
		}),
		null
	);
});

test('Score rejects incorrect or incomplete legends', () => {
	for (const legend of [
		null,
		{},
		{
			...scoreAnswer.legend,
			2: 'Event officially ready'
		},
		{
			...scoreAnswer.legend,
			5: 'Unexpected level'
		}
	]) {
		assert.equal(
			scoreAnswerFrom(scoreQuestion, {
				...scoreAnswer,
				legend
			}),
			null
		);
	}
});

test('Score rejects malformed probability distributions', () => {
	for (const probabilities of [
		{},
		null,
		{
			...scoreAnswer.probabilities,
			5: 0
		},
		{
			...scoreAnswer.probabilities,
			2: 0.2
		},
		{
			...scoreAnswer.probabilities,
			2: -0.5
		},
		{
			...scoreAnswer.probabilities,
			2: Infinity
		}
	]) {
		assert.equal(
			scoreAnswerFrom(scoreQuestion, {
				...scoreAnswer,
				probabilities
			}),
			null
		);
	}
});

test('Score preserves valid null and low confidence', () => {
	for (const confidence of [null, 0, 0.2, 1]) {
		assert.equal(
			scoreAnswerFrom(scoreQuestion, {
				...scoreAnswer,
				confidence
			}).confidence,
			confidence
		);
	}
});

test('Score rejects invalid confidence', () => {
	for (const confidence of [undefined, -0.1, 1.1, NaN, Infinity, '0.85']) {
		assert.equal(
			scoreAnswerFrom(scoreQuestion, {
				...scoreAnswer,
				confidence
			}),
			null
		);
	}
});

test('Score rejects unsupported local rubric lengths', () => {
	for (const criteria of [
		[],
		['Single level'],
		Array.from({ length: 11 }, (_, i) => `Level ${i}`)
	]) {
		assert.equal(scoreAnswerFrom({ ...scoreQuestion, criteria }, scoreAnswer), null);
	}
});

// Noul

test('Noul accepts valid probability judgments', () => {
	for (const noul of [0, 0.2, 0.5, 0.8, 0.92, 1]) {
		const answer = { type: 'noul', noul };

		assert.deepEqual(noulAnswerFrom(answer), answer);
	}
});

test('Noul rejects invalid probabilities', () => {
	for (const noul of [undefined, null, -0.1, 1.1, NaN, Infinity, '0.92', true]) {
		assert.equal(noulAnswerFrom({ type: 'noul', noul }), null);
	}
});

test('Noul rejects invented confidence fields', () => {
	assert.equal(
		noulAnswerFrom({
			...noulAnswer,
			confidence: 0.95
		}),
		null
	);
});

// Shared primitive boundary

const cases = [
	[choiceQuestion, choiceAnswer],
	[scoreQuestion, scoreAnswer],
	[noulQuestion, noulAnswer]
];

test('primitive dispatcher accepts matching answer types', () => {
	for (const [question, answer] of cases) {
		assert.deepEqual(primitiveAnswerFrom(question, answer), answer);
	}
});

test('primitive dispatcher rejects mismatched answer types', () => {
	for (const [question] of cases) {
		for (const [, answer] of cases) {
			if (question.type !== answer.type) {
				assert.equal(primitiveAnswerFrom(question, answer), null);
			}
		}
	}
});

test('primitive responses reject unexpected execution fields', () => {
	for (const [question, answer] of cases) {
		for (const extra of [
			{ execute: true },
			{ authorized: true },
			{ command: 'unexpected' },
			{ operation: 'activate_event' },
			{ [Symbol('unexpected')]: true }
		]) {
			assert.equal(
				primitiveAnswerFrom(question, {
					...answer,
					...extra
				}),
				null
			);
		}
	}
});

test('primitive responses reject missing or malformed answers', () => {
	for (const [question] of cases) {
		for (const answer of [null, undefined, [], {}, 'answer', 42]) {
			assert.equal(primitiveAnswerFrom(question, answer), null);
		}
	}
});

test('primitive responses reject accessors without invoking them', () => {
	for (const [question, answer] of cases) {
		let invoked = false;

		const invalid = { ...answer };

		Object.defineProperty(invalid, 'type', {
			enumerable: true,
			get() {
				invoked = true;
				return question.type;
			}
		});

		assert.equal(primitiveAnswerFrom(question, invalid), null);

		assert.equal(invoked, false);
	}
});

test('primitive responses reject inherited answer properties', () => {
	for (const [question, answer] of cases) {
		assert.equal(primitiveAnswerFrom(question, Object.create(answer)), null);
	}
});

test('validated primitive answers are independent copies', () => {
	for (const [question, answer] of cases) {
		const validated = primitiveAnswerFrom(question, answer);

		assert.deepEqual(validated, answer);
		assert.notEqual(validated, answer);

		if ('probabilities' in answer) {
			assert.notEqual(validated.probabilities, answer.probabilities);
		}

		if ('legend' in answer) {
			assert.notEqual(validated.legend, answer.legend);
		}
	}
});
