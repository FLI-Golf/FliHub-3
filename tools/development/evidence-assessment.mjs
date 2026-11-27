import { isDeepStrictEqual } from 'node:util';
import {
	discoverAssignmentContext,
	inspectLocalGit,
	normalizePaths
} from './assignment-builder.mjs';
import {
	hash,
	prepareImport,
	readArtifact,
	rejectSensitiveText,
	textOf
} from './completion-report.mjs';
import { publishPrivateArtifact, requirePrivateDirectory } from './private-artifacts.mjs';

const digest = /^[a-f0-9]{64}$/u;
const recordLimit = 256 * 1024;
const assessmentVersion = 1;
const assessmentLimit = 512 * 1024;

function bindReport(id, reportDigest, assignmentDigest) {
	if (!/^[a-f0-9]{20}$/u.test(id) || !digest.test(reportDigest) || !digest.test(assignmentDigest)) {
		throw new Error('Use the exact assignment ID and both SHA-256 digests, without paths.');
	}
	const source = prepareImport(id);
	if (source.sha256 !== reportDigest || source.reference.sha256 !== assignmentDigest) {
		throw new Error('The source artifacts do not match the supplied digests.');
	}
	const directory = `/tmp/flihub-completion-reports-${process.getuid()}`;
	requirePrivateDirectory(directory);
	const path = `${directory}/${id}-${reportDigest}.json`;
	const bytes = readArtifact(path, recordLimit);
	let record;
	try {
		record = JSON.parse(textOf(bytes));
	} catch (error) {
		throw new Error('The retained import record is malformed.', { cause: error });
	}
	const time = record?.importedAt;
	if (
		typeof time !== 'string' ||
		!Number.isFinite(Date.parse(time)) ||
		new Date(time).toISOString() !== time ||
		!isDeepStrictEqual(record, {
			recordVersion: 1,
			importedAt: time,
			sourcePath: source.sourcePath,
			sha256: source.sha256,
			assignment: source.reference,
			claimsStatus: 'unverified',
			report: source.report,
			originalBytesBase64: source.bytes.toString('base64')
		})
	) {
		throw new Error(
			'The retained import record contradicts the source artifacts or uses an unsupported version.'
		);
	}
	return { source, ingestion: { path, sha256: hash(bytes), importedAt: time } };
}

function assignmentScope(text, context) {
	const observed = text
		.split('## Observed repository context and expected checkpoint\n')[1]
		?.split('\n## ')[0];
	if (
		!observed
			?.split('\n')
			.includes(`Repository: ${context.repository} (local origin configuration)`)
	) {
		throw new Error('Assignment repository identity does not match the current repository.');
	}
	const scope = /^## Implementation scope\nPaths: (.+)$/mu.exec(text)?.[1];
	const requirements = /^## Acceptance requirements\n(".+")$/mu.exec(text)?.[1];
	const verification = /^## Required verification\n(".+")$/mu.exec(text)?.[1];
	try {
		const declared = JSON.parse(`[${scope}]`);
		const paths = normalizePaths(declared);
		const acceptance = JSON.parse(requirements);
		const requiredVerification = JSON.parse(verification);
		if (
			!paths.length ||
			!isDeepStrictEqual(paths, declared) ||
			typeof acceptance !== 'string' ||
			typeof requiredVerification !== 'string' ||
			/[\p{C}\p{Zl}\p{Zp}]/u.test(acceptance + requiredVerification)
		) {
			throw new Error('Incomplete assignment scope.');
		}
		rejectSensitiveText(acceptance + '\n' + requiredVerification);
		return { paths, acceptance, verification: requiredVerification };
	} catch (error) {
		throw new Error('The assignment scope or requirements are malformed.', { cause: error });
	}
}

function reportedPaths(value) {
	if (!value) return null;
	if (/^(?:none|no changes)\.?$/iu.test(value)) return [];
	const paths = [];
	for (const line of value.split('\n')) {
		if (!line.trim() || /^ +\S/u.test(line)) continue;
		const match = /^[-*] (?:`([^`]+)`|([^\s`]+))(?:$|\s+[—–-]\s+)/u.exec(line);
		if (!match) return null;
		try {
			paths.push(normalizePaths([match[1] ?? match[2]])[0]);
		} catch {
			return null;
		}
	}
	return paths.length && new Set(paths).size === paths.length ? paths.sort() : null;
}

function assessCheckpoints(root, report, paths, add) {
	const start = report.startingCheckpoint;
	const end = report.endingCheckpoint;
	const exists = (value) => inspectLocalGit(root, ['cat-file', '-t', value]).output === 'commit\n';
	if (!exists(start)) {
		add('missing', 'Starting checkpoint', 'The exact commit object is unavailable locally.');
		return null;
	}
	add('verified', 'Starting checkpoint', start);
	if (!end || !exists(end)) {
		add(
			'missing',
			'Ending checkpoint',
			end ? 'The exact commit object is unavailable locally.' : 'No ending checkpoint was supplied.'
		);
		return null;
	}
	const ancestry = inspectLocalGit(root, ['merge-base', '--is-ancestor', start, end]);
	if (ancestry.status !== 0) {
		add(
			ancestry.status === 1 ? 'contradicted' : 'incomplete',
			'Checkpoint ancestry',
			ancestry.status === 1
				? 'The ending commit is outside the starting commit ancestry.'
				: 'Local ancestry could not be assessed.'
		);
		return null;
	}
	add('verified', 'Ending checkpoint and ancestry', end);
	const net = inspectLocalGit(root, [
		'diff',
		'--no-ext-diff',
		'--no-textconv',
		'--no-renames',
		'--name-only',
		'-z',
		start,
		end,
		'--'
	]);
	if (net.status !== 0 || /[\p{C}\p{Zl}\p{Zp}\uFFFD]/u.test(net.output.replaceAll('\0', ''))) {
		add(
			'incomplete',
			'Changed files',
			'The bounded local Git diff is unavailable or contains unsupported paths.'
		);
		return null;
	}
	const actual = net.output.split('\0').filter(Boolean).sort();
	const scopes = paths.map((path) => ({
		path,
		directory: inspectLocalGit(root, ['cat-file', '-t', `${start}:${path}`]).output === 'tree\n'
	}));
	const outside = actual.filter(
		(path) =>
			!scopes.some(
				(scope) => path === scope.path || (scope.directory && path.startsWith(scope.path + '/'))
			)
	);
	add('verified', 'Actual changed files', actual);
	add(
		outside.length ? 'out-of-scope' : 'verified',
		'Declared path scope',
		outside.length ? outside : 'All net changed paths are within declared scope.'
	);
	const reported = reportedPaths(report.outcomes.changedFiles);
	if (!reported) {
		add(
			report.outcomes.changedFiles ? 'unverified' : 'missing',
			'Reported file inventory',
			'Provide an exact, duplicate-free bullet list to compare with the net Git diff.'
		);
	} else if (!isDeepStrictEqual(reported, actual)) {
		add('contradicted', 'Reported file inventory', {
			unreported: actual.filter((path) => !reported.includes(path)),
			absentFromDiff: reported.filter((path) => !actual.includes(path))
		});
	} else {
		add('verified', 'Reported file inventory', 'The inventory matches the net Git diff.');
	}
	return actual;
}

export function assessCompletionEvidence({ repository, id, reportDigest, assignmentDigest }) {
	const { source, ingestion } = bindReport(id, reportDigest, assignmentDigest);
	const local = discoverAssignmentContext(repository);
	const context = {
		repository: local.repository,
		branch: local.branch,
		head: local.commit,
		worktree: local.worktree,
		statusDigest: local.statusDigest,
		trackingCommit: local.trackingCommit,
		tracking: local.tracking,
		liveRemote: 'unverified'
	};
	const scope = assignmentScope(source.assignmentText, context);
	const findings = [];
	const add = (status, subject, detail) => findings.push({ status, subject, detail });
	add(
		'verified',
		'Artifact consistency',
		'The supplied digests, source files and retained import record agree.'
	);
	add('verified', 'Current local Git observation', context);
	assessCheckpoints(local.root, source.report, scope.paths, add);
	for (const [field, value] of Object.entries(source.report.outcomes)) {
		if (field === 'changedFiles') continue;
		const status = !value
			? 'missing'
			: ['blockers', 'incompleteWork', 'remainingWork'].includes(field) && !/^none\b/iu.test(value)
				? 'incomplete'
				: 'unverified';
		add(status, `Worker report — ${field}`, value);
	}
	add(
		'missing',
		'Independent verification results',
		'No trusted execution evidence is admitted by this offline review.'
	);
	add('unverified', 'Acceptance requirements', scope.acceptance);
	add('unverified', 'Required verification', scope.verification);
	return {
		assessmentVersion,
		assignment: source.reference,
		report: {
			path: source.sourcePath,
			sha256: source.sha256,
			startingCheckpoint: source.report.startingCheckpoint,
			endingCheckpoint: source.report.endingCheckpoint,
			sourceFormat: source.report.sourceFormat
		},
		ingestion,
		scope,
		findings,
		completionAcceptance: 'not-determined'
	};
}

function saveAssessment(assessment, review, fingerprint) {
	const record = {
		recordVersion: 1,
		recordedAt: new Date().toISOString(),
		fingerprint,
		review,
		assessment
	};
	const contents = JSON.stringify(record, null, 2) + '\n';
	if (Buffer.byteLength(contents) > assessmentLimit) {
		throw new Error('Assessment exceeds the 512 KiB storage limit.');
	}
	const directory = `/tmp/flihub-evidence-assessments-${process.getuid()}`;
	requirePrivateDirectory(directory, { create: true });
	const path = `${directory}/${assessment.assignment.id}-${fingerprint}.json`;

	try {
		publishPrivateArtifact(path, contents);
	} catch (error) {
		if (error.code === 'EEXIST')
			throw new Error('This assessment review already exists.', { cause: error });
		throw error;
	}
	return path;
}

export async function runEvidenceAssessment({ question, print, repository, signal }) {
	try {
		const id = (await question('Exported assignment ID (Enter cancels): ')).trim();
		if (!id || signal.aborted) return;
		if (!/^[a-f0-9]{20}$/u.test(id))
			throw new Error('Enter a valid assignment ID, without a path.');
		const assignmentDigest = (await question('Approved assignment SHA-256: ')).trim();
		const reportDigest = (await question('Imported report SHA-256: ')).trim();
		if (signal.aborted) return;
		const reference = { repository, id, assignmentDigest, reportDigest };
		const assessment = assessCompletionEvidence(reference);
		print('Independent local observations and separately labeled worker claims');
		print(JSON.stringify(assessment, null, 2));
		const observation = (
			await question('Optional human observation, without private data (Enter omits): ')
		).trim();
		if (signal.aborted) return;
		if (Buffer.byteLength(observation) > 512 || /[\p{C}\p{Zl}\p{Zp}]/u.test(observation)) {
			throw new Error('Human observations require one printable line of at most 512 bytes.');
		}
		rejectSensitiveText(observation);
		const reviewed = { decision: 'accepted-assessment', humanObservation: observation || null };
		const fingerprint = hash(JSON.stringify({ assessment, review: reviewed }));
		const response = (
			await question(
				`Enter accept ${fingerprint} to acknowledge this exact assessment, or Enter to cancel: `
			)
		).trim();
		if (response !== `accept ${fingerprint}` || signal.aborted) return;
		const current = assessCompletionEvidence(reference);
		if (!isDeepStrictEqual(current, assessment))
			throw new Error('Assessment inputs changed. Review again before recording.');
		print(`Saved human review: ${saveAssessment(current, reviewed, fingerprint)}`);
	} catch (error) {
		if (!signal.aborted)
			print(error.code ? 'Could not safely assess or store the evidence.' : error.message);
	}
}
