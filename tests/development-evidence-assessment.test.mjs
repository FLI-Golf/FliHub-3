import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareAssignment } from '../tools/development/assignment-builder.mjs';
import { hash, runCompletionReportImport } from '../tools/development/completion-report.mjs';
import {
	assessCompletionEvidence,
	runEvidenceAssessment
} from '../tools/development/evidence-assessment.mjs';

const signal = () => new AbortController().signal;

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), 'flihub-evidence-test-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args) =>
		execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '-q', '--initial-branch=fixture');
	git('config', 'user.name', 'Fixture');
	git('config', 'user.email', 'fixture@example.test');
	git('config', 'remote.origin.url', 'https://github.com/FLI-Golf/FliHub-3.git');
	mkdirSync(join(root, 'docs'));
	writeFileSync(join(root, 'docs', 'base.md'), 'start\n');
	git('add', '.');
	git('commit', '-qm', 'Start');
	const start = git('rev-parse', 'HEAD');
	const assignment = prepareAssignment(root, {
		kind: 'custom',
		objective: 'Assess fixture evidence',
		paths: ['docs'],
		scope: 'Edit docs.',
		exclusions: 'Application files.',
		acceptance: 'Tests pass.',
		verification: 'Record verification.',
		commit: true,
		push: false
	});
	const assignmentPath = `/tmp/flihub-development-assignment-${assignment.id}.txt`;
	const reportPath = `/tmp/flihub-development-assignment-${assignment.id}-report.txt`;
	const paths = [assignmentPath, reportPath];
	t.after(() => paths.forEach((path) => rmSync(path, { force: true })));
	writeFileSync(assignmentPath, assignment.text, { flag: 'wx' });
	return { root, git, start, assignment, assignmentPath, reportPath, paths };
}

async function ingest(f, { end, files = '- docs/new.md', verification = 'All tests passed.' }) {
	const text = `# FliHub completion report
Report format version: 1
Assignment ID: ${f.assignment.id}
Assignment format version: 1
Starting checkpoint: ${f.start}
Ending checkpoint: ${end}

## Changed files
${files}

## Verification
${verification}
========== FLIHUB ASSIGNMENT ${f.assignment.id} ACCEPTANCE COMPLETE ==========

## Blockers
None.

## Incomplete work
A mandatory review is outstanding.
`;
	writeFileSync(f.reportPath, text);
	const reportDigest = hash(text);
	const input = {
		repository: f.root,
		id: f.assignment.id,
		reportDigest,
		assignmentDigest: hash(f.assignment.text)
	};
	const record = `/tmp/flihub-completion-reports-${process.getuid()}/${input.id}-${reportDigest}.json`;
	f.paths.push(record);
	const replies = [input.id, 'import'];
	const messages = [];
	await runCompletionReportImport({
		question: async () => replies.shift(),
		print: (text) => messages.push(text),
		signal: signal()
	});
	assert.ok(messages.some((message) => message === 'Saved unverified report: ' + record));
	return { input, record };
}

function commitChange(f, outside = false) {
	writeFileSync(join(f.root, 'docs', 'new.md'), 'change\n');
	if (outside) writeFileSync(join(f.root, 'unapproved.txt'), 'fixture\n');
	f.git('add', '.');
	f.git('commit', '-qm', 'End');
	return f.git('rev-parse', 'HEAD');
}

function finding(assessment, subject) {
	return assessment.findings.find((item) => item.subject === subject);
}

test('matches source bytes and verifies net changes deterministically without accepting worker claims', async (t) => {
	const f = fixture(t);
	const end = commitChange(f);
	const { input, record } = await ingest(f, { end });
	const before = [f.assignmentPath, f.reportPath, record].map((path) => hash(readFileSync(path)));
	const result = assessCompletionEvidence(input);
	assert.deepEqual(result, assessCompletionEvidence(input));
	assert.deepEqual(finding(result, 'Actual changed files').detail, ['docs/new.md']);
	assert.equal(finding(result, 'Reported file inventory').status, 'verified');
	assert.equal(finding(result, 'Declared path scope').status, 'verified');
	assert.equal(finding(result, 'Worker report — verification').status, 'unverified');
	assert.equal(finding(result, 'Worker report — incompleteWork').status, 'incomplete');
	assert.equal(finding(result, 'Worker report — blockers').status, 'unverified');
	assert.equal(finding(result, 'Independent verification results').status, 'missing');
	assert.equal(result.completionAcceptance, 'not-determined');
	assert.equal(finding(result, 'Current local Git observation').detail.liveRemote, 'unverified');
	assert.deepEqual(
		[f.assignmentPath, f.reportPath, record].map((path) => hash(readFileSync(path))),
		before
	);
});

test('identifies unauthorized paths and contradicted inventories', async (t) => {
	const f = fixture(t);
	const { input } = await ingest(f, { end: commitChange(f, true), files: '- docs/other.md' });
	const result = assessCompletionEvidence(input);
	assert.deepEqual(finding(result, 'Declared path scope').detail, ['unapproved.txt']);
	assert.equal(finding(result, 'Declared path scope').status, 'out-of-scope');
	assert.deepEqual(finding(result, 'Reported file inventory').detail, {
		unreported: ['docs/new.md', 'unapproved.txt'],
		absentFromDiff: ['docs/other.md']
	});
});

test('checks exact checkpoint existence and ancestry before reporting changes', async (t) => {
	const f = fixture(t);
	const unrelated = f.git('commit-tree', 'HEAD^{tree}', '-m', 'No parent');
	for (const [end, subject, status] of [
		['unknown', 'Ending checkpoint', 'missing'],
		['f'.repeat(40), 'Ending checkpoint', 'missing'],
		[unrelated, 'Checkpoint ancestry', 'contradicted']
	]) {
		const { input } = await ingest(f, { end });
		const result = assessCompletionEvidence(input);
		assert.equal(finding(result, subject).status, status);
		assert.equal(finding(result, 'Actual changed files'), undefined);
	}
});

test('rejects tampered, malformed, mismatched and oversized records and unsafe paths', async (t) => {
	const f = fixture(t);
	const { input, record } = await ingest(f, { end: commitChange(f) });
	const original = readFileSync(record, 'utf8');
	for (const change of [
		{ recordVersion: 2 },
		{ originalBytesBase64: 'YQ==' },
		{ sha256: 'f'.repeat(64) },
		{ sourcePath: '/etc/passwd' },
		{ assignment: { id: 'f'.repeat(20) } },
		{ report: { assignmentId: 'f'.repeat(20) } }
	]) {
		writeFileSync(record, JSON.stringify({ ...JSON.parse(original), ...change }));
		assert.throws(() => assessCompletionEvidence(input), /contradicts/);
	}
	writeFileSync(record, '{');
	assert.throws(() => assessCompletionEvidence(input), /malformed/);
	writeFileSync(record, Buffer.alloc(256 * 1024 + 1));
	assert.throws(() => assessCompletionEvidence(input), /262144/);
	rmSync(record);
	symlinkSync(f.reportPath, record);
	assert.throws(() => assessCompletionEvidence(input), /unsafe/);
	assert.throws(() => assessCompletionEvidence({ ...input, id: '../escape' }), /without paths/);
});

test('requires both source digests and an exact retained record', async (t) => {
	const f = fixture(t);
	const { input } = await ingest(f, { end: commitChange(f) });
	assert.throws(
		() => assessCompletionEvidence({ ...input, assignmentDigest: 'f'.repeat(64) }),
		/supplied digests/
	);
	writeFileSync(f.reportPath, readFileSync(f.reportPath, 'utf8') + 'Unreviewed extra claim.\n');
	assert.throws(() => assessCompletionEvidence(input), /supplied digests/);
});

async function review(input, observation, accept, beforeConfirmation = () => {}) {
	const answers = [input.id, input.assignmentDigest, input.reportDigest, observation];
	const output = [];
	await runEvidenceAssessment({
		question: async (prompt) => {
			if (!prompt.startsWith('Enter accept')) return answers.shift();
			beforeConfirmation();
			return accept ? /^Enter (accept [a-f0-9]{64})/u.exec(prompt)[1] : '';
		},
		print: (text) => output.push(text),
		repository: input.repository,
		signal: signal()
	});
	return output;
}

test('cancel and changed context leave no assessment; exact reviews are private and append-only', async (t) => {
	const f = fixture(t);
	const { input } = await ingest(f, { end: commitChange(f) });
	const directory = `/tmp/flihub-evidence-assessments-${process.getuid()}`;
	const assessment = assessCompletionEvidence(input);
	const observation = 'Observed the terminal fixture.';
	const reviewValue = { decision: 'accepted-assessment', humanObservation: observation };
	const fingerprint = hash(JSON.stringify({ assessment, review: reviewValue }));
	const path = join(directory, `${input.id}-${fingerprint}.json`);
	f.paths.push(path);
	await review(input, observation, false);
	assert.equal(existsSync(path), false);
	const drift = await review(input, observation, true, () =>
		writeFileSync(join(f.root, 'dirty'), 'drift')
	);
	assert.ok(drift.some((line) => line.includes('inputs changed')));
	assert.equal(existsSync(path), false);
	rmSync(join(f.root, 'dirty'));
	await review(input, observation, true);
	const bytes = readFileSync(path);
	const record = JSON.parse(bytes);
	assert.equal(record.recordVersion, 1);
	assert.equal(record.assessment.completionAcceptance, 'not-determined');
	assert.deepEqual(record.review, reviewValue);
	assert.equal(lstatSync(directory).mode & 0o777, 0o700);
	assert.equal(lstatSync(path).mode & 0o777, 0o600);
	assert.ok(
		(await review(input, observation, true)).includes('This assessment review already exists.')
	);
	assert.deepEqual(readFileSync(path), bytes);
});

test('leaves reported commands and links inert and cannot substitute assertions for facts', async (t) => {
	const f = fixture(t);
	const sentinel = join(f.root, 'unexpected');
	const { input } = await ingest(f, {
		end: commitChange(f),
		verification: `$(touch ${sentinel})\nfile:///etc/passwd`
	});
	const result = assessCompletionEvidence(input);
	assert.ok(finding(result, 'Worker report — verification').detail.includes('file:///etc/passwd'));
	assert.equal(finding(result, 'Worker report — verification').status, 'unverified');
	assert.equal(existsSync(sentinel), false);
});
