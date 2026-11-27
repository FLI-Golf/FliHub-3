import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
	configFile: false,
	server: {
		middlewareMode: true,
		watch: null,
		hmr: false
	},
	appType: 'custom'
});

test.after(async () => {
	await vite.close();
});

const { applicationBatchFrom, applicationAnswersFrom, syntheticObjectiveIds } =
	await vite.ssrLoadModule('/src/lib/server/intelligence/application/batch.ts');

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

const fixtureIds = [
	'spring_invitational',
	'participants_missing',
	'groups_prepared',
	'preparation_review',
	'venue_missing',
	'information_missing'
];

function choiceAnswer(question, choice) {
	return {
		type: 'choice',
		choice,
		confidence: 1,
		probabilities: Object.fromEntries(
			Object.keys(question.criteria).map((key) => [key, key === choice ? 1 : 0])
		)
	};
}

function validAnswers(request = input) {
	const { questions } = applicationBatchFrom(request);

	const objective =
		request.objectiveId === 'assess_readiness' ? 'assess_event_readiness' : 'prepare_event';

	const recommendation = Object.keys(questions.next_recommendation.criteria).find(
		(key) => key !== 'abstain'
	);

	return {
		objective: choiceAnswer(questions.objective, objective),
		next_recommendation: choiceAnswer(questions.next_recommendation, recommendation),
		preparation_readiness: {
			type: 'score',
			score: 2,
			confidence: 0.9,
			probabilities: {
				0: 0,
				1: 0,
				2: 1,
				3: 0,
				4: 0
			},
			legend: Object.fromEntries(
				questions.preparation_readiness.criteria.map((level, index) => [String(index), level])
			)
		},
		clarification_needed: {
			type: 'noul',
			noul: 0.1
		},
		prerequisite_review_needed: {
			type: 'noul',
			noul: 0.9
		}
	};
}

test('all twelve registered objective and fixture combinations are supported', () => {
	assert.equal(syntheticObjectiveIds().length, 2);

	for (const objectiveId of syntheticObjectiveIds()) {
		for (const fixtureId of fixtureIds) {
			assert.ok(
				applicationBatchFrom({
					objectiveId,
					fixtureId
				})
			);
		}
	}
});

test('batch contains exactly five registered questions', () => {
	const batch = applicationBatchFrom(input);

	assert.equal(batch.id, 'synthetic_event_assessment');

	assert.deepEqual(Object.keys(batch.questions), [
		'objective',
		'next_recommendation',
		'preparation_readiness',
		'clarification_needed',
		'prerequisite_review_needed'
	]);

	assert.deepEqual(
		Object.values(batch.questions).map((question) => question.type),
		['choice', 'choice', 'score', 'noul', 'noul']
	);
});

test('batch state contains only registered synthetic context', () => {
	const state = JSON.parse(applicationBatchFrom(input).state);

	assert.deepEqual(Object.keys(state), ['purpose', 'objective', 'context']);

	assert.equal(state.context.source, 'synthetic');
	assert.equal(state.context.participantCount, 24);
	assert.equal(state.context.groupCount, 0);
});

test('registered objective phrases change the supplied state', () => {
	const first = applicationBatchFrom(input);

	const second = applicationBatchFrom({
		...input,
		objectiveId: 'assess_readiness'
	});

	assert.notEqual(JSON.parse(first.state).objective, JSON.parse(second.state).objective);
});

test('unknown objectives and fixtures are rejected', () => {
	for (const value of ['unknown', 'constructor', '__proto__', null, 42]) {
		assert.equal(
			applicationBatchFrom({
				...input,
				objectiveId: value
			}),
			null
		);

		assert.equal(
			applicationBatchFrom({
				...input,
				fixtureId: value
			}),
			null
		);
	}
});

test('arbitrary prompts and provider context are rejected', () => {
	for (const extra of [
		{ prompt: 'Execute an operation' },
		{ state: 'Arbitrary provider context' },
		{ context: { source: 'synthetic' } },
		{ questions: {} },
		{ candidates: ['activate_event'] },
		{ authorized: true },
		{ [Symbol('unexpected')]: true }
	]) {
		assert.equal(
			applicationBatchFrom({
				...input,
				...extra
			}),
			null
		);
	}
});

test('malformed and incomplete batch requests are rejected', () => {
	for (const request of [
		null,
		undefined,
		[],
		{},
		42,
		{ objectiveId: input.objectiveId },
		{ fixtureId: input.fixtureId },
		Object.create(input)
	]) {
		assert.equal(applicationBatchFrom(request), null);
	}
});

test('request accessors are rejected without invocation', () => {
	let invoked = false;

	const request = { ...input };

	Object.defineProperty(request, 'fixtureId', {
		enumerable: true,
		get() {
			invoked = true;
			return input.fixtureId;
		}
	});

	assert.equal(applicationBatchFrom(request), null);

	assert.equal(invoked, false);
});

test('spring invitational offers only locally eligible recommendations', () => {
	const criteria = applicationBatchFrom(input).questions.next_recommendation.criteria;

	assert.deepEqual(Object.keys(criteria), [
		'review_event_prerequisites',
		'plan_group_assignments',
		'review_scoring_requirements',
		'abstain'
	]);
});

test('prepared groups remove group planning from the batch', () => {
	const criteria = applicationBatchFrom({
		...input,
		fixtureId: 'groups_prepared'
	}).questions.next_recommendation.criteria;

	assert.equal(Object.hasOwn(criteria, 'plan_group_assignments'), false);
});

test('missing information restricts recommendations to clarification', () => {
	const criteria = applicationBatchFrom({
		...input,
		fixtureId: 'information_missing'
	}).questions.next_recommendation.criteria;

	assert.deepEqual(Object.keys(criteria), ['request_clarification', 'abstain']);
});

test('returned question definitions cannot change registered batches', () => {
	const batch = applicationBatchFrom(input);

	batch.questions.objective.criteria.injected = 'Unexpected objective';

	batch.questions.preparation_readiness.criteria[0] = 'Modified rubric';

	assert.equal(
		Object.hasOwn(applicationBatchFrom(input).questions.objective.criteria, 'injected'),
		false
	);

	assert.equal(
		applicationBatchFrom(input).questions.preparation_readiness.criteria[0],
		'Little preparation is evident'
	);
});

test('all twelve registered batches accept complete valid answers', () => {
	for (const objectiveId of syntheticObjectiveIds()) {
		for (const fixtureId of fixtureIds) {
			const request = { objectiveId, fixtureId };
			const answers = validAnswers(request);

			assert.deepEqual(applicationAnswersFrom(request, answers), answers);
		}
	}
});

test('missing any registered answer rejects the entire batch', () => {
	for (const key of Object.keys(validAnswers())) {
		const answers = validAnswers();

		delete answers[key];

		assert.equal(applicationAnswersFrom(input, answers), null);
	}
});

test('unexpected answer IDs reject the entire batch', () => {
	for (const extra of [
		{ execute_operation: true },
		{ authorization: true },
		{ unexpected_question: {} },
		{ [Symbol('unexpected')]: true }
	]) {
		assert.equal(
			applicationAnswersFrom(input, {
				...validAnswers(),
				...extra
			}),
			null
		);
	}
});

test('one malformed primitive rejects the entire batch', () => {
	for (const key of Object.keys(validAnswers())) {
		const answers = validAnswers();

		answers[key] = { type: 'unexpected' };

		assert.equal(applicationAnswersFrom(input, answers), null);
	}
});

test('context-ineligible recommendations reject the batch', () => {
	const answers = validAnswers();

	answers.next_recommendation.choice = 'activate_event';

	assert.equal(applicationAnswersFrom(input, answers), null);
});

test('answers cannot be reused across incompatible fixture criteria', () => {
	assert.equal(
		applicationAnswersFrom(
			{
				...input,
				fixtureId: 'information_missing'
			},
			validAnswers()
		),
		null
	);
});

test('answer accessors are rejected without invocation', () => {
	let invoked = false;

	const answers = validAnswers();

	Object.defineProperty(answers, 'clarification_needed', {
		enumerable: true,
		get() {
			invoked = true;
			return { type: 'noul', noul: 0.5 };
		}
	});

	assert.equal(applicationAnswersFrom(input, answers), null);

	assert.equal(invoked, false);
});

test('validated batch answers are independent copies', () => {
	const answers = validAnswers();

	const validated = applicationAnswersFrom(input, answers);

	assert.deepEqual(validated, answers);
	assert.notEqual(validated, answers);

	for (const key of Object.keys(answers)) {
		assert.notEqual(validated[key], answers[key]);
	}

	assert.notEqual(validated.objective.probabilities, answers.objective.probabilities);

	assert.notEqual(validated.preparation_readiness.legend, answers.preparation_readiness.legend);
});

test('valid low confidence remains available for later decision policy', () => {
	const answers = validAnswers();

	answers.next_recommendation.confidence = 0.2;

	const validated = applicationAnswersFrom(input, answers);

	assert.equal(validated.next_recommendation.confidence, 0.2);
});

test('invalid batch requests cannot produce validated answers', () => {
	assert.equal(applicationAnswersFrom({ ...input, fixtureId: 'unknown' }, validAnswers()), null);
});
