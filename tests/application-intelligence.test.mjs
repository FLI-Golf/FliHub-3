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

// JAI-2B context and eligibility

const { syntheticEventContextFrom } = await server.ssrLoadModule(
	'/src/lib/server/intelligence/application/context.ts'
);

const { syntheticFixtureIds, getSyntheticFixture } = await server.ssrLoadModule(
	'/src/lib/server/intelligence/application/fixtures.ts'
);

const { eligibleSyntheticRecommendations, syntheticDecisionRequest } = await server.ssrLoadModule(
	'/src/lib/server/intelligence/application/eligibility.ts'
);

const springContext = getSyntheticFixture('spring_invitational');

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

test('all six synthetic fixtures have valid context', () => {
	const ids = syntheticFixtureIds();

	assert.equal(ids.length, 6);

	for (const id of ids) {
		const context = getSyntheticFixture(id);

		assert.ok(context);
		assert.deepEqual(syntheticEventContextFrom(context), context);
	}
});

test('unknown fixture identifiers are rejected', () => {
	for (const id of ['unknown', 'constructor', '__proto__', 'toString', null, 42]) {
		assert.equal(getSyntheticFixture(id), null);
	}
});

test('fixture copies cannot change registered scenarios', () => {
	const context = getSyntheticFixture('spring_invitational');

	context.participantCount = 999;

	assert.equal(getSyntheticFixture('spring_invitational').participantCount, 24);
});

test('validated context is an independent copy', () => {
	const context = syntheticEventContextFrom(springContext);

	assert.deepEqual(context, springContext);
	assert.notEqual(context, springContext);
});

test('real and unsupported activity contexts are rejected', () => {
	for (const value of [
		{ ...springContext, source: 'pocketbase' },
		{ ...springContext, activity: 'pickleball' },
		{ ...springContext, status: 'published' },
		{ ...springContext, status: 'active' }
	]) {
		assert.equal(syntheticEventContextFrom(value), null);
	}
});

test('unexpected private fields are rejected', () => {
	for (const extra of [
		{ organizationId: 'example' },
		{ participantNames: ['Example'] },
		{ email: 'example@example.invalid' },
		{ privateNotes: 'synthetic example' },
		{ command: 'unexpected' }
	]) {
		assert.equal(
			syntheticEventContextFrom({
				...springContext,
				...extra
			}),
			null
		);
	}
});

test('malformed and incomplete contexts are rejected', () => {
	const incomplete = { ...springContext };

	delete incomplete.venueAssigned;

	for (const value of [
		null,
		[],
		{},
		incomplete,
		Object.create(springContext),
		{ ...springContext, dateAssigned: 'true' },
		{ ...springContext, scoringConfigured: 1 }
	]) {
		assert.equal(syntheticEventContextFrom(value), null);
	}
});

test('invalid numeric context values are rejected', () => {
	for (const count of [-1, 0.5, NaN, Infinity, '24', true, Number.MAX_SAFE_INTEGER + 1]) {
		for (const field of ['participantCount', 'groupCount']) {
			assert.equal(
				syntheticEventContextFrom({
					...springContext,
					[field]: count
				}),
				null
			);
		}
	}
});

test('inconsistent synthetic group counts are rejected', () => {
	assert.equal(
		syntheticEventContextFrom({
			...springContext,
			participantCount: 2,
			groupCount: 3
		}),
		null
	);
});

test('context accessors are rejected without invocation', () => {
	let invoked = false;

	const context = { ...springContext };

	Object.defineProperty(context, 'participantCount', {
		enumerable: true,
		get() {
			invoked = true;
			return 24;
		}
	});

	assert.equal(syntheticEventContextFrom(context), null);

	assert.equal(invoked, false);
});

test('unexpected symbol properties are rejected', () => {
	assert.equal(
		syntheticEventContextFrom({
			...springContext,
			[Symbol('unexpected')]: true
		}),
		null
	);
});

test('spring invitational has multiple eligible recommendations', () => {
	assert.deepEqual(eligibleSyntheticRecommendations(springContext), [
		'review_event_prerequisites',
		'plan_group_assignments',
		'review_scoring_requirements'
	]);
});

test('missing participants change eligible recommendations', () => {
	assert.deepEqual(eligibleSyntheticRecommendations(getSyntheticFixture('participants_missing')), [
		'review_event_prerequisites',
		'review_participant_readiness'
	]);
});

test('prepared groups remove group planning from candidates', () => {
	assert.deepEqual(eligibleSyntheticRecommendations(getSyntheticFixture('groups_prepared')), [
		'review_event_prerequisites',
		'review_scoring_requirements'
	]);
});

test('prepared context still requires prerequisite review', () => {
	assert.deepEqual(eligibleSyntheticRecommendations(getSyntheticFixture('preparation_review')), [
		'review_event_prerequisites'
	]);
});

test('missing venue or date restricts recommendations to prerequisite review', () => {
	for (const context of [
		getSyntheticFixture('venue_missing'),
		{ ...springContext, dateAssigned: false }
	]) {
		assert.deepEqual(eligibleSyntheticRecommendations(context), ['review_event_prerequisites']);
	}
});

test('unknown context fields require clarification', () => {
	for (const field of [
		'dateAssigned',
		'venueAssigned',
		'participantCount',
		'groupCount',
		'scoringConfigured'
	]) {
		assert.deepEqual(
			eligibleSyntheticRecommendations({
				...springContext,
				[field]: null
			}),
			['request_clarification']
		);
	}
});

test('decision candidates are derived from validated context', () => {
	for (const objective of ['prepare_event', 'assess_event_readiness']) {
		for (const id of syntheticFixtureIds()) {
			const context = getSyntheticFixture(id);

			const request = syntheticDecisionRequest(objective, context);

			assert.ok(request);
			assert.equal(request.objective, objective);

			assert.deepEqual(request.candidates, eligibleSyntheticRecommendations(context));

			assert.deepEqual(applicationRequestFrom(request), request);
		}
	}
});

test('invalid context or objectives cannot produce requests', () => {
	assert.equal(syntheticDecisionRequest('prepare_event', null), null);

	assert.equal(syntheticDecisionRequest('activate_event', springContext), null);
});

test('context-ineligible provider recommendations are rejected', () => {
	const request = syntheticDecisionRequest(
		'prepare_event',
		getSyntheticFixture('participants_missing')
	);

	assert.deepEqual(
		applicationOutcomeFrom(request, {
			choice: 'plan_group_assignments',
			confidence: 1
		}),
		{
			status: 'unavailable',
			reason: 'invalid_response'
		}
	);
});

test('incomplete context cannot produce unrelated recommendations', () => {
	const request = syntheticDecisionRequest(
		'prepare_event',
		getSyntheticFixture('information_missing')
	);

	assert.equal(
		applicationOutcomeFrom(request, {
			choice: 'review_scoring_requirements',
			confidence: 1
		}).status,
		'unavailable'
	);

	assert.deepEqual(
		applicationOutcomeFrom(request, {
			choice: 'request_clarification',
			confidence: 0.95
		}),
		{
			status: 'suggested',
			capability: 'request_clarification',
			confidence: 0.95
		}
	);
});
