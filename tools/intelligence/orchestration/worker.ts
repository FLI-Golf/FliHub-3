import { spawn } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tasks, type Worker, type WorkerResult } from './contracts.ts';

export const mockWorker: Worker = {
	source: 'mock',
	async execute(job, signal, corrected) {
		if (signal.aborted) return { evidence: 'cancelled', changed: [] };
		if (job === 'verify_targeted' || job === 'verify_broader') {
			return { evidence: corrected ? 'pass' : 'fail', changed: [] };
		}
		const file =
			job === 'correct_defect' || job === 'reconsider'
				? tasks.implementation.file
				: tasks[job].file;
		return { evidence: 'pass', changed: [file] };
	}
};

const command = 'cat fixture.txt';
const marker = 'FLIHUB_SYNTHETIC_READ';
const empty = (evidence: WorkerResult['evidence']): WorkerResult => ({ evidence, changed: [] });

function snapshot(directory: string) {
	const names = readdirSync(directory);
	if (names.length !== 1 || names[0] !== 'fixture.txt') return;
	const path = join(directory, names[0]);
	const info = lstatSync(path);
	if (!info.isFile() || info.nlink !== 1 || info.size > 1024) return;
	const bytes = readFileSync(path);
	if (bytes.toString() !== marker) return;
	return createHash('sha256').update(bytes).digest('hex');
}

// The real adapter is deliberately restricted to a single read-only fixture.
// Never pass through arbitrary launch arguments, environment values or worker commands.
export function codexFixtureWorker(directory: string, port: number): Worker {
	const root = realpathSync(directory);
	if (!Number.isInteger(port) || port < 1024 || port > 65535)
		throw new Error('Invalid fixture port.');
	return {
		source: 'codex',
		async execute(job, signal) {
			if (job !== 'verify_targeted') return empty('missing');
			if (signal.aborted) return empty('cancelled');
			const before = snapshot(root);
			if (!before) return empty('unexpected');
			const result = await codexFixtureTurn(
				root,
				port,
				signal,
				'Read the fixed synthetic fixture with cat fixture.txt and report its marker.'
			);
			if (snapshot(root) !== before) return empty('unexpected');
			if (!result.output) return empty(result.evidence);
			const output = result.output;
			try {
				const events = output
					.trim()
					.split('\n')
					.map((line) => JSON.parse(line));
				const completed = events.filter(
					(event) => event.type === 'item.completed' && event.item?.type === 'command_execution'
				);
				const item = completed.length === 1 ? completed[0].item : undefined;
				return item?.command === `/bin/bash -lc '${command}'` &&
					item.exit_code === 0 &&
					item.aggregated_output === marker &&
					events.some((event) => event.type === 'turn.completed')
					? empty('pass')
					: empty('missing');
			} catch {
				return empty('missing');
			}
		}
	};
}

// Only fixed synthetic launchers call this helper. No shell argument is interpreted here.
export async function codexFixtureTurn(
	root: string,
	port: number,
	signal: AbortSignal,
	prompt: string
) {
	if (!Number.isInteger(port) || port < 1024 || port > 65535)
		throw new Error('Invalid fixture port.');
	if (signal.aborted) return { evidence: 'cancelled' as const };
	const args = [
		'-a',
		'never',
		'exec',
		'-m',
		'gpt-5.4',
		'--ignore-user-config',
		'--ephemeral',
		'--skip-git-repo-check',
		'--json',
		'--sandbox',
		'read-only',
		'-C',
		root,
		'-c',
		'model_provider="fixture"',
		'-c',
		'web_search="disabled"',
		'-c',
		'model_providers.fixture.name="Local synthetic fixture"',
		'-c',
		`model_providers.fixture.base_url="http://127.0.0.1:${port}/v1"`,
		'-c',
		'model_providers.fixture.wire_api="responses"',
		'-c',
		'model_providers.fixture.request_max_retries=0',
		'-c',
		'model_providers.fixture.stream_max_retries=0',
		prompt
	];
	let deadlineExpired = false;
	let outputExceeded = false;
	const output = await new Promise<string | undefined>((resolve) => {
		const child = spawn('codex', args, {
			cwd: root,
			detached: true,
			stdio: ['ignore', 'pipe', 'ignore'],
			env: { PATH: process.env.PATH, LANG: 'C.UTF-8' }
		});
		let stdout = '';
		const kill = () => {
			if (child.pid) {
				try {
					process.kill(-child.pid, 'SIGKILL');
				} catch {
					/* Child already exited. */
				}
			}
		};
		const timeout = setTimeout(() => {
			deadlineExpired = true;
			kill();
		}, 10_000);
		signal.addEventListener('abort', kill, { once: true });
		if (signal.aborted) kill();
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			if (stdout.length + chunk.length > 131_072) {
				outputExceeded = true;
				kill();
			} else stdout += chunk;
		});
		child.once('error', () => resolve(undefined));
		child.once('close', (code) => {
			clearTimeout(timeout);
			signal.removeEventListener('abort', kill);
			resolve(code === 0 ? stdout : undefined);
		});
	});
	if (signal.aborted) return { evidence: 'cancelled' as const };
	if (deadlineExpired) return { evidence: 'timeout' as const };
	if (!output || outputExceeded) return { evidence: 'missing' as const };
	return { evidence: 'pass' as const, output };
}
