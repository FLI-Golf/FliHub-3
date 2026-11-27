import test from 'node:test';
import assert from 'node:assert/strict';

import { createApplicationExperiment } from '../tools/application/experiment-dispatch.ts';

import { experimentRequestDigest } from '../tools/application/experiment-authorization.ts';

import { applicationJevRequestFrom } from '../src/lib/server/intelligence/application/jev-adapter.ts';

import {
	MODEL,
	RESERVED_TOKENS,
	NANODOLLARS_PER_TOKEN
} from '../src/lib/server/intelligence/providers.ts';

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

const request = applicationJevRequestFrom(input);
const body = JSON.stringify(request);
const digest = experimentRequestDigest(body);
const args = ['--live', '--authorize-sha256', digest];
const key = 'synthetic-test-key';

function choice(question, selected) {
	return {
		type: 'choice',
		choice: selected,
		confidence: 1,
		probabilities: Object.fromEntries(
			Object.keys(question.criteria).map((id) => [id, id === selected ? 1 : 0])
		)
	};
}

function response(inputTokens = 500) {
	const criteria = request.questions.preparation_readiness.criteria;

	return {
		model: MODEL,
		answers: {
			objective: choice(request.questions.objective, 'prepare_event'),
			next_recommendation: choice(request.questions.next_recommendation, 'plan_group_assignments'),
			preparation_readiness: {
				type: 'score',
				score: 2,
				confidence: 1,
				probabilities: Object.fromEntries(
					criteria.map((_, index) => [String(index), index === 2 ? 1 : 0])
				),
				legend: Object.fromEntries(criteria.map((label, index) => [String(index), label]))
			},
			clarification_needed: {
				type: 'noul',
				noul: 0
			},
			prerequisite_review_needed: {
				type: 'noul',
				noul: 1
			}
		},
		usage: {
			input_tokens: inputTokens,
			output_tokens: 50
		}
	};
}

function simulatedFetch(handler = () => Response.json(response())) {
	const calls = [];

	const fetcher = async (url, options) => {
		calls.push({ url, options });
		return handler(url, options);
	};

	return {
		calls,
		run: createApplicationExperiment(fetcher)
	};
}

test('preview cannot dispatch', async () => {
	const { run, calls } = simulatedFetch();

	const result = await run([], key);

	assert.equal(result.status, 'disabled');
	assert.equal(calls.length, 0);
});

test('live flag alone cannot dispatch', async () => {
	const { run, calls } = simulatedFetch();

	const result = await run(['--live'], key);

	assert.equal(result.status, 'disabled');
	assert.equal(calls.length, 0);
});

test('incorrect digest cannot dispatch', async () => {
	const { run, calls } = simulatedFetch();

	const result = await run(['--live', '--authorize-sha256', '0'.repeat(64)], key);

	assert.equal(result.status, 'disabled');
	assert.equal(calls.length, 0);
});

test('missing or malformed credentials cannot dispatch', async () => {
	const { run, calls } = simulatedFetch();

	for (const value of [undefined, '', 'invalid key']) {
		const result = await run(args, value);

		assert.equal(result.status, 'disabled');
		assert.equal(result.reason, 'credentials_unavailable');
	}

	assert.equal(calls.length, 0);
});

test('authorized assessment sends exactly the reviewed body', async () => {
	const { run, calls } = simulatedFetch();

	const result = await run(args, key);

	assert.equal(result.status, 'assessed');
	assert.equal(calls.length, 1);

	const call = calls[0];

	assert.equal(call.url, 'https://api.typesafe.ai/v1/systemone');

	assert.equal(call.options.method, 'POST');
	assert.equal(call.options.redirect, 'error');
	assert.equal(call.options.body, body);

	assert.equal(new Headers(call.options.headers).get('Authorization'), 'Bearer ' + key);

	assert.ok(call.options.signal instanceof AbortSignal);

	assert.equal(result.model, MODEL);

	assert.deepEqual(result.usage, {
		inputTokens: 500,
		outputTokens: 50
	});

	assert.equal(result.estimatedCostNanodollars, 500 * NANODOLLARS_PER_TOKEN);

	assert.equal(result.answers.next_recommendation.choice, 'plan_group_assignments');

	assert.ok(!JSON.stringify(result).includes(key));
});

test('authorization is consumed after successful dispatch', async () => {
	const { run, calls } = simulatedFetch();

	assert.equal((await run(args, key)).status, 'assessed');

	const repeated = await run(args, key);

	assert.equal(repeated.status, 'disabled');
	assert.equal(repeated.reason, 'authorization_consumed');
	assert.equal(calls.length, 1);
});

test('concurrent calls cannot reuse authorization', async () => {
	const { run, calls } = simulatedFetch();

	const results = await Promise.all([run(args, key), run(args, key), run(args, key)]);

	assert.equal(calls.length, 1);

	assert.equal(results.filter((result) => result.status === 'assessed').length, 1);

	assert.equal(results.filter((result) => result.status === 'disabled').length, 2);
});

test('incomplete answers retain valid reported usage', async () => {
	const payload = response();

	delete payload.answers.clarification_needed;

	const { run, calls } = simulatedFetch(() => Response.json(payload));

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'invalid_output');
	assert.equal(result.usage.inputTokens, 500);
	assert.equal(calls.length, 1);
	assert.equal((await run(args, key)).status, 'disabled');
});

test('missing usage rejects the assessment', async () => {
	const payload = response();

	delete payload.usage;

	const { run, calls } = simulatedFetch(() => Response.json(payload));

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'invalid_output');
	assert.equal(result.usage, undefined);
	assert.equal(calls.length, 1);
});

test('wrong provider model rejects the assessment', async () => {
	const payload = response();

	payload.model = 'unknown-model';

	const { run, calls } = simulatedFetch(() => Response.json(payload));

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'invalid_output');
	assert.equal(calls.length, 1);
});

test('over-reservation usage stops the experiment', async () => {
	const { run, calls } = simulatedFetch(() => Response.json(response(RESERVED_TOKENS + 1)));

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'budget');
	assert.equal(result.usage.inputTokens, RESERVED_TOKENS + 1);
	assert.equal(result.estimatedCostNanodollars, undefined);
	assert.equal((await run(args, key)).status, 'disabled');
	assert.equal(calls.length, 1);
});

test('provider HTTP failures never trigger retries', async () => {
	const cases = [
		[400, 'invalid_input'],
		[401, 'authentication'],
		[402, 'billing'],
		[403, 'authentication'],
		[422, 'invalid_input'],
		[429, 'rate'],
		[500, 'provider'],
		[503, 'provider']
	];

	for (const [status, reason] of cases) {
		const { run, calls } = simulatedFetch(() => new Response(null, { status }));

		const result = await run(args, key);

		assert.equal(result.status, 'unavailable');
		assert.equal(result.reason, reason);
		assert.equal((await run(args, key)).status, 'disabled');
		assert.equal(calls.length, 1);
	}
});

test('transport exceptions do not expose sensitive errors or retry', async () => {
	const { run, calls } = simulatedFetch(() => {
		throw new Error('Sensitive simulated error: ' + key);
	});

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'provider');
	assert.ok(!JSON.stringify(result).includes(key));
	assert.equal((await run(args, key)).status, 'disabled');
	assert.equal(calls.length, 1);
});

test('malformed JSON is rejected without retry', async () => {
	const { run, calls } = simulatedFetch(() => new Response('{invalid json'));

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'invalid_output');
	assert.equal((await run(args, key)).status, 'disabled');
	assert.equal(calls.length, 1);
});

test('oversized responses are rejected', async () => {
	const { run, calls } = simulatedFetch(() => new Response('x'.repeat(16385)));

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'invalid_output');
	assert.equal(calls.length, 1);
});

test('validated assessment produces a recommendation-only plan', async () => {
	const { run, calls } = simulatedFetch();

	const result = await run(args, key);

	assert.equal(result.status, 'assessed');
	assert.equal(result.plan.kind, 'synthetic-advisory-plan');
	assert.equal(result.plan.effect, 'recommendation-only');
	assert.equal(result.plan.execution, 'not-implemented');
	assert.equal(result.plan.readiness.score, 2);
	assert.equal(result.plan.readiness.maximum, 4);
	assert.equal(result.plan.readiness.interpretation, 'qualitative-only');
	assert.equal(result.plan.prerequisiteReviewSuggested, true);
	assert.ok(result.explanation);
	assert.equal(calls.length, 1);
});

test('low readiness confidence suppresses the readiness estimate', async () => {
	const payload = response();

	payload.answers.preparation_readiness.confidence = 0.5;

	const { run, calls } = simulatedFetch(() => Response.json(payload));

	const result = await run(args, key);

	assert.equal(result.status, 'assessed');
	assert.equal(result.plan.readiness, null);
	assert.equal(result.plan.effect, 'recommendation-only');
	assert.equal(result.plan.execution, 'not-implemented');
	assert.equal(calls.length, 1);
});

test('objective abstention cannot authorize execution', async () => {
	const payload = response();

	payload.answers.objective = choice(request.questions.objective, 'abstain');

	const { run, calls } = simulatedFetch(() => Response.json(payload));

	const result = await run(args, key);

	assert.equal(result.status, 'assessed');
	assert.equal(result.plan.readiness, null);
	assert.equal(result.plan.effect, 'recommendation-only');
	assert.equal(result.plan.execution, 'not-implemented');
	assert.equal(calls.length, 1);
});

test('clarification requirement suppresses readiness and execution', async () => {
	const payload = response();

	payload.answers.clarification_needed.noul = 1;

	const { run, calls } = simulatedFetch(() => Response.json(payload));

	const result = await run(args, key);

	assert.equal(result.status, 'assessed');
	assert.equal(result.plan.readiness, null);
	assert.equal(result.plan.effect, 'recommendation-only');
	assert.equal(result.plan.execution, 'not-implemented');
	assert.equal(calls.length, 1);
});

test('timeout aborts transport and consumes authorization', async () => {
	let aborted = false;

	const { run, calls } = simulatedFetch(
		(_url, options) =>
			new Promise((resolve, reject) => {
				options.signal.addEventListener(
					'abort',
					() => {
						aborted = true;
						reject(new Error('Simulated transport aborted'));
					},
					{ once: true }
				);
			})
	);

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'timeout');
	assert.equal(aborted, true);
	assert.equal(calls.length, 1);

	const repeated = await run(args, key);

	assert.equal(repeated.status, 'disabled');
	assert.equal(repeated.reason, 'authorization_consumed');
	assert.equal(calls.length, 1);
});

test('audit records successful reconciliation', async () => {
	const events = [];
	const run = createApplicationExperiment(
		async () => Response.json(response()),
		(event) => events.push(event)
	);

	const result = await run(args, key);

	assert.equal(result.status, 'assessed');
	assert.equal(events.length, 1);

	const event = events[0];

	assert.equal(event.experiment, 'synthetic_event_assessment');
	assert.equal(event.requestSha256, digest);
	assert.equal(event.provider, 'jev');
	assert.equal(event.reportedModel, MODEL);
	assert.equal(event.status, 'assessed');
	assert.equal(event.transportAttempts, 1);
	assert.equal(event.reservation, 'reconciled');
	assert.deepEqual(event.usage, {
		inputTokens: 500,
		outputTokens: 50
	});
	assert.equal(event.estimatedCostNanodollars, 500 * NANODOLLARS_PER_TOKEN);
	assert.ok(event.durationMs >= 0);
	assert.ok(event.requestId);

	assert.deepEqual(
		Object.keys(event).sort(),
		[
			'experiment',
			'requestId',
			'requestSha256',
			'provider',
			'status',
			'reason',
			'reportedModel',
			'durationMs',
			'transportAttempts',
			'reservation',
			'usage',
			'estimatedCostNanodollars'
		].sort()
	);

	assert.ok(!JSON.stringify(event).includes(key));
	assert.ok(!JSON.stringify(event).includes('Spring Invitational'));
	assert.ok(!JSON.stringify(event).includes('plan_group_assignments'));
});

test('audit records blocked requests without reserving resources', async () => {
	const events = [];
	let calls = 0;

	const run = createApplicationExperiment(
		async () => {
			calls++;
			return Response.json(response());
		},
		(event) => events.push(event)
	);

	await run([], key);
	await run(args, undefined);

	assert.equal(calls, 0);
	assert.equal(events.length, 2);
	assert.notEqual(events[0].requestId, events[1].requestId);

	for (const event of events) {
		assert.equal(event.status, 'disabled');
		assert.equal(event.transportAttempts, 0);
		assert.equal(event.reservation, 'not_reserved');
		assert.equal(event.usage, undefined);
	}
});

test('audit retains reservation for invalid provider answers', async () => {
	const events = [];
	const payload = response();

	delete payload.answers.objective;

	const run = createApplicationExperiment(
		async () => Response.json(payload),
		(event) => events.push(event)
	);

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(events.length, 1);
	assert.equal(events[0].reason, 'invalid_output');
	assert.equal(events[0].transportAttempts, 1);
	assert.equal(events[0].reservation, 'retained');
	assert.equal(events[0].usage.inputTokens, 500);
});

test('audit retains reservation when transport fails', async () => {
	const events = [];

	const run = createApplicationExperiment(
		async () => {
			throw new Error('private simulated provider error');
		},
		(event) => events.push(event)
	);

	const result = await run(args, key);

	assert.equal(result.status, 'unavailable');
	assert.equal(events.length, 1);
	assert.equal(events[0].transportAttempts, 1);
	assert.equal(events[0].reservation, 'retained');
	assert.equal(events[0].usage, undefined);
	assert.ok(!JSON.stringify(events).includes('private simulated provider error'));
});

test('audit observer cannot mutate returned usage', async () => {
	const run = createApplicationExperiment(
		async () => Response.json(response()),
		(event) => {
			event.usage.inputTokens = 999;
		}
	);

	const result = await run(args, key);

	assert.equal(result.status, 'assessed');
	assert.equal(result.usage.inputTokens, 500);
});

test('audit observer failure cannot retry or change assessment', async () => {
	let calls = 0;

	const run = createApplicationExperiment(
		async () => {
			calls++;
			return Response.json(response());
		},
		() => {
			throw new Error('Simulated audit failure');
		}
	);

	const result = await run(args, key);

	assert.equal(result.status, 'assessed');
	assert.equal(calls, 1);

	const repeated = await run(args, key);

	assert.equal(repeated.status, 'disabled');
	assert.equal(repeated.reason, 'authorization_consumed');
	assert.equal(calls, 1);
});
