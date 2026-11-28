import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { canonicalSha256 } from '../../../src/lib/server/intelligence/application/operations/canonical.ts';
import { createCollector, ownerAccountId, type Read, type ReadCommand } from './collector.ts';
import { requireFact, sha, type Objective } from './contract.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const runFile = promisify(execFile);
const endpoint = 'repos/FLI-Golf/FliHub-3/';

type Metadata = { uid: number; mode: number; isFile(): boolean; isDirectory(): boolean };
export function trustedMetadata(
	metadata: Metadata,
	owners: readonly number[],
	kind: 'file' | 'directory'
) {
	return (
		owners.includes(metadata.uid) &&
		(metadata.mode & 0o022) === 0 &&
		(kind === 'file' ? metadata.isFile() : metadata.isDirectory())
	);
}

async function verifyPath(path: string, owners: readonly number[], kind: 'file' | 'directory') {
	requireFact(trustedMetadata(await lstat(path), owners, kind));
}

function github(endpoint: string, filter: string): ReadCommand {
	return { program: 'gh', args: ['api', endpoint, '--jq', filter] };
}

/** Hosted image paths and operator-owned GitHub configuration are the trust anchors. */
async function withQualifiedRead<T>(action: (read: Read) => Promise<T>): Promise<T> {
	const systemOwners = [0, 65534];
	const { uid, homedir } = userInfo();
	requireFact(!systemOwners.includes(uid));
	for (const dir of ['/', '/usr', '/usr/bin', '/home'])
		await verifyPath(dir, systemOwners, 'directory');
	for (const file of ['/usr/bin/gh', '/usr/bin/git']) {
		const metadata = await lstat(file);
		requireFact(trustedMetadata(metadata, systemOwners, 'file') && (metadata.mode & 0o111) !== 0);
	}
	requireFact(/^\/home\/[a-z][a-z0-9_-]*$/.test(homedir));
	const configuration = join(homedir, '.config', 'gh');
	for (const dir of [homedir, join(homedir, '.config'), configuration])
		await verifyPath(dir, [uid], 'directory');
	for (const file of ['hosts.yml', 'config.yml'])
		await verifyPath(join(configuration, file), [uid], 'file');

	const gitObjects = join(root, '.git', 'objects');
	for (const dir of [
		join(root, '.git'),
		gitObjects,
		join(gitObjects, 'info'),
		join(gitObjects, 'pack')
	])
		requireFact((await lstat(dir)).isDirectory());
	for (const marker of ['alternates', 'http-alternates']) {
		const path = join(gitObjects, 'info', marker);
		const exists = await lstat(path).then(
			() => true,
			(error: NodeJS.ErrnoException) => {
				if (error.code !== 'ENOENT') throw error;
				return false;
			}
		);
		requireFact(!exists);
	}
	const temporary = await mkdtemp('/tmp/flihub-advisory-read-');
	try {
		const gitDir = join(temporary, 'git');
		await mkdir(join(gitDir, 'refs'), { recursive: true });
		await mkdir(join(gitDir, 'objects'));
		await writeFile(join(gitDir, 'HEAD'), 'ref: refs/heads/unused\n', { mode: 0o600 });
		const env = {
			PATH: '/usr/bin:/bin',
			HOME: homedir,
			LANG: 'C.UTF-8',
			GH_CONFIG_DIR: configuration,
			GH_PROMPT_DISABLED: '1',
			GIT_TERMINAL_PROMPT: '0',
			GIT_CONFIG_NOSYSTEM: '1',
			GIT_CONFIG_GLOBAL: '/dev/null',
			GIT_OBJECT_DIRECTORY: gitObjects
		};
		return await action(async ({ program, args }) => {
			const fixedArgs =
				program === 'git'
					? ['--git-dir=' + gitDir, '-c', 'core.commitGraph=false', ...args]
					: [...args, '--hostname', 'github.com'];
			const { stdout } = await runFile(
				program === 'git' ? '/usr/bin/git' : '/usr/bin/gh',
				fixedArgs,
				{
					cwd: temporary,
					env,
					timeout: 5000,
					maxBuffer: 192 * 1024,
					encoding: 'utf8'
				}
			);
			return stdout;
		});
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

function json(text: string): unknown {
	return JSON.parse(text);
}

function view(value: unknown): Record<string, unknown> {
	requireFact(typeof value === 'object' && value !== null && !Array.isArray(value));
	return value as Record<string, unknown>;
}

export async function verifyGitHubOperator(read: Read) {
	const identity = view(json(await read(github('user', '{id,type}'))));
	requireFact(identity.id === ownerAccountId && identity.type === 'User');
	return ownerAccountId;
}

/**
 * Corroborate Git decisions against pinned GitHub observations, without trusting
 * local Git configuration or any unverified roadmap bytes as authority.
 */
export function qualifyCollection(read: Read, now: () => number = Date.now) {
	return async (objective: Objective, includeQualification: boolean) => {
		const compare = new Map<string, Record<string, unknown>>();
		async function relation(left: string, right: string) {
			sha(left);
			sha(right);
			const key = `${left}...${right}`;
			if (!compare.has(key)) {
				compare.set(
					key,
					view(
						json(
							await read(
								github(
									`${endpoint}compare/${key}?per_page=1`,
									'{mergeBase:.merge_base_commit.sha,ahead:.ahead_by,behind:.behind_by}'
								)
							)
						)
					)
				);
			}
			return compare.get(key)!;
		}
		let query: { command: ReadCommand; fingerprint: string } | undefined;
		const operator = await verifyGitHubOperator(read);
		const collect = createCollector(async (command) => {
			const result = await read(command);
			const args = command.args;
			if (command.program === 'gh' && args[1] === 'graphql') {
				requireFact(!query);
				query = { command, fingerprint: canonicalSha256(json(result)) };
			}
			if (command.program === 'git' && args[2] === 'merge-base') {
				requireFact(result.trim() === (await relation(args[4], args[5])).mergeBase);
			}
			if (command.program === 'git' && args[2] === 'rev-list') {
				const [left, right] = args[5].split('...');
				const verified = await relation(left, right);
				const [behind, ahead] = result.trim().split(/\s+/).map(Number);
				requireFact(verified.behind === behind && verified.ahead === ahead);
			}
			if (command.program === 'git' && args[2] === 'show') {
				const [revision, path] = args[3].split(':');
				sha(revision);
				requireFact(
					path === 'docs/INTELLIGENCE-ROADMAP.md' || path === 'docs/CHARITY-EVENT-ROADMAP.md'
				);
				const blob = view(
					json(await read(github(`${endpoint}contents/${path}?ref=${revision}`, '{sha,type}')))
				);
				const data = Buffer.from(result, 'utf8');
				const digest = createHash('sha1')
					.update(`blob ${data.length}\0`)
					.update(data)
					.digest('hex');
				requireFact(blob.type === 'file' && blob.sha === digest);
			}
			return result;
		}, now);
		const context = await collect(objective, includeQualification);
		requireFact(query && canonicalSha256(json(await read(query.command))) === query.fingerprint);
		requireFact((await verifyGitHubOperator(read)) === operator);
		return { context, operator };
	};
}

export async function collectQualified(objective: Objective, includeQualification: boolean) {
	try {
		return await withQualifiedRead((read) =>
			qualifyCollection(read)(objective, includeQualification)
		);
	} catch {
		throw new Error('Trusted development evidence unavailable; use manual review');
	}
}
