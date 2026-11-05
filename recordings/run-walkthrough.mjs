/**
 * Walkthrough recording runner.
 *
 * Boots a fully disposable stack on its own ports — PocketBase (temp data
 * dir, committed migrations + hooks), mailpit, and a production preview of
 * the app — then records a walkthrough script (a single continuous take)
 * and extracts inspection frames with the Playwright-bundled ffmpeg.
 *
 * Usage: `node recordings/run-walkthrough.mjs [1a|1b]` (default 1a), or
 * `npm run record:walkthrough` / `npm run record:walkthrough-1b`.
 *
 * Never touches the development services (5173/8090/8025) or pb_data.
 * Cleanup stops only the processes this runner created.
 *
 * Prerequisites: `npx playwright install chromium` (also provides ffmpeg).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WALKTHROUGHS = {
	'1a': {
		script: 'walkthrough.mjs',
		output: 'phase1a-walkthrough.webm',
		frames: 'frames',
		manifest: 'run-manifest.json'
	},
	'1b': {
		script: 'walkthrough-1b.mjs',
		output: 'phase1b-walkthrough.webm',
		frames: 'frames-1b',
		manifest: 'run-manifest-1b.json'
	}
};
const walkthrough = WALKTHROUGHS[process.argv[2] ?? '1a'];
if (!walkthrough) {
	throw new Error(
		`Unknown walkthrough "${process.argv[2]}" — expected one of: ${Object.keys(WALKTHROUGHS).join(', ')}`
	);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pbBin = path.join(root, 'pocketbase', 'pocketbase');
const mailpitBin = path.join(root, 'pocketbase', 'mailpit');
const outDir = path.join(root, 'recordings', 'output');

// Dedicated recording ports — deliberately distinct from dev (5173/8090/8025)
// and from the test suites (5174/8098/8099/1125/1126/8125/8126).
const PB_PORT = 8097;
const SMTP_PORT = 1127;
const MAILPIT_API_PORT = 8127;
const APP_PORT = 5175;
const SUPERUSER_EMAIL = 'record-admin@flihub.test';
const SUPERUSER_PASSWORD = 'recording-test-only-not-a-secret';

const tmp = mkdtempSync(path.join(tmpdir(), 'flihub-record-'));
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

function findFfmpeg() {
	const cache = path.join(homedir(), '.cache', 'ms-playwright');
	const candidates = readdirSync(cache)
		.filter((d) => d.startsWith('ffmpeg-'))
		.sort()
		.reverse()
		.map((d) => path.join(cache, d, 'ffmpeg-linux'))
		.filter((p) => existsSync(p));
	if (candidates.length === 0) {
		throw new Error('ffmpeg not found — run: npx playwright install chromium');
	}
	return candidates[0];
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

	// Disposable PocketBase.
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
	if (!authRes.ok) throw new Error('recording superuser auth failed');
	const { token } = await authRes.json();
	const settingsRes = await fetch(`http://127.0.0.1:${PB_PORT}/api/settings`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body: JSON.stringify({
			smtp: { enabled: true, host: '127.0.0.1', port: SMTP_PORT, tls: false }
		})
	});
	if (!settingsRes.ok) throw new Error('failed to point SMTP at recording mailpit');

	// Production preview of the app against the disposable instance.
	const viteBin = path.join(root, 'node_modules', '.bin', 'vite');
	const build = spawnSync(viteBin, ['build'], { cwd: root, stdio: 'inherit' });
	if (build.status !== 0) throw new Error('vite build failed');
	const preview = spawn(
		viteBin,
		['preview', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
		{
			cwd: root,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, POCKETBASE_URL: `http://127.0.0.1:${PB_PORT}` }
		}
	);
	procs.push(preview);
	preview.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
	await waitFor(`http://127.0.0.1:${APP_PORT}/`);

	// Record into a clean output directory so stale segments never leak in.
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	const record = spawnSync('node', [path.join(root, 'recordings', walkthrough.script)], {
		stdio: 'inherit',
		env: {
			...process.env,
			FLIHUB_RECORD_APP_URL: `http://127.0.0.1:${APP_PORT}`,
			FLIHUB_RECORD_MAILPIT_URL: `http://127.0.0.1:${MAILPIT_API_PORT}`,
			FLIHUB_RECORD_PB_URL: `http://127.0.0.1:${PB_PORT}`
		}
	});
	if (record.status !== 0) throw new Error('recording script failed');

	// The recording is a single continuous take — no concatenation needed.
	const finalVideo = path.join(outDir, walkthrough.output);
	if (!existsSync(finalVideo)) throw new Error(`recording did not produce ${walkthrough.output}`);

	const ffmpeg = findFfmpeg();
	const sizeMb = (statSync(finalVideo).size / (1024 * 1024)).toFixed(1);
	const probe = spawnSync(ffmpeg, ['-i', finalVideo], { encoding: 'utf8' });
	const duration = /Duration: ([0-9:.]+)/.exec(probe.stderr ?? '')?.[1] ?? 'unknown';
	console.log(`Recorded: ${finalVideo} (${sizeMb} MB, duration ${duration})`);

	// Merge the probed duration into the run manifest so scene tables align.
	const manifestPath = path.join(outDir, walkthrough.manifest);
	if (existsSync(manifestPath) && duration !== 'unknown') {
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.durationSeconds = parseDuration(duration);
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
	}

	// Inspection frames at evenly spaced timestamps for review.
	const frameDir = path.join(outDir, walkthrough.frames);
	mkdirSync(frameDir, { recursive: true });
	const totalSec = parseDuration(duration);
	for (const t of [
		2,
		Math.round(totalSec * 0.2),
		Math.round(totalSec * 0.4),
		Math.round(totalSec * 0.6),
		Math.round(totalSec * 0.8),
		Math.max(3, totalSec - 3)
	]) {
		spawnSync(
			ffmpeg,
			[
				'-y',
				'-ss',
				String(t),
				'-i',
				finalVideo,
				'-frames:v',
				'1',
				path.join(frameDir, `frame-${String(t).padStart(4, '0')}s.png`)
			],
			{
				stdio: 'inherit'
			}
		);
	}
	console.log(`Inspection frames: ${frameDir}`);

	teardown();
	console.log('RECORDING RUN OK');
} catch (err) {
	console.error(err);
	teardown();
	process.exit(1);
}

function parseDuration(value) {
	const [h = '0', m = '0', s = '0'] = String(value).split(':');
	return Number(h) * 3600 + Number(m) * 60 + Math.round(Number(s));
}
