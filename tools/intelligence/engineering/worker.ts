import { spawn } from 'node:child_process';
import {
	accessSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	renameSync,
	writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { engineeringFiles, jobFile, type Job, type Worker } from '../orchestration/contracts.ts';

const harness = fileURLToPath(new URL('./capsule.ts', import.meta.url));
const acceptance = fileURLToPath(new URL('./acceptance.mjs', import.meta.url));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const imports =
	"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { discount } from './discount.mjs';\n";
const nonnegative = "test('nonnegative', () => assert.ok(discount(100) >= 0));\n";
const zero = "test('zero', () => assert.equal(discount(0), 0));\n";
const validSource = (file: string, code: string) =>
	file === engineeringFiles[0]
		? /^(?:\/\/ Synthetic integer-cent discount\n)?export const discount = \(cents\) => Math\.round\(cents \* 0\.[0-9]{2}\);\n$/.test(
				code
			)
		: [imports + nonnegative, imports + nonnegative + zero].includes(code);

export function validateProposal(job: Job, response: unknown, allowed: readonly string[]) {
	const expected = jobFile(job, 'isolated_engineering');
	if (
		!expected ||
		!allowed.includes(expected) ||
		!response ||
		typeof response !== 'object' ||
		Array.isArray(response)
	)
		return;
	const { file, source } = response as Record<string, unknown>;
	if (
		Object.keys(response).length !== 2 ||
		file !== expected ||
		typeof source !== 'string' ||
		source.length > 1024 ||
		!validSource(expected, source)
	)
		return;
	return { file: expected, source };
}

function privateDirectory(path: string) {
	const info = lstatSync(path);
	if (
		!info.isDirectory() ||
		info.uid !== process.getuid?.() ||
		(info.mode & 0o777) !== 0o700 ||
		realpathSync(path) !== path
	) {
		throw new Error('Engineering workspace must be a canonical private directory.');
	}
}

function snapshot(root: string) {
	privateDirectory(root);
	return Object.fromEntries(
		readdirSync(root)
			.sort()
			.map((file) => {
				const path = join(root, file);
				const info = lstatSync(path);
				if (
					!engineeringFiles.some((item) => item === file) ||
					!info.isFile() ||
					info.uid !== process.getuid?.() ||
					info.nlink !== 1 ||
					info.size > 1024
				)
					throw new Error('Unexpected workspace entry.');
				const text = readFileSync(path, 'utf8');
				if (!validSource(file, text)) throw new Error('Unexpected workspace content.');
				return [file, text];
			})
	);
}

function codexPath() {
	for (const directory of (process.env.PATH ?? '').split(':')) {
		if (!directory.startsWith('/')) continue;
		try {
			const path = realpathSync(join(directory, 'codex'));
			if (path.startsWith('/usr/')) {
				accessSync(path, 1);
				return path;
			}
		} catch {
			/* Try the next trusted PATH entry. */
		}
	}
}

async function capsule(
	root: string,
	mode: 'probe' | 'verify' | 'codex',
	signal: AbortSignal,
	job?: Job,
	approach?: string
) {
	const node = realpathSync(process.execPath);
	const codex = mode === 'codex' ? codexPath() : '';
	if (!node.startsWith('/usr/') || (mode === 'codex' && !codex) || signal.aborted) return;
	const cwd = '/work';
	const args = [
		'--unshare-all',
		'--die-with-parent',
		'--new-session',
		'--cap-drop',
		'ALL',
		'--ro-bind',
		'/usr',
		'/usr',
		'--symlink',
		'usr/bin',
		'/bin',
		'--symlink',
		'usr/lib',
		'/lib',
		'--symlink',
		'usr/lib64',
		'/lib64',
		'--proc',
		'/proc',
		'--dev',
		'/dev',
		'--tmpfs',
		'/tmp',
		'--ro-bind',
		root,
		cwd,
		'--ro-bind',
		harness,
		'/harness/capsule.ts',
		'--ro-bind',
		acceptance,
		'/harness/acceptance.mjs',
		'--chdir',
		cwd,
		'--clearenv',
		'--setenv',
		'HOME',
		'/tmp',
		'--setenv',
		'PATH',
		dirname(node) + ':/usr/bin',
		'--setenv',
		'LANG',
		'C.UTF-8',
		'--',
		node,
		'--max-old-space-size=128',
		'/harness/capsule.ts',
		mode,
		node,
		codex ?? '',
		job ?? '',
		approach ?? ''
	];
	return new Promise<unknown>((resolve) => {
		// Serialize worker processes sharing this private operator store.
		const executable = mode === 'probe' ? '/usr/bin/bwrap' : '/usr/bin/flock';
		const parameters =
			mode === 'probe'
				? args
				: [
						'--nonblock',
						'--close',
						join(dirname(root), '.engineering-worker.lock'),
						'/usr/bin/bwrap',
						...args
					];
		const child = spawn(executable, parameters, {
			detached: true,
			env: {},
			stdio: ['ignore', 'pipe', 'ignore']
		});
		let output = '';
		let aborted = false;
		const cancel = () => {
			aborted = true;
			if (child.pid) {
				try {
					process.kill(-child.pid, 'SIGKILL');
				} catch {
					/* Process exited. */
				}
			}
		};
		const deadline = setTimeout(cancel, 12_000);
		signal.addEventListener('abort', cancel, { once: true });
		if (signal.aborted) cancel();
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			if (output.length + chunk.length > 16_384) cancel();
			else output += chunk;
		});
		child.once('error', () => resolve(undefined));
		child.once('close', (code) => {
			clearTimeout(deadline);
			signal.removeEventListener('abort', cancel);
			if (aborted || code !== 0) {
				resolve(undefined);
				return;
			}
			try {
				resolve(JSON.parse(output));
			} catch {
				resolve(undefined);
			}
		});
	});
}

export async function namespaceAvailable(root: string, signal: AbortSignal) {
	const value = await capsule(root, 'probe', signal);
	const result = value as
		| {
				isolated?: boolean;
				pidNamespace?: string;
				netNamespace?: string;
				networkDevices?: string[];
		  }
		| undefined;
	return (
		result?.isolated === true &&
		typeof result.pidNamespace === 'string' &&
		/^pid:\[\d+\]$/.test(result.pidNamespace) &&
		result.pidNamespace !== readlinkSync('/proc/self/ns/pid') &&
		typeof result.netNamespace === 'string' &&
		/^net:\[\d+\]$/.test(result.netNamespace) &&
		result.netNamespace !== readlinkSync('/proc/self/ns/net') &&
		result.networkDevices?.length === 1 &&
		result.networkDevices[0] === 'lo'
	);
}

export function engineeringWorker(
	parent: string,
	workflow: string,
	allowed: readonly string[],
	saved?: string
): Worker {
	if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(workflow))
		throw new Error('Invalid workflow identity.');
	privateDirectory(parent);
	const root = join(parent, 'engineering-' + workflow);
	try {
		mkdirSync(root, { mode: 0o700 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
	}
	let checkpoint = saved ?? hash('{}');
	let isolated = false;
	return {
		source: 'engineering',
		async execute(job, signal, _corrected, approach) {
			if (signal.aborted) return { evidence: 'cancelled', changed: [] };
			const target = jobFile(job, 'isolated_engineering');
			if (target && !allowed.includes(target)) return { evidence: 'unexpected', changed: [] };
			try {
				const before = snapshot(root);
				if (hash(JSON.stringify(before)) !== checkpoint)
					return { evidence: 'unexpected', changed: [] };
				if (!isolated) isolated = await namespaceAvailable(root, signal);
				if (!isolated) return { evidence: 'missing', changed: [] };
				if (job === 'verify_targeted' || job === 'verify_broader') {
					if (!engineeringFiles.every((file) => Object.hasOwn(before, file)))
						return { evidence: 'missing', changed: [] };
					const report = (await capsule(root, 'verify', signal)) as
						{ build?: unknown; test?: unknown; missing?: boolean } | undefined;
					if (signal.aborted) return { evidence: 'cancelled', changed: [] };
					if (hash(JSON.stringify(snapshot(root))) !== checkpoint)
						return { evidence: 'unexpected', changed: [] };
					if (
						!report ||
						report.missing ||
						typeof report.build !== 'boolean' ||
						typeof report.test !== 'boolean'
					) {
						return { evidence: 'missing', changed: [] };
					}
					return {
						evidence: report.build && report.test ? 'pass' : 'fail',
						changed: [],
						checkpoint,
						checks: { build: report.build, test: report.test }
					};
				}
				if (!target) return { evidence: 'unexpected', changed: [] };
				const response = await capsule(root, 'codex', signal, job, approach);
				if (signal.aborted) return { evidence: 'cancelled', changed: [] };
				if (!response) return { evidence: 'missing', changed: [] };
				const proposal = validateProposal(job, response, allowed);
				if (!proposal || hash(JSON.stringify(snapshot(root))) !== checkpoint)
					return { evidence: 'unexpected', changed: [] };
				const stage = join(root, '.stage-' + randomUUID());
				writeFileSync(stage, proposal.source, { flag: 'wx', mode: 0o600 });
				renameSync(stage, join(root, proposal.file));
				const after = snapshot(root);
				if (
					after[proposal.file] !== proposal.source ||
					Object.keys(after).length !==
						Object.keys(before).length + Number(!Object.hasOwn(before, proposal.file)) ||
					Object.entries(before).some(
						([name, value]) => name !== proposal.file && after[name] !== value
					)
				) {
					return { evidence: 'unexpected', changed: [] };
				}
				checkpoint = hash(JSON.stringify(after));
				return { evidence: 'pass', changed: [proposal.file], checkpoint, codexAcknowledged: true };
			} catch {
				return { evidence: 'unexpected', changed: [] };
			}
		}
	};
}

export function verifiedReviewFiles(parent: string, workflow: string, checkpoint: string) {
	if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(workflow))
		throw new Error('Invalid workflow identity.');
	const content = snapshot(join(parent, 'engineering-' + workflow));
	if (
		!engineeringFiles.every((file) => Object.hasOwn(content, file)) ||
		hash(JSON.stringify(content)) !== checkpoint
	)
		throw new Error('Verified snapshot changed.');
	return content;
}
