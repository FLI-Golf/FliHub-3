import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
	configFile: false,
	server: {
		middlewareMode: true,
		watch: null,
		hmr: false
	},
	appType: 'custom'
});

test.after(async () => {
	await server.close();
});

const { applicationCapabilityIds } = await server.ssrLoadModule(
	'/src/lib/server/intelligence/application/contracts.ts'
);

const { getApplicationCapability, isApplicationCapabilityId, capabilitiesForObjective } =
	await server.ssrLoadModule('/src/lib/server/intelligence/application/capabilities.ts');

const { applicationRequestFrom, applicationOutcomeFrom, APPLICATION_MIN_CONFIDENCE } =
	await server.ssrLoadModule('/src/lib/server/intelligence/application/validation.ts');

const request = {
	objective: 'prepare_event',
	candidates: ['plan_group_assignments', 'review_scoring_requirements']
};

test('all registered capabilities are advisory only', () => {
	assert.equal(applicationCapabilityIds.length, 5);

	for (const id of applicationCapabilityIds) {
		const capability = getApplicationCapability(id);

		assert.ok(capability);
		assert.equal(capability.id, id);
		assert.equal(capability.effect, 'recommendation-only');
		assert.equal(capability.execution, 'not-implemented');
	}
});

test('unknown and prototype capability identifiers are rejected', () => {
	for (const id of [
		'execute_command',
		'delete_event',
		'constructor',
		'__proto__',
		'toString',
		null,
		42
	]) {
		assert.equal(isApplicationCapabilityId(id), false);
		assert.equal(getApplicationCapability(id), null);
	}
});

test('catalog copies cannot modify registered definitions', () => {
	const capability = getApplicationCapability('plan_group_assignments');

	capability.label = 'Changed';
	capability.objectives.length = 0;

	const fresh = getApplicationCapability('plan_group_assignments');

	assert.equal(fresh.label, 'Plan group assignments');
	assert.equal(fresh.objectives.length, 2);

	assert.equal(capabilitiesForObjective('prepare_event').length, 5);
});

test('valid requests are normalized into independent copies', () => {
	const validated = applicationRequestFrom(request);

	assert.deepEqual(validated, request);
	assert.notEqual(validated, request);
	assert.notEqual(validated.candidates, request.candidates);
});

test('unknown objectives and malformed requests are rejected', () => {
	for (const value of [
		null,
		[],
		{},
		{ ...request, objective: 'delete_organization' },
		{ ...request, objective: 'constructor' },
		{ ...request, candidates: 'plan_group_assignments' },
		{ ...request, command: 'unexpected' },
		Object.create(request)
	]) {
		assert.equal(applicationRequestFrom(value), null);
	}
});

test('unknown, duplicate and sparse candidates are rejected', () => {
	for (const candidates of [
		['execute_command'],
		['constructor'],
		['plan_group_assignments', 'plan_group_assignments'],
		[null],
		new Array(1)
	]) {
		assert.equal(
			applicationRequestFrom({
				...request,
				candidates
			}),
			null
		);
	}
});

test('valid high-confidence recommendations are accepted', () => {
	assert.deepEqual(
		applicationOutcomeFrom(request, {
			choice: 'plan_group_assignments',
			confidence: 0.95
		}),
		{
			status: 'suggested',
			capability: 'plan_group_assignments',
			confidence: 0.95
		}
	);
});

test('registered but excluded candidates are rejected', () => {
	assert.deepEqual(
		applicationOutcomeFrom(request, {
			choice: 'review_participant_readiness',
			confidence: 1
		}),
		{
			status: 'unavailable',
			reason: 'invalid_response'
		}
	);
});

test('unknown recommendations are rejected', () => {
	for (const choice of ['execute_command', 'activate_event', 'constructor', '__proto__']) {
		assert.deepEqual(
			applicationOutcomeFrom(request, {
				choice,
				confidence: 1
			}),
			{
				status: 'unavailable',
				reason: 'invalid_response'
			}
		);
	}
});

test('low and missing confidence produce safe abstention', () => {
	for (const [confidence, reason] of [
		[0.1, 'confidence_below_threshold'],
		[APPLICATION_MIN_CONFIDENCE - 0.01, 'confidence_below_threshold'],
		[null, 'confidence_missing']
	]) {
		assert.deepEqual(
			applicationOutcomeFrom(request, {
				choice: 'plan_group_assignments',
				confidence
			}),
			{
				status: 'abstained',
				reason
			}
		);
	}
});

test('confidence threshold boundary is accepted', () => {
	assert.equal(
		applicationOutcomeFrom(request, {
			choice: 'plan_group_assignments',
			confidence: APPLICATION_MIN_CONFIDENCE
		}).status,
		'suggested'
	);
});

test('explicit abstention never produces a recommendation', () => {
	assert.deepEqual(
		applicationOutcomeFrom(request, {
			choice: 'abstain',
			confidence: 1
		}),
		{
			status: 'abstained',
			reason: 'explicit'
		}
	);
});

test('invalid confidence values are rejected', () => {
	for (const confidence of [-1, 1.1, NaN, Infinity, '0.95', undefined, true]) {
		assert.deepEqual(
			applicationOutcomeFrom(request, {
				choice: 'plan_group_assignments',
				confidence
			}),
			{
				status: 'unavailable',
				reason: 'invalid_response'
			}
		);
	}
});

test('unexpected response fields cannot introduce execution', () => {
	assert.deepEqual(
		applicationOutcomeFrom(request, {
			choice: 'plan_group_assignments',
			confidence: 1,
			execute: true
		}),
		{
			status: 'unavailable',
			reason: 'invalid_response'
		}
	);
});

test('empty candidate lists produce safe abstention', () => {
	assert.deepEqual(applicationOutcomeFrom({ ...request, candidates: [] }, null), {
		status: 'abstained',
		reason: 'no_eligible_capability'
	});
});

test('invalid requests cannot produce recommendations', () => {
	assert.deepEqual(
		applicationOutcomeFrom(null, {
			choice: 'plan_group_assignments',
			confidence: 1
		}),
		{
			status: 'unavailable',
			reason: 'invalid_request'
		}
	);
});
