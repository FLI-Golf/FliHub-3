import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import {
	publishPrivateArtifact,
	requirePrivateDirectory,
	requireSafeTmp
} from './private-artifacts.mjs';

const assignmentId = /^[a-f0-9]{20}$/u;
const commit = /^[a-f0-9]{40}$/u;
const maxBytes = 64 * 1024;
const sections = {
	'Changed files': 'changedFiles',
	'Completed work': 'completedWork',
	'Incomplete work': 'incompleteWork',
	Verification: 'verification',
	Blockers: 'blockers',
	'Git status': 'gitStatus',
	'Security outcomes': 'securityOutcomes',
	'Remaining work': 'remainingWork'
};
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function readArtifact(path, limit = maxBytes) {
	let fd;
	try {
		const entry = lstatSync(path, { bigint: true });
		if (!entry.isFile() || entry.nlink !== 1n || entry.uid !== BigInt(process.getuid())) {
			throw new Error('Artifact is unsafe. Expected an operator-owned regular file with one link.');
		}
		fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		const before = fstatSync(fd, { bigint: true });
		if (entry.dev !== before.dev || entry.ino !== before.ino || entry.ctimeNs !== before.ctimeNs) {
			throw new Error('Artifact changed before inspection.');
		}
		if (!before.size || before.size > limit)
			throw new Error(`Artifact must contain 1–${limit} bytes.`);
		const buffer = Buffer.alloc(limit + 1);
		let size = 0;
		while (size < buffer.length) {
			const count = readSync(fd, buffer, size, buffer.length - size, null);
			if (!count) break;
			size += count;
		}
		const after = fstatSync(fd, { bigint: true });
		if (
			BigInt(size) !== before.size ||
			before.size !== after.size ||
			before.mtimeNs !== after.mtimeNs ||
			before.ctimeNs !== after.ctimeNs
		) {
			throw new Error('Artifact changed during inspection.');
		}
		return buffer.subarray(0, size);
	} catch (error) {
		if (error.code)
			throw new Error(
				'Artifact is unavailable or unsafe. Use the expected regular file under /tmp.',
				{ cause: error }
			);
		throw error;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

export function textOf(bytes) {
	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
	} catch (error) {
		throw new Error('Artifact must be valid UTF-8 text.', { cause: error });
	}
	if (/[\p{C}\p{Zl}\p{Zp}]/u.test(text.replaceAll('\n', '').replaceAll('\t', ''))) {
		throw new Error('Artifact contains unsupported control characters.');
	}
	return text;
}

function readAssignment(id) {
	const path = `/tmp/flihub-development-assignment-${id}.txt`;
	const bytes = readArtifact(path);
	const text = textOf(bytes);
	const header =
		/^# FliHub development assignment\n\nAssignment ID: ([a-f0-9]{20})\nFormat version: (\d+)\n/u.exec(
			text
		);
	const fields = [...text.matchAll(/^Exact commit: ([a-f0-9]{40})$/gmu)];
	if (
		!header ||
		header[1] !== id ||
		header[2] !== '1' ||
		fields.length !== 1 ||
		!text.includes(
			`Always save a complete report to /tmp/flihub-development-assignment-${id}-report.txt,`
		) ||
		!text.trimEnd().endsWith(`========== FLIHUB ASSIGNMENT ${id} ACCEPTANCE COMPLETE ==========`)
	) {
		throw new Error('Exported assignment identity, version or format is invalid.');
	}
	return {
		text,
		reference: { id, formatVersion: 1, path, sha256: hash(bytes), startingCheckpoint: fields[0][1] }
	};
}

function collectSections(lines, headings) {
	const found = new Map();
	let section;
	for (const line of lines) {
		const heading = headings(line);
		if (heading) {
			if (found.has(heading)) throw new Error('Duplicate completion report section.');
			section = [];
			found.set(heading, section);
		} else if (section) {
			section.push(line);
		} else if (line.trim()) {
			throw new Error('Unexpected content before the first report section.');
		}
	}
	return new Map([...found].map(([name, content]) => [name, content.join('\n').trim() || null]));
}

const legacyHeadings = new Set([
	'Starting checkpoint',
	'Implementation',
	'Changed files',
	'Verification',
	'Terminal export evidence',
	'Security and limitations',
	'Remaining work',
	'Ending checkpoint',
	'Editor handoff',
	'Remaining requirements',
	'Blockers'
]);

export function rejectSensitiveText(text) {
	if (
		/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_|github_pat_|sk-(?:proj-)?)\w{20,}|\bAKIA[A-Z0-9]{16}\b|\b(?:TYPESAFE|OPENAI|ANTHROPIC)_API_KEY\s*[:=]\s*['"]?[A-Za-z0-9_-]{12,}/iu.test(
			text
		)
	) {
		throw new Error(
			'Text contains a credential signature. Remove sensitive content before retaining it.'
		);
	}
}

export function parseCompletionReport(bytes) {
	if (!bytes.length || bytes.length > maxBytes)
		throw new Error('Artifact must contain 1–65536 bytes.');
	const text = textOf(bytes);
	rejectSensitiveText(text);
	const lines = text.split('\n');
	const outcomes = Object.fromEntries(Object.values(sections).map((key) => [key, null]));
	let id;
	let startingCheckpoint;
	let endingCheckpoint;
	let sourceFormat;
	if (lines[0] === '# FliHub completion report') {
		if (
			lines[1] !== 'Report format version: 1' ||
			lines[3] !== 'Assignment format version: 1' ||
			!lines[2]?.startsWith('Assignment ID: ') ||
			!lines[4]?.startsWith('Starting checkpoint: ') ||
			!lines[5]?.startsWith('Ending checkpoint: ') ||
			lines[6] !== ''
		) {
			throw new Error('Completion report header or format version is invalid.');
		}
		id = lines[2].slice('Assignment ID: '.length);
		startingCheckpoint = lines[4].slice('Starting checkpoint: '.length);
		endingCheckpoint = lines[5].slice('Ending checkpoint: '.length);
		const found = collectSections(lines.slice(7), (line) => {
			if (!line.startsWith('## ')) return null;
			const name = line.slice(3);
			if (!Object.hasOwn(sections, name))
				throw new Error('Unrecognized completion report section.');
			return name;
		});
		if (!found.size) throw new Error('Expected at least one completion report section.');
		for (const [name, content] of found) outcomes[sections[name]] = content;
		sourceFormat = 'flihub-completion-report-v1';
	} else if (lines[0] === 'FliHub-3 ADM-3 development assignment') {
		id = /^Assignment ([a-f0-9]{20}), format 1$/u.exec(lines[1])?.[1];
		const found = collectSections(lines.slice(2), (line) =>
			legacyHeadings.has(line) ? line : null
		);
		startingCheckpoint = /\b(?:at|matched) ([a-f0-9]{40})\./u.exec(
			found.get('Starting checkpoint') ?? ''
		)?.[1];
		endingCheckpoint =
			/^Commit ([a-f0-9]{40})$/mu.exec(found.get('Ending checkpoint') ?? '')?.[1] ?? 'unknown';
		outcomes.completedWork = found.get('Implementation') ?? null;
		outcomes.changedFiles = found.get('Changed files') ?? null;
		outcomes.verification = found.get('Verification') ?? null;
		outcomes.securityOutcomes = found.get('Security and limitations') ?? null;
		outcomes.gitStatus = found.get('Ending checkpoint') ?? null;
		outcomes.remainingWork =
			found.get('Remaining work') ?? found.get('Remaining requirements') ?? null;
		outcomes.blockers = found.get('Blockers') ?? null;
		sourceFormat = 'adm-3-legacy';
	} else {
		throw new Error('Unrecognized completion report format.');
	}
	if (
		!assignmentId.test(id) ||
		!commit.test(startingCheckpoint) ||
		(endingCheckpoint !== 'unknown' && !commit.test(endingCheckpoint))
	) {
		throw new Error('Report assignment identity or Git checkpoint is invalid.');
	}
	return {
		assignmentId: id,
		assignmentFormatVersion: 1,
		sourceFormat,
		startingCheckpoint,
		endingCheckpoint: endingCheckpoint === 'unknown' ? null : endingCheckpoint,
		outcomes
	};
}

export function prepareImport(id) {
	if (!assignmentId.test(id)) throw new Error('Enter a valid assignment ID, without a path.');
	requireSafeTmp();
	const { reference, text: assignmentText } = readAssignment(id);
	const sourcePath = `/tmp/flihub-development-assignment-${id}-report.txt`;
	const bytes = readArtifact(sourcePath);
	const report = parseCompletionReport(bytes);
	if (
		report.assignmentId !== id ||
		report.assignmentFormatVersion !== reference.formatVersion ||
		report.startingCheckpoint !== reference.startingCheckpoint
	) {
		throw new Error(
			'Report identity, format version or starting checkpoint does not match the exported assignment.'
		);
	}
	return { reference, assignmentText, sourcePath, bytes, report, sha256: hash(bytes) };
}

function saveImport(draft) {
	const directory = `/tmp/flihub-completion-reports-${process.getuid()}`;
	requirePrivateDirectory(directory, { create: true });
	const path = `${directory}/${draft.reference.id}-${draft.sha256}.json`;
	const record = {
		recordVersion: 1,
		importedAt: new Date().toISOString(),
		sourcePath: draft.sourcePath,
		sha256: draft.sha256,
		assignment: draft.reference,
		claimsStatus: 'unverified',
		report: draft.report,
		originalBytesBase64: draft.bytes.toString('base64')
	};
	try {
		publishPrivateArtifact(path, JSON.stringify(record, null, 2) + '\n');
	} catch (error) {
		if (error.code === 'EEXIST')
			throw new Error('This report has already been imported.', { cause: error });
		throw error;
	}
	return path;
}

export async function runCompletionReportImport({ question, print, signal }) {
	try {
		const id = (await question('Exported assignment ID (Enter cancels): ')).trim();
		if (!id || signal.aborted) return;
		if (!assignmentId.test(id)) throw new Error('Enter a valid assignment ID, without a path.');
		const draft = prepareImport(id);
		print('Reported outcomes — unverified worker claims');
		print(`Assignment: ${id}\nReport source: ${draft.sourcePath}\nSHA-256: ${draft.sha256}`);
		print(
			`Reported starting checkpoint: ${draft.report.startingCheckpoint}\nReported ending checkpoint: ${draft.report.endingCheckpoint ?? 'Missing'}`
		);
		for (const [label, key] of Object.entries(sections)) {
			print(`${label} (reported):\n${draft.report.outcomes[key] ?? 'Missing'}`);
		}
		const confirmation = (
			await question(
				'Confirm this report contains no secrets or private payloads. Enter import to save, or Enter to cancel: '
			)
		).trim();
		if (confirmation !== 'import' || signal.aborted) return;
		const current = prepareImport(id);
		if (current.sha256 !== draft.sha256 || current.reference.sha256 !== draft.reference.sha256) {
			throw new Error('Assignment or report changed. Review it again before importing.');
		}
		print(`Saved unverified report: ${saveImport(current)}`);
	} catch (error) {
		if (!signal.aborted)
			print(error.code ? 'Could not safely store the completion report.' : error.message);
	}
}
