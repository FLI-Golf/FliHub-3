import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { type Job } from '../orchestration/contracts.ts';

const path = 'src/lib/tee-times.ts';
const maxBytes = 16_384;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

// This catalog entry is for operator review. The workflow store does not admit it.
export const teeTimePilot = Object.freeze({
	repository: 'FLI-Golf/FliHub-3',
	objective: 'tee-time-local-year-padding',
	policy: 'tee-time-local-year-padding-v1',
	path,
	operations: Object.freeze([
		'implementation',
		'correct_defect',
		'verify_targeted',
		'verify_broader'
	] as const satisfies readonly Job[]),
	acceptance: 'teeLocal returns a four-digit year for years 0001 through 0999 in UTC.'
});

function contextDigest(
	commit: string,
	inventory: { path: string; blob: string; bytes: number; sha256: string }
) {
	return digest(
		JSON.stringify([
			teeTimePilot.repository,
			teeTimePilot.objective,
			teeTimePilot.policy,
			commit,
			inventory
		])
	);
}

export function assertPilotContext(context: ReturnType<typeof readPilotContext>) {
	const { commit, inventory, content } = context;
	if (
		inventory.path !== path ||
		inventory.bytes !== Buffer.byteLength(content) ||
		inventory.sha256 !== digest(content) ||
		context.digest !== contextDigest(commit, inventory)
	)
		throw new Error('Pilot context integrity mismatch.');
}

export function readPilotContext(repository: string, commit: string) {
	if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('An exact source commit is required.');
	// Run only against the trusted host checkout. Disable replacement objects and
	// promisor fetches, and ignore inherited Git configuration and credentials.
	const git = (args: string[]) =>
		execFileSync('/usr/bin/git', args, {
			cwd: repository,
			env: {
				GIT_NO_REPLACE_OBJECTS: '1',
				GIT_NO_LAZY_FETCH: '1',
				GIT_CONFIG_NOSYSTEM: '1',
				GIT_CONFIG_GLOBAL: '/dev/null',
				GIT_TERMINAL_PROMPT: '0',
				GIT_OPTIONAL_LOCKS: '0',
				LC_ALL: 'C'
			},
			stdio: ['ignore', 'pipe', 'ignore'],
			maxBuffer: maxBytes,
			timeout: 3000
		});
	if (git(['cat-file', '-t', commit]).toString() !== 'commit\n')
		throw new Error('Expected a commit object.');
	const tree = git(['ls-tree', '-z', commit, '--', path]).toString();
	const entry = /^100644 blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(tree);
	if (!entry || entry[2] !== path) throw new Error('Expected an approved regular source blob.');
	const bytes = git(['cat-file', 'blob', entry[1]]);
	const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	// eslint-disable-next-line no-control-regex
	if (!content || /[\x00-\x08\x0B-\x1F\x7F]/u.test(content) || !Buffer.from(content).equals(bytes))
		throw new Error('Expected canonical UTF-8 source text.');
	const inventory = Object.freeze({
		path,
		blob: entry[1],
		bytes: bytes.length,
		sha256: digest(bytes)
	});
	return Object.freeze({
		commit,
		inventory,
		digest: contextDigest(commit, inventory),
		content
	});
}

if (import.meta.main) {
	if (process.argv.length !== 3) throw new Error('Specify one full source commit.');
	const { commit, inventory, digest } = readPilotContext(process.cwd(), process.argv[2]);
	console.log(JSON.stringify({ pilot: teeTimePilot, commit, inventory, digest }, null, 2));
}
