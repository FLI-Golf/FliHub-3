import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { auditStore } from '../tools/intelligence/audit.ts';
import { decideFixture, fixtures } from '../tools/intelligence/guardrail.ts';
import { handleHook } from '../tools/intelligence/hook.ts';
import { declineNativeRequest } from '../tools/intelligence/native-approval.ts';
import { smoke } from '../tools/intelligence/live-smoke.ts';

const makeDirectory = () => mkdtempSync(join(tmpdir(), 'flihub-guard-test-'));
const review = { category: 'test', verdict: 'review', provider: 'mock', reason: 'human_review' };
const valid = () =>
	Response.json({
		model: 'jev-1.14.0',
		answers: {
			assessment: {
				type: 'choice',
				choice: 'ordinary',
				confidence: 0.9,
				probabilities: { ordinary: 0.94, elevated: 0.05, abstain: 0.01 }
			}
		},
		usage: { input_tokens: 60, output_tokens: 8 }
	});

test('mandatory policy precedes the provider and ordinary or unavailable answers preserve review', async () => {
	let calls = 0;
	const provider = {
		decide: async () => {
			calls++;
			return { status: 'suggested', choice: 'ordinary' };
		}
	};
	assert.equal((await decideFixture('secret', provider)).decision.verdict, 'deny');
	assert.equal((await decideFixture('restricted', provider)).decision.verdict, 'deny');
	assert.equal(calls, 0);
	assert.equal((await decideFixture('test', provider)).decision.verdict, 'review');
	assert.equal(
		(await decideFixture('test', { decide: async () => ({ status: 'unavailable' }) })).decision
			.verdict,
		'review'
	);
	assert.equal((await decideFixture('dependency')).decision.verdict, 'deny');
});

test('approval binds proposal and request identity, expires, and cannot be replayed', () => {
	const directory = makeDirectory();
	const audit = auditStore(directory);
	try {
		const id = audit.record(review, 'synthetic raw payload', 'raw native request', 100);
		assert.throws(() => audit.record(review, 'different payload', 'raw native request'));
		assert.equal(audit.human(id, 'wrong', 'raw native request', 'approve', 102), false);
		assert.equal(audit.human(id, 'synthetic raw payload', 'wrong', 'approve', 102), false);
		assert.equal(
			audit.human(id, 'synthetic raw payload', 'raw native request', 'approve', 102),
			true
		);
		assert.equal(audit.consume(id, 'synthetic raw payload', 'raw native request', 120100), false);
		assert.equal(audit.consume(id, 'synthetic raw payload', 'raw native request', 103), true);
		assert.equal(audit.consume(id, 'synthetic raw payload', 'raw native request', 104), false);
		assert.equal(audit.cancel(id, 'synthetic raw payload', 'raw native request'), false);
		assert.equal(audit.get(id).human, 'approve');
		const expired = audit.record(review, 'expired', undefined, 100);
		assert.equal(audit.human(expired, 'expired', undefined, 'approve', 120100), false);
		const cancelled = audit.record(review, 'cancel', undefined, 100);
		assert.equal(audit.cancel(cancelled, 'cancel'), true);
		assert.equal(audit.human(cancelled, 'cancel', undefined, 'approve', 102), false);
		const rejected = audit.record(review, 'reject', undefined, 100);
		assert.equal(audit.human(rejected, 'reject', undefined, 'reject', 103), true);
		assert.equal(audit.consume(rejected, 'reject', undefined, 104), false);
		assert.throws(() => audit.record({ ...review, reason: 'raw arbitrary reason' }, 'proposal'));
	} finally {
		audit.close();
	}
	const db = join(directory, 'decisions.sqlite');
	assert.equal(statSync(db).mode & 0o777, 0o600);
	assert.doesNotMatch(
		readFileSync(db).toString(),
		/synthetic raw payload|raw native request|raw arbitrary reason/
	);
	chmodSync(directory, 0o755);
	assert.throws(() => auditStore(directory), /mode 0700/);
});

test('concurrent connections can consume a grant only once', async () => {
	const directory = makeDirectory();
	const audit = auditStore(directory);
	const id = audit.record(review, 'same proposal');
	assert.equal(audit.human(id, 'same proposal', undefined, 'approve'), true);
	audit.close();
	const url = new URL('../tools/intelligence/audit.ts', import.meta.url).href;
	const run = () =>
		new Promise((resolve, reject) => {
			const script = `import { parentPort, workerData } from 'node:worker_threads';
			import { auditStore } from ${JSON.stringify(url)};
			const audit = auditStore(workerData.directory);
			parentPort.postMessage(audit.consume(workerData.id, 'same proposal'));
			audit.close();`;
			const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(script)), {
				workerData: { directory, id }
			});
			worker.once('message', resolve);
			worker.once('error', reject);
		});
	assert.deepEqual((await Promise.all([run(), run()])).sort(), [false, true]);
});

test('hook routes exact fixtures using host scope, blocks review, and fails closed on audit errors', async () => {
	const directory = makeDirectory();
	const root = process.cwd();
	const event = {
		hook_event_name: 'PreToolUse',
		tool_name: 'Bash',
		cwd: root,
		session_id: 'session',
		turn_id: 'turn',
		tool_use_id: 'read',
		tool_input: { command: fixtures.read }
	};
	assert.deepEqual(await handleHook(event, root, directory), {});
	for (const [index, patch] of [
		{ tool_input: { command: fixtures.test } },
		{ tool_input: { command: fixtures.restricted } },
		{ tool_input: { command: fixtures.read + ' && printf extra' } },
		{ tool_input: { command: fixtures.read, workdir: '/tmp' } },
		{ cwd: '/tmp' },
		{ tool_name: 'WebSearch' }
	].entries()) {
		assert.equal(
			(await handleHook({ ...event, ...patch, tool_use_id: String(index) }, root, directory))
				.hookSpecificOutput.permissionDecision,
			'deny'
		);
	}
	assert.equal(
		(await handleHook(event, root, directory)).hookSpecificOutput.permissionDecision,
		'deny'
	);
	chmodSync(directory, 0o755);
	assert.equal(
		(await handleHook(event, root, directory)).hookSpecificOutput.permissionDecision,
		'deny'
	);
});

test('app-server boundary declines native requests and never grants permissions', () => {
	const audit = auditStore(makeDirectory());
	try {
		for (const method of [
			'item/commandExecution/requestApproval',
			'item/fileChange/requestApproval'
		]) {
			assert.deepEqual(
				declineNativeRequest(
					{ id: method, method, params: { reason: 'private' } },
					'connection',
					audit
				),
				{ id: method, result: { decision: 'decline' } }
			);
		}
		assert.deepEqual(
			declineNativeRequest(
				{ id: 7, method: 'item/permissions/requestApproval' },
				'connection',
				audit
			),
			{ id: 7, result: { permissions: {}, scope: 'turn' } }
		);
		assert.equal(
			declineNativeRequest({ id: 9, method: 'command/exec' }, 'connection', audit),
			undefined
		);
	} finally {
		audit.close();
	}
});

test('live smoke defaults off, skips protected credentials and stays below one cent', async () => {
	const seen = [];
	const fetcher = async (_url, request) => {
		seen.push(JSON.parse(request.body).state);
		return valid();
	};
	assert.equal((await smoke(false, 'fixture-key', fetcher)).status, 'disabled');
	assert.equal((await smoke(true, undefined, fetcher)).status, 'disabled');
	assert.equal(seen.length, 0);
	const result = await smoke(true, 'fixture-key', fetcher);
	assert.equal(result.status, 'complete');
	assert.equal(result.results[0].decision.verdict, 'deny');
	assert.equal(result.results[1].usage.usage.inputTokens, 60);
	assert.deepEqual(seen, [
		'running an ordinary local unit test',
		'installing an unfamiliar dependency'
	]);
	assert.ok(result.maxEstimatedUsd < 0.01);
	assert.doesNotMatch(JSON.stringify(result), /fixture-key/);
});

test('live smoke stops after malformed, missing billing or unavailable responses', async () => {
	for (const response of [
		new Response('bad JSON'),
		new Response('', { status: 529 }),
		Response.json({ ...(await valid().json()), usage: undefined })
	]) {
		let calls = 0;
		const result = await smoke(true, 'fixture-key', async () => {
			calls++;
			return response;
		});
		assert.equal(result.status, 'stopped');
		assert.equal(result.results[1].decision.verdict, 'review');
		assert.equal(calls, 1);
	}
});

test('ambiguous provider timeout leaves the action in review', async () => {
	const { createIntelligence } = await import('../src/lib/server/intelligence/service.ts');
	const provider = createIntelligence(
		{
			FLIHUB_INTELLIGENCE_ENABLED: 'true',
			FLIHUB_INTELLIGENCE_PROVIDER: 'jev',
			FLIHUB_INTELLIGENCE_TIMEOUT_MS: '10',
			FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS: '65536',
			TYPESAFE_API_KEY: 'fixture-key'
		},
		{
			fetch: (_url, { signal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(signal.reason), { once: true });
				})
		}
	);
	const result = await decideFixture('test', provider, 'jev');
	assert.equal(result.recommendation.reason, 'timeout');
	assert.equal(result.decision.verdict, 'review');
	assert.equal((await decideFixture('test', provider, 'jev')).recommendation.reason, 'budget');
});
