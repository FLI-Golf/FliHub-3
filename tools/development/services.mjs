import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import {
	closeSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
	renameSync,
	writeFileSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { workflowSummary } from '../intelligence/orchestration/store.ts';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const home = join(homedir(), '.flihub-dev-guardrail');
const serviceState = process.env.FLIHUB_DEV_STATE_DIR ?? home;
const uid = process.getuid?.();
const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
export const runtime = join(serviceState, 'services-' + key);
const loopback = 'http://127.0.0.1:';
const services = [
	{
		name: 'mailpit',
		ports: [8025, 1025],
		url: loopback + '8025',
		path: '/api/v1/messages',
		valid: (body) => Array.isArray(JSON.parse(body).messages),
		command: join(root, 'pocketbase/mailpit'),
		args: ['--listen', '127.0.0.1:8025', '--smtp', '127.0.0.1:1025']
	},
	{
		name: 'pocketbase',
		ports: [8090],
		url: loopback + '8090',
		path: '/api/health',
		valid: (body) => JSON.parse(body).code === 200,
		command: '/bin/sh',
		args: [join(root, 'pocketbase/serve-dev.sh')]
	},
	{
		name: 'vite',
		ports: [5173],
		url: loopback + '5173',
		path: '/@vite/client',
		valid: (body) => body.includes('createHotContext'),
		page: '/',
		command: process.execPath,
		args: [
			join(root, 'node_modules/vite/bin/vite.js'),
			'dev',
			'--host',
			'127.0.0.1',
			'--port',
			'5173',
			'--strictPort'
		]
	}
];

function privateDirectory(path, create) {
	if (create)
		try {
			mkdirSync(path, { mode: 0o700 });
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;
		}
	const info = lstatSync(path, { throwIfNoEntry: false });
	if (!info) return false;
	if (
		uid === undefined ||
		!info.isDirectory() ||
		info.uid !== uid ||
		(info.mode & 0o777) !== 0o700
	) {
		throw new Error('Development state directory must be operator-owned with mode 0700.');
	}
	return true;
}

const boot = () => readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
function identify(pid) {
	if (!Number.isSafeInteger(pid) || pid < 2) return;
	try {
		const stat = readFileSync('/proc/' + pid + '/stat', 'utf8');
		const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
		if (fields[0] !== 'Z') return { pid, start: fields[19], boot: boot() };
	} catch {
		/* It exited. */
	}
}

function owned(record) {
	const current = identify(record?.pid);
	return current && current.start === record.start && current.boot === record.boot;
}

function records(directory) {
	if (!privateDirectory(directory, false)) return {};
	try {
		const record = JSON.parse(readFileSync(join(directory, 'services.json'), 'utf8'));
		if (!record || Array.isArray(record) || typeof record !== 'object')
			throw new Error('Invalid service records.');
		return record;
	} catch (error) {
		if (error.code === 'ENOENT') return {};
		throw error;
	}
}

function persist(directory, record) {
	const temporary = join(directory, 'services.new');
	writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
	renameSync(temporary, join(directory, 'services.json'));
}

function connected(port) {
	return new Promise((resolve) => {
		const socket = createConnection({ host: '127.0.0.1', port });
		const finish = (result) => {
			socket.destroy();
			resolve(result);
		};
		socket.once('connect', () => finish(true));
		socket.once('error', () => finish(false));
		socket.setTimeout(500, () => finish(false));
	});
}

async function health(service) {
	try {
		const response = await fetch(service.url + service.path, {
			signal: AbortSignal.timeout(1000),
			redirect: 'error'
		});
		if (!response.ok || !service.valid(await response.text())) return false;
		if (service.page) {
			const app = await fetch(service.url + service.page, {
				signal: AbortSignal.timeout(15000),
				redirect: 'error'
			});
			if (!app.ok || !/<title[^>]*>FliHub/.test(await app.text())) return false;
		}
		return service.ports.length === 1 || (await connected(service.ports[1]));
	} catch {
		return false;
	}
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (...args) =>
	spawnSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8' });

export async function status(directory = runtime, definitions = services) {
	const metadata = records(directory);
	const local = await Promise.all(
		definitions.map(async (service) => ({
			service: service.name,
			url: service.url,
			ready: await health(service),
			owned: Boolean(owned(metadata[service.name])),
			pid: owned(metadata[service.name]) ? metadata[service.name].pid : undefined
		}))
	);
	const codex = (process.env.PATH ?? '').split(':').some((path) => {
		try {
			accessSync(join(path, 'codex'), constants.X_OK);
			return true;
		} catch {
			return false;
		}
	});
	const tree = git('status', '--porcelain');
	const storage = workflowSummary(process.env.FLIHUB_GUARDRAIL_AUDIT_DIR ?? home);
	const { CODESPACE_NAME: name, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: domain } = process.env;
	return {
		services: local,
		codespacesApp: name && domain ? `https://${name}-5173.${domain}` : undefined,
		branch: git('branch', '--show-current').stdout?.trim(),
		workingTree:
			tree.status !== 0 ? 'unavailable' : tree.stdout?.trim() ? 'changes present' : 'clean',
		codex: codex ? 'available on PATH' : 'unavailable',
		jevKeyPresent: Boolean(process.env.TYPESAFE_API_KEY),
		intelligencePolicy:
			'Explicit objective and authorization required. Service commands never run workflows.',
		workflowStorage: storage
	};
}

export async function start(directory = runtime, definitions = services, readinessMs = 45_000) {
	const metadata = records(directory);
	for (const service of definitions) {
		if (await health(service)) continue;
		if (owned(metadata[service.name]))
			throw new Error(service.name + ' is owned but unhealthy. Inspect its log or stop it.');
		if ((await Promise.all(service.ports.map(connected))).some(Boolean)) {
			throw new Error(service.name + ' port is occupied by an unrecognized or unhealthy listener.');
		}
		const logPath = join(directory, service.name + '.log');
		const log = openSync(logPath, 'a', 0o600);
		const env = { ...process.env };
		delete env.TYPESAFE_API_KEY;

		// Connect the managed development client to local PocketBase.
		if (service.name === 'vite') {
			env.POCKETBASE_URL = loopback + '8090';
		}
		let spawnFailed = false;
		let child;
		try {
			child = spawn(service.command, service.args, {
				cwd: root,
				env,
				detached: true,
				stdio: ['ignore', log, log]
			});
			child.on('error', () => {
				spawnFailed = true;
			});
		} finally {
			closeSync(log);
		}
		const identity = identify(child.pid);
		if (identity) {
			metadata[service.name] = identity;
			persist(directory, metadata);
		}
		child.unref();
		const deadline = Date.now() + readinessMs;
		let ready = false;
		while (!spawnFailed && owned(identity) && Date.now() < deadline) {
			if (await health(service)) {
				ready = true;
				break;
			}
			await delay(150);
		}
		if (!ready) throw new Error(service.name + ' failed readiness. See ' + logPath);
	}
}

// Verify the actual running development environment.
// Never print process environment contents or authentication credentials.
export async function verify(directory = runtime) {
	const metadata = records(directory);
	const failures = [];

	const report = (name, passed) => {
		console.log(`${passed ? 'PASS' : 'FAIL'} | ${name}`);
		if (!passed) failures.push(name);
	};

	console.log('\nFLIHUB DEVELOPMENT ENVIRONMENT');
	console.log('────────────────────────────────────────');

	for (const service of services) {
		report(service.name + ' process ownership', Boolean(owned(metadata[service.name])));
		report(service.name + ' health', await health(service));
	}

	const database = join(root, 'pocketbase/pb_data/data.db');
	let databaseVerified = false;

	try {
		const expected = realpathSync(database);
		const expectedStat = statSync(expected);
		const record = metadata.pocketbase;

		if (owned(record)) {
			// PocketBase may close idle SQLite connections.
			// Issue a bounded read-only request before inspecting
			// descriptors. A successful request alone is not proof
			// of database identity.
			const response = await fetch(loopback + '8090/api/collections/users/records?perPage=1', {
				signal: AbortSignal.timeout(5000),
				redirect: 'error'
			});

			await response.body?.cancel();

			if (!owned(record)) {
				throw new Error('PocketBase process identity changed.');
			}

			const descriptors = '/proc/' + record.pid + '/fd';

			for (const fd of readdirSync(descriptors)) {
				try {
					const actual = realpathSync(join(descriptors, fd));
					const actualStat = statSync(join(descriptors, fd));

					if (
						actual === expected &&
						actualStat.dev === expectedStat.dev &&
						actualStat.ino === expectedStat.ino &&
						owned(record)
					) {
						databaseVerified = true;
						break;
					}
				} catch {
					// A descriptor may close during inspection.
				}
			}
		}
	} catch {
		// Missing or inaccessible database identity fails verification.
	}

	report('Persistent PocketBase database identity', databaseVerified);

	let frontendVerified = false;

	try {
		const record = metadata.vite;

		if (owned(record)) {
			const environment = readFileSync('/proc/' + record.pid + '/environ', 'utf8').split('\0');

			const values = environment.filter((entry) => entry.startsWith('POCKETBASE_URL='));

			frontendVerified =
				values.length === 1 && values[0] === 'POCKETBASE_URL=http://127.0.0.1:8090';
		}
	} catch {
		// Missing or inaccessible configuration fails verification.
	}

	report('Vite PocketBase configuration', frontendVerified);

	for (const port of [8098, 8099, 8198, 5174, 5274, 5275, 8125, 8126]) {
		report('Temporary test port ' + port + ' clear', !(await connected(port)));
	}

	report(
		'Managed process identities unchanged',
		services.every((service) => Boolean(owned(metadata[service.name])))
	);

	if (failures.length) {
		throw new Error('Development verification failed: ' + failures.length + ' check(s).');
	}

	console.log('\nDEVELOPMENT ENVIRONMENT VERIFIED');
}

const terminate = `
import os, signal, sys
pid, start, boot = sys.argv[1:]
try:
    fd = os.pidfd_open(int(pid))
    with open('/proc/'+pid+'/stat') as f:
        fields = f.read().rsplit(')',1)[1].split()
    with open('/proc/sys/kernel/random/boot_id') as f:
        matches = f.read().strip() == boot
    if matches and fields[19] == start:
        signal.pidfd_send_signal(fd, signal.SIGTERM)
except (ProcessLookupError, FileNotFoundError):
    pass
`;

export async function stop(directory = runtime, definitions = services) {
	const metadata = records(directory);
	for (const service of [...definitions].reverse()) {
		const record = metadata[service.name];
		if (owned(record)) {
			const result = spawnSync('python3', [
				'-c',
				terminate,
				String(record.pid),
				record.start,
				record.boot
			]);
			if (result.status !== 0) throw new Error(service.name + ' could not be signalled safely.');
			const end = Date.now() + 8000;
			while (owned(record) && Date.now() < end) await delay(100);
			if (owned(record)) throw new Error(service.name + ' did not stop after SIGTERM.');
		}
		delete metadata[service.name];
		persist(directory, metadata);
	}
}

if (import.meta.main) {
	try {
		const action = process.argv[2];
		if (action === 'status') console.log(JSON.stringify(await status(), null, 2));
		else if (action === 'verify') await verify();
		else if (['start', 'stop', 'restart'].includes(action) && process.argv[3] !== '--locked') {
			if (
				action === 'stop' &&
				(!privateDirectory(serviceState, false) || !privateDirectory(runtime, false))
			) {
				console.log('No managed services are recorded.');
			} else {
				privateDirectory(serviceState, true);
				privateDirectory(runtime, true);
				const result = spawnSync(
					'flock',
					[
						'-n',
						'-E',
						'75',
						join(runtime, 'lock'),
						process.execPath,
						fileURLToPath(import.meta.url),
						action,
						'--locked'
					],
					{ stdio: 'inherit' }
				);
				if (result.status === 75)
					throw new Error('A managed service operation is already in progress.');
				if (result.status !== 0)
					throw new Error(
						'Managed service operation failed. Check the startup or shutdown message.'
					);
			}
		} else if (['start', 'stop', 'restart'].includes(action)) {
			if (action === 'restart') {
				await stop();

				for (const service of services) {
					if ((await Promise.all(service.ports.map(connected))).some(Boolean)) {
						throw new Error(
							service.name + ' still has an active listener. Restart stopped safely.'
						);
					}
				}

				await start();
				await verify();
			} else if (action === 'start') {
				await start();
			} else {
				await stop();
			}

			console.log(JSON.stringify(await status(), null, 2));
		} else throw new Error('Expected start, status, stop, restart or verify.');
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
