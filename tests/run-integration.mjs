/**
 * Integration test orchestrator for Phase 1A.
 *
 * Boots a disposable PocketBase instance (temp data dir, committed migrations
 * and hooks from pocketbase/) plus a disposable mailpit SMTP capture, wires
 * the instance's SMTP to mailpit, runs `node --test tests/integration/`, and
 * tears everything down. No state escapes the temp directory.
 *
 * The test-instance superuser exists only for infrastructure plumbing
 * (pointing SMTP at the test mailpit); every product behavior is exercised
 * with ordinary user credentials and direct API requests.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pbBin = path.join(root, 'pocketbase', 'pocketbase');
const mailpitBin = path.join(root, 'pocketbase', 'mailpit');

const PB_PORT = 8099;
const SMTP_PORT = 1125;
const MAILPIT_API_PORT = 8125;
const SUPERUSER_EMAIL = 'test-admin@flihub.test';
const SUPERUSER_PASSWORD = 'integration-test-only-not-a-secret';

const tmp = mkdtempSync(path.join(tmpdir(), 'flihub-pbtest-'));
const procs = [];

function start(name, cmd, args, env = {}) {
	const proc = spawn(cmd, args, {
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, ...env }
	});
	proc.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
	procs.push(proc);
	return proc;
}

async function waitFor(url, attempts = 60) {
	for (let i = 0; i < attempts; i++) {
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			// Not up yet — keep polling.
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

function teardown() {
	for (const p of procs) p.kill('SIGTERM');
	rmSync(tmp, { recursive: true, force: true });
}

try {
	// 1. Disposable mailpit (SMTP capture + HTTP API).
	start('mailpit', mailpitBin, [
		'--listen',
		`127.0.0.1:${MAILPIT_API_PORT}`,
		'--smtp',
		`127.0.0.1:${SMTP_PORT}`
	]);
	await waitFor(`http://127.0.0.1:${MAILPIT_API_PORT}/api/v1/messages`);

	// 2. Disposable PocketBase: apply migrations, create the plumbing superuser.
	const pbArgs = [
		`--dir=${tmp}`,
		`--migrationsDir=${path.join(root, 'pocketbase', 'pb_migrations')}`,
		`--hooksDir=${path.join(root, 'pocketbase', 'pb_hooks')}`
	];
	spawnSync(pbBin, [...pbArgs, 'migrate', 'up'], { stdio: 'inherit' });
	spawnSync(pbBin, [...pbArgs, 'superuser', 'upsert', SUPERUSER_EMAIL, SUPERUSER_PASSWORD], {
		stdio: 'inherit'
	});
	start('pocketbase', pbBin, [...pbArgs, 'serve', '--http', `127.0.0.1:${PB_PORT}`]);
	await waitFor(`http://127.0.0.1:${PB_PORT}/api/health`);

	// 3. Point the test instance's SMTP at the test mailpit.
	const authRes = await fetch(
		`http://127.0.0.1:${PB_PORT}/api/collections/_superusers/auth-with-password`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD })
		}
	);
	if (!authRes.ok) throw new Error('test superuser auth failed');
	const { token } = await authRes.json();
	const settingsRes = await fetch(`http://127.0.0.1:${PB_PORT}/api/settings`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body: JSON.stringify({
			smtp: { enabled: true, host: '127.0.0.1', port: SMTP_PORT, tls: false }
		})
	});
	if (!settingsRes.ok) throw new Error('failed to point SMTP at test mailpit');

	// 4. Run the suite.
	const result = spawnSync(
		'node',
		['--test', path.join(root, 'tests', 'integration', '*.test.mjs')],
		{
			stdio: 'inherit',
			env: {
				...process.env,
				FLIHUB_TEST_PB_URL: `http://127.0.0.1:${PB_PORT}`,
				FLIHUB_TEST_MAILPIT_URL: `http://127.0.0.1:${MAILPIT_API_PORT}`,
				FLIHUB_TEST_SUPERUSER_EMAIL: SUPERUSER_EMAIL,
				FLIHUB_TEST_SUPERUSER_PASSWORD: SUPERUSER_PASSWORD
			}
		}
	);

	teardown();
	process.exit(result.status ?? 1);
} catch (err) {
	console.error(err);
	teardown();
	process.exit(1);
}
