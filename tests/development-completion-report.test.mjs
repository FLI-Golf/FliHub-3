import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
	existsSync,
	lstatSync,
	linkSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { test } from 'node:test';
import {
	parseCompletionReport,
	runCompletionReportImport
} from '../tools/development/completion-report.mjs';

const start = 'a'.repeat(40);
const end = 'b'.repeat(40);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function text(id, checkpoint = start, ending = end) {
	return `# FliHub completion report
Report format version: 1
Assignment ID: ${id}
Assignment format version: 1
Starting checkpoint: ${checkpoint}
Ending checkpoint: ${ending}

## Changed files
- README.md

## Completed work
The operator reported a documentation change.

## Verification
Run claims remain unverified.

## Git status
Reported clean and synchronized.

## Remaining work
Owner review.
`;
}

function fixture(t) {
	const id = randomBytes(10).toString('hex');
	const assignment = `/tmp/flihub-development-assignment-${id}.txt`;
	const report = `/tmp/flihub-development-assignment-${id}-report.txt`;
	const directory = `/tmp/flihub-completion-reports-${process.getuid()}`;
	const paths = [assignment, report];
	t.after(() => paths.forEach((path) => rmSync(path, { force: true })));
	const assignmentText = `# FliHub development assignment

Assignment ID: ${id}
Format version: 1

Exact commit: ${start}

Always save a complete report to ${report}, including when blocked.
========== FLIHUB ASSIGNMENT ${id} ACCEPTANCE COMPLETE ==========
`;
	writeFileSync(assignment, assignmentText, { flag: 'wx', mode: 0o600 });
	return {
		id,
		assignment,
		assignmentText,
		report,
		directory,
		write(bytes = text(id)) {
			writeFileSync(report, bytes);
			const path = `${directory}/${id}-${digest(bytes)}.json`;
			paths.push(path);
			return path;
		}
	};
}

async function run(id, confirmation, onConfirm = () => {}) {
	const output = [];
	let questions = 0;
	await runCompletionReportImport({
		question: async () => {
			if (questions++ === 0) return id;
			onConfirm();
			return confirmation;
		},
		print: (value) => output.push(value),
		signal: new AbortController().signal
	});
	return { questions, text: output.join('\n') };
}

test('stores exact bytes and versioned provenance while labeling reported and missing fields', async (t) => {
	const f = fixture(t);
	const bytes = Buffer.from(text(f.id, start, 'unknown').replaceAll('\n', '\r\n'));
	const path = f.write(bytes);
	const output = await run(f.id, 'import');
	assert.match(output.text, /unverified worker claims/);
	assert.match(output.text, /Reported ending checkpoint: Missing/);
	assert.match(output.text, /Blockers \(reported\):\nMissing/);
	assert.match(output.text, /Saved unverified report:/);
	const record = JSON.parse(readFileSync(path, 'utf8'));
	assert.deepEqual(Buffer.from(record.originalBytesBase64, 'base64'), bytes);
	assert.equal(record.sourcePath, f.report);
	assert.equal(record.sha256, digest(bytes));
	assert.equal(record.assignment.sha256, digest(f.assignmentText));
	assert.equal(record.assignment.startingCheckpoint, start);
	assert.equal(record.report.endingCheckpoint, null);
	assert.equal(record.claimsStatus, 'unverified');
	assert.equal(record.recordVersion, 1);
	assert.equal(new Date(record.importedAt).toISOString(), record.importedAt);
	assert.equal(lstatSync(path).mode & 0o777, 0o600);
	assert.equal(lstatSync(f.directory).mode & 0o777, 0o700);
});

test('rejects malformed headers, missing metadata, versions, encoding, size and duplicate sections', () => {
	const id = 'a'.repeat(20);
	for (const value of [
		'free-form report',
		text(id).replace('Report format version: 1', 'Report format version: 2'),
		text(id).replace('Assignment format version: 1', 'Assignment format version: 2'),
		text(id).replace(/^Starting checkpoint: .*\n/mu, ''),
		text(id).replace(end, 'wrong'),
		text(id) + '\n## Verification\nDuplicate',
		text(id) + '\n## Unexpected\nText',
		text(id).replace('Owner review.', '\u001b[31m'),
		Buffer.from([255]),
		Buffer.alloc(65537, 65)
	])
		assert.throws(() => parseCompletionReport(Buffer.from(value)));
	assert.equal(parseCompletionReport(Buffer.from(text(id))).outcomes.incompleteWork, null);
});

test('rejects mismatched identities and starting checkpoints and a missing export', async (t) => {
	const f = fixture(t);
	for (const body of [text('f'.repeat(20)), text(f.id, end)]) {
		const path = f.write(body);
		assert.match((await run(f.id, 'import')).text, /does not match/);
		assert.equal(existsSync(path), false);
	}
	writeFileSync(f.assignment, f.assignmentText.replace('Format version: 1', 'Format version: 2'));
	assert.match((await run(f.id, 'import')).text, /identity, version or format is invalid/);
	rmSync(f.assignment);
	assert.match((await run(f.id, 'import')).text, /unsafe/);
});

test('rejects oversized, nonregular, symlink and unsafe path inputs', async (t) => {
	const f = fixture(t);
	assert.match((await run('../etc/passwd', 'import')).text, /without a path/);
	f.write(Buffer.alloc(65537));
	assert.match((await run(f.id, 'import')).text, /65536/);
	rmSync(f.report);
	symlinkSync(f.assignment, f.report);
	assert.match((await run(f.id, 'import')).text, /unsafe/);
	rmSync(f.report);
	mkdirSync(f.report);
	assert.match((await run(f.id, 'import')).text, /regular file/);
	rmSync(f.report, { recursive: true });
	f.write();
	const alias = f.report + '.alias';
	linkSync(f.report, alias);
	try {
		assert.match((await run(f.id, 'import')).text, /one link/);
	} finally {
		rmSync(alias);
	}
	rmSync(f.assignment);
	symlinkSync(f.report, f.assignment);
	assert.match((await run(f.id, 'import')).text, /unsafe/);
});

test('cancellation and source replacement during review create no record', async (t) => {
	const f = fixture(t);
	const path = f.write();
	assert.equal((await run('', 'import')).questions, 1);
	assert.doesNotMatch((await run(f.id, '')).text, /Saved/);
	assert.equal(existsSync(path), false);
	let replacement;
	const outcome = await run(f.id, 'import', () => {
		replacement = f.write(text(f.id) + 'Replaced while inspecting.\n');
	});
	assert.match(outcome.text, /changed/);
	assert.equal(existsSync(path), false);
	assert.equal(existsSync(replacement), false);
});

test('atomic duplicate prevention preserves the first record and leaves symlinks untouched', async (t) => {
	const f = fixture(t);
	const path = f.write();
	const first = await run(f.id, 'import');
	assert.match(first.text, /Saved unverified report/);
	const bytes = readFileSync(path);
	const repeat = await run(f.id, 'import');
	assert.match(repeat.text, /already been imported/);
	assert.deepEqual(readFileSync(path), bytes);
	rmSync(path);
	symlinkSync(f.report, path);
	assert.match((await run(f.id, 'import')).text, /already been imported/);
	assert.equal(lstatSync(path).isSymbolicLink(), true);
	assert.equal(readFileSync(f.report, 'utf8'), text(f.id));
});

test('preserves commands and references as inert text and rejects recognizable credentials', async (t) => {
	const f = fixture(t);
	const sentinel = `/tmp/flihub-import-command-${f.id}`;
	const body = text(f.id) + `\n$(touch ${sentinel})\nfile:///etc/passwd\n`;
	const path = f.write(body);
	assert.match((await run(f.id, 'import')).text, /Saved unverified report/);
	assert.equal(existsSync(sentinel), false);
	assert.ok(
		JSON.parse(readFileSync(path, 'utf8')).report.outcomes.remainingWork.includes(
			'file:///etc/passwd'
		)
	);
	assert.throws(
		() => parseCompletionReport(Buffer.from(body + 'TYPESAFE_API_KEY=synthetic_key_fixture_000')),
		/credential signature/
	);
});

test('parses the supported ADM-3 legacy heading layout and imports a matched report', async (t) => {
	const f = fixture(t);
	const body = `FliHub-3 ADM-3 development assignment
Assignment ${f.id}, format 1

Starting checkpoint
The clean branch and live origin matched ${start}.
Implementation
A fixture was completed.
Changed files
- README.md
Verification
Reported verification.
Remaining work
Review.
Ending checkpoint
Commit ${end}
The branch was reported clean.
`;
	const path = f.write(body);
	assert.match((await run(f.id, 'import')).text, /Saved unverified report/);
	const record = JSON.parse(readFileSync(path, 'utf8'));
	assert.equal(record.report.sourceFormat, 'adm-3-legacy');
	assert.equal(record.report.endingCheckpoint, end);
	assert.equal(record.report.outcomes.changedFiles, '- README.md');
});
