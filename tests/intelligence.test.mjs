import assert from 'node:assert/strict';
import test from 'node:test';
import { createIntelligence } from '../src/lib/server/intelligence/service.ts';
import { evaluate } from '../tools/intelligence/policy.ts';
import { hookResult } from '../tools/intelligence/pre-tool-use.mjs';

const request = { id: 'developmentRisk', state: 'local build with uncertain side effects' };
const env = {
	FLIHUB_INTELLIGENCE_ENABLED: 'true',
	FLIHUB_INTELLIGENCE_PROVIDER: 'jev',
	FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS: '65536',
	TYPESAFE_API_KEY: 'offline-fixture'
};
const suggestion = { status: 'suggested', choice: 'elevated', confidence: 0.9 };
const unavailable = (reason) => ({ status: 'unavailable', reason });

function jevResponse(answer = {}, overrides = {}) {
	return Response.json({
		model: 'jev-1.14.0',
		usage: { input_tokens: 120, output_tokens: 12 },
		answers: {
			assessment: {
				type: 'choice',
				choice: 'elevated',
				confidence: 0.9,
				probabilities: { elevated: 0.94, ordinary: 0.04, abstain: 0.02 },
				...answer
			}
		},
		...overrides
	});
}

test('default, incomplete and unsafe configurations disable dispatch', async () => {
	let calls = 0;
	for (const settings of [
		{},
		{ ...env, TYPESAFE_API_KEY: undefined },
		{ ...env, FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS: '0' },
		{ ...env, FLIHUB_INTELLIGENCE_TIMEOUT_MS: 'Infinity' },
		{ ...env, FLIHUB_INTELLIGENCE_CONCURRENCY: '2.2' }
	]) {
		const service = createIntelligence(settings, {
			fetch: async () => {
				calls++;
			}
		});
		assert.deepEqual(await service.decide(request), { status: 'disabled' });
	}
	assert.equal(calls, 0);
});

test('mock is deterministic, abstains, and uses the shared rate limiter', async () => {
	const service = createIntelligence({
		...env,
		FLIHUB_INTELLIGENCE_PROVIDER: 'mock',
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '3'
	});
	assert.deepEqual(await service.decide(request), suggestion);
	assert.deepEqual(await service.decide(request), suggestion);
	assert.deepEqual(
		await service.decide({ ...request, state: 'local test with uncertain side effects' }),
		{ status: 'abstained' }
	);
	assert.deepEqual(await service.decide(request), unavailable('rate'));
});

test('Jev sends the official request and emits sanitized audit metadata', async () => {
	const events = [];
	const service = createIntelligence(env, {
		fetch: async (url, init) => {
			assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
			assert.equal(init.headers.Authorization, 'Bearer offline-fixture');
			assert.equal(init.redirect, 'error');
			assert.equal(init.method, 'POST');
			const body = JSON.parse(init.body);
			assert.equal(body.state, request.state);
			assert.equal(body.model, 'jev-1.14.0');
			assert.equal(body.questions.assessment.type, 'choice');
			assert.deepEqual(Object.keys(body.questions.assessment.criteria), [
				'elevated',
				'ordinary',
				'abstain'
			]);
			return jevResponse();
		},
		audit: (event) => events.push(event)
	});
	assert.deepEqual(await service.decide(request), suggestion);
	assert.equal(events.length, 1);
	assert.deepEqual(events[0].usage, { inputTokens: 120, outputTokens: 12 });
	assert.equal(events[0].estimatedCostNanodollars, 5040);
	assert.equal(events[0].model, 'jev-1.14.0');
	assert.doesNotMatch(JSON.stringify(events), /offline-fixture|uncertain side effects|elevated/);
});

test('invalid inputs and provider outputs yield safe fallback', async () => {
	for (const invalid of [
		{ ...request, state: 'raw command' },
		{ ...request, args: 'raw args' },
		{ ...request, id: '__proto__' }
	]) {
		const service = createIntelligence(env, {
			fetch: async () => assert.fail('dispatched invalid input')
		});
		assert.deepEqual(await service.decide(invalid), unavailable('invalid_input'));
	}
	for (const response of [
		jevResponse({ choice: 'surprise' }),
		jevResponse({ probabilities: { elevated: 1 } }),
		jevResponse({ confidence: 2 }),
		jevResponse({}, { usage: {} }),
		jevResponse({}, { model: 'unexpected' }),
		new Response('invalid-json'),
		new Response('x'.repeat(17000))
	]) {
		const service = createIntelligence(env, { fetch: async () => response });
		assert.deepEqual(await service.decide(request), unavailable('invalid_output'));
	}
});

test('low or null confidence and explicit abstention yield no suggestion', async () => {
	for (const answer of [
		{ confidence: 0.3 },
		{ confidence: null },
		{
			choice: 'abstain',
			probabilities: { elevated: 0.04, ordinary: 0.02, abstain: 0.94 }
		}
	]) {
		const service = createIntelligence(env, { fetch: async () => jevResponse(answer) });
		assert.deepEqual(await service.decide(request), {
			status: 'abstained',
			abstention:
				answer.choice === 'abstain'
					? 'explicit'
					: answer.confidence === null
						? 'confidence_missing'
						: 'confidence_below_threshold',
			...(answer.confidence === 0.3 ? { confidence: 0.3 } : {})
		});
	}
});

test('provider failures map to sanitized reasons without retries', async () => {
	for (const [status, reason] of [
		[401, 'authentication'],
		[402, 'billing'],
		[422, 'invalid_input'],
		[429, 'rate'],
		[529, 'provider']
	]) {
		let calls = 0;
		const service = createIntelligence(env, {
			fetch: async () => {
				calls++;
				return new Response('private error', { status });
			}
		});
		assert.deepEqual(await service.decide(request), unavailable(reason));
		assert.deepEqual(await service.decide(request), unavailable('budget'));
		assert.equal(calls, 1);
	}
});

test('reserves budget before dispatch and reconciles reported tokens', async () => {
	let release;
	const pending = new Promise((resolve) => {
		release = resolve;
	});
	let calls = 0;
	const service = createIntelligence(
		{ ...env, FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS: '65656' },
		{
			fetch: async () => {
				calls++;
				await pending;
				return jevResponse();
			}
		}
	);
	const first = service.decide(request);
	assert.deepEqual(await service.decide(request), unavailable('budget'));
	release();
	assert.deepEqual(await first, suggestion);
	assert.deepEqual(await service.decide(request), suggestion);
	assert.deepEqual(await service.decide(request), unavailable('budget'));
	assert.equal(calls, 2);
});

test('usage above the reservation closes dispatch even after an in-flight settlement', async () => {
	let calls = 0;
	let release;
	const pending = new Promise((resolve) => {
		release = resolve;
	});
	const service = createIntelligence(
		{ ...env, FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS: '200000' },
		{
			fetch: async () => {
				if (++calls === 1) {
					await pending;
					return jevResponse();
				}
				return jevResponse({}, { usage: { input_tokens: 70000, output_tokens: 10 } });
			}
		}
	);
	const first = service.decide(request);
	assert.deepEqual(await service.decide(request), unavailable('budget'));
	release();
	assert.deepEqual(await first, suggestion);
	assert.deepEqual(await service.decide(request), unavailable('budget'));
	assert.equal(calls, 2);
});

test('timeout aborts a hanging call and holds its slot until the transport settles', async () => {
	let signal;
	let release;
	const service = createIntelligence(
		{
			...env,
			FLIHUB_INTELLIGENCE_TIMEOUT_MS: '20',
			FLIHUB_INTELLIGENCE_CONCURRENCY: '1'
		},
		{
			fetch: async (_url, init) => {
				signal = init.signal;
				await new Promise((resolve) => {
					release = resolve;
				});
				return jevResponse();
			}
		}
	);
	const pending = service.decide(request);
	assert.deepEqual(await service.decide(request), unavailable('concurrency'));
	assert.deepEqual(await pending, unavailable('timeout'));
	assert.equal(signal.aborted, true);
	assert.deepEqual(await service.decide(request), unavailable('concurrency'));
	release();
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(await service.decide(request), unavailable('budget'));
});

test('policy respects mandatory denials and native review before evaluating ambiguous actions', async () => {
	const fixture = {
		category: 'build',
		scope: 'workspace',
		nativePermission: 'permitted',
		ambiguous: false
	};
	for (const category of ['read', 'edit', 'test', 'build']) {
		assert.equal((await evaluate({ ...fixture, category })).verdict, 'allow');
	}
	for (const category of [
		'authorization',
		'secret',
		'paid',
		'destructive',
		'commit',
		'push',
		'merge',
		'charity'
	]) {
		assert.deepEqual(await evaluate({ ...fixture, category, ambiguous: true }), {
			category,
			verdict: 'deny',
			reason: 'mandatory_policy'
		});
	}
	for (const category of ['dependency', 'network']) {
		assert.equal((await evaluate({ ...fixture, category })).verdict, 'review');
	}
	assert.equal((await evaluate({ ...fixture, scope: 'outside' })).verdict, 'deny');
	assert.equal((await evaluate({ ...fixture, nativePermission: 'denied' })).verdict, 'deny');
	assert.equal(
		(await evaluate({ ...fixture, nativePermission: 'review', ambiguous: true })).verdict,
		'review'
	);
	assert.equal((await evaluate({ ...fixture, ambiguous: true })).reason, 'elevated_risk');
	assert.equal(
		(await evaluate({ ...fixture, category: 'test', ambiguous: true })).verdict,
		'review'
	);
	assert.equal((await evaluate({ ...fixture, command: 'injected' })).reason, 'invalid_proposal');
});

test('hook emits only denial or an empty response and rejects compound shell strings', () => {
	const event = {
		hook_event_name: 'PreToolUse',
		tool_name: 'Bash',
		tool_input: { command: 'git status --short --branch' }
	};
	assert.deepEqual(hookResult(event), {});
	for (const command of ['git status --short --branch && git push', 'git push', null]) {
		assert.equal(
			hookResult({ ...event, tool_input: { command } }).hookSpecificOutput.permissionDecision,
			'deny'
		);
	}
	assert.equal(hookResult(null).hookSpecificOutput.permissionDecision, 'deny');
});
