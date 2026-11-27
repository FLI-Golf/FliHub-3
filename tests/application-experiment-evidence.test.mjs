import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, readFileSync, statSync, symlinkSync, rmSync, existsSync } from 'node:fs';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { claimExperimentAuthorization } from '../tools/application/experiment-claim.ts';

import {
	persistExperimentIntent,
	persistExperimentOutcome
} from '../tools/application/experiment-evidence.ts';

const digest = 'a'.repeat(64);

function fixture(t, claimed = true) {
	const root = mkdtempSync(join(tmpdir(), 'flihub-evidence-test-'));

	t.after(() =>
		rmSync(root, {
			recursive: true,
			force: true
		})
	);

	if (claimed) {
		assert.equal(claimExperimentAuthorization(root, digest).status, 'claimed');
	}

	return root;
}

function audit() {
	return {
		experiment: 'synthetic_event_assessment',
		requestId: 'synthetic-request-id',
		requestSha256: digest,
		provider: 'jev',
		reportedModel: 'jev-1.14.0',
		status: 'assessed',
		durationMs: 100,
		transportAttempts: 1,
		reservation: 'reconciled',
		usage: {
			inputTokens: 500,
			outputTokens: 50
		},
		estimatedCostNanodollars: 21000
	};
}

test('intent evidence requires a persistent claim', (t) => {
	const directory = fixture(t, false);

	assert.equal(persistExperimentIntent(directory, digest), false);

	assert.equal(existsSync(join(directory, 'synthetic-event-assessment.intent.json')), false);
});

test('intent is private and records no confirmed provider receipt', (t) => {
	const directory = fixture(t);

	assert.equal(persistExperimentIntent(directory, digest), true);

	const path = join(directory, 'synthetic-event-assessment.intent.json');

	const record = JSON.parse(readFileSync(path, 'utf8'));

	assert.equal(record.status, 'dispatch_intent');
	assert.equal(record.requestSha256, digest);
	assert.equal(record.requestCountLimit, 1);
	assert.equal(record.automaticRetries, false);
	assert.equal(record.transportAttempts, undefined);
	assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('existing intent evidence cannot be overwritten', (t) => {
	const directory = fixture(t);

	assert.equal(persistExperimentIntent(directory, digest), true);
	assert.equal(persistExperimentIntent(directory, digest), false);
});

test('outcome evidence includes only selected audit fields', (t) => {
	const directory = fixture(t);

	assert.equal(persistExperimentIntent(directory, digest), true);

	const event = {
		...audit(),
		apiKey: 'private-test-secret',
		answers: { private: 'raw-provider-answer' },
		requestBody: 'raw-request-body'
	};

	assert.equal(persistExperimentOutcome(directory, event), true);

	const path = join(directory, 'synthetic-event-assessment.outcome.json');

	const raw = readFileSync(path, 'utf8');
	const record = JSON.parse(raw);

	assert.equal(record.status, 'assessed');
	assert.equal(record.transportAttempts, 1);
	assert.equal(record.usage.inputTokens, 500);
	assert.equal(record.estimatedCostNanodollars, 21000);
	assert.equal(statSync(path).mode & 0o777, 0o600);

	assert.ok(!raw.includes('private-test-secret'));
	assert.ok(!raw.includes('raw-provider-answer'));
	assert.ok(!raw.includes('raw-request-body'));
});

test('existing outcome evidence cannot be overwritten', (t) => {
	const directory = fixture(t);

	assert.equal(persistExperimentIntent(directory, digest), true);
	assert.equal(persistExperimentOutcome(directory, audit()), true);
	assert.equal(persistExperimentOutcome(directory, audit()), false);
});

test('symbolic link evidence targets are rejected', (t) => {
	const directory = fixture(t);

	symlinkSync(
		join(directory, 'missing-target'),
		join(directory, 'synthetic-event-assessment.intent.json')
	);

	assert.equal(persistExperimentIntent(directory, digest), false);

	assert.equal(existsSync(join(directory, 'missing-target')), false);
});
