import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { createAdvisorySimulation } from '../tools/intelligence/development-advisory/simulation.ts';

const limits = {
	maxRequests: 1,
	maxInputTokens: 50,
	maxCostUsdMicros: 10,
	timeoutMs: 1000
};
const kinds = ['planning', 'evidence-assessment'];
const approvalText = (review) => `APPROVE ${review.reviewDigest}`;

function prepare(harness, kind = 'planning', scenario = 'recommendation', bounds = limits) {
	const result = harness.prepare(kind, scenario, bounds);
	assert.equal(result.status, 'review');
	assert.equal(result.mode, 'offline-fixture-simulator');
	assert.match(result.notice, /never contacted/);
	return result.review;
}

function approve(harness, review) {
	const result = harness.approve(review.sessionId, review.reviewId, approvalText(review));
	assert.equal(result.ok, true);
	return result.value.approvalId;
}

function run(harness, review, approvalId) {
	return harness.run(review.sessionId, review.reviewId, review.reviewDigest, approvalId);
}

function denied(result, harness, previousCalls = 0) {
	assert.equal(result.status, 'manual-fallback');
	assert.equal(result.simulatorCalls, 0);
	assert.equal(harness.invocationCount(), previousCalls);
	assert.equal('outcome' in result, false);
}

for (const kind of kinds) {
	for (const scenario of ['recommendation', 'abstention', 'unavailable']) {
		test(`${kind} handles ${scenario} after exact approval with sanitized provenance`, async () => {
			const harness = createAdvisorySimulation(true);
			const review = prepare(harness, kind, scenario);
			assert.match(review.reviewText, /Destination: typesafe-jev-api/);
			const raw = review.reviewText.split('Exact canonical payload follows:\n')[1].split('\n')[0];
			const bytes = Buffer.from(raw, 'utf8');
			assert.ok(bytes.length > raw.length);
			const hash = createHash('sha256').update(bytes).digest('hex');
			assert.ok(review.reviewText.includes(`Payload SHA-256: ${hash}`));
			assert.equal(harness.invocationCount(), 0);
			const approvalId = approve(harness, review);
			assert.equal(harness.invocationCount(), 0);
			const result = await run(harness, review, approvalId);
			assert.equal(harness.invocationCount(), 1);
			assert.equal(result.simulatorCalls, 1);
			assert.equal(result.status, scenario === 'recommendation' ? 'advisory' : 'manual-fallback');
			assert.equal(result.outcome.kind, kind);
			assert.equal(result.outcome.status, scenario);
			assert.deepEqual(result.provenance, {
				mode: 'offline-fixture-simulator',
				reviewDigest: review.reviewDigest,
				payloadDigest: hash,
				payloadBytes: bytes.length,
				decision: kind,
				sources:
					kind === 'planning'
						? ['operator-objective', 'repository-facts', 'documentation-references']
						: [
								'operator-objective',
								'repository-facts',
								'documentation-references',
								'evidence-summaries'
							],
				outcome: scenario
			});
			assert.doesNotMatch(
				JSON.stringify(result.provenance),
				/café|Synthetic worker|confidence|approvalId/
			);
			denied(await run(harness, review, approvalId), harness, 1);
		});
	}
}

test('disabled, invalid, oversized or unregistered requests never reach simulation', () => {
	const disabled = createAdvisorySimulation();
	denied(disabled.prepare('planning', 'recommendation', limits), disabled);
	const harness = createAdvisorySimulation(true);
	for (const scenario of ['invalid-request', 'oversized-request', 'unknown'])
		denied(harness.prepare('planning', scenario, limits), harness);
	denied(harness.prepare('planning', 'recommendation', { ...limits, maxRequests: 2 }), harness);
});

test('unconfirmed, wrong confirmation, wrong approval, digest and session fail before invocation', async () => {
	const harness = createAdvisorySimulation(true);
	let review = prepare(harness);
	denied(await run(harness, review, ''), harness);
	assert.equal(harness.approve(review.sessionId, review.reviewId, 'APPROVE wrong').ok, false);
	denied(await run(harness, review, ''), harness);
	review = prepare(harness);
	const approval = approve(harness, review);
	const forged = '00000000-0000-0000-0000-000000000000';
	denied(await run(harness, review, forged), harness);
	denied(await run(harness, { ...review, sessionId: forged }, approval), harness);
	const another = createAdvisorySimulation(true);
	denied(await run(another, review, approval), another);
	denied(await run(harness, { ...review, reviewDigest: '0'.repeat(64) }, approval), harness);
	denied(await run(harness, review, approval), harness);
});

test('reselecting fixtures or limits invalidates the previous snapshot, and cancel revokes the active review', async () => {
	const harness = createAdvisorySimulation(true);
	const review = prepare(harness);
	const approval = approve(harness, review);
	const replacement = prepare(harness, 'evidence-assessment', 'recommendation', {
		...limits,
		timeoutMs: 900
	});
	assert.notEqual(replacement.reviewDigest, review.reviewDigest);
	denied(await run(harness, review, approval), harness);
	const newApproval = approve(harness, replacement);
	harness.cancel();
	denied(await run(harness, replacement, newApproval), harness);
});

test('expiry and backward clock fail closed', async (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: 100 });
	const harness = createAdvisorySimulation(true);
	let review = prepare(harness);
	let approval = approve(harness, review);
	t.mock.timers.tick(120000);
	assert.equal((await run(harness, review, approval)).reason, 'approval-expired');
	review = prepare(harness);
	approval = approve(harness, review);
	t.mock.timers.setTime(0);
	assert.equal((await run(harness, review, approval)).reason, 'clock-failure');
	assert.equal(harness.invocationCount(), 0);
});

test('simulated input usage and cost ceilings prevent invocation', async () => {
	const harness = createAdvisorySimulation(true);
	for (const bounds of [{ maxInputTokens: 49 }, { maxCostUsdMicros: 9 }]) {
		const review = prepare(harness, 'planning', 'recommendation', { ...limits, ...bounds });
		const result = await run(harness, review, approve(harness, review));
		assert.equal(result.reason, 'simulated-limit');
		denied(result, harness);
	}
});

for (const scenario of ['invalid-response', 'oversized-response', 'wrong-decision', 'failure']) {
	test(`${scenario} falls back after one invocation with no retry`, async () => {
		const harness = createAdvisorySimulation(true);
		const review = prepare(harness, 'evidence-assessment', scenario);
		const result = await run(harness, review, approve(harness, review));
		assert.equal(result.status, 'manual-fallback');
		assert.equal(result.reason, scenario === 'failure' ? 'simulator-failure' : 'invalid-response');
		assert.equal(result.simulatorCalls, 1);
		assert.equal(result.provenance.reviewDigest, review.reviewDigest);
		assert.equal(result.provenance.outcome, result.reason);
		assert.equal(harness.invocationCount(), 1);
	});
}

for (const stop of ['timeout', 'cancelled']) {
	test(`${stop} rejects competing and late outcomes without disturbing a new review`, async (t) => {
		t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100 });
		const harness = createAdvisorySimulation(true);
		const review = prepare(harness, 'planning', 'delayed');
		const approval = approve(harness, review);
		const pending = run(harness, review, approval);
		denied(await run(harness, review, approval), harness, 1);
		if (stop === 'cancelled') harness.cancel();
		else t.mock.timers.tick(limits.timeoutMs);
		const stopped = await pending;
		assert.equal(stopped.status, 'manual-fallback');
		assert.equal(stopped.reason, stop);
		assert.equal(stopped.simulatorCalls, 1);
		const next = prepare(harness);
		t.mock.timers.tick(limits.timeoutMs + 1);
		assert.equal(harness.invocationCount(), 1);
		assert.equal((await run(harness, next, approve(harness, next))).status, 'advisory');
		assert.equal(harness.invocationCount(), 2);
	});
}

test('transitive static dependencies are confined to exact advisory and canonical modules', () => {
	const root = new URL('../', import.meta.url);
	const directory = 'tools/intelligence/development-advisory/';
	const allowed = new Set([
		...['simulation', 'approval', 'contracts', 'disclosure', 'validation'].map(
			(name) => `${directory}${name}.ts`
		),
		'src/lib/server/intelligence/application/operations/canonical.ts',
		'tools/development/advisory-preview.mjs'
	]);
	const seen = new Set();
	function inspect(path) {
		if (seen.has(path)) return;
		assert.ok(allowed.has(path), path);
		seen.add(path);
		const file = new URL(path, root);
		const source = readFileSync(file, 'utf8');
		assert.doesNotMatch(source, /\b(?:import|require)\s*\(|process\.env|\bfetch\s*\(/);
		for (const [, dependency] of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
			if (dependency.startsWith('node:')) {
				const builtins =
					path === 'tools/development/advisory-preview.mjs'
						? ['node:readline/promises']
						: ['node:crypto', 'node:util'];
				assert.ok(builtins.includes(dependency), dependency);
			} else {
				const resolved = fileURLToPath(new URL(dependency, file)).slice(fileURLToPath(root).length);
				inspect(resolved);
			}
		}
	}
	inspect('tools/development/advisory-preview.mjs');
	assert.deepEqual(seen, allowed);
});

test('simulation success, rejection and failure use no credential, network, process or file-write surfaces', async (t) => {
	const observed = [];
	const deny = (name) => () => {
		observed.push(name);
		throw new Error('Unexpected side effect');
	};
	t.mock.method(globalThis, 'fetch', deny('fetch'));
	for (const [module, methods] of [
		[http, ['request', 'get']],
		[https, ['request', 'get']],
		[net, ['connect', 'createConnection']],
		[childProcess, ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']],
		[fs, ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream']],
		[fs.promises, ['writeFile', 'appendFile']]
	]) {
		for (const method of methods) t.mock.method(module, method, deny(method));
	}
	syncBuiltinESMExports();
	const original = process.env;
	try {
		process.env = new Proxy(original, {
			get(target, property, receiver) {
				if (typeof property === 'string' && /KEY|TOKEN|SECRET|CREDENTIAL/i.test(property))
					return deny('credential')();
				return Reflect.get(target, property, receiver);
			}
		});
		const harness = createAdvisorySimulation(true);
		const success = prepare(harness);
		assert.equal((await run(harness, success, approve(harness, success))).status, 'advisory');
		const failure = prepare(harness, 'planning', 'failure');
		assert.equal(
			(await run(harness, failure, approve(harness, failure))).reason,
			'simulator-failure'
		);
		denied(harness.prepare('planning', 'invalid-request', limits), harness, 2);
	} finally {
		process.env = original;
		t.mock.restoreAll();
		syncBuiltinESMExports();
	}
	assert.deepEqual(observed, []);
});
