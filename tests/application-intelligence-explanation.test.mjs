import assert from 'node:assert/strict';
import test from 'node:test';

import {
	applicationBatchFrom,
	syntheticObjectiveIds
} from '../src/lib/server/intelligence/application/batch.ts';

import { syntheticFixtureIds } from '../src/lib/server/intelligence/application/fixtures.ts';

import { mockApplicationAssessment } from '../src/lib/server/intelligence/application/mock.ts';

import { applicationExplanationFrom } from '../src/lib/server/intelligence/application/explanation.ts';

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

async function assessment(request = input) {
	const batch = applicationBatchFrom(request);
	assert.ok(batch);
	return (await mockApplicationAssessment(batch)).answers;
}

async function explain(fixtureId = input.fixtureId) {
	const request = { ...input, fixtureId };

	return applicationExplanationFrom(request, await assessment(request));
}

test('all twelve registered scenarios produce explanations', async () => {
	for (const objectiveId of syntheticObjectiveIds()) {
		for (const fixtureId of syntheticFixtureIds()) {
			const request = { objectiveId, fixtureId };

			const result = applicationExplanationFrom(request, await assessment(request));

			assert.ok(result);
			assert.ok(result.heading);
			assert.ok(result.summary);
			assert.ok(result.disclaimer);
		}
	}
});

test('spring explanation accurately describes local facts', async () => {
	const result = await explain();

	assert.match(result.summary, /Event date is assigned/);
	assert.match(result.summary, /Venue is assigned/);
	assert.match(result.summary, /Registered participant count: 24/);
	assert.match(result.summary, /Competition group count: 0/);
	assert.match(result.summary, /Scoring is not configured/);
});

test('spring explanation recommends group planning', async () => {
	const result = await explain();

	assert.equal(result.recommendation, 'Plan group assignments');
	assert.match(result.reasoning, /no competition groups are recorded/);
});

test('alternatives use registered capability labels', async () => {
	const result = await explain();

	assert.deepEqual(result.alternatives, [
		'Review event prerequisites',
		'Review scoring requirements'
	]);
});

test('missing participants are accurately described', async () => {
	const result = await explain('participants_missing');

	assert.match(result.summary, /Registered participant count: 0/);
	assert.equal(result.recommendation, 'Review participant readiness');
	assert.match(result.reasoning, /No participants are registered/);
});

test('existing groups are described without claiming complete assignments', async () => {
	const result = await explain('groups_prepared');

	assert.match(result.summary, /Competition group count: 6/);
	assert.equal(result.recommendation, 'Review scoring requirements');
	assert.doesNotMatch(result.summary, /all participants are assigned/i);
});

test('configured scoring does not establish official readiness', async () => {
	const result = await explain('preparation_review');

	assert.match(result.summary, /Scoring is configured/);
	assert.equal(result.recommendation, 'Review event prerequisites');
	assert.match(result.reasoning, /does not establish official event readiness/);
});

test('missing venue takes priority over other considerations', async () => {
	const result = await explain('venue_missing');

	assert.match(result.summary, /Venue is not assigned/);
	assert.equal(result.recommendation, 'Review event prerequisites');
	assert.match(result.reasoning, /essential date or venue prerequisite is missing/);
	assert.deepEqual(result.alternatives, []);
});

test('unknown participant count is not represented as zero', async () => {
	const result = await explain('information_missing');

	assert.match(result.summary, /Registered participant count is unknown/);
	assert.doesNotMatch(result.summary, /Registered participant count: 0/);
});

test('missing information suppresses preparation advice', async () => {
	const result = await explain('information_missing');

	assert.equal(result.heading, 'Clarification needed');
	assert.equal(result.recommendation, 'Request clarification');
	assert.deepEqual(result.alternatives, []);
	assert.equal(result.readiness, null);
	assert.ok(result.notices.some((notice) => notice.includes('Required information is missing')));
});

test('provider clarification suppresses alternatives and readiness', async () => {
	const answers = await assessment();

	answers.clarification_needed.noul = 1;

	const result = applicationExplanationFrom(input, answers);

	assert.equal(result.heading, 'Clarification needed');
	assert.deepEqual(result.alternatives, []);
	assert.equal(result.readiness, null);
});

test('low objective confidence explains abstention', async () => {
	const answers = await assessment();

	answers.objective.confidence = 0.2;

	const result = applicationExplanationFrom(input, answers);

	assert.equal(result.heading, 'No recommendation available');
	assert.match(result.reasoning, /Confidence in the objective was insufficient/);
	assert.equal(result.recommendation, null);
	assert.deepEqual(result.alternatives, []);
	assert.equal(result.readiness, null);
});

test('low recommendation confidence explains abstention', async () => {
	const answers = await assessment();

	answers.next_recommendation.confidence = 0.2;

	const result = applicationExplanationFrom(input, answers);

	assert.match(result.reasoning, /Confidence in the recommendation was insufficient/);
	assert.equal(result.recommendation, null);
	assert.deepEqual(result.alternatives, []);
});

test('readiness uses a qualitative rubric rather than a percentage', async () => {
	const result = await explain();

	assert.match(result.readiness, /2\.00 on a 0–4 rubric/);
	assert.match(result.readiness, /not an official completion measurement/);
	assert.doesNotMatch(result.readiness, /%/);
});

test('insufficient readiness confidence suppresses the score', async () => {
	for (const confidence of [null, 0.79]) {
		const answers = await assessment();

		answers.preparation_readiness.confidence = confidence;

		const result = applicationExplanationFrom(input, answers);

		assert.equal(result.readiness, null);
		assert.equal(result.recommendation, 'Plan group assignments');
	}
});

test('negative prerequisite judgment does not establish readiness', async () => {
	const answers = await assessment();

	answers.prerequisite_review_needed.noul = 0;

	const result = applicationExplanationFrom(input, answers);

	assert.deepEqual(result.notices, []);
	assert.doesNotMatch(JSON.stringify(result), /all prerequisites are satisfied/i);
	assert.doesNotMatch(JSON.stringify(result), /ready to activate/i);
});

test('positive prerequisite judgment remains advisory', async () => {
	const answers = await assessment();

	answers.prerequisite_review_needed.noul = 1;

	const result = applicationExplanationFrom(input, answers);

	assert.ok(
		result.notices.some((notice) => notice.includes('suggests reviewing event prerequisites'))
	);

	assert.equal(result.recommendation, 'Plan group assignments');
});

test('invalid assessments cannot produce explanations', async () => {
	const answers = await assessment();

	delete answers.preparation_readiness;

	assert.equal(applicationExplanationFrom(input, answers), null);
});

test('unregistered execution instructions are rejected', async () => {
	const answers = await assessment();

	answers.execute = true;

	assert.equal(applicationExplanationFrom(input, answers), null);
});

test('explanations are deterministic and advisory only', async () => {
	const answers = await assessment();

	const first = applicationExplanationFrom(input, answers);
	const second = applicationExplanationFrom(input, answers);

	assert.deepEqual(first, second);

	assert.equal(
		first.disclaimer,
		'Synthetic advisory assessment only. No execution or application changes are authorized.'
	);
});
