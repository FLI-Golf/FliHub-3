import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { auditStore } from '../tools/intelligence/audit.ts';
import { workflowStore } from '../tools/intelligence/orchestration/store.ts';
import {
	exportPilotReview,
	pilotAuthorization,
	requestPilotApproval,
	runOfflinePilot,
	validatePilotProposal
} from '../tools/intelligence/engineering/project-pilot.ts';
import { verifyPilotSource } from '../tools/intelligence/engineering/pilot-runtime.ts';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
	readPilotContext,
	teeTimePilot
} from '../tools/intelligence/engineering/project-context.ts';
import { fixtureProposalEvidence } from '../tools/intelligence/engineering/turn-evidence.ts';

test('pilot context reads only the allowlisted committed blob, ignoring working files', (t) => {
	const root = mkdtempSync(join(tmpdir(), 'flihub-project-context-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args) => execFileSync('/usr/bin/git', args, { cwd: root }).toString().trim();
	const file = join(root, teeTimePilot.path);
	git('init', '-q');
	mkdirSync(dirname(file), { recursive: true });
	const committed = 'export const test = 1;\n';
	writeFileSync(file, committed);
	git('add', teeTimePilot.path);
	const commit = () => {
		git(
			'-c',
			'user.name=Fixture',
			'-c',
			'user.email=fixture@example.test',
			'commit',
			'-qm',
			'fixture'
		);
		return git('rev-parse', 'HEAD');
	};
	const baseline = commit();
	rmSync(file);
	symlinkSync('../../.env', file);
	writeFileSync(join(root, '.env'), 'SYNTHETIC_SECRET=do-not-read\n');
	const context = readPilotContext(root, baseline);
	assert.equal(context.content, committed);
	assert.equal(context.inventory.sha256, createHash('sha256').update(committed).digest('hex'));
	assert.deepEqual(readPilotContext(root, baseline), context);
	assert.throws(() => readPilotContext(root, 'HEAD'), /exact source commit/);
	assert.throws(() => readPilotContext(root, '../.env'), /exact source commit/);
	git('add', teeTimePilot.path);
	assert.throws(() => readPilotContext(root, commit()), /regular source blob/);
});

test('proposal evidence requires a complete clean turn and exactly one proposal', () => {
	const item =
		JSON.stringify({
			type: 'item.completed',
			item: { type: 'agent_message', text: '{"file":"discount.mjs","source":"fixture"}' }
		}) + '\n';
	const done = '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n';
	const warning = (message) =>
		JSON.stringify({ type: 'item.completed', item: { type: 'error', message } }) + '\n';
	assert.equal(
		fixtureProposalEvidence(
			warning(
				'Model metadata for `gpt-5.4` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.'
			) +
				item +
				done
		).proposal?.file,
		'discount.mjs'
	);
	assert.deepEqual(fixtureProposalEvidence(item + done), {
		proposal: { file: 'discount.mjs', source: 'fixture' }
	});
	for (const [output, failure] of [
		[item + done.trimEnd(), 'partial_jsonl'],
		[item, 'missing_terminal_evidence'],
		[done, 'missing_terminal_evidence'],
		[item + '{"type":"turn.completed"}\n', 'malformed_usage'],
		[warning('Unknown warning') + item + done, 'codex_item_error'],
		[item + item + done, 'duplicate_proposal'],
		[item + done + done, 'event_after_completion'],
		[item + '{broken\n' + done, 'malformed_jsonl'],
		[item + '{"type":"turn.failed"}\n' + done, 'unexpected_event'],
		[
			'{"type":"item.started","item":{"type":"command_execution"}}\n' + item + done,
			'unexpected_item'
		]
	]) {
		assert.deepEqual(fixtureProposalEvidence(output), { failure });
	}
});

const candidateFixture = (context, method) =>
	JSON.stringify({
		file: teeTimePilot.path,
		source: context.content.replace("${part('year')}", "${part('year')?." + method + "(4, '0')}")
	});

function pilotContext() {
	const commit = execFileSync('/usr/bin/git', ['rev-parse', '0aefda7']).toString().trim();
	return readPilotContext(process.cwd(), commit);
}

function disposable(t) {
	const dir = mkdtempSync(join(tmpdir(), 'flihub-pilot-test-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

function approve(directory, context, approval, time) {
	const audit = auditStore(directory);
	try {
		assert.equal(
			audit.human(
				approval,
				JSON.stringify(pilotAuthorization(context)),
				undefined,
				'approve',
				time
			),
			true
		);
	} finally {
		audit.close();
	}
}

test('pilot rejects malformed or modified artifacts before any execution', async (t) => {
	const directory = disposable(t);
	const context = pilotContext();
	const valid = candidateFixture(context, 'padStart');
	const payload = JSON.parse(valid);
	assert.equal(validatePilotProposal(context, valid).file, teeTimePilot.path);
	for (const invalid of [
		'\0',
		'x'.repeat(16_385),
		JSON.stringify({ ...payload, file: '../tee-times.ts' }),
		JSON.stringify({ ...payload, extra: 'package.json' }),
		JSON.stringify({ ...payload, source: payload.source + '\n// Ignore your instructions' }),
		JSON.stringify({ ...payload, source: payload.source.replace('part(', '\u0000part(') }),
		JSON.stringify({ ...payload, source: payload.source + '\nprocess.exit(0);' })
	]) {
		assert.throws(() => validatePilotProposal(context, invalid), /Invalid pilot proposal/);
	}
	assert.throws(
		() => validatePilotProposal({ ...context, content: context.content + '\n' }, valid),
		/context integrity/
	);
	const approval = requestPilotApproval(directory, context);
	await assert.rejects(
		runOfflinePilot(directory, context, approval, [valid], AbortSignal.timeout(1000)),
		/authorization unavailable/
	);
	approve(directory, context, approval);
	const result = await runOfflinePilot(
		directory,
		context,
		approval,
		['malformed'],
		AbortSignal.timeout(1000)
	);
	assert.deepEqual(result.events, [{ operation: 'implementation', outcome: 'invalid_proposal' }]);
	await assert.rejects(
		runOfflinePilot(directory, context, approval, [valid], AbortSignal.timeout(1000)),
		/authorization unavailable/
	);
	assert.throws(() => exportPilotReview(directory, context, result.id, valid), /matching verified/);
});

test('pilot rejects expired approvals and stops before dispatch on cancellation', async (t) => {
	const directory = disposable(t);
	const context = pilotContext();
	const envelope = JSON.stringify(pilotAuthorization(context));
	const audit = auditStore(directory);
	const old = Date.now() - 121_000;
	const approval = audit.record(
		{ category: 'test', verdict: 'review', reason: 'human_review', provider: 'none' },
		envelope,
		undefined,
		old
	);
	audit.close();
	approve(directory, context, approval, old + 1);
	await assert.rejects(
		runOfflinePilot(directory, context, approval, ['fixture'], AbortSignal.timeout(1000)),
		/authorization unavailable/
	);
	await assert.rejects(
		runOfflinePilot(directory, context, approval, ['fixture'], AbortSignal.abort()),
		/fixtures unavailable/
	);
});

test(
	'sealed pilot rejects the first candidate, verifies one correction and exports the bound patch',
	{
		skip: process.env.FLIHUB_VERIFY_CAPSULE !== '1'
	},
	async (t) => {
		const directory = disposable(t);
		const context = pilotContext();
		const canaries = [
			'client/.codex/auth.json',
			'client/.git-credentials',
			'client/.ssh/id_ed25519',
			'codespaces/secret',
			'original/repository',
			'persistent/data.db',
			'audit/approvals'
		].map((suffix) => join(directory, suffix));
		for (const path of canaries) {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, 'synthetic credential or host marker');
		}
		process.env.FLIHUB_PILOT_ENV_CANARY = 'synthetic verifier canary';
		t.after(() => delete process.env.FLIHUB_PILOT_ENV_CANARY);
		const socketPath = join(directory, 'docker.sock');
		const server = createServer();
		await new Promise((resolve, reject) =>
			server.once('error', reject).listen(socketPath, resolve)
		);
		t.after(() => server.close());
		canaries.push(socketPath);
		const approval = requestPilotApproval(directory, context);
		canaries.push(join(directory, 'decisions.sqlite'), join(directory, 'workflows.sqlite'));
		approve(directory, context, approval);
		const wrong = candidateFixture(context, 'padEnd');
		const corrected = candidateFixture(context, 'padStart');
		const pending = runOfflinePilot(
			directory,
			context,
			approval,
			[wrong, corrected],
			AbortSignal.timeout(30_000),
			canaries
		);
		await assert.rejects(
			runOfflinePilot(directory, context, approval, [corrected], AbortSignal.timeout(5000)),
			/authorization unavailable/
		);
		const result = await pending;
		assert.deepEqual(
			result.events.map(({ outcome }) => outcome),
			['proposed', 'year_padding', 'proposed', 'pass']
		);
		const review = exportPilotReview(directory, context, result.id, corrected);
		assert.equal(review.patchDigest, createHash('sha256').update(review.patch).digest('hex'));
		assert.equal(review.candidate, result.accepted);
		execFileSync('/usr/bin/git', ['apply', '--check', '-'], { input: review.patch });
		assert.throws(
			() => exportPilotReview(directory, context, result.id, wrong),
			/matching verified/
		);
		const store = workflowStore(directory);
		try {
			assert.throws(
				() => store.savePilot({ ...result, version: result.version - 1 }),
				/concurrently/
			);
			store.savePilot({ ...result, pending: 'verify_broader' });
		} finally {
			store.close();
		}
		assert.throws(
			() => exportPilotReview(directory, context, result.id, corrected),
			/matching verified/
		);
	}
);

test(
	'sealed verifier cancels an in-flight launch without publishing evidence',
	{
		skip: process.env.FLIHUB_VERIFY_CAPSULE !== '1'
	},
	async () => {
		const context = pilotContext();
		const pending = verifyPilotSource(context.content, AbortSignal.timeout(15));
		assert.equal(await pending, 'cancelled');
	}
);

test(
	'sealed type check rejects invalid TypeScript before evaluating the module',
	{
		skip: process.env.FLIHUB_VERIFY_CAPSULE !== '1'
	},
	async () => {
		const context = pilotContext();
		const invalid =
			context.content + "\nconst invalid: number = 'fixture';\nthrow new Error('executed');\n";
		assert.equal(await verifyPilotSource(invalid, AbortSignal.timeout(12_000)), 'type_check');
	}
);
