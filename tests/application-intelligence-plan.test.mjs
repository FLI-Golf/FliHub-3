import assert from 'node:assert/strict';
import test from 'node:test';

import {
	applicationBatchFrom,
	syntheticObjectiveIds
} from '../src/lib/server/intelligence/application/batch.ts';

import {
	getSyntheticFixture,
	syntheticFixtureIds
} from '../src/lib/server/intelligence/application/fixtures.ts';

import { mockApplicationAssessment } from '../src/lib/server/intelligence/application/mock.ts';

import { applicationAdvisoryPlanFrom } from '../src/lib/server/intelligence/application/plan.ts';

import { eligibleSyntheticRecommendations } from '../src/lib/server/intelligence/application/eligibility.ts';

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

async function assessment(request = input) {
	const batch = applicationBatchFrom(request);
	assert.ok(batch);
	return (await mockApplicationAssessment(batch)).answers;
}

test('all twelve registered scenarios produce advisory plans', async () => {
	for (const objectiveId of syntheticObjectiveIds()) {
		for (const fixtureId of syntheticFixtureIds()) {
			const request = { objectiveId, fixtureId };

			const plan = applicationAdvisoryPlanFrom(request, await assessment(request));

			assert.ok(plan);
			assert.equal(plan.kind, 'synthetic-advisory-plan');
			assert.equal(plan.effect, 'recommendation-only');
			assert.equal(plan.execution, 'not-implemented');
		}
	}
});

test('plan facts come from registered local context', async () => {
	const plan = applicationAdvisoryPlanFrom(input, await assessment());

	assert.deepEqual(plan.facts, getSyntheticFixture(input.fixtureId));

	assert.equal(plan.facts.participantCount, 24);
	assert.equal(plan.facts.groupCount, 0);
	assert.equal(plan.facts.scoringConfigured, false);
});

test('spring invitational recommends group planning', async () => {
	const plan = applicationAdvisoryPlanFrom(input, await assessment());

	assert.equal(plan.decision.status, 'recommended');
	assert.equal(plan.nextStep.capability, 'plan_group_assignments');
	assert.equal(plan.nextStep.label, 'Plan group assignments');
	assert.equal(plan.nextStep.effect, 'recommendation-only');
});

test('alternatives exclude the selected recommendation', async () => {
	const plan = applicationAdvisoryPlanFrom(input, await assessment());

	assert.deepEqual(
		plan.alternatives.map((step) => step.capability),
		['review_event_prerequisites', 'review_scoring_requirements']
	);
});

test('all preparation recommendations remain locally eligible', async () => {
	for (const fixtureId of syntheticFixtureIds()) {
		const request = { ...input, fixtureId };

		const plan = applicationAdvisoryPlanFrom(request, await assessment(request));

		const eligible = eligibleSyntheticRecommendations(plan.facts);

		if (plan.decision.status === 'recommended') {
			assert.ok(eligible.includes(plan.nextStep.capability));
		}

		for (const alternative of plan.alternatives) {
			assert.ok(eligible.includes(alternative.capability));
			assert.equal(alternative.effect, 'recommendation-only');
		}
	}
});

test('missing venue produces prerequisite review without alternatives', async () => {
	const request = {
		...input,
		fixtureId: 'venue_missing'
	};

	const plan = applicationAdvisoryPlanFrom(request, await assessment(request));

	assert.equal(plan.nextStep.capability, 'review_event_prerequisites');

	assert.deepEqual(plan.alternatives, []);
	assert.equal(plan.facts.venueAssigned, false);
});

test('missing information produces clarification without preparation advice', async () => {
	const request = {
		...input,
		fixtureId: 'information_missing'
	};

	const plan = applicationAdvisoryPlanFrom(request, await assessment(request));

	assert.equal(plan.decision.status, 'clarification');
	assert.equal(plan.nextStep.capability, 'request_clarification');
	assert.deepEqual(plan.alternatives, []);
	assert.equal(plan.readiness, null);
	assert.equal(plan.facts.participantCount, null);
});

test('provider clarification suppresses preparation recommendations', async () => {
	const answers = await assessment();
	answers.clarification_needed.noul = 1;

	const plan = applicationAdvisoryPlanFrom(input, answers);

	assert.equal(plan.decision.status, 'clarification');
	assert.equal(plan.nextStep.capability, 'request_clarification');
	assert.deepEqual(plan.alternatives, []);
	assert.equal(plan.readiness, null);
});

test('director abstention produces no recommended next step', async () => {
	const answers = await assessment();
	answers.objective.confidence = 0.2;

	const plan = applicationAdvisoryPlanFrom(input, answers);

	assert.equal(plan.decision.status, 'abstained');
	assert.equal(plan.nextStep, null);
	assert.deepEqual(plan.alternatives, []);
	assert.equal(plan.readiness, null);
});

test('readiness is explicitly qualitative', async () => {
	const plan = applicationAdvisoryPlanFrom(input, await assessment());

	assert.deepEqual(plan.readiness, {
		score: 2,
		maximum: 4,
		confidence: 1,
		interpretation: 'qualitative-only'
	});
});

test('low or missing readiness confidence suppresses the score', async () => {
	for (const confidence of [null, 0, 0.79]) {
		const answers = await assessment();
		answers.preparation_readiness.confidence = confidence;

		const plan = applicationAdvisoryPlanFrom(input, answers);

		assert.equal(plan.readiness, null);
		assert.equal(plan.decision.status, 'recommended');
	}
});

test('readiness confidence threshold is inclusive', async () => {
	const answers = await assessment();
	answers.preparation_readiness.confidence = 0.8;

	const plan = applicationAdvisoryPlanFrom(input, answers);

	assert.equal(plan.readiness.confidence, 0.8);
});

test('prerequisite review judgment does not change observed facts', async () => {
	const answers = await assessment();

	answers.prerequisite_review_needed.noul = 0.8;

	const plan = applicationAdvisoryPlanFrom(input, answers);

	assert.equal(plan.prerequisiteReviewSuggested, true);
	assert.equal(plan.facts.venueAssigned, true);
	assert.equal(plan.facts.dateAssigned, true);
	assert.equal(plan.nextStep.capability, 'plan_group_assignments');
});

test('invalid assessments cannot produce plans', async () => {
	const answers = await assessment();
	delete answers.preparation_readiness;

	assert.equal(applicationAdvisoryPlanFrom(input, answers), null);
});

test('unexpected execution fields cannot enter plans', async () => {
	const answers = await assessment();
	answers.authorized = true;

	assert.equal(applicationAdvisoryPlanFrom(input, answers), null);
});

test('invalid requests cannot produce plans', async () => {
	const answers = await assessment();

	for (const request of [
		null,
		{},
		{ ...input, fixtureId: 'unknown' },
		{ ...input, objectiveId: 'unknown' },
		{ ...input, execute: true }
	]) {
		assert.equal(applicationAdvisoryPlanFrom(request, answers), null);
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

	assert.equal(applicationAdvisoryPlanFrom(request, await assessment()), null);

	assert.equal(invoked, false);
});

test('returned plans cannot mutate registered fixtures or capabilities', async () => {
	const answers = await assessment();

	const first = applicationAdvisoryPlanFrom(input, answers);

	first.facts.participantCount = 999;
	first.nextStep.label = 'Modified';
	first.alternatives.length = 0;

	const second = applicationAdvisoryPlanFrom(input, answers);

	assert.equal(second.facts.participantCount, 24);
	assert.equal(second.nextStep.label, 'Plan group assignments');
	assert.equal(second.alternatives.length, 2);
});

test('returned plans are independent of subsequent provider mutations', async () => {
	const answers = await assessment();

	const plan = applicationAdvisoryPlanFrom(input, answers);

	answers.next_recommendation.choice = 'activate_event';
	answers.preparation_readiness.score = 4;

	assert.equal(plan.nextStep.capability, 'plan_group_assignments');
	assert.equal(plan.readiness.score, 2);
});

test('malformed provider objects fail safely', () => {
	const answers = new Proxy(
		{},
		{
			getPrototypeOf() {
				throw new Error('Malformed provider object');
			}
		}
	);

	assert.equal(applicationAdvisoryPlanFrom(input, answers), null);
});
