import { codexFixtureTurn } from './worker.ts';
import { spawnSync } from 'node:child_process';
import {
	constants,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	renameSync,
	writeFileSync,
	closeSync
} from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { tasks, type Job, type Worker } from './contracts.ts';

const files = ['implementation.txt', 'checks.txt'];
const implementation = [
	'export const answer = 41;\n',
	'// Fixture behavior\nexport const answer = 41;\n',
	'export const answer = 42;\n',
	'// Revised fixture behavior\nexport const answer = 42;\n'
];
const checks = ['expected=42\n', 'expected=42\nintegrated=yes\n'];
const allowed = new Map([
	[files[0], implementation],
	[files[1], checks]
]);

function scan(directory: string) {
	const info = lstatSync(directory);
	if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700)
		throw new Error('Unsafe fixture directory.');
	const content = new Map<string, string>();
	for (const name of readdirSync(directory)) {
		const path = join(directory, name);
		const stat = lstatSync(path);
		if (
			!allowed.has(name) ||
			!stat.isFile() ||
			stat.uid !== info.uid ||
			stat.nlink !== 1 ||
			stat.size > 256
		) {
			throw new Error('Unexpected fixture entry.');
		}
		const fd = openSync(path, constants.O_NOFOLLOW | constants.O_RDONLY);
		try {
			const text = readFileSync(fd, 'utf8');
			if (!allowed.get(name)?.includes(text)) throw new Error('Unexpected fixture content.');
			content.set(name, text);
		} finally {
			closeSync(fd);
		}
	}
	return content;
}

const digest = (content: Map<string, string>) =>
	createHash('sha256')
		.update(JSON.stringify([...content].sort()))
		.digest('hex');

export function fixtureWorker(
	parent: string,
	id: string,
	permitted: readonly string[],
	expected?: string,
	localPort?: number
): Worker {
	if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))
		throw new Error('Invalid fixture identity.');
	const directory = join(parent, 'fixture-' + id);
	try {
		mkdirSync(directory, { mode: 0o700 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
	}
	let checkpoint = expected ?? digest(new Map());
	return {
		source: 'fixture',
		async execute(job: Job, signal, _corrected, approach) {
			if (signal.aborted) return { evidence: 'cancelled', changed: [] };
			try {
				const before = scan(directory);
				if (digest(before) !== checkpoint) return { evidence: 'unexpected', changed: [] };
				if (job === 'verify_targeted' || job === 'verify_broader') {
					const code = before.get(files[0]);
					const contract = before.get(files[1]);
					if (!code || !contract) return { evidence: 'missing', changed: [] };
					// The host independently checks only exact, trusted templates.
					const build = spawnSync(process.execPath, ['--input-type=module', '--check'], {
						input: code,
						timeout: 2000,
						env: { PATH: process.env.PATH }
					});
					const compiled = build.status === 0;
					const passed = compiled && /answer = 42;/.test(code) && contract === checks[1];
					const broader = job !== 'verify_broader' || before.size === 2;
					return {
						evidence: passed && broader ? 'pass' : 'fail',
						changed: [],
						checkpoint,
						checks: { build: compiled, test: passed && broader }
					};
				}
				const correction = job === 'correct_defect' || job === 'reconsider';
				const file = correction ? files[0] : tasks[job].file;
				if (!permitted.includes(file)) return { evidence: 'unexpected', changed: [] };
				const text = correction
					? implementation[job === 'reconsider' ? 3 : 2]
					: job === 'implementation'
						? implementation[approach === 'add_fixture' ? 1 : 0]
						: checks[job === 'integration' ? 1 : 0];
				if (localPort !== undefined) {
					const result = await codexFixtureTurn(
						directory,
						localPort,
						signal,
						'Read-only synthetic fixture. Return exactly this JSON acknowledgement as the final message: ' +
							JSON.stringify({ operation: 'apply_fixture', job, ...(approach ? { approach } : {}) })
					);
					if (!result.output) return { evidence: result.evidence, changed: [] };
					const messages = result.output
						.trim()
						.split('\n')
						.map((line) => JSON.parse(line));
					if (
						messages.some(
							(event) =>
								event.item?.type === 'command_execution' || event.item?.type === 'file_change'
						) ||
						!messages.some((event) => event.type === 'turn.completed')
					)
						return { evidence: 'unexpected', changed: [] };
					const final = messages.filter(
						(event) => event.type === 'item.completed' && event.item?.type === 'agent_message'
					);
					const expectedReply = JSON.stringify({
						operation: 'apply_fixture',
						job,
						...(approach ? { approach } : {})
					});
					if (final.length !== 1 || final[0].item.text.trim() !== expectedReply)
						return { evidence: 'missing', changed: [] };
					if (digest(scan(directory)) !== checkpoint)
						return { evidence: 'unexpected', changed: [] };
				}
				if (signal.aborted) return { evidence: 'cancelled', changed: [] };
				const pending = join(directory, '.stage-' + randomUUID());
				writeFileSync(pending, text, { flag: 'wx', mode: 0o600 });
				renameSync(pending, join(directory, file));
				const after = scan(directory);
				before.set(file, text);
				if (digest(before) !== digest(after)) return { evidence: 'unexpected', changed: [] };
				checkpoint = digest(after);
				return {
					evidence: 'pass',
					changed: [file],
					checkpoint,
					codexAcknowledged: localPort !== undefined
				};
			} catch {
				return { evidence: 'unexpected', changed: [] };
			}
		}
	};
}
