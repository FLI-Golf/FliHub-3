import assert from 'node:assert/strict';
import test from 'node:test';

import {
	applicationBatchFrom,
	syntheticObjectiveIds
} from '../src/lib/server/intelligence/application/batch.ts';

import { syntheticFixtureIds } from '../src/lib/server/intelligence/application/fixtures.ts';

import { mockApplicationAssessment } from '../src/lib/server/intelligence/application/mock.ts';

import { applicationDirectorFrom } from '../src/lib/server/intelligence/application/director.ts';

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

async function assessment(request = input) {
	const batch = applicationBatchFrom(request);
	assert.ok(batch);
	return (await mockApplicationAssessment(batch)).answers;
}

function select(answer, choice, confidence = 1) {
	answer.choice = choice;
	answer.confidence = confidence;

	answer.probabilities = Object.fromEntries(
		Object.keys(answer.probabilities).map((key) => [key, key === choice ? 1 : 0])
	);
}

test('all twelve registered director scenarios are supported', async () => {
	for (const objectiveId of syntheticObjectiveIds()) {
		for (const fixtureId of syntheticFixtureIds()) {
			const request = { objectiveId, fixtureId };
			const result = applicationDirectorFrom(request, await assessment(request));

			assert.equal(
				result.status,
				fixtureId === 'information_missing' ? 'clarification' : 'recommended'
			);
		}
	}
});

test('spring invitational produces an advisory group recommendation', async () => {
	assert.deepEqual(applicationDirectorFrom(input, await assessment()), {
		status: 'recommended',
		objective: 'prepare_event',
		capability: 'plan_group_assignments',
		confidence: 1,
		effect: 'recommendation-only'
	});
});

test('objective mismatch prevents a recommendation', async () => {
	const answers = await assessment();
	select(answers.objective, 'assess_event_readiness');

	assert.deepEqual(applicationDirectorFrom(input, answers), {
		status: 'abstained',
		reason: 'objective_mismatch'
	});
});

test('explicit objective abstention prevents a recommendation', async () => {
	const answers = await assessment();
	select(answers.objective, 'abstain');

	assert.deepEqual(applicationDirectorFrom(input, answers), {
		status: 'abstained',
		reason: 'objective_abstention'
	});
});

test('low or missing objective confidence prevents recommendations', async () => {
	for (const confidence of [null, 0, 0.79]) {
		const answers = await assessment();
		answers.objective.confidence = confidence;

		assert.deepEqual(applicationDirectorFrom(input, answers), {
			status: 'abstained',
			reason: 'objective_confidence'
		});
	}
});

test('objective confidence threshold is inclusive', async () => {
	const answers = await assessment();
	answers.objective.confidence = 0.8;

	assert.equal(applicationDirectorFrom(input, answers).status, 'recommended');
});

test('explicit recommendation abstention is preserved', async () => {
	const answers = await assessment();
	select(answers.next_recommendation, 'abstain');

	assert.deepEqual(applicationDirectorFrom(input, answers), {
		status: 'abstained',
		reason: 'recommendation_abstention'
	});
});

test('low or missing recommendation confidence prevents recommendations', async () => {
	for (const confidence of [null, 0, 0.79]) {
		const answers = await assessment();
		answers.next_recommendation.confidence = confidence;

		assert.deepEqual(applicationDirectorFrom(input, answers), {
			status: 'abstained',
			reason: 'recommendation_confidence'
		});
	}
});

test('recommendation confidence threshold is inclusive', async () => {
	const answers = await assessment();
	answers.next_recommendation.confidence = 0.8;

	assert.equal(applicationDirectorFrom(input, answers).status, 'recommended');
});

test('high clarification probability withholds an eligible recommendation', async () => {
	const answers = await assessment();
	answers.clarification_needed.noul = 0.8;

	assert.deepEqual(applicationDirectorFrom(input, answers), {
		status: 'clarification',
		reason: 'provider_clarification'
	});
});

test('clarification below threshold does not automatically block recommendations', async () => {
	const answers = await assessment();
	answers.clarification_needed.noul = 0.79;

	assert.equal(applicationDirectorFrom(input, answers).status, 'recommended');
});

test('missing context overrides provider confidence', async () => {
	const request = {
		...input,
		fixtureId: 'information_missing'
	};

	const answers = await assessment(request);

	answers.clarification_needed.noul = 0;
	select(answers.objective, 'assess_event_readiness');

	assert.deepEqual(applicationDirectorFrom(request, answers), {
		status: 'clarification',
		reason: 'missing_context'
	});
});

test('prerequisite review probability does not automatically block group planning', async () => {
	const answers = await assessment();
	answers.prerequisite_review_needed.noul = 1;

	const result = applicationDirectorFrom(input, answers);

	assert.equal(result.status, 'recommended');
	assert.equal(result.capability, 'plan_group_assignments');
});

test('readiness judgment cannot authorize or replace a recommendation', async () => {
	const answers = await assessment();

	answers.preparation_readiness.score = 4;
	answers.preparation_readiness.probabilities = Object.fromEntries(
		Object.keys(answers.preparation_readiness.probabilities).map((key) => [
			key,
			key === '4' ? 1 : 0
		])
	);

	const result = applicationDirectorFrom(input, answers);

	assert.equal(result.status, 'recommended');
	assert.equal(result.capability, 'plan_group_assignments');
	assert.equal(result.effect, 'recommendation-only');
	assert.equal(Object.hasOwn(result, 'authorized'), false);
});

test('unregistered operation recommendations are rejected', async () => {
	const answers = await assessment();
	answers.next_recommendation.choice = 'activate_event';

	assert.deepEqual(applicationDirectorFrom(input, answers), {
		status: 'unavailable',
		reason: 'invalid_response'
	});
});

test('ineligible recommendations are rejected', async () => {
	const request = {
		...input,
		fixtureId: 'groups_prepared'
	};

	assert.deepEqual(applicationDirectorFrom(request, await assessment()), {
		status: 'unavailable',
		reason: 'invalid_response'
	});
});

test('partial assessments are rejected', async () => {
	const answers = await assessment();
	delete answers.preparation_readiness;

	assert.deepEqual(applicationDirectorFrom(input, answers), {
		status: 'unavailable',
		reason: 'invalid_response'
	});
});

test('unexpected authorization fields are rejected', async () => {
	const answers = await assessment();
	answers.authorized = true;

	assert.deepEqual(applicationDirectorFrom(input, answers), {
		status: 'unavailable',
		reason: 'invalid_response'
	});
});

test('invalid requests are rejected', async () => {
	const answers = await assessment();

	for (const request of [
		null,
		{},
		{ ...input, objectiveId: 'unknown' },
		{ ...input, fixtureId: 'unknown' },
		{ ...input, execute: true }
	]) {
		assert.deepEqual(applicationDirectorFrom(request, answers), {
			status: 'unavailable',
			reason: 'invalid_request'
		});
	}
});

test('request accessors are rejected without invocation', async () => {
	let invoked = false;

	const request = {
		fixtureId: input.fixtureId,
		get objectiveId() {
			invoked = true;
			return input.objectiveId;
		}
	};

	assert.deepEqual(applicationDirectorFrom(request, await assessment()), {
		status: 'unavailable',
		reason: 'invalid_request'
	});

	assert.equal(invoked, false);
});

test('malformed provider objects fail safely', async () => {
	const answers = new Proxy(
		{},
		{
			getPrototypeOf() {
				throw new Error('Malformed provider object');
			}
		}
	);

	assert.deepEqual(applicationDirectorFrom(input, answers), {
		status: 'unavailable',
		reason: 'invalid_response'
	});
});

test('known missing venue takes priority over scoring preparation', async () => {
	const request = {
		...input,
		fixtureId: 'venue_missing'
	};

	const result = applicationDirectorFrom(request, await assessment(request));

	assert.equal(result.status, 'recommended');
	assert.equal(result.capability, 'review_event_prerequisites');
});

test('missing venue restricts the provider recommendation alternatives', () => {
	const batch = applicationBatchFrom({
		...input,
		fixtureId: 'venue_missing'
	});

	assert.ok(batch);

	assert.deepEqual(Object.keys(batch.questions.next_recommendation.criteria), [
		'review_event_prerequisites',
		'abstain'
	]);
});

test('provider cannot bypass essential prerequisite priority', async () => {
	const request = {
		...input,
		fixtureId: 'venue_missing'
	};

	const answers = await assessment(request);

	answers.next_recommendation.choice = 'review_scoring_requirements';

	assert.deepEqual(applicationDirectorFrom(request, answers), {
		status: 'unavailable',
		reason: 'invalid_response'
	});
});
