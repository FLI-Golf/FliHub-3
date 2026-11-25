import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runApplicationExperiment } from '../tools/application/experiment-orchestration.ts';

import { applicationJevRequestFrom } from '../src/lib/server/intelligence/application/jev-adapter.ts';

import { experimentRequestDigest } from '../tools/application/experiment-authorization.ts';

import { MODEL } from '../src/lib/server/intelligence/providers.ts';

const input = {
	objectiveId: 'prepare_tournament',
	fixtureId: 'spring_invitational'
};

const request = applicationJevRequestFrom(input);
const body = JSON.stringify(request);
const digest = experimentRequestDigest(body);
const args = ['--live', '--authorize-sha256', digest];
const key = 'synthetic-test-key';

const claimFile = 'synthetic-event-assessment.claim';
const intentFile = 'synthetic-event-assessment.intent.json';
const outcomeFile = 'synthetic-event-assessment.outcome.json';

function fixture(t) {
	const directory = mkdtempSync(join(tmpdir(), 'flihub-orchestration-test-'));

	t.after(() =>
		rmSync(directory, {
			recursive: true,
			force: true
		})
	);

	return directory;
}

function read(directory, filename) {
	return JSON.parse(readFileSync(join(directory, filename), 'utf8'));
}

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

function response() {
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
			input_tokens: 500,
			output_tokens: 50
		}
	};
}

test('missing authorization creates no claim or network request', async (t) => {
	const directory = fixture(t);
	let calls = 0;

	const result = await runApplicationExperiment([], key, directory, async () => {
		calls++;
		return Response.json(response());
	});

	assert.equal(result.status, 'blocked');
	assert.equal(result.reason, 'authorization_required');
	assert.equal(calls, 0);
	assert.equal(existsSync(join(directory, claimFile)), false);
});

test('invalid credentials do not consume authorization', async (t) => {
	const directory = fixture(t);
	let calls = 0;

	const result = await runApplicationExperiment(args, undefined, directory, async () => {
		calls++;
		return Response.json(response());
	});

	assert.equal(result.reason, 'credentials_unavailable');
	assert.equal(calls, 0);
	assert.equal(existsSync(join(directory, claimFile)), false);
});

test('claim and intent exist before transport and outcome exists before return', async (t) => {
	const directory = fixture(t);
	let calls = 0;
	let observedClaim;
	let observedIntent;
	let observedBody;
	let outcomeBeforeTransport;

	const result = await runApplicationExperiment(args, key, directory, async (_url, options) => {
		calls++;
		observedClaim = read(directory, claimFile);
		observedIntent = read(directory, intentFile);
		observedBody = options.body;
		outcomeBeforeTransport = existsSync(join(directory, outcomeFile));

		return Response.json(response());
	});

	assert.equal(result.status, 'assessed');
	assert.equal(calls, 1);
	assert.equal(observedClaim.requestSha256, digest);
	assert.equal(observedIntent.requestSha256, digest);
	assert.equal(observedIntent.status, 'dispatch_intent');
	assert.equal(observedBody, body);
	assert.equal(outcomeBeforeTransport, false);

	const outcome = read(directory, outcomeFile);

	assert.equal(outcome.requestSha256, digest);
	assert.equal(outcome.status, 'assessed');
	assert.equal(outcome.transportAttempts, 1);
	assert.equal(outcome.reservation, 'reconciled');
	assert.equal(outcome.usage.inputTokens, 500);
	assert.equal(result.plan.execution, 'not-implemented');

	for (const filename of [claimFile, intentFile, outcomeFile]) {
		const raw = readFileSync(join(directory, filename), 'utf8');

		assert.ok(!raw.includes(key));
		assert.ok(!raw.includes('plan_group_assignments'));
	}
});

test('independent orchestration calls cannot reuse a claim', async (t) => {
	const directory = fixture(t);
	let calls = 0;

	const fetcher = async () => {
		calls++;
		return Response.json(response());
	};

	const results = await Promise.all([
		runApplicationExperiment(args, key, directory, fetcher),
		runApplicationExperiment(args, key, directory, fetcher),
		runApplicationExperiment(args, key, directory, fetcher)
	]);

	assert.equal(calls, 1);

	assert.equal(results.filter((result) => result.status === 'assessed').length, 1);

	assert.equal(results.filter((result) => result.reason === 'already_claimed').length, 2);
});

test('intent persistence failure blocks all transport', async (t) => {
	const directory = fixture(t);
	let calls = 0;

	writeFileSync(join(directory, intentFile), 'existing evidence', { mode: 0o600 });

	const result = await runApplicationExperiment(args, key, directory, async () => {
		calls++;
		return Response.json(response());
	});

	assert.equal(result.status, 'blocked');
	assert.equal(result.reason, 'intent_storage_failed');
	assert.equal(calls, 0);
	assert.equal(existsSync(join(directory, claimFile)), true);
});

test('outcome persistence failure consumes authorization', async (t) => {
	const directory = fixture(t);
	let calls = 0;

	const fetcher = async () => {
		calls++;

		writeFileSync(join(directory, outcomeFile), 'existing evidence', { mode: 0o600 });

		return Response.json(response());
	};

	const result = await runApplicationExperiment(args, key, directory, fetcher);

	assert.equal(result.status, 'blocked');
	assert.equal(result.reason, 'outcome_storage_failed');
	assert.equal(result.authorizationConsumed, true);
	assert.equal(calls, 1);

	const repeated = await runApplicationExperiment(args, key, directory, fetcher);

	assert.equal(repeated.reason, 'already_claimed');
	assert.equal(calls, 1);
});

test('provider failure is persisted without retry', async (t) => {
	const directory = fixture(t);
	let calls = 0;

	const result = await runApplicationExperiment(args, key, directory, async () => {
		calls++;
		return new Response(null, { status: 429 });
	});

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'rate');
	assert.equal(calls, 1);

	const outcome = read(directory, outcomeFile);

	assert.equal(outcome.status, 'unavailable');
	assert.equal(outcome.reason, 'rate');
	assert.equal(outcome.transportAttempts, 1);
	assert.equal(outcome.reservation, 'retained');
});

test('invalid provider answers preserve usage and failure evidence', async (t) => {
	const directory = fixture(t);
	const payload = response();

	delete payload.answers.objective;

	const result = await runApplicationExperiment(args, key, directory, async () =>
		Response.json(payload)
	);

	assert.equal(result.status, 'unavailable');
	assert.equal(result.reason, 'invalid_output');

	const outcome = read(directory, outcomeFile);

	assert.equal(outcome.reason, 'invalid_output');
	assert.equal(outcome.usage.inputTokens, 500);
	assert.equal(outcome.reservation, 'retained');
});

test('pre-existing outcome evidence prevents transport', async (t) => {
	const directory = fixture(t);
	let calls = 0;

	writeFileSync(join(directory, outcomeFile), 'existing outcome evidence', { mode: 0o600 });

	const result = await runApplicationExperiment(args, key, directory, async () => {
		calls++;
		return Response.json(response());
	});

	assert.equal(result.status, 'blocked');
	assert.equal(result.reason, 'outcome_evidence_exists');
	assert.equal(calls, 0);
	assert.equal(existsSync(join(directory, intentFile)), false);
	assert.equal(existsSync(join(directory, claimFile)), true);
	assert.equal(readFileSync(join(directory, outcomeFile), 'utf8'), 'existing outcome evidence');
});
