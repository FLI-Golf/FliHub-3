import assert from 'node:assert/strict';
import childProcess, { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	lstatSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
	discoverAssignmentContext,
	prepareAssignment,
	runAssignmentBuilder
} from '../tools/development/assignment-builder.mjs';

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), 'flihub-assignment-test-'));
	t.after(() =>
		import('node:fs/promises').then(({ rm }) => rm(root, { force: true, recursive: true }))
	);
	const git = (...args) =>
		execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '--initial-branch=fixture');
	git('config', 'remote.origin.url', 'https://github.com/FLI-Golf/FliHub-3.git');
	git('config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
	mkdirSync(join(root, 'docs'));
	mkdirSync(join(root, 'tools'));
	writeFileSync(join(root, 'AGENTS.md'), 'Fixture root directions.\n');
	writeFileSync(join(root, 'tools/AGENTS.override.md'), 'Fixture scoped directions.\n');
	writeFileSync(join(root, 'docs/INTELLIGENCE-ROADMAP.md'), 'Fixture roadmap.\n');
	git('add', '.');
	git(
		'-c',
		'user.name=Fixture',
		'-c',
		'user.email=fixture@example.test',
		'commit',
		'-qm',
		'Fixture'
	);
	return { root, git };
}

const inputs = {
	kind: 'custom',
	objective: 'Improve the offline terminal instructions',
	paths: ['tools/example.mjs', 'docs/INTELLIGENCE-ROADMAP.md'],
	scope: 'Clarify the terminal workflow.',
	exclusions: 'Application routes and workers.',
	acceptance: 'Instructions include a runnable example.',
	verification: 'Run the focused offline checks.',
	commit: false,
	push: false
};
const replies = [
	'1',
	inputs.objective,
	inputs.paths.join(','),
	inputs.scope,
	inputs.exclusions,
	inputs.acceptance,
	inputs.verification,
	'no',
	'no'
];

test('reads exact local Git facts and scoped instruction inventory without writes', (t) => {
	const { root, git } = fixture(t);
	git('update-ref', 'refs/remotes/origin/fixture', 'HEAD');
	git('config', 'branch.fixture.remote', 'origin');
	git('config', 'branch.fixture.merge', 'refs/heads/fixture');
	const initial = discoverAssignmentContext(root, inputs.paths);
	assert.equal(initial.repository, 'FLI-Golf/FliHub-3');
	assert.equal(initial.branch, 'fixture');
	assert.equal(initial.commit, git('rev-parse', 'HEAD'));
	assert.equal(initial.worktree, 'Clean');
	assert.equal(initial.tracking, '0 ahead, 0 behind the local tracking ref');
	assert.ok(
		initial.instructions.some(
			(item) => item.path === 'tools/AGENTS.override.md' && item.state === 'present'
		)
	);
	assert.ok(
		initial.instructions.some((item) => item.path === 'tools/AGENTS.md' && item.state === 'missing')
	);
	assert.ok(initial.roadmaps.some((item) => item.state === 'missing'));
	assert.equal(git('status', '--porcelain'), '');
	writeFileSync(join(root, 'untracked'), 'fixture');
	assert.equal(discoverAssignmentContext(root).worktree, 'Changes present');
});

test('handles missing, detached and unexpected repository context without disclosing origin', (t) => {
	const { root, git } = fixture(t);
	assert.throws(() => discoverAssignmentContext(join(root, 'absent')), /unavailable/);
	assert.throws(() => discoverAssignmentContext(join(root, 'tools')), /repository root/);
	git('checkout', '--detach', '-q');
	assert.equal(discoverAssignmentContext(root).branch, 'Detached HEAD');
	assert.match(discoverAssignmentContext(root).tracking, /No usable/);
	git('config', '--unset', 'remote.origin.url');
	assert.throws(() => discoverAssignmentContext(root), /Origin is missing/);
	git('config', 'remote.origin.url', 'https://synthetic-token@example.test/other');
	assert.throws(() => discoverAssignmentContext(root), {
		message: 'Origin is unexpected or unavailable.'
	});
});

test('does not follow instruction symlinks or execute configured Git helpers', (t) => {
	const { root, git } = fixture(t);
	symlinkSync('/dev/null', join(root, 'AGENTS.override.md'));
	const hook = join(root, 'fixture-hook');
	writeFileSync(hook, '#!/bin/sh\ntouch ./unexpected-execution\n', { mode: 0o700 });
	writeFileSync(join(root, '.gitattributes'), 'AGENTS.md filter=fixture\n');
	git('add', '.gitattributes');
	git('config', 'core.fsmonitor', hook);
	git('config', 'filter.fixture.clean', hook);
	git('config', 'filter.fixture.process', hook);
	git('config', 'filter.fixture.required', 'true');
	writeFileSync(join(root, 'AGENTS.md'), 'Changed fixture directions.\n');
	const context = discoverAssignmentContext(root);
	assert.ok(
		context.instructions.some(
			(item) => item.path === 'AGENTS.override.md' && item.state === 'unavailable'
		)
	);
	assert.equal(existsSync(join(root, 'unexpected-execution')), false);
});

test('serializes normalized custom input deterministically with explicit boundaries and reporting', (t) => {
	const { root } = fixture(t);
	const first = prepareAssignment(root, inputs);
	const second = prepareAssignment(root, {
		...inputs,
		objective: '  ' + inputs.objective + ' ',
		paths: [...inputs.paths].reverse()
	});
	assert.deepEqual(first, second);
	for (const section of [
		'Authority and safety',
		'Development objective',
		'Observed repository context',
		'Governing instruction files',
		'Relevant roadmaps',
		'Implementation scope',
		'Additional exclusions',
		'Git authorization declarations',
		'Acceptance requirements',
		'Required verification',
		'Mandatory completion report'
	])
		assert.ok(first.text.includes(section), section);
	assert.match(first.text, /Format version: 1/);
	assert.match(first.text, /Local commit: Excluded\nPush: Excluded/);
	assert.match(first.text, /Live remote state: unverified/);
	assert.match(first.text, /including when blocked/);
	assert.match(
		first.text,
		new RegExp('code /tmp/flihub-development-assignment-' + first.id + '-report.txt')
	);
	assert.match(first.text, /exact path and the same command for manual execution/);
	assert.match(first.text, /only if the specified acceptance gates actually pass/);
	assert.match(
		prepareAssignment(root, { ...inputs, commit: true }).text,
		/Local commit: Operator marks in scope[^\n]*\nPush: Excluded/
	);
});

test('supports the fixed documented roadmap objective and rejects a missing roadmap', (t) => {
	const { root, git } = fixture(t);
	const roadmap = { ...inputs, kind: 'roadmap', objective: 'Ignored arbitrary phase' };
	assert.match(
		prepareAssignment(root, roadmap).text,
		/milestone 3\)\nObjective: "Add human assignment review and export\."/
	);
	git('rm', '-q', 'docs/INTELLIGENCE-ROADMAP.md');
	assert.throws(() => prepareAssignment(root, roadmap), /roadmap is unavailable/);
});

test('rejects malformed fields, traversal and terminal controls', (t) => {
	const { root } = fixture(t);
	for (const override of [
		{ kind: 'arbitrary' },
		{ paths: [] },
		{ objective: '' },
		{ acceptance: 'a\nb' },
		{ objective: 'x'.repeat(1201) },
		{ scope: 'Scope\x1b[1m' },
		{ push: 'yes' },
		{ paths: ['../secret'] },
		{ paths: ['/outside'] },
		{ paths: ['.git/config'] }
	])
		assert.throws(() => prepareAssignment(root, { ...inputs, ...override }));
	const shellText = 'Inert example: $(touch unexpected-execution)';
	assert.ok(
		prepareAssignment(root, { ...inputs, objective: shellText }).text.includes(
			JSON.stringify(shellText)
		)
	);
	assert.equal(existsSync(join(root, 'unexpected-execution')), false);
});

test('console allows cancellation and revision and copies reviewed text without creating an artifact', async (t) => {
	const { root, git } = fixture(t);
	const before = readdirSync(root);
	const drive = async (answers) => {
		const output = [];
		await runAssignmentBuilder({
			question: async () => answers.shift() ?? '',
			print: (line) => output.push(line),
			repository: root,
			signal: new AbortController().signal
		});
		return output.filter((line) => line.startsWith('# FliHub development assignment'));
	};
	assert.equal((await drive([''])).length, 0);
	assert.equal((await drive([...replies, ''])).length, 1);
	const revised = [...replies];
	revised[1] = 'Revised objective';
	const reviewed = await drive([...replies, 'revise', ...revised, 'copy']);
	assert.equal(reviewed.length, 3);
	assert.equal(reviewed[1], reviewed[2]);
	assert.match(reviewed[2], /Revised objective/);
	assert.deepEqual(readdirSync(root), before);
	assert.equal(git('status', '--porcelain'), '');
});

test('console refuses stale review when the working status changes', async (t) => {
	const { root } = fixture(t);
	const answers = [...replies];
	const output = [];
	await runAssignmentBuilder({
		question: async (prompt) => {
			if (prompt.startsWith('Enter copy')) {
				writeFileSync(join(root, 'new-local-file'), 'changed');
				return 'copy';
			}
			return answers.shift() ?? '';
		},
		print: (line) => output.push(line),
		repository: root,
		signal: new AbortController().signal
	});
	assert.equal(
		output.filter((line) => line.startsWith('# FliHub development assignment')).length,
		1
	);
	assert.ok(output.some((line) => line.includes('checkpoint changed')));
});

test('review and export start only fixed Git inspections and makes no provider requests', async (t) => {
	const { root } = fixture(t);
	const draft = prepareAssignment(root, inputs);
	const path = exportDestination(t, draft);
	const realSpawn = childProcess.spawnSync;
	const observed = [];
	t.mock.method(childProcess, 'spawnSync', (program, args, options) => {
		assert.equal(program, '/usr/bin/git');
		assert.equal(options.shell, undefined);
		assert.equal(options.env.TYPESAFE_API_KEY, undefined);
		observed.push(args);
		return realSpawn(program, args, options);
	});
	t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected provider request'));
	syncBuiltinESMExports();
	try {
		const answers = [...replies, approvalFor(draft), 'export'];
		const output = [];
		await runAssignmentBuilder({
			question: async () => answers.shift() ?? '',
			print: (line) => output.push(line),
			repository: root,
			signal: new AbortController().signal
		});
		assert.equal(answers.length, 0);
		assert.equal(
			output.filter((line) => line.startsWith('# FliHub development assignment')).length,
			1
		);
		assert.equal(readFileSync(path, 'utf8'), draft.text);
		assert.ok(observed.length > 0);
		assert.ok(observed.every((args) => !args.includes(inputs.objective)));
	} finally {
		t.mock.restoreAll();
		syncBuiltinESMExports();
	}
});

const approvalFor = ({ text }) => `approve ${createHash('sha256').update(text).digest('hex')}`;

function exportDestination(t, draft) {
	const path = `/tmp/flihub-development-assignment-${draft.id}.txt`;
	assert.throws(() => lstatSync(path), { code: 'ENOENT' });
	t.after(() => rmSync(path, { force: true }));
	return path;
}

async function reviewSession(root, answers, beforeAnswer = () => {}) {
	const output = [];
	await runAssignmentBuilder({
		question: async (prompt) => {
			beforeAnswer(prompt);
			return answers.shift() ?? '';
		},
		print: (line) => output.push(line),
		repository: root,
		signal: new AbortController().signal
	});
	return output;
}

test('exports the exact approved bytes as a private file and prints the editor command', async (t) => {
	const { root, git } = fixture(t);
	const draft = prepareAssignment(root, inputs);
	const path = exportDestination(t, draft);
	const approval = approvalFor(draft);
	const output = await reviewSession(root, [...replies, approval, 'export']);
	assert.ok(output.some((line) => line.endsWith(approval)));
	assert.equal(
		output.find((line) => line.startsWith('# FliHub development assignment')),
		draft.text
	);
	assert.deepEqual(readFileSync(path), Buffer.from(draft.text));
	assert.equal(lstatSync(path).mode & 0o777, 0o600);
	assert.ok(
		output.includes(`Exported assignment: ${path}
Open in VS Code: code ${path}`)
	);
	assert.equal(git('status', '--porcelain'), '');
});

test('requires exact approval and refuses unsafe export commands', async (t) => {
	const { root } = fixture(t);
	const draft = prepareAssignment(root, inputs);
	const path = exportDestination(t, draft);
	for (const commands of [
		['export'],
		['approve', 'export'],
		[approvalFor(draft) + '0', 'export'],
		[approvalFor(draft), 'export /tmp/../unapproved-assignment.txt']
	]) {
		const output = await reviewSession(root, [...replies, ...commands]);
		assert.ok(output.some((line) => line.includes('Assignment action refused')));
		assert.throws(() => lstatSync(path), { code: 'ENOENT' });
	}
});

test('cancel after approving creates no artifact', async (t) => {
	const { root } = fixture(t);
	const draft = prepareAssignment(root, inputs);
	const path = exportDestination(t, draft);
	await reviewSession(root, [...replies, approvalFor(draft), '']);
	assert.throws(() => lstatSync(path), { code: 'ENOENT' });
});

test('revision retains unchanged inputs and requires approval of the revised text', async (t) => {
	const { root } = fixture(t);
	const original = prepareAssignment(root, inputs);
	const objective = 'Revised custom assignment';
	const revised = prepareAssignment(root, { ...inputs, objective });
	const originalPath = exportDestination(t, original);
	const revisedPath = exportDestination(t, revised);
	const edits = ['1', objective, '', '', '', '', '', '', ''];
	const start = [...replies, approvalFor(original), 'revise', ...edits];
	const refusal = await reviewSession(root, [...start, approvalFor(original), 'export']);
	assert.ok(refusal.some((line) => line.includes('Assignment action refused')));
	assert.throws(() => lstatSync(revisedPath), { code: 'ENOENT' });
	await reviewSession(root, [...start, approvalFor(revised), 'export']);
	assert.equal(readFileSync(revisedPath, 'utf8'), revised.text);
	assert.throws(() => lstatSync(originalPath), { code: 'ENOENT' });
});

test('revalidates repository context after approval and before export', async (t) => {
	const { root } = fixture(t);
	const draft = prepareAssignment(root, inputs);
	const path = exportDestination(t, draft);
	const output = await reviewSession(root, [...replies, approvalFor(draft), 'export'], (prompt) => {
		if (prompt.startsWith('Exact text approved')) {
			writeFileSync(join(root, 'unreviewed-change'), 'fixture');
		}
	});
	assert.ok(output.some((line) => line.includes('checkpoint changed')));
	assert.throws(() => lstatSync(path), { code: 'ENOENT' });
});

test('refuses to overwrite either an existing file or a symlink', async (t) => {
	const { root } = fixture(t);
	const draft = prepareAssignment(root, inputs);
	const path = exportDestination(t, draft);
	const commands = [...replies, approvalFor(draft), 'export'];
	writeFileSync(path, 'existing export', { flag: 'wx' });
	const collision = await reviewSession(root, [...commands]);
	assert.ok(collision.some((line) => line.includes('destination already exists')));
	assert.equal(readFileSync(path, 'utf8'), 'existing export');
	rmSync(path);

	const target = join(root, 'absent-symlink-target');
	symlinkSync(target, path);
	const symlink = await reviewSession(root, [...commands]);
	assert.ok(symlink.some((line) => line.includes('destination already exists')));
	assert.ok(lstatSync(path).isSymbolicLink());
	assert.equal(existsSync(target), false);
});
