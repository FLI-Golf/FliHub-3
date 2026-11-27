import test from 'node:test';
import assert from 'node:assert/strict';

import {
	applicationJevRequestFrom,
	applicationJevResponseFrom
} from '../src/lib/server/intelligence/application/jev-adapter.ts';

import { MODEL } from '../src/lib/server/intelligence/providers.ts';

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

function choice(selected, criteria) {
	return {
		type: 'choice',
		choice: selected,
		confidence: 1,
		probabilities: Object.fromEntries(
			Object.keys(criteria).map((key) => [key, key === selected ? 1 : 0])
		)
	};
}

function envelope() {
	const request = applicationJevRequestFrom(input);
	const questions = request.questions;

	return {
		model: MODEL,
		usage: {
			input_tokens: 500,
			output_tokens: 50
		},
		answers: {
			objective: choice('prepare_event', questions.objective.criteria),
			next_recommendation: choice('plan_group_assignments', questions.next_recommendation.criteria),
			preparation_readiness: {
				type: 'score',
				score: 2,
				confidence: 1,
				probabilities: {
					0: 0,
					1: 0,
					2: 1,
					3: 0,
					4: 0
				},
				legend: Object.fromEntries(
					questions.preparation_readiness.criteria.map((label, index) => [String(index), label])
				)
			},
			clarification_needed: {
				type: 'noul',
				noul: 0
			},
			prerequisite_review_needed: {
				type: 'noul',
				noul: 1
			}
		}
	};
}

const invalidOutput = {
	status: 'unavailable',
	reason: 'invalid_output'
};

test('constructs a pinned five-question synthetic request', () => {
	const request = applicationJevRequestFrom(input);

	assert.equal(request.model, MODEL);
	assert.deepEqual(Object.keys(request).sort(), ['model', 'questions', 'state']);

	assert.equal(Object.keys(request.questions).length, 5);
	assert.equal(JSON.parse(request.state).context.source, 'synthetic');
	assert.equal(JSON.parse(request.state).context.participantCount, 24);
});

test('rejects arbitrary context and provider overrides', () => {
	for (const invalid of [
		null,
		{},
		{ ...input, state: 'arbitrary context' },
		{ ...input, model: 'jev-latest' },
		{ ...input, fixtureId: 'production-event' },
		{ ...input, prompt: 'arbitrary instruction' }
	]) {
		assert.equal(applicationJevRequestFrom(invalid), null);
	}
});

test('accepts a complete synthetic provider response', () => {
	const result = applicationJevResponseFrom(input, envelope());

	assert.equal(result.status, 'assessed');
	assert.equal(result.model, MODEL);
	assert.deepEqual(result.usage, {
		inputTokens: 500,
		outputTokens: 50
	});
	assert.equal(result.answers.next_recommendation.choice, 'plan_group_assignments');
	assert.equal(result.answers.preparation_readiness.score, 2);
});

test('rejects an incorrect model', () => {
	assert.deepEqual(
		applicationJevResponseFrom(input, {
			...envelope(),
			model: 'jev-latest'
		}),
		invalidOutput
	);
});

test('rejects malformed usage metadata', () => {
	for (const usage of [
		null,
		{},
		{ input_tokens: 0, output_tokens: 50 },
		{ input_tokens: -1, output_tokens: 50 },
		{ input_tokens: 1.5, output_tokens: 50 },
		{ input_tokens: '500', output_tokens: 50 },
		{ input_tokens: 500, output_tokens: -1 },
		{ input_tokens: Infinity, output_tokens: 50 },
		{ input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 50 }
	]) {
		assert.deepEqual(
			applicationJevResponseFrom(input, {
				...envelope(),
				usage
			}),
			invalidOutput
		);
	}
});

test('rejects incomplete answers while retaining valid usage', () => {
	const response = envelope();

	delete response.answers.clarification_needed;

	assert.deepEqual(applicationJevResponseFrom(input, response), {
		...invalidOutput,
		model: MODEL,
		usage: {
			inputTokens: 500,
			outputTokens: 50
		}
	});
});

test('rejects an ineligible recommendation', () => {
	const response = envelope();

	response.answers.next_recommendation.choice = 'review_participant_readiness';

	assert.equal(applicationJevResponseFrom(input, response).status, 'unavailable');
});

test('rejects unexpected envelope fields', () => {
	assert.deepEqual(
		applicationJevResponseFrom(input, {
			...envelope(),
			execute: true
		}),
		invalidOutput
	);
});

test('rejects unexpected answer identifiers', () => {
	const response = envelope();

	response.answers.execute_operation = {
		type: 'noul',
		noul: 1
	};

	assert.equal(applicationJevResponseFrom(input, response).status, 'unavailable');
});

test('rejects invalid registered input', () => {
	assert.deepEqual(applicationJevResponseFrom({}, envelope()), {
		status: 'unavailable',
		reason: 'invalid_input'
	});
});

test('rejects envelope accessors without invoking them', () => {
	let invoked = false;
	const response = envelope();

	Object.defineProperty(response, 'usage', {
		get() {
			invoked = true;
			return {};
		}
	});

	assert.deepEqual(applicationJevResponseFrom(input, response), invalidOutput);

	assert.equal(invoked, false);
});

test('validated answers are independent copies', () => {
	const response = envelope();
	const result = applicationJevResponseFrom(input, response);

	assert.equal(result.status, 'assessed');

	response.answers.next_recommendation.choice = 'invalid';

	assert.equal(result.answers.next_recommendation.choice, 'plan_group_assignments');
});
