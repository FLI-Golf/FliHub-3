import assert from 'node:assert/strict';
import test from 'node:test';

import { createIntelligence } from '../src/lib/server/intelligence/service.ts';

import { syntheticObjectiveIds } from '../src/lib/server/intelligence/application/batch.ts';

import { syntheticFixtureIds } from '../src/lib/server/intelligence/application/fixtures.ts';

import { RESERVED_TOKENS } from '../src/lib/server/intelligence/providers.ts';

const env = {
	FLIHUB_INTELLIGENCE_ENABLED: 'true',
	FLIHUB_INTELLIGENCE_PROVIDER: 'mock'
};

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

const engineeringRequest = {
	id: 'developmentRisk',
	state: 'local build with uncertain side effects'
};

test('advisory service is disabled by default', async () => {
	const service = createIntelligence();

	assert.deepEqual(await service.adviseApplication(input), {
		status: 'disabled'
	});
});

test('live Jev configuration cannot dispatch advisory requests', async () => {
	let calls = 0;

	const service = createIntelligence(
		{
			...env,
			FLIHUB_INTELLIGENCE_PROVIDER: 'jev',
			FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS: String(RESERVED_TOKENS),
			TYPESAFE_API_KEY: 'synthetic-test-key'
		},
		{
			fetch: async () => {
				calls++;
				throw new Error('Network access forbidden');
			}
		}
	);

	assert.deepEqual(await service.adviseApplication(input), {
		status: 'disabled'
	});

	assert.equal(calls, 0);
});

test('all twelve scenarios return complete advisory responses', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '60'
	});

	let count = 0;

	for (const objectiveId of syntheticObjectiveIds()) {
		for (const fixtureId of syntheticFixtureIds()) {
			const result = await service.adviseApplication({
				objectiveId,
				fixtureId
			});

			assert.equal(result.status, 'advised');
			assert.equal(result.source, 'mock');
			assert.ok(result.answers);
			assert.ok(result.plan);
			assert.ok(result.explanation);
			assert.equal(result.plan.execution, 'not-implemented');

			count++;
		}
	}

	assert.equal(count, 12);
});

test('assessment plan and explanation agree', async () => {
	const service = createIntelligence(env);
	const result = await service.adviseApplication(input);

	assert.equal(result.status, 'advised');

	assert.equal(result.answers.next_recommendation.choice, result.plan.nextStep.capability);

	assert.equal(result.plan.nextStep.label, result.explanation.recommendation);

	assert.equal(result.plan.readiness.score, 2);
	assert.equal(result.plan.facts.participantCount, 24);
});

test('missing information produces clarification throughout the pipeline', async () => {
	const service = createIntelligence(env);

	const result = await service.adviseApplication({
		...input,
		fixtureId: 'information_missing'
	});

	assert.equal(result.status, 'advised');
	assert.equal(result.plan.decision.status, 'clarification');
	assert.equal(result.plan.nextStep.capability, 'request_clarification');
	assert.equal(result.explanation.heading, 'Clarification needed');
	assert.equal(result.explanation.readiness, null);
	assert.deepEqual(result.plan.alternatives, []);
	assert.deepEqual(result.explanation.alternatives, []);
});

test('missing venue preserves prerequisite priority', async () => {
	const service = createIntelligence(env);

	const result = await service.adviseApplication({
		...input,
		fixtureId: 'venue_missing'
	});

	assert.equal(result.status, 'advised');
	assert.equal(result.plan.nextStep.capability, 'review_event_prerequisites');
	assert.deepEqual(result.plan.alternatives, []);
	assert.deepEqual(result.explanation.alternatives, []);
});

test('one advisory request produces one assessment audit event', async () => {
	const events = [];

	const service = createIntelligence(env, {
		applicationAudit: (event) => events.push(event)
	});

	assert.equal((await service.adviseApplication(input)).status, 'advised');

	assert.equal(events.length, 1);
	assert.equal(events[0].status, 'assessed');
	assert.equal(events[0].provider, 'mock');
});

test('advisory audit contains only sanitized assessment metadata', async () => {
	const events = [];

	const service = createIntelligence(env, {
		applicationAudit: (event) => events.push(event)
	});

	await service.adviseApplication(input);

	assert.deepEqual(
		Object.keys(events[0]).sort(),
		['requestId', 'decision', 'provider', 'status', 'reason', 'durationMs'].sort()
	);

	const serialized = JSON.stringify(events[0]);

	for (const forbidden of [
		input.objectiveId,
		input.fixtureId,
		'plan_group_assignments',
		'participantCount'
	]) {
		assert.ok(!serialized.includes(forbidden));
	}
});

test('audit failure does not prevent advisory responses', async () => {
	const service = createIntelligence(env, {
		applicationAudit: () => {
			throw new Error('Synthetic audit failure');
		}
	});

	assert.equal((await service.adviseApplication(input)).status, 'advised');
});

test('invalid requests do not consume dispatch capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	for (const invalid of [
		null,
		{},
		{ ...input, objectiveId: 'unknown' },
		{ ...input, fixtureId: 'production-event' },
		{ ...input, execute: true },
		{ ...input, prompt: 'arbitrary instruction' }
	]) {
		assert.deepEqual(await service.adviseApplication(invalid), {
			status: 'unavailable',
			reason: 'invalid_input'
		});
	}

	assert.equal((await service.adviseApplication(input)).status, 'advised');
});

test('request accessors are rejected without invocation', async () => {
	let invoked = false;

	const service = createIntelligence(env);

	const request = {
		fixtureId: input.fixtureId,
		get objectiveId() {
			invoked = true;
			return input.objectiveId;
		}
	};

	assert.deepEqual(await service.adviseApplication(request), {
		status: 'unavailable',
		reason: 'invalid_input'
	});

	assert.equal(invoked, false);
});

test('malformed request objects fail safely', async () => {
	const service = createIntelligence(env);

	const request = new Proxy(
		{},
		{
			getPrototypeOf() {
				throw new Error('Malformed request');
			}
		}
	);

	assert.deepEqual(await service.adviseApplication(request), {
		status: 'unavailable',
		reason: 'invalid_input'
	});
});

test('in-flight request mutation cannot change advisory results', async () => {
	const service = createIntelligence(env);
	const request = { ...input };

	const pending = service.adviseApplication(request);

	request.objectiveId = 'assess_readiness';
	request.fixtureId = 'information_missing';

	const result = await pending;

	assert.equal(result.status, 'advised');
	assert.equal(result.answers.objective.choice, 'prepare_event');
	assert.equal(result.plan.facts.participantCount, 24);
	assert.equal(result.plan.nextStep.capability, 'plan_group_assignments');
	assert.equal(result.explanation.recommendation, 'Plan group assignments');
});

test('one advisory request fits within a one-request rate limit', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	assert.equal((await service.adviseApplication(input)).status, 'advised');

	assert.deepEqual(await service.adviseApplication(input), {
		status: 'unavailable',
		reason: 'rate'
	});
});

test('assessment requests consume advisory rate capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	assert.equal((await service.assessApplication(input)).status, 'assessed');

	assert.deepEqual(await service.adviseApplication(input), {
		status: 'unavailable',
		reason: 'rate'
	});
});

test('advisory requests consume engineering rate capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	assert.equal((await service.adviseApplication(input)).status, 'advised');

	assert.deepEqual(await service.decide(engineeringRequest), {
		status: 'unavailable',
		reason: 'rate'
	});
});

test('engineering requests consume advisory rate capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	assert.equal((await service.decide(engineeringRequest)).status, 'suggested');

	assert.deepEqual(await service.adviseApplication(input), {
		status: 'unavailable',
		reason: 'rate'
	});
});

test('advisory requests share assessment concurrency capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_CONCURRENCY: '1'
	});

	const first = service.adviseApplication(input);
	const second = service.assessApplication(input);

	assert.deepEqual(await second, {
		status: 'unavailable',
		reason: 'concurrency'
	});

	assert.equal((await first).status, 'advised');

	assert.equal((await service.adviseApplication(input)).status, 'advised');
});

test('advisory responses are independent and deterministic', async () => {
	const service = createIntelligence(env);

	const first = await service.adviseApplication(input);
	const second = await service.adviseApplication(input);

	assert.deepEqual(first, second);

	first.plan.facts.participantCount = 999;
	first.answers.next_recommendation.choice = 'activate_event';
	first.explanation.recommendation = 'Modified';

	const third = await service.adviseApplication(input);

	assert.deepEqual(second, third);
});

test('mock advisory pipeline makes no external provider requests', async () => {
	let calls = 0;

	const service = createIntelligence(env, {
		fetch: async () => {
			calls++;
			throw new Error('Network access forbidden');
		}
	});

	const result = await service.adviseApplication(input);

	assert.equal(result.status, 'advised');
	assert.equal(result.plan.effect, 'recommendation-only');
	assert.equal(result.plan.execution, 'not-implemented');
	assert.equal(calls, 0);
});
