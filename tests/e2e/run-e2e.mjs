/**
 * Browser E2E orchestrator for Phase 1A.
 *
 * Boots a fully disposable stack — PocketBase (temp data dir, committed
 * migrations + hooks), mailpit, and a production preview of the app pointed
 * at the disposable instance — then runs the Playwright acceptance spec and
 * tears everything down. Development data (pocketbase/pb_data) is never
 * touched.
 *
 * The app is served by `vite build` + `vite preview` (not `vite dev`) to keep
 * the run reliable in memory-constrained containers.
 *
 * Prerequisites: `npx playwright install chromium` (see README.md).
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pbBin = path.join(root, 'pocketbase', 'pocketbase');
const mailpitBin = path.join(root, 'pocketbase', 'mailpit');

const PB_PORT = 8098;
const SMTP_PORT = 1126;
const MAILPIT_API_PORT = 8126;
const APP_PORT = 5174;
const SUPERUSER_EMAIL = 'e2e-admin@flihub.test';
const SUPERUSER_PASSWORD = 'e2e-test-only-not-a-secret';

const tmp = mkdtempSync(path.join(tmpdir(), 'flihub-e2e-'));
const procs = [];

function start(name, cmd, args, env = {}) {
	const proc = spawn(cmd, args, {
		cwd: root,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, ...env }
	});
	proc.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
	procs.push(proc);
	return proc;
}

/** Builds the app and serves it with `vite preview`; resolves once listening. */
async function startPreview(env = {}) {
	const viteBin = path.join(root, 'node_modules', '.bin', 'vite');
	// E2E_SKIP_BUILD=1 reuses an existing, separately verified production build.
	// Escape hatch for memory-constrained environments where spawning a second
	// build inside the runner gets the process killed despite a good build.
	if (process.env.E2E_SKIP_BUILD !== '1') {
		const build = spawnSync(viteBin, ['build'], { cwd: root, stdio: 'inherit' });
		if (build.status !== 0) throw new Error('vite build failed');
	}

	const proc = spawn(
		viteBin,
		['preview', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
		{ cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }
	);
	procs.push(proc);
	proc.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
	proc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
	await waitFor(`http://127.0.0.1:${APP_PORT}/`);
	return proc;
}

async function waitFor(url, attempts = 90) {
	for (let i = 0; i < attempts; i++) {
		try {
			const res = await fetch(url);
			if (res.status < 500) return;
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
	// Disposable mailpit.
	start('mailpit', mailpitBin, [
		'--listen',
		`127.0.0.1:${MAILPIT_API_PORT}`,
		'--smtp',
		`127.0.0.1:${SMTP_PORT}`
	]);
	await waitFor(`http://127.0.0.1:${MAILPIT_API_PORT}/api/v1/messages`);

	// Disposable PocketBase: migrations, plumbing superuser, SMTP → mailpit.
	const pbArgs = [
		`--dir=${tmp}`,
		`--migrationsDir=${path.join(root, 'pocketbase', 'pb_migrations')}`,
		`--hooksDir=${path.join(root, 'pocketbase', 'pb_hooks')}`
	];
	spawnSync(pbBin, [...pbArgs, 'migrate', 'up'], { stdio: 'inherit' });
	spawnSync(pbBin, [...pbArgs, 'superuser', 'upsert', SUPERUSER_EMAIL, SUPERUSER_PASSWORD], {
		stdio: 'inherit'
	});
	start('pocketbase', pbBin, [...pbArgs, 'serve', '--http', `127.0.0.1:${PB_PORT}`], {
		FLIHUB_APP_URL: `http://127.0.0.1:${APP_PORT}`
	});
	await waitFor(`http://127.0.0.1:${PB_PORT}/api/health`);

	const authRes = await fetch(
		`http://127.0.0.1:${PB_PORT}/api/collections/_superusers/auth-with-password`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD })
		}
	);
	if (!authRes.ok) throw new Error('e2e superuser auth failed');
	const { token } = await authRes.json();
	const settingsRes = await fetch(`http://127.0.0.1:${PB_PORT}/api/settings`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body: JSON.stringify({
			smtp: { enabled: true, host: '127.0.0.1', port: SMTP_PORT, tls: false }
		})
	});
	if (!settingsRes.ok) throw new Error('failed to point SMTP at e2e mailpit');

	// Production preview of the app bound to the disposable PocketBase.
	await startPreview({ POCKETBASE_URL: `http://127.0.0.1:${PB_PORT}` });

	mkdirSync(path.join(root, 'tests', 'e2e', 'output'), { recursive: true });
	// Optional positional arg filters to specs whose filename contains it
	// (e.g. `node tests/e2e/run-e2e.mjs 1c` runs only phase1c.spec.mjs).
	const specFilter = process.argv[2] ?? '';
	let specs = readdirSync(path.join(root, 'tests', 'e2e'))
		.filter((f) => f.endsWith('.spec.mjs'))
		.sort();
	if (specFilter) specs = specs.filter((f) => f.includes(specFilter));
	if (specs.length === 0) throw new Error(`no e2e specs matched filter "${specFilter}"`);
	let status = 0;
	for (const spec of specs) {
		console.log(`\n=== ${spec} ===`);
		const result = spawnSync('node', [path.join(root, 'tests', 'e2e', spec)], {
			stdio: 'inherit',
			env: {
				...process.env,
				FLIHUB_E2E_APP_URL: `http://127.0.0.1:${APP_PORT}`,
				FLIHUB_E2E_MAILPIT_URL: `http://127.0.0.1:${MAILPIT_API_PORT}`,
				FLIHUB_E2E_PB_URL: `http://127.0.0.1:${PB_PORT}`
			}
		});
		if (result.status !== 0) {
			status = result.status ?? 1;
			break;
		}
	}

	teardown();
	process.exit(status);
} catch (err) {
	if (String(err).includes('executable') || String(err).includes("doesn't exist")) {
		console.error('Playwright browser missing — run: npx playwright install chromium');
	}
	console.error(err);
	teardown();
	process.exit(1);
}
