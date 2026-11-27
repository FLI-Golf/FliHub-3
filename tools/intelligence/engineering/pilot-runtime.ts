import { pilotToolchainDigest, stagePilotToolchain } from './pilot-toolchain.ts';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = fileURLToPath(new URL('./pilot-capsule.mjs', import.meta.url));
const dependency = fileURLToPath(
	new URL('../../../node_modules/@internationalized/date/dist/', import.meta.url)
);
const dependencyDigest = '19bc68640b27670d764f4fa2d6623ff008dcd37f7aabaafade7ae130b87c99c0';
const libraries = [
	'ld-linux-x86-64.so.2',
	'libdl.so.2',
	'libstdc++.so.6',
	'libm.so.6',
	'libgcc_s.so.1',
	'libpthread.so.0',
	'libc.so.6'
];
export const pilotRuntimePolicy = Object.freeze({
	capsule: 'tee-time-pilot-capsule-v2',
	toolchain: pilotToolchainDigest,
	dependencyDigest,
	timeoutMs: 5000,
	outputBytes: 8192
});

function dependencyFiles(root: string, prefix = ''): string[] {
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const relative = prefix + entry.name;
		if (entry.isDirectory() && (prefix || entry.name === 'private'))
			return dependencyFiles(join(root, entry.name), relative + '/');
		return entry.isFile() && entry.name.endsWith('.mjs') ? [relative] : [];
	});
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export function pilotHarnessDigest() {
	return sha256(readFileSync(harness));
}

function stage(working: string, source: string, acceptance: Buffer) {
	const target = join(working, 'node_modules/@internationalized/date');
	mkdirSync(target, { recursive: true });
	const hash = createHash('sha256');
	for (const file of dependencyFiles(dependency).sort()) {
		const path = join(dependency, file);
		const info = lstatSync(path);
		if (!info.isFile() || info.nlink !== 1 || info.size > 128 * 1024)
			throw new Error('Unexpected date dependency file.');
		const bytes = readFileSync(path);
		hash.update(JSON.stringify([file, sha256(bytes)]));
		const destination = join(target, file);
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, bytes, { flag: 'wx' });
	}
	if (hash.digest('hex') !== dependencyDigest) throw new Error('Date dependency pin mismatch.');
	stagePilotToolchain(working);
	writeFileSync(
		join(target, 'package.json'),
		'{"exports":{"types":"./types/src/index.d.ts","default":"./index.mjs"}}',
		{ flag: 'wx' }
	);
	writeFileSync(join(working, 'tee-times.ts'), source, { flag: 'wx' });
	writeFileSync(join(working, 'pilot-capsule.mjs'), acceptance, { flag: 'wx' });
}

function runCapsule(
	working: string,
	mode: 'probe' | 'verify',
	signal: AbortSignal,
	canaries: readonly string[]
) {
	const node = realpathSync(process.execPath);
	const libDir = '/lib/x86_64-linux-gnu';
	const args = [
		'--cpu=3',
		'--as=12884901888',
		'--nofile=64',
		'--core=0',
		'--fsize=1048576',
		'--',
		'/usr/bin/bwrap',
		'--unshare-all',
		'--unshare-user',
		'--disable-userns',
		'--die-with-parent',
		'--new-session',
		'--cap-drop',
		'ALL',
		'--clearenv',
		'--proc',
		'/proc',
		'--dev',
		'/dev',
		'--ro-bind',
		node,
		'/node',
		...libraries.flatMap((name) => [
			'--ro-bind',
			realpathSync(join(libDir, name)),
			join(libDir, name)
		]),
		'--symlink',
		join(libDir, libraries[0]),
		'/lib64/ld-linux-x86-64.so.2',
		'--ro-bind',
		working,
		'/work',
		'--chdir',
		'/work',
		'--remount-ro',
		'/',
		'--',
		'/node',
		'--permission',
		'--allow-fs-read=*',
		'--max-old-space-size=160',
		'/work/pilot-capsule.mjs',
		mode,
		readlinkSync('/proc/self/ns/pid'),
		readlinkSync('/proc/self/ns/net'),
		...canaries
	];
	return new Promise<{ code: number | null; output: string; failure?: string }>((resolve) => {
		if (signal.aborted) return resolve({ code: null, output: '', failure: 'cancelled' });
		const child = spawn('/usr/bin/prlimit', args, {
			detached: true,
			env: {},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let size = 0;
		let output = '';
		let failure: string | undefined;
		const stop = (reason: string) => {
			failure ??= reason;
			if (child.pid) {
				try {
					process.kill(-child.pid, 'SIGKILL');
				} catch {
					// The group can exit before the timer or abort callback runs.
				}
			}
		};
		const abort = () => stop('cancelled');
		const timer = setTimeout(() => stop('timeout'), pilotRuntimePolicy.timeoutMs);
		const collect = (chunk: Buffer) => {
			size += chunk.length;
			if (size > pilotRuntimePolicy.outputBytes) stop('output_limit');
			return !failure;
		};
		child.stdout.on('data', (chunk: Buffer) => {
			if (collect(chunk)) output += chunk.toString('utf8');
		});
		child.stderr.on('data', collect);
		child.once('error', () => stop('spawn'));
		signal.addEventListener('abort', abort, { once: true });
		if (signal.aborted) abort();
		child.once('close', (code) => {
			clearTimeout(timer);
			signal.removeEventListener('abort', abort);
			resolve({ code, output, failure });
		});
	});
}

export async function verifyPilotSource(
	source: string,
	signal: AbortSignal,
	canaries: readonly string[] = [],
	expectedAcceptance = pilotHarnessDigest()
) {
	if (signal.aborted) return 'cancelled';
	if (process.platform !== 'linux' || process.arch !== 'x64') return 'unsupported_runtime';
	const root = mkdtempSync(join(tmpdir(), 'flihub-pilot-runtime-'));
	try {
		const acceptance = readFileSync(harness);
		if (sha256(acceptance) !== expectedAcceptance) return 'verification_policy_changed';
		stage(root, source, acceptance);
		const probe = await runCapsule(root, 'probe', signal, canaries);
		if (probe.failure) return probe.failure;
		if (probe.code !== 0 || probe.output !== 'pilot-isolated-v1\n') return 'isolation_preflight';
		const result = await runCapsule(root, 'verify', signal, []);
		if (result.failure) return result.failure;
		if (result.code === 0 && result.output === 'pilot-pass-v1\n') return 'pass';
		if (result.code === 3 && result.output === 'pilot-year-padding-failed-v1\n')
			return 'year_padding';
		if (result.code === 4 && result.output === 'pilot-types-failed-v1\n') return 'type_check';
		return 'missing_evidence';
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}
