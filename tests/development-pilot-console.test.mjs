import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runPilotConsole } from '../tools/development/pilot-console.mjs';
import { inspectProposalTransport } from '../tools/intelligence/engineering/proposal-preflight.ts';
import { scopedReplacementSnapshot } from '../tools/intelligence/engineering/scoped-proposal.ts';

const scope = {
	context: 'a'.repeat(64),
	files: [{ path: 'src/lib/example.ts', sha256: 'b'.repeat(64) }]
};

test('scoped snapshots accept independent solutions and reject stale or unapproved replacements', () => {
	const replacement = {
		path: scope.files[0].path,
		before: 'b'.repeat(64),
		source: 'export const answer = 42;\n'
	};
	const proposal = (replacements, context = scope.context) =>
		JSON.stringify({ context, replacements });
	const original = scopedReplacementSnapshot(scope, proposal([replacement]));
	const alternative = scopedReplacementSnapshot(
		scope,
		proposal([{ ...replacement, source: 'export const answer = 6 * 7;\n' }])
	);
	assert.notEqual(original.digest, alternative.digest);
	assert(Object.isFrozen(original.files[0]));
	for (const value of [
		proposal([{ ...replacement, path: 'src/lib/../example.ts' }]),
		proposal([{ ...replacement, path: 'src/lib/other.ts' }]),
		proposal([{ ...replacement, source: 'x\0\n' }]),
		proposal([{ ...replacement, source: 'x\ud800\n' }]),
		proposal([{ ...replacement, before: 'c'.repeat(64) }]),
		proposal([replacement, replacement]),
		proposal([replacement], 'c'.repeat(64))
	])
		assert.throws(() => scopedReplacementSnapshot(scope, value), /proposal|replacement/);
});

function directory(t) {
	const root = mkdtempSync(join(tmpdir(), 'flihub-a10-test-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return root;
}

test('feature metadata can never admit authenticated execution', (t) => {
	const binary = join(directory(t), 'fixture-codex');
	writeFileSync(
		binary,
		`#!/bin/sh
case "$*" in
  --version) echo "codex-cli 0.172.0";;
  *"features list") printf 'shell_tool stable false\\nunified_exec stable false\\n';;
  *) exit 1;;
esac
`,
		{ mode: 0o700 }
	);
	const evidence = inspectProposalTransport(binary);
	assert.equal(evidence.admitted, false);
	assert.equal(evidence.reason, 'effective_tool_boundary_unverified');
	assert.equal(evidence.unifiedExec, false);
});

function consoleOptions(t, replies, signal = AbortSignal.timeout(20_000)) {
	const messages = [];
	return {
		messages,
		directory: directory(t),
		repository: process.cwd(),
		signal,
		question: async () => replies.shift(),
		print: (value) => messages.push(value)
	};
}

test('operator can review and reject the offline plan without writing authorization or calling models', async (t) => {
	const options = consoleOptions(t, ['Fix tee-time years', 'reject']);
	await runPilotConsole(options);
	assert.equal(options.messages[0].usage.authenticatedUsage, 'unavailable');
	assert.equal(options.messages[0].scope.transport, 'offline-fixture');
	assert.equal(options.messages[0].scope.path, 'src/lib/tee-times.ts');
	assert.deepEqual(readdirSync(options.directory), []);
});

test('operator cancellation at authorization does not dispatch the pilot', async (t) => {
	const options = consoleOptions(t, ['Fix tee-time years', 'authorize'], AbortSignal.abort());
	await runPilotConsole(options);
	assert.deepEqual(readdirSync(options.directory), []);
});

test(
	'operator observes durable correction and exports a verified review artifact',
	{
		skip: process.env.FLIHUB_VERIFY_CAPSULE !== '1'
	},
	async (t) => {
		const options = consoleOptions(t, ['Fix tee-time years', 'authorize', 'export']);
		const result = await runPilotConsole(options);
		assert.equal(result.evidence.outcome, 'pass');
		assert(options.messages.some((message) => message.pending === 'correct_defect'));
		const artifact = JSON.parse(
			readFileSync(join(options.directory, 'pilot-review-' + result.workflow + '.json'), 'utf8')
		);
		assert.deepEqual(artifact, result);
	}
);
