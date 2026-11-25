import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	engineeringWorker,
	validateProposal,
	namespaceAvailable
} from '../tools/intelligence/engineering/worker.ts';
import { reviewPatch } from '../tools/intelligence/engineering/review.ts';
import { engineeringFiles } from '../tools/intelligence/orchestration/contracts.ts';
import { createDirector, runWorkflow } from '../tools/intelligence/orchestration/engine.ts';
import { workflowStore } from '../tools/intelligence/orchestration/store.ts';

const auth = {
	objective: 'isolated_engineering',
	files: engineeringFiles,
	operations: ['edit', 'verify'],
	protectedTasks: []
};
const source = 'export const discount = (cents) => Math.round(cents * 0.80);\n';
const setup = (t) => {
	const directory = mkdtempSync(join(tmpdir(), 'flihub-engineering-test-'));
	const store = workflowStore(directory);
	t.after(() => store.close());
	return { directory, store };
};

test('strict proposal grammar excludes arbitrary paths, imports, command fields and unapproved changes', () => {
	assert.deepEqual(
		validateProposal('correct_defect', { file: 'discount.mjs', source }, engineeringFiles),
		{ file: 'discount.mjs', source }
	);
	for (const candidate of [
		{ file: '../discount.mjs', source },
		{ file: 'discount.test.mjs', source },
		{ file: 'discount.mjs', source: source + 'import("node:fs");' },
		{ file: 'discount.mjs', source, command: 'irrelevant' }
	])
		assert.equal(validateProposal('correct_defect', candidate, engineeringFiles), undefined);
	assert.equal(
		validateProposal('correct_defect', { file: 'discount.mjs', source }, ['discount.test.mjs']),
		undefined
	);
});

test('engineering scope and checkpoint are validated before worker contact', async (t) => {
	const { directory, store } = setup(t);
	assert.throws(
		() => store.create({ ...auth, files: ['src/private.ts'] }, 'mock', {}, 'engineering'),
		/Invalid workflow authorization/
	);
	const state = store.create(auth, 'mock', {}, 'engineering');
	const restricted = engineeringWorker(directory, state.id, ['discount.test.mjs']);
	const signal = new AbortController().signal;
	assert.equal((await restricted.execute('implementation', signal, false)).evidence, 'unexpected');
	assert.throws(() => reviewPatch(directory, state.id), /verified engineering run/);
	writeFileSync(join(directory, 'engineering-' + state.id, 'discount.mjs'), source);
	assert.equal((await restricted.execute('verify_targeted', signal, false)).evidence, 'unexpected');
	const abort = new AbortController();
	abort.abort();
	assert.equal((await restricted.execute('checks', abort.signal, false)).evidence, 'cancelled');
});

test(
	'real isolated worker applies, detects failure, corrects, verifies and exports a bound patch',
	{
		skip: process.env.FLIHUB_VERIFY_CAPSULE !== '1'
	},
	async (t) => {
		const { directory, store } = setup(t);
		const signal = AbortSignal.timeout(120_000);
		assert.equal(await namespaceAvailable(directory, signal), true);
		const state = store.create(auth, 'mock', { invocations: 6 }, 'engineering');
		const final = await runWorkflow(
			store,
			state.id,
			createDirector('mock'),
			engineeringWorker(directory, state.id, engineeringFiles),
			signal
		);
		assert.equal(final.status, 'complete', final.reason);
		assert.deepEqual(
			final.events.filter((event) => event.category === 'test').map((event) => event.value),
			['fail', 'pass']
		);
		assert.equal(final.events.filter((event) => event.source === 'codex').length, 4);
		const patch = reviewPatch(directory, final.id);
		assert.match(patch, /diff --git a\/discount\.mjs b\/discount\.mjs/);
		assert.match(patch, /cents \* 0\.80/);
		assert.match(patch, /diff --git a\/discount\.test\.mjs b\/discount\.test\.mjs/);
		const path = join(directory, 'engineering-' + state.id, 'discount.mjs');
		assert.equal(readFileSync(path, 'utf8'), source);
		writeFileSync(path, source.replace('0.80', '0.81'));
		assert.throws(() => reviewPatch(directory, state.id), /snapshot changed/);
	}
);
