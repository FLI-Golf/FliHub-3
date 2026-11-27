import test from 'node:test';
import assert from 'node:assert/strict';

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

test('application intelligence is disabled by default', async () => {
	const service = createIntelligence();

	assert.deepEqual(await service.assessApplication(input), {
		status: 'disabled'
	});
});

test('live Jev configuration cannot dispatch application requests', async () => {
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

	assert.deepEqual(await service.assessApplication(input), {
		status: 'disabled'
	});

	assert.equal(calls, 0);
});

test('all twelve registered combinations return complete assessments', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '60'
	});

	let count = 0;

	for (const objectiveId of syntheticObjectiveIds()) {
		for (const fixtureId of syntheticFixtureIds()) {
			const result = await service.assessApplication({
				objectiveId,
				fixtureId
			});

			assert.equal(result.status, 'assessed');
			assert.equal(result.source, 'mock');

			assert.deepEqual(
				Object.keys(result.answers).sort(),
				[
					'objective',
					'next_recommendation',
					'preparation_readiness',
					'clarification_needed',
					'prerequisite_review_needed'
				].sort()
			);

			count++;
		}
	}

	assert.equal(count, 12);
});

test('spring invitational recommends group planning', async () => {
	const service = createIntelligence(env);
	const result = await service.assessApplication(input);

	assert.equal(result.status, 'assessed');
	assert.equal(result.answers.objective.choice, 'prepare_event');
	assert.equal(result.answers.next_recommendation.choice, 'plan_group_assignments');
	assert.equal(result.answers.preparation_readiness.score, 2);
	assert.equal(result.answers.clarification_needed.noul, 0);
	assert.equal(result.answers.prerequisite_review_needed.noul, 1);
});

test('missing information recommends clarification', async () => {
	const service = createIntelligence(env);

	const result = await service.assessApplication({
		...input,
		fixtureId: 'information_missing'
	});

	assert.equal(result.status, 'assessed');
	assert.equal(result.answers.next_recommendation.choice, 'request_clarification');
	assert.equal(result.answers.clarification_needed.noul, 1);
});

test('mock assessments are deterministic', async () => {
	const service = createIntelligence(env);

	const first = await service.assessApplication(input);
	const second = await service.assessApplication(input);

	assert.equal(first.status, 'assessed');
	assert.deepEqual(first, second);
});

test('invalid inputs do not consume dispatch capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	for (const invalid of [
		null,
		{},
		{ ...input, prompt: 'arbitrary instruction' },
		{ ...input, fixtureId: 'production-event' },
		{ ...input, authorized: true }
	]) {
		assert.deepEqual(await service.assessApplication(invalid), {
			status: 'unavailable',
			reason: 'invalid_input'
		});
	}

	assert.equal((await service.assessApplication(input)).status, 'assessed');
});

test('request accessors are rejected without invocation', async () => {
	const service = createIntelligence(env);
	let invoked = false;

	const request = {
		fixtureId: input.fixtureId,
		get objectiveId() {
			invoked = true;
			return input.objectiveId;
		}
	};

	assert.deepEqual(await service.assessApplication(request), {
		status: 'unavailable',
		reason: 'invalid_input'
	});

	assert.equal(invoked, false);
});

test('request mutation cannot change an in-flight assessment', async () => {
	const service = createIntelligence(env);
	const request = { ...input };

	const pending = service.assessApplication(request);

	request.fixtureId = 'information_missing';
	request.objectiveId = 'assess_readiness';

	const result = await pending;

	assert.equal(result.status, 'assessed');
	assert.equal(result.answers.objective.choice, 'prepare_event');
	assert.equal(result.answers.next_recommendation.choice, 'plan_group_assignments');
});

test('application assessments respect the shared rate limit', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	assert.equal((await service.assessApplication(input)).status, 'assessed');

	assert.deepEqual(await service.assessApplication(input), {
		status: 'unavailable',
		reason: 'rate'
	});
});

test('application assessments respect shared concurrency limits', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_CONCURRENCY: '1'
	});

	const first = service.assessApplication(input);
	const second = service.assessApplication(input);

	assert.deepEqual(await second, {
		status: 'unavailable',
		reason: 'concurrency'
	});

	assert.equal((await first).status, 'assessed');

	assert.equal((await service.assessApplication(input)).status, 'assessed');
});

test('application audit contains only sanitized metadata', async () => {
	const events = [];

	const service = createIntelligence(env, {
		applicationAudit: (event) => events.push(event)
	});

	const result = await service.assessApplication(input);

	assert.equal(result.status, 'assessed');
	assert.equal(events.length, 1);

	const audit = events[0];

	assert.equal(audit.provider, 'mock');
	assert.equal(audit.decision, 'synthetic_event_assessment');
	assert.equal(audit.status, 'assessed');
	assert.equal(typeof audit.requestId, 'string');
	assert.ok(audit.durationMs >= 0);

	assert.deepEqual(
		Object.keys(audit).sort(),
		['requestId', 'decision', 'provider', 'status', 'reason', 'durationMs'].sort()
	);

	const serialized = JSON.stringify(audit);

	assert.ok(!serialized.includes(input.fixtureId));
	assert.ok(!serialized.includes(input.objectiveId));
	assert.ok(!serialized.includes('plan_group_assignments'));
});

test('application audit failure does not break assessments', async () => {
	const service = createIntelligence(env, {
		applicationAudit: () => {
			throw new Error('Synthetic telemetry failure');
		}
	});

	assert.equal((await service.assessApplication(input)).status, 'assessed');
});

const engineeringRequest = {
	id: 'developmentRisk',
	state: 'local build with uncertain side effects'
};

const engineeringSuggestion = {
	status: 'suggested',
	choice: 'elevated',
	confidence: 0.9
};

test('engineering dispatch consumes application rate capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	assert.deepEqual(await service.decide(engineeringRequest), engineeringSuggestion);

	assert.deepEqual(await service.assessApplication(input), {
		status: 'unavailable',
		reason: 'rate'
	});
});

test('application dispatch consumes engineering rate capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '1'
	});

	assert.equal((await service.assessApplication(input)).status, 'assessed');

	assert.deepEqual(await service.decide(engineeringRequest), {
		status: 'unavailable',
		reason: 'rate'
	});
});

test('engineering dispatch occupies application concurrency capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_CONCURRENCY: '1'
	});

	const engineering = service.decide(engineeringRequest);
	const application = service.assessApplication(input);

	assert.deepEqual(await application, {
		status: 'unavailable',
		reason: 'concurrency'
	});

	assert.deepEqual(await engineering, engineeringSuggestion);

	assert.equal((await service.assessApplication(input)).status, 'assessed');
});

test('application dispatch occupies engineering concurrency capacity', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_CONCURRENCY: '1'
	});

	const application = service.assessApplication(input);
	const engineering = service.decide(engineeringRequest);

	assert.deepEqual(await engineering, {
		status: 'unavailable',
		reason: 'concurrency'
	});

	assert.equal((await application).status, 'assessed');

	assert.deepEqual(await service.decide(engineeringRequest), engineeringSuggestion);
});
