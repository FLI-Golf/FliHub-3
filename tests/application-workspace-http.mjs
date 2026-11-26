import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import PocketBase from 'pocketbase';
import { request as httpRequest } from 'node:http';

const root = process.cwd();
const pbUrl = 'http://127.0.0.1:8198';
const devUrl = 'http://127.0.0.1:5274';
const previewUrl = 'http://127.0.0.1:5275';

const workspacePath = '/development/intelligence/operations';
const workspaceCookie = 'flihub_application_workspace';

const temp = mkdtempSync(resolve(tmpdir(), 'flihub-workspace-http-'));
const children = new Set();

const adminEmail = 'workspace-admin@flihub.test';
const password = 'workspace-test-only-password-2026';

let passed = 0;

const safeEnv = {
	PATH: process.env.PATH,
	HOME: process.env.HOME,
	USER: process.env.USER,
	TMPDIR: temp,
	POCKETBASE_URL: pbUrl,
	FLIHUB_INTELLIGENCE_ENABLED: 'false',
	FLIHUB_APPLICATION_WORKSPACE_ENABLED: 'false',
	FLIHUB_APPLICATION_WORKSPACE_ALLOWED_USER_IDS: '',
	TYPESAFE_API_KEY: '',
	JEV_API_KEY: '',
	OPENAI_API_KEY: '',
	ANTHROPIC_API_KEY: ''
};

function pass(label) {
	passed++;
	console.log(`PASS ${label}`);
}

async function checkPort(port) {
	const server = createServer();
	try {
		server.listen(port, '127.0.0.1');
		await once(server, 'listening');
	} finally {
		if (server.listening) {
			await new Promise((done) => server.close(done));
		}
	}
}

function run(command, args) {
	const result = spawnSync(command, args, {
		cwd: root,
		env: safeEnv,
		stdio: 'inherit'
	});

	assert.equal(result.status, 0, 'Disposable setup command failed');
}

function start(command, args, env = {}) {
	const child = spawn(command, args, {
		cwd: root,
		env: { ...safeEnv, ...env },
		stdio: ['ignore', 'ignore', 'inherit']
	});

	children.add(child);
	child.on('error', () => {});
	return child;
}

async function stop(child) {
	if (child.exitCode === null && child.signalCode === null) {
		const exited = once(child, 'exit');
		child.kill('SIGTERM');

		const timer = setTimeout(() => child.kill('SIGKILL'), 3000);

		try {
			await exited;
		} finally {
			clearTimeout(timer);
		}
	}

	children.delete(child);
}

async function waitFor(url, child) {
	for (let attempt = 0; attempt < 120; attempt++) {
		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error('Disposable service exited before readiness');
		}

		try {
			const response = await requestHttp(url, {
				redirect: 'manual',
				signal: AbortSignal.timeout(2000)
			});

			if (response.status < 500) return;
		} catch {
			// Service is still starting.
		}

		await new Promise((done) => setTimeout(done, 500));
	}

	throw new Error('Disposable service readiness timeout');
}

async function requestHttp(url, options = {}) {
	return new Promise((resolve, reject) => {
		const request = httpRequest(
			url,
			{
				method: options.method ?? 'GET',
				headers: {
					...options.headers,
					connection: 'close',
					...(options.body !== undefined
						? { 'content-length': Buffer.byteLength(options.body) }
						: {})
				},
				agent: false
			},
			(response) => {
				const chunks = [];
				let bytes = 0;

				response.on('data', (chunk) => {
					bytes += chunk.length;

					if (bytes > 8 * 1024 * 1024) {
						request.destroy(new Error('HTTP test response too large'));
						return;
					}

					chunks.push(chunk);
				});

				response.on('error', reject);

				response.on('aborted', () => {
					reject(new Error('HTTP test response aborted'));
				});

				response.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8');

					resolve({
						status: response.statusCode,
						headers: {
							get(name) {
								const value = response.headers[name.toLowerCase()];
								return Array.isArray(value) ? value.join(', ') : (value ?? null);
							},
							getSetCookie() {
								return response.headers['set-cookie'] ?? [];
							}
						},
						async text() {
							return body;
						}
					});
				});
			}
		);

		const timer = setTimeout(() => {
			request.destroy(new Error('HTTP test request timed out'));
		}, 30000);

		request.on('close', () => clearTimeout(timer));
		request.on('error', reject);
		request.end(options.body);
	});
}

function authCookie(pb) {
	return pb.authStore.exportToCookie().split(';')[0];
}

function getWorkspaceCookie(response) {
	const cookies = response.headers.getSetCookie();
	return cookies.find((cookie) => cookie.startsWith(`${workspaceCookie}=`));
}

function assertNoStore(response) {
	assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
}

async function get(base, cookie = '') {
	return requestHttp(`${base}${workspacePath}`, {
		headers: {
			connection: 'close',
			...(cookie ? { cookie } : {})
		},
		redirect: 'manual',
		signal: AbortSignal.timeout(30000)
	});
}

async function post(base, action, cookie = '', options = {}) {
	console.log(`HTTP POST ${action} | body bytes: ${Buffer.byteLength(options.body ?? '')}`);

	return requestHttp(`${base}${workspacePath}?/${action}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			connection: 'close',
			cookie,
			origin: base,
			'content-type': 'application/x-www-form-urlencoded',
			...options.headers
		},
		body: options.body ?? '',
		signal: AbortSignal.timeout(30000)
	});
}

function startApp(mode, enabled, ids) {
	const port = mode === 'preview' ? '5275' : '5274';

	return start(
		resolve(root, 'node_modules/.bin/vite'),
		[mode, '--host', '127.0.0.1', '--port', port, '--strictPort'],
		{
			FLIHUB_APPLICATION_WORKSPACE_ENABLED: enabled,
			FLIHUB_APPLICATION_WORKSPACE_ALLOWED_USER_IDS: ids
		}
	);
}

async function createUser(admin, name) {
	const email = `${name}@flihub.test`;

	await admin.collection('users').create({
		email,
		password,
		passwordConfirm: password,
		name,
		verified: true
	});

	const client = new PocketBase(pbUrl);

	await client.collection('users').authWithPassword(email, password);

	return client;
}

try {
	for (const port of [8198, 5274, 5275]) {
		await checkPort(port);
	}

	const pbBin = resolve(root, 'pocketbase/pocketbase');

	const pbArgs = [
		`--dir=${temp}`,
		`--migrationsDir=${resolve(root, 'pocketbase/pb_migrations')}`,
		`--hooksDir=${resolve(root, 'pocketbase/pb_hooks')}`
	];

	run(pbBin, [...pbArgs, 'migrate', 'up']);
	run(pbBin, [...pbArgs, 'superuser', 'upsert', adminEmail, password]);

	const pbProcess = start(pbBin, [...pbArgs, 'serve', '--http', '127.0.0.1:8198']);

	await waitFor(`${pbUrl}/api/health`, pbProcess);

	const admin = new PocketBase(pbUrl);
	await admin.collection('_superusers').authWithPassword(adminEmail, password);

	const owner = await createUser(admin, 'workspace-owner');
	const other = await createUser(admin, 'workspace-other');
	const denied = await createUser(admin, 'workspace-denied');

	const ids = `${owner.authStore.record.id},${other.authStore.record.id}`;

	const ownerCookie = authCookie(owner);
	const otherCookie = authCookie(other);
	const deniedCookie = authCookie(denied);

	pass('Disposable authenticated test accounts created');

	let app = startApp('dev', 'false', ids);
	await waitFor(devUrl, app);

	let response = await get(devUrl, ownerCookie);
	assert.equal(response.status, 404);
	assertNoStore(response);

	pass('Disabled workspace rejects authenticated access');

	await stop(app);

	app = startApp('dev', 'true', ids);
	await waitFor(devUrl, app);

	response = await get(devUrl);
	assert.ok([401, 302, 303, 307, 308].includes(response.status));
	assertNoStore(response);

	pass('Unauthenticated workspace access rejected');

	response = await post(devUrl, 'start');
	assert.ok([401, 302, 303, 307, 308].includes(response.status));
	assert.equal(getWorkspaceCookie(response), undefined);
	assertNoStore(response);

	pass('Unauthenticated session creation rejected');

	response = await get(devUrl, deniedCookie);
	assert.equal(response.status, 403);
	assertNoStore(response);

	response = await post(devUrl, 'start', deniedCookie);
	assert.equal(response.status, 403);
	assert.equal(getWorkspaceCookie(response), undefined);

	pass('Authenticated non-allowlisted user rejected');

	response = await get(devUrl, ownerCookie);
	assert.equal(response.status, 200);
	assertNoStore(response);

	let html = await response.text();
	assert.ok(html.includes('Start synthetic session'));

	pass('Authorized workspace renders without an active session');

	response = await post(devUrl, 'start', ownerCookie, {
		headers: { origin: 'https://untrusted.example' }
	});

	assert.equal(response.status, 403);
	assert.equal(getWorkspaceCookie(response), undefined);

	pass('Cross-origin session creation rejected');

	response = await post(devUrl, 'start', ownerCookie, {
		body: 'approve=true'
	});

	assert.equal(response.status, 400);
	assert.equal(getWorkspaceCookie(response), undefined);
	assertNoStore(response);

	pass('Unexpected action fields rejected');

	response = await post(devUrl, 'start', ownerCookie, {
		body: 'x'.repeat(8193)
	});

	assert.equal(response.status, 413);
	assert.equal(getWorkspaceCookie(response), undefined);

	pass('Oversized action body rejected');

	response = await post(devUrl, 'start', ownerCookie);
	assert.equal(response.status, 200);
	assertNoStore(response);

	const issued = getWorkspaceCookie(response);
	assert.ok(issued);
	assert.match(issued, /HttpOnly/i);
	assert.match(issued, /SameSite=Strict/i);
	assert.match(issued, /Path=\/development\/intelligence\/operations/i);

	const selector = issued.split(';')[0];
	const activeCookie = `${ownerCookie}; ${selector}`;

	html = await response.text();
	assert.ok(!html.includes(selector.split('=')[1]));

	pass('Session creation issues protected cookie without exposing selector');

	response = await get(devUrl, activeCookie);
	assert.equal(response.status, 200);
	assertNoStore(response);

	html = await response.text();
	assert.ok(html.includes('End synthetic session'));

	pass('Authorized session survives a subsequent HTTP request');

	response = await get(devUrl, `${otherCookie}; ${selector}`);
	assert.equal(response.status, 200);

	html = await response.text();
	assert.ok(html.includes('Start synthetic session'));
	assert.ok(!html.includes('End synthetic session'));

	pass('Foreign account cannot read another account session');

	response = await post(devUrl, 'close', `${otherCookie}; ${selector}`);
	assert.equal(response.status, 200);

	response = await get(devUrl, activeCookie);
	html = await response.text();
	assert.ok(html.includes('End synthetic session'));

	pass('Foreign account cannot close another account session');

	const concurrent = await Promise.all([
		post(devUrl, 'start', ownerCookie),
		post(devUrl, 'start', ownerCookie),
		post(devUrl, 'start', ownerCookie)
	]);

	assert.equal(concurrent.filter((r) => r.status === 200).length, 1);
	assert.equal(concurrent.filter((r) => r.status === 429).length, 2);

	pass('Concurrent requests respect per-user session capacity');

	response = await post(devUrl, 'close', activeCookie);
	assert.equal(response.status, 200);
	assertNoStore(response);

	const deletion = getWorkspaceCookie(response);
	assert.ok(deletion);
	assert.match(deletion, /Max-Age=0/i);

	response = await get(devUrl, activeCookie);
	html = await response.text();
	assert.ok(html.includes('Start synthetic session'));

	pass('Closing a session invalidates its previous cookie');

	response = await requestHttp(`${devUrl}/development/intelligence`, {
		headers: { cookie: ownerCookie },
		redirect: 'manual'
	});

	assert.equal(response.status, 200);
	assertNoStore(response);

	pass('Existing advisory playground remains accessible');

	await stop(app);

	app = startApp('dev', 'true', ids);
	await waitFor(devUrl, app);

	response = await get(devUrl, activeCookie);
	html = await response.text();
	assert.ok(html.includes('Start synthetic session'));

	pass('Server restart discards process-local workspace state');

	await stop(app);

	run(resolve(root, 'node_modules/.bin/vite'), ['build']);

	const preview = startApp('preview', 'true', ids);
	await waitFor(previewUrl, preview);

	response = await get(previewUrl, ownerCookie);
	assert.equal(response.status, 404);
	assertNoStore(response);

	response = await post(previewUrl, 'start', ownerCookie);
	assert.equal(response.status, 404);
	assert.equal(getWorkspaceCookie(response), undefined);

	pass('Production rejects workspace even with explicit enablement');

	console.log(`\nHTTP acceptance checks passed: ${passed}`);
} finally {
	for (const child of [...children].reverse()) {
		await stop(child);
	}

	rmSync(temp, { recursive: true, force: true });

	console.log('Disposable HTTP acceptance services and data removed.');
}
