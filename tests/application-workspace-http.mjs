import assert from 'node:assert/strict';
import { runWorkspaceBrowserAcceptance } from './e2e/application-workspace-acceptance.mjs';
import { unflatten } from 'devalue';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import PocketBase from 'pocketbase';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';

const root = process.cwd();
const pbUrl = 'http://127.0.0.1:8198';
const devUrl = 'http://127.0.0.1:5274';
const authProxyUrl = 'http://127.0.0.1:8199';
const mailUrl = 'http://127.0.0.1:8126/api/v1/messages';

let authProxy;
let refreshFailure = null;
let refreshHold = null;

function armRefreshHold(attempt) {
	assert.equal(refreshHold, null);

	let reached;
	let release;

	const arrived = new Promise((resolve) => {
		reached = resolve;
	});

	const released = new Promise((resolve) => {
		release = resolve;
	});

	refreshHold = {
		attempt,
		observed: 0,
		held: false,
		arrived,
		released,
		reached,
		release
	};

	return refreshHold;
}

function armRefreshFailure(attempt) {
	assert.equal(refreshFailure, null);
	refreshFailure = { attempt, observed: 0, injected: false };
	return refreshFailure;
}

function createAuthorizationProxy() {
	return createHttpServer(async (incoming, outgoing) => {
		const target = incoming.url ?? '/';

		if (
			!target.startsWith('/') ||
			target.startsWith('//') ||
			target.includes(String.fromCharCode(92))
		) {
			incoming.resume();
			outgoing.writeHead(400, { connection: 'close' });
			outgoing.end();
			return;
		}

		const destination = new URL(target, pbUrl);

		if (destination.origin !== pbUrl) {
			incoming.resume();
			outgoing.writeHead(400, { connection: 'close' });
			outgoing.end();
			return;
		}

		const pathname = destination.pathname;

		if (
			refreshHold &&
			incoming.method === 'POST' &&
			pathname === '/api/collections/users/auth-refresh'
		) {
			const hold = refreshHold;
			hold.observed++;

			if (hold.observed === hold.attempt) {
				hold.held = true;
				hold.reached();

				let timer;

				try {
					const released = await Promise.race([
						hold.released.then(() => true),
						new Promise((resolve) => {
							timer = setTimeout(() => resolve(false), 12000);
						})
					]);

					if (!released) {
						incoming.resume();
						outgoing.writeHead(504, { connection: 'close' });
						outgoing.end();
						return;
					}
				} finally {
					clearTimeout(timer);
				}
			}
		}

		if (
			refreshFailure &&
			incoming.method === 'POST' &&
			pathname === '/api/collections/users/auth-refresh'
		) {
			refreshFailure.observed++;

			if (refreshFailure.observed === refreshFailure.attempt) {
				refreshFailure.injected = true;

				incoming.resume();

				outgoing.writeHead(401, {
					'content-type': 'application/json',
					'cache-control': 'no-store',
					connection: 'close'
				});

				outgoing.end(
					JSON.stringify({
						status: 401,
						message: 'Disposable authorization rejection.',
						data: {}
					})
				);

				return;
			}
		}

		const upstream = httpRequest(
			destination,
			{
				method: incoming.method,
				headers: {
					...incoming.headers,
					host: new URL(pbUrl).host,
					connection: 'close'
				},
				agent: false
			},
			(response) => {
				outgoing.writeHead(response.statusCode ?? 502, response.headers);

				response.pipe(outgoing);
			}
		);

		upstream.setTimeout(10000, () => upstream.destroy());

		upstream.on('error', () => {
			if (!outgoing.headersSent) {
				outgoing.writeHead(502);
				outgoing.end();
			} else {
				outgoing.destroy();
			}
		});

		incoming.on('aborted', () => upstream.destroy());
		outgoing.on('close', () => upstream.destroy());

		incoming.pipe(upstream);
	});
}
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

async function postChunkedAssessment(base, cookie, chunks, stalled = false, action = 'assess') {
	return new Promise((resolve, reject) => {
		const startedAt = Date.now();

		const request = httpRequest(
			`${base}${workspacePath}?/${action}`,
			{
				method: 'POST',
				agent: false,
				headers: {
					connection: 'close',
					cookie,
					origin: base,
					'content-type': 'application/x-www-form-urlencoded',
					'transfer-encoding': 'chunked'
				}
			},
			(response) => {
				const parts = [];
				let bytes = 0;

				response.on('data', (chunk) => {
					bytes += chunk.length;

					if (bytes > 8 * 1024 * 1024) {
						request.destroy(new Error('Streaming response exceeded test limit'));
						return;
					}

					parts.push(chunk);
				});

				response.on('error', reject);

				response.on('aborted', () => {
					reject(new Error('Streaming response aborted'));
				});

				response.on('end', () => {
					clearTimeout(timer);

					resolve({
						status: response.statusCode,
						cacheControl: response.headers['cache-control'] ?? '',
						body: Buffer.concat(parts).toString('utf8'),
						elapsedMs: Date.now() - startedAt
					});

					request.destroy();
				});
			}
		);

		const timer = setTimeout(() => {
			request.destroy(new Error('Streaming HTTP acceptance deadline exceeded'));
		}, 15000);

		request.on('error', (error) => {
			const elapsedMs = Date.now() - startedAt;

			if (stalled && error.code === 'ECONNRESET' && elapsedMs >= 4500 && elapsedMs < 15000) {
				resolve({
					status: null,
					cacheControl: '',
					body: '',
					elapsedMs,
					transportClosed: true
				});
				return;
			}

			reject(error);
		});
		request.on('close', () => clearTimeout(timer));

		request.flushHeaders();

		for (const chunk of chunks) {
			request.write(chunk);
		}

		if (!stalled) {
			request.end();
		}
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
			POCKETBASE_URL: authProxyUrl,
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
	for (const port of [8198, 8199, 5274, 5275, 8126, 1126]) {
		await checkPort(port);
	}

	const mail = start(resolve(root, 'pocketbase/mailpit'), [
		'--listen',
		'127.0.0.1:8126',
		'--smtp',
		'127.0.0.1:1126'
	]);
	await waitFor(mailUrl, mail);

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

	authProxy = createAuthorizationProxy();
	authProxy.listen(8199, '127.0.0.1');
	await once(authProxy, 'listening');

	const proxyHealth = await requestHttp(`${authProxyUrl}/api/health`);

	assert.equal(proxyHealth.status, 200);

	pass('Disposable authorization proxy available');

	const admin = new PocketBase(pbUrl);
	await admin.collection('_superusers').authWithPassword(adminEmail, password);
	await admin.settings.update({
		smtp: { enabled: true, host: '127.0.0.1', port: 1126, tls: false }
	});

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

	response = await post(devUrl, 'executeReview', ownerCookie);
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

	const assessmentFields = {
		mode: 'registered',
		objective: 'prepare_tournament',
		fixtureId: 'spring_invitational',
		actorId: 'synthetic-actor-owner'
	};

	function assessmentBody(patch = {}) {
		return new URLSearchParams({
			...assessmentFields,
			...patch
		}).toString();
	}

	async function assess(cookie, patch = {}, options = {}) {
		return post(devUrl, 'assess', cookie, {
			body: assessmentBody(patch),
			...options
		});
	}

	// Use a separate authenticated session so successful streaming tests
	// do not consume the primary owner's assessment admission budget.
	response = await post(devUrl, 'start', otherCookie);
	assert.equal(response.status, 200);

	const streamingIssued = getWorkspaceCookie(response);
	assert.ok(streamingIssued);

	const streamingSelector = streamingIssued.split(';')[0];
	const streamingCookie = `${otherCookie}; ${streamingSelector}`;

	const validStreamingBody = assessmentBody();

	let streamingResponse = await postChunkedAssessment(devUrl, streamingCookie, [
		validStreamingBody.slice(0, 17),
		validStreamingBody.slice(17, 43),
		validStreamingBody.slice(43)
	]);

	assert.equal(streamingResponse.status, 200);
	assert.match(streamingResponse.cacheControl, /no-store/i);
	assert.ok(streamingResponse.body.includes('Offline assessment completed.'));
	assert.ok(!streamingResponse.body.includes(streamingSelector.split('=')[1]));

	pass('Valid chunked assessment accepted without Content-Length');

	streamingResponse = await postChunkedAssessment(devUrl, streamingCookie, [
		'x'.repeat(4096),
		'x'.repeat(4096),
		'x'
	]);

	assert.equal(streamingResponse.status, 413);
	assert.match(streamingResponse.cacheControl, /no-store/i);
	assert.ok(!streamingResponse.body.includes(streamingSelector.split('=')[1]));

	pass('Oversized chunked assessment rejected by actual HTTP byte limit');

	streamingResponse = await postChunkedAssessment(
		devUrl,
		streamingCookie,
		['mode=registered&'],
		true
	);

	if (streamingResponse.transportClosed === true) {
		assert.equal(streamingResponse.status, null);
		console.log(
			'INFO Stalled request connection terminated after ' + streamingResponse.elapsedMs + ' ms'
		);
	} else {
		assert.equal(streamingResponse.status, 408);
		assert.match(streamingResponse.cacheControl, /no-store/i);
	}
	assert.ok(streamingResponse.elapsedMs >= 4500);
	assert.ok(streamingResponse.elapsedMs < 15000);
	assert.ok(!streamingResponse.body.includes(streamingSelector.split('=')[1]));

	pass('Stalled HTTP assessment rejected or disconnected within bounded reading deadline');

	// Confirm the rejected transport requests did not create assessment
	// records or leave the session permanently busy.
	response = await assess(streamingCookie);
	assert.equal(response.status, 200);

	response = await get(devUrl, streamingCookie);
	assert.equal(response.status, 200);
	assertNoStore(response);

	html = await response.text();
	const accountingResponse = await requestHttp(`${devUrl}${workspacePath}/__data.json`, {
		headers: {
			cookie: streamingCookie,
			connection: 'close'
		}
	});

	assert.equal(accountingResponse.status, 200);
	assertNoStore(accountingResponse);

	const accountingPayload = JSON.parse(await accountingResponse.text());

	assert.equal(accountingPayload.type, 'data');
	assert.ok(Array.isArray(accountingPayload.nodes));

	const accountingNodes = accountingPayload.nodes
		.filter((node) => node?.type === 'data' && Array.isArray(node.data))
		.map((node) => unflatten(node.data));

	const workspaceNode = accountingNodes.find(
		(node) => node && Object.hasOwn(node, 'assessmentSummary')
	);

	assert.ok(workspaceNode, 'Workspace accounting data must be present');

	const summary = workspaceNode.assessmentSummary;

	assert.ok(summary, 'Active session accounting must be present');
	assert.equal(summary.usage.completedAssessments, 2);
	assert.equal(summary.usage.retainedAssessments, 2);
	assert.equal(summary.history.length, 2);
	assert.deepEqual(
		summary.history.map((record) => record.sequence),
		[1, 2]
	);
	assert.deepEqual(
		summary.history.map((record) => record.outcome),
		['advised', 'advised']
	);
	assert.equal(summary.usage.paidProviderRequests, 0);
	assert.equal(summary.usage.paidProviderCost, 0);
	assert.equal(summary.usage.source, 'mock');

	console.log('PASS Exact completed assessment count: 2');
	console.log('PASS Exact retained history count: 2');
	console.log('PASS Assessment sequence integrity: 1, 2');
	console.log('PASS Paid provider requests: 0');
	console.log('PASS Paid provider cost: $0.00');

	pass('Streaming rejections preserve session usability and assessment accounting');

	response = await post(devUrl, 'close', streamingCookie);
	assert.equal(response.status, 200);

	// Exercise authorization failures using only the disposable second account.
	for (const attempt of [2, 3]) {
		const phase = attempt === 2 ? 'pre-admission' : 'publication';

		response = await post(devUrl, 'start', otherCookie);
		assert.equal(response.status, 200);
		assertNoStore(response);

		const authorizationIssued = response.headers
			.getSetCookie()
			.find((cookie) => cookie.startsWith(`${workspaceCookie}=`));

		assert.ok(authorizationIssued);

		const authorizationSelector = authorizationIssued.split(';')[0];
		const authorizationCookie = `${otherCookie}; ${authorizationSelector}`;

		const failure = armRefreshFailure(attempt);

		let rejectedResponse;

		try {
			rejectedResponse = await assess(authorizationCookie);
		} finally {
			refreshFailure = null;
		}

		assert.equal(failure.injected, true);
		assert.ok(failure.observed >= attempt);

		assert.equal(rejectedResponse.status, 403);
		assertNoStore(rejectedResponse);

		const rejectedBody = await rejectedResponse.text();

		assert.ok(
			rejectedBody.includes(
				attempt === 2
					? 'Workspace assessment access unavailable.'
					: 'Assessment discarded because workspace access is no longer valid.'
			)
		);

		assert.equal(rejectedBody.includes('Offline assessment completed.'), false);

		assert.equal(rejectedBody.includes('Disposable authorization rejection.'), false);

		assert.equal(rejectedBody.includes(authorizationSelector.split('=')[1]), false);

		pass(`Authentication rejection during ${phase} prevents recommendation publication`);

		// The original authenticated account remains valid at PocketBase.
		// Its revoked workspace selector must nevertheless remain unusable.
		response = await assess(authorizationCookie);

		assert.equal(response.status, 409);
		assertNoStore(response);

		const revokedDataResponse = await requestHttp(`${devUrl}${workspacePath}/__data.json`, {
			headers: {
				cookie: authorizationCookie
			}
		});

		assert.equal(revokedDataResponse.status, 200);
		assertNoStore(revokedDataResponse);

		const revokedPayload = JSON.parse(await revokedDataResponse.text());

		const revokedWorkspace = revokedPayload.nodes
			.filter((node) => node?.type === 'data' && Array.isArray(node.data))
			.map((node) => unflatten(node.data))
			.find((node) => node && Object.hasOwn(node, 'assessmentSummary'));

		assert.ok(revokedWorkspace);
		assert.equal(revokedWorkspace.session, null);
		assert.equal(revokedWorkspace.assessmentSummary, null);

		pass(`Authorization failure during ${phase} revokes workspace and history`);

		const unrelatedDataResponse = await requestHttp(`${devUrl}${workspacePath}/__data.json`, {
			headers: {
				cookie: activeCookie
			}
		});

		assert.equal(unrelatedDataResponse.status, 200);
		assertNoStore(unrelatedDataResponse);

		const unrelatedPayload = JSON.parse(await unrelatedDataResponse.text());

		const unrelatedWorkspace = unrelatedPayload.nodes
			.filter((node) => node?.type === 'data' && Array.isArray(node.data))
			.map((node) => unflatten(node.data))
			.find((node) => node && Object.hasOwn(node, 'assessmentSummary'));

		assert.ok(unrelatedWorkspace?.session);
		assert.ok(unrelatedWorkspace.assessmentSummary);
		assert.equal(unrelatedWorkspace.assessmentSummary.usage.completedAssessments, 0);
		assert.equal(unrelatedWorkspace.assessmentSummary.usage.paidProviderRequests, 0);
		assert.equal(unrelatedWorkspace.assessmentSummary.usage.paidProviderCost, 0);

		pass(`Authorization failure during ${phase} preserves unrelated workspace`);
	}

	// Hold final authorization while a separate logout request revokes
	// the disposable second account's workspace.
	response = await post(devUrl, 'start', otherCookie);
	assert.equal(response.status, 200);
	assertNoStore(response);

	const logoutIssued = getWorkspaceCookie(response);
	assert.ok(logoutIssued);

	const logoutSelector = logoutIssued.split(';')[0];
	const logoutCookie = `${otherCookie}; ${logoutSelector}`;

	const hold = armRefreshHold(3);
	const pendingAssessment = assess(logoutCookie).then(
		(value) => ({ value }),
		(error) => ({ error })
	);

	let arrivalTimer;
	let concurrentLogoutResponse;

	try {
		await Promise.race([
			hold.arrived,
			new Promise((_, reject) => {
				arrivalTimer = setTimeout(
					() => reject(new Error('Final authorization was not reached')),
					10000
				);
			})
		]);

		assert.equal(hold.held, true);
		assert.equal(hold.observed, 3);

		concurrentLogoutResponse = await requestHttp(`${devUrl}/logout`, {
			method: 'POST',
			headers: {
				cookie: otherCookie,
				origin: devUrl,
				'content-type': 'application/x-www-form-urlencoded'
			},
			body: ''
		});

		assert.equal(concurrentLogoutResponse.status, 303);
	} finally {
		clearTimeout(arrivalTimer);
		hold.release();
		refreshHold = null;
	}

	const pendingResult = await pendingAssessment;

	if (pendingResult.error) throw pendingResult.error;

	const discardedResponse = pendingResult.value;

	assert.equal(discardedResponse.status, 403);
	assertNoStore(discardedResponse);

	const discardedBody = await discardedResponse.text();

	assert.ok(
		discardedBody.includes('Assessment discarded because workspace access is no longer valid.')
	);

	assert.ok(!discardedBody.includes('Offline assessment completed.'));
	assert.ok(!discardedBody.includes('Recommended next step'));
	assert.ok(!discardedBody.includes(logoutSelector.split('=')[1]));

	pass('Concurrent logout prevents pending assessment publication');

	response = await assess(logoutCookie);
	assert.equal(response.status, 409);
	assertNoStore(response);

	async function readConcurrentWorkspace(cookie) {
		const result = await requestHttp(`${devUrl}${workspacePath}/__data.json`, {
			headers: { cookie }
		});

		assert.equal(result.status, 200);
		assertNoStore(result);

		const payload = JSON.parse(await result.text());

		const workspace = payload.nodes
			.filter((node) => node?.type === 'data' && Array.isArray(node.data))
			.map((node) => unflatten(node.data))
			.find((node) => node && Object.hasOwn(node, 'assessmentSummary'));

		assert.ok(workspace);
		return workspace;
	}

	const loggedOutWorkspace = await readConcurrentWorkspace(logoutCookie);

	assert.equal(loggedOutWorkspace.session, null);
	assert.equal(loggedOutWorkspace.assessmentSummary, null);

	pass('Concurrent logout revokes workspace history and prevents selector replay');

	const preservedWorkspace = await readConcurrentWorkspace(activeCookie);

	assert.ok(preservedWorkspace.session);
	assert.ok(preservedWorkspace.assessmentSummary);
	assert.equal(preservedWorkspace.assessmentSummary.usage.completedAssessments, 0);
	assert.equal(preservedWorkspace.assessmentSummary.usage.paidProviderRequests, 0);
	assert.equal(preservedWorkspace.assessmentSummary.usage.paidProviderCost, 0);

	pass('Concurrent logout preserves unrelated account and zero-cost accounting');

	response = await assess('');

	assert.ok([401, 302, 303, 307, 308].includes(response.status));

	assertNoStore(response);

	pass('Unauthenticated assessment rejected');

	response = await assess(deniedCookie);

	assert.equal(response.status, 403);
	assertNoStore(response);

	pass('Non-allowlisted assessment rejected');

	response = await assess(ownerCookie);

	assert.equal(response.status, 409);
	assertNoStore(response);

	pass('Assessment requires an active workspace session');

	response = await assess(`${otherCookie}; ${selector}`);

	assert.equal(response.status, 409);
	assertNoStore(response);

	pass('Foreign account cannot assess using another session');

	response = await assess(
		activeCookie,
		{},
		{
			headers: {
				origin: 'https://untrusted.example'
			}
		}
	);

	assert.equal(response.status, 403);

	pass('Cross-origin assessment rejected');

	response = await assess(
		activeCookie,
		{},
		{
			headers: {
				origin: 'null'
			}
		}
	);

	assert.equal(response.status, 403);

	pass('Opaque assessment origin rejected');

	response = await assess(
		activeCookie,
		{},
		{
			body: `${assessmentBody()}&owner=unexpected`
		}
	);

	assert.equal(response.status, 400);
	assertNoStore(response);

	pass('Client-supplied account identity rejected');

	response = await assess(
		activeCookie,
		{},
		{
			body: `${assessmentBody()}&sessionId=unexpected`
		}
	);

	assert.equal(response.status, 400);

	pass('Client-supplied session identity rejected');

	response = await assess(
		activeCookie,
		{},
		{
			body: `${assessmentBody()}&approval=true`
		}
	);

	assert.equal(response.status, 400);

	pass('Client-supplied approval rejected');

	response = await assess(
		activeCookie,
		{},
		{
			body: `${assessmentBody()}&execute=true`
		}
	);

	assert.equal(response.status, 400);

	pass('Client-supplied execution request rejected');

	response = await assess(
		activeCookie,
		{},
		{
			body: `${assessmentBody()}&mode=natural`
		}
	);

	assert.equal(response.status, 400);

	pass('Duplicate assessment field rejected');

	response = await assess(
		activeCookie,
		{},
		{
			body: assessmentBody().replace('prepare_tournament', '%GG')
		}
	);

	assert.equal(response.status, 400);

	pass('Malformed assessment encoding rejected');

	response = await assess(activeCookie, {
		mode: 'natural',
		objective: 'a'.repeat(257)
	});

	assert.equal(response.status, 400);

	pass('Oversized objective rejected');

	response = await assess(
		activeCookie,
		{},
		{
			body: 'x'.repeat(8193)
		}
	);

	assert.equal(response.status, 413);

	pass('Oversized assessment request rejected');

	response = await assess(activeCookie);

	assert.equal(response.status, 200);
	assertNoStore(response);

	html = await response.text();

	assert.ok(html.includes('Offline assessment completed.'));
	assert.ok(html.includes('Spring Invitational'));
	assert.ok(html.includes('recommendation-only'));
	assert.ok(!html.includes(selector.split('=')[1]));

	pass('Registered objective returns browser-safe offline advice');

	response = await assess(activeCookie, {
		mode: 'natural',
		objective: 'Help me prepare our next tournament.'
	});

	assert.equal(response.status, 200);
	assertNoStore(response);

	html = await response.text();

	assert.ok(html.includes('Offline assessment completed.'));
	assert.ok(html.includes('Spring Invitational'));

	pass('Natural-language objective resolves through protected HTTP');

	response = await assess(activeCookie, {
		mode: 'natural',
		objective: ''
	});

	assert.equal(response.status, 200);
	assertNoStore(response);

	html = await response.text();

	assert.ok(html.includes('Enter an objective or select a registered objective.'));

	pass('Empty objective returns safe clarification');

	response = await assess(activeCookie, {
		fixtureId: 'information_missing'
	});

	assert.equal(response.status, 200);

	html = await response.text();

	assert.ok(html.includes('Information Missing'));
	assert.ok(html.includes('clarification'));

	pass('Missing synthetic context returns clarification');

	response = await assess(activeCookie, {
		mode: 'natural',
		objective: 'PRIVATE_UNSUPPORTED_OBJECTIVE'
	});

	assert.equal(response.status, 400);
	assertNoStore(response);

	html = await response.text();

	assert.ok(html.includes('The requested assessment is not supported.'));

	assert.ok(!html.includes('PRIVATE_UNSUPPORTED_OBJECTIVE'));

	pass('Unsupported objective rejected without reflecting raw input');

	response = await assess(activeCookie, {
		fixtureId: 'unknown_scenario'
	});

	assert.equal(response.status, 400);

	pass('Unregistered synthetic scenario rejected');

	response = await assess(activeCookie, {
		actorId: 'unknown-actor'
	});

	assert.equal(response.status, 400);

	pass('Unregistered simulated actor rejected');

	for (let index = 0; index < 3; index++) {
		response = await assess(activeCookie);

		assert.equal(response.status, 200);
	}

	response = await assess(activeCookie);

	assert.equal(response.status, 429);
	assertNoStore(response);

	pass('HTTP assessment admission limit enforced');

	response = await get(devUrl, activeCookie);

	assert.equal(response.status, 200);
	assertNoStore(response);

	html = await response.text();

	assert.ok(html.includes('assessmentSummary'));
	assert.ok(html.includes('completedAssessments'));
	assert.ok(html.includes('paidProviderCost'));
	assert.ok(!html.includes(selector.split('=')[1]));
	assert.ok(!html.includes('PRIVATE_UNSUPPORTED_OBJECTIVE'));

	pass('Session history and usage remain browser-safe');

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

	// JAI-5D: isolated authenticated exact-review security acceptance.
	{
		async function startReviewSession() {
			const started = await post(devUrl, 'start', ownerCookie);

			assert.equal(started.status, 200);
			assertNoStore(started);

			const issued = getWorkspaceCookie(started);
			assert.ok(issued);

			const selector = issued.split(';')[0];

			return {
				selector,
				cookie: `${ownerCookie}; ${selector}`
			};
		}

		async function reviewAction(action, cookie, body, status, headers = {}) {
			const result = await post(devUrl, action, cookie, { body, headers });

			assert.equal(result.status, status, `Unexpected status for ${action}`);

			assertNoStore(result);

			return result;
		}

		async function recommend(cookie, patch = {}) {
			const result = await assess(cookie, patch);

			assert.equal(result.status, 200);
			assertNoStore(result);

			const workspace = await readConcurrentWorkspace(cookie);

			assert.ok(workspace.reviewAvailability);
			assert.match(workspace.reviewAvailability.generation, /^[a-f0-9]{64}$/);

			return workspace.reviewAvailability;
		}

		async function prepare(cookie, generation, status = 200) {
			return reviewAction('prepareReview', cookie, `generation=${generation}`, status);
		}

		async function cancel(cookie, reviewId, status = 200) {
			return reviewAction('cancelReview', cookie, `reviewId=${reviewId}`, status);
		}

		async function closeReviewSession(cookie) {
			const result = await post(devUrl, 'close', cookie);
			assert.equal(result.status, 200);
			assertNoStore(result);
		}

		const first = await startReviewSession();
		const second = await startReviewSession();

		const firstContext = await recommend(first.cookie);
		const secondContext = await recommend(second.cookie);

		assert.equal(firstContext.sequence, 1);
		assert.equal(secondContext.sequence, 1);
		assert.notEqual(firstContext.generation, secondContext.generation);

		assert.notEqual(firstContext.generation, first.selector.split('=')[1]);

		await prepare(second.cookie, firstContext.generation, 409);
		await prepare(first.cookie, secondContext.generation, 409);

		assert.equal((await readConcurrentWorkspace(first.cookie)).review, null);

		assert.equal((await readConcurrentWorkspace(second.cookie)).review, null);

		pass('HTTP rejects cross-session generations with identical assessment sequences');

		const generation = firstContext.generation;
		const validBody = `generation=${generation}`;

		const tampered = (generation[0] === 'a' ? 'b' : 'a') + generation.slice(1);

		await prepare(first.cookie, tampered, 409);

		for (const body of [
			'sequence=1',
			'generation=',
			'generation=invalid',
			`${validBody}&generation=${generation}`,
			`${validBody}&approval=true`,
			`${validBody}&execute=true`,
			`${validBody}&plan=unexpected`,
			`${validBody}&operationId=create_synthetic_group_assignments`,
			`${validBody}&actorId=synthetic-actor-owner`,
			`${validBody}&sessionId=unexpected`,
			`${validBody}&owner=unexpected`
		]) {
			await reviewAction('prepareReview', first.cookie, body, 400);
		}

		await reviewAction('prepareReview', first.cookie, 'x'.repeat(8193), 413);

		await reviewAction('prepareReview', first.cookie, validBody, 403, {
			origin: 'https://untrusted.example'
		});

		assert.equal((await readConcurrentWorkspace(first.cookie)).review, null);

		pass('HTTP rejects tampered generations and client-supplied execution instructions');

		await prepare(first.cookie, generation);

		const prepared = await readConcurrentWorkspace(first.cookie);
		const exact = prepared.review;

		assert.ok(exact);
		assert.equal(exact.kind, 'exact-operation-review');
		assert.equal(exact.scope, 'synthetic-only');
		assert.equal(exact.stateRevision, 0);

		assert.equal(exact.summary.groupsBefore, 0);
		assert.equal(exact.summary.groupsAfter, 6);
		assert.equal(exact.summary.teamsAssigned, 12);
		assert.equal(exact.summary.athletesAssigned, 24);

		assert.equal(exact.groups.length, 6);

		const teams = exact.groups.flatMap((group) => group.teams);
		const athletes = teams.flatMap((team) => team.athletes);

		assert.equal(teams.length, 12);
		assert.equal(athletes.length, 24);
		assert.equal(new Set(teams.map((team) => team.teamId)).size, 12);
		assert.equal(new Set(athletes.map((athlete) => athlete.id)).size, 24);

		assert.equal(exact.boundaries.approvalRequired, true);
		assert.equal(exact.boundaries.approvalGranted, false);
		assert.equal(exact.boundaries.execution, 'disabled');
		assert.equal(exact.boundaries.persistentMutation, false);
		assert.equal(exact.boundaries.externalProviderAccess, false);

		assert.equal(Object.hasOwn(exact, 'sessionId'), false);
		assert.equal(Object.hasOwn(exact, 'approvalReceipt'), false);

		pass('HTTP publishes exact synthetic assignments without approval or execution');

		await prepare(first.cookie, generation);

		assert.deepEqual((await readConcurrentWorkspace(first.cookie)).review, exact);

		pass('Repeated HTTP preparation preserves the exact reviewed plan');

		const foreignCookie = `${otherCookie}; ${first.selector}`;

		await prepare(foreignCookie, generation, 409);
		await cancel(foreignCookie, exact.reviewId, 409);

		const foreignWorkspace = await readConcurrentWorkspace(foreignCookie);

		assert.equal(foreignWorkspace.session, null);
		assert.equal(foreignWorkspace.review, null);
		assert.equal(foreignWorkspace.reviewAvailability, null);

		await prepare(`${deniedCookie}; ${first.selector}`, generation, 403);

		assert.deepEqual((await readConcurrentWorkspace(first.cookie)).review, exact);

		pass('Foreign and non-allowlisted accounts cannot access or cancel exact reviews');

		await cancel(first.cookie, 'incorrect-review-identity', 409);

		await reviewAction(
			'cancelReview',
			first.cookie,
			`reviewId=${exact.reviewId}&approval=true`,
			400
		);

		await reviewAction('cancelReview', first.cookie, `reviewId=${exact.reviewId}`, 403, {
			origin: 'https://untrusted.example'
		});

		assert.deepEqual((await readConcurrentWorkspace(first.cookie)).review, exact);

		pass('Invalid cancellation requests preserve the active exact review');

		// Direct HTTP reassessment deliberately bypasses the UI editing lock.
		const nextContext = await recommend(first.cookie);

		assert.equal(nextContext.sequence, 2);
		assert.notEqual(nextContext.generation, generation);

		assert.equal((await readConcurrentWorkspace(first.cookie)).review, null);

		await prepare(first.cookie, generation, 409);
		await cancel(first.cookie, exact.reviewId, 409);

		await prepare(first.cookie, nextContext.generation);

		const nextReview = (await readConcurrentWorkspace(first.cookie)).review;

		assert.ok(nextReview);
		assert.notEqual(nextReview.reviewId, exact.reviewId);

		await cancel(first.cookie, exact.reviewId, 409);

		assert.deepEqual((await readConcurrentWorkspace(first.cookie)).review, nextReview);

		pass('Direct HTTP reassessment invalidates old generations and review identities');

		await cancel(first.cookie, nextReview.reviewId);

		const cancelled = await readConcurrentWorkspace(first.cookie);

		assert.equal(cancelled.review, null);
		assert.equal(cancelled.reviewAvailability, null);

		await prepare(first.cookie, nextContext.generation, 409);
		await cancel(first.cookie, nextReview.reviewId, 409);

		pass('Cancelled reviews cannot be restored by replaying preparation');

		const unauthorized = await recommend(first.cookie, {
			actorId: 'synthetic-actor-viewer'
		});

		await prepare(first.cookie, unauthorized.generation, 400);

		assert.equal((await readConcurrentWorkspace(first.cookie)).review, null);

		pass('HTTP review preparation independently enforces simulated operator authorization');

		const accounting = await readConcurrentWorkspace(first.cookie);

		assert.equal(accounting.assessmentSummary.usage.completedAssessments, 3);
		assert.equal(accounting.assessmentSummary.usage.paidProviderRequests, 0);
		assert.equal(accounting.assessmentSummary.usage.paidProviderCost, 0);

		pass('Review requests do not create extra assessment records or paid usage');

		await closeReviewSession(first.cookie);

		await prepare(first.cookie, unauthorized.generation, 409);

		const replacement = await startReviewSession();
		const replacementContext = await recommend(replacement.cookie);

		assert.equal(replacementContext.sequence, 1);
		assert.notEqual(replacementContext.generation, generation);

		await prepare(replacement.cookie, generation, 409);
		await prepare(replacement.cookie, secondContext.generation, 409);
		await prepare(replacement.cookie, replacementContext.generation);

		const replacementReview = (await readConcurrentWorkspace(replacement.cookie)).review;

		assert.ok(replacementReview);

		const execution = new URLSearchParams({
			confirmation: 'approve-and-execute',
			generation: replacementContext.generation,
			reviewId: replacementReview.reviewId,
			planDigest: replacementReview.planDigest
		}).toString();

		const execute = (cookie, body, status, headers) =>
			reviewAction('executeReview', cookie, body, status, headers);

		for (const body of [
			execution.replace('approve-and-execute', 'yes'),
			`${execution}&confirmation=approve-and-execute`,
			`${execution}&receipt=unexpected`,
			execution.replace(replacementReview.planDigest, 'invalid')
		])
			await execute(replacement.cookie, body, 400);

		await execute(replacement.cookie, execution, 403, { origin: 'https://untrusted.example' });
		await execute(replacement.cookie, execution, 415, { 'content-type': 'text/plain' });
		await execute(replacement.cookie, 'x'.repeat(8193), 413);
		const stalled = await postChunkedAssessment(
			devUrl,
			replacement.cookie,
			[execution],
			true,
			'executeReview'
		);
		assert.ok(stalled.status === 408 || stalled.transportClosed);
		assert.ok(stalled.elapsedMs >= 4500 && stalled.elapsedMs < 15000);
		if (stalled.status === 408) assert.match(stalled.cacheControl, /no-store/i);
		await execute(second.cookie, execution, 409);
		await execute(`${deniedCookie}; ${replacement.selector}`, execution, 403);
		await execute(`${otherCookie}; ${replacement.selector}`, execution, 409);
		assert.equal((await readConcurrentWorkspace(replacement.cookie)).execution, null);
		pass(
			'HTTP execution admits only exact, bounded, same-origin confirmation for the owning session'
		);

		const applicationCollections = (await admin.collections.getFullList())
			.filter((collection) => collection.type === 'base' && !collection.system)
			.map((collection) => collection.name);
		const snapshotRecords = () =>
			Promise.all(
				applicationCollections.map((name) => admin.collection(name).getFullList({ sort: 'id' }))
			);
		const recordsBefore = await snapshotRecords();

		const submissions = await Promise.all([
			post(devUrl, 'executeReview', replacement.cookie, { body: execution }),
			post(devUrl, 'executeReview', replacement.cookie, { body: execution })
		]);
		assert.deepEqual(submissions.map((result) => result.status).sort(), [200, 409]);
		for (const result of submissions) {
			assertNoStore(result);
			const body = await result.text();
			assert.doesNotMatch(
				body,
				/synthetic-approval-receipt|approvalId|originalStateDigest|publishedStateDigest/
			);
		}

		const published = {
			status: 'published',
			revisionBefore: 0,
			revisionAfter: 1,
			groupsCreated: 6,
			teamsAssigned: 12,
			athletesAssigned: 24,
			verification: 'passed',
			persistentMutation: false,
			paidProviderRequests: 0,
			paidProviderCost: 0
		};
		assert.deepEqual((await readConcurrentWorkspace(replacement.cookie)).execution, published);
		const retained = await readConcurrentWorkspace(replacement.cookie);
		assert.deepEqual(
			retained.executionEvidence.publication.groups,
			replacementReview.groups.map(({ name, teams }) => ({
				name,
				teams: teams.map((team) => ({
					name: team.name,
					athletes: team.athletes.map(({ name }) => name)
				}))
			}))
		);
		assert.equal(retained.executionEvidence.audit.verification, 'passed');
		assert.equal(retained.executionEvidence.audit.sequence, 1);
		assert.doesNotMatch(
			JSON.stringify(retained.executionEvidence),
			/sessionId|reviewId|receipt|planDigest|stateDigest/i
		);
		assert.equal((await readConcurrentWorkspace(second.cookie)).executionEvidence, null);
		assert.equal(
			(await readConcurrentWorkspace(`${otherCookie}; ${replacement.selector}`)).executionEvidence,
			null
		);
		pass(
			'HTTP exposes only bounded published assignments and sanitized audit to the owning workspace'
		);
		await execute(replacement.cookie, execution, 409);
		await cancel(replacement.cookie, replacementReview.reviewId, 409);
		assert.equal((await assess(replacement.cookie)).status, 409);
		assert.deepEqual((await readConcurrentWorkspace(replacement.cookie)).execution, published);
		assert.equal((await readConcurrentWorkspace(second.cookie)).execution, null);
		assert.deepEqual(await snapshotRecords(), recordsBefore);
		pass('HTTP execution leaves disposable persistent application records unchanged');
		pass(
			'HTTP concurrent execution publishes once and supports read-only retained outcome recovery'
		);

		await closeReviewSession(replacement.cookie);

		await prepare(replacement.cookie, replacementContext.generation, 409);

		await cancel(replacement.cookie, replacementReview.reviewId, 409);

		const closed = await readConcurrentWorkspace(replacement.cookie);

		assert.equal(closed.session, null);
		assert.equal(closed.review, null);
		assert.equal(closed.reviewAvailability, null);
		assert.equal(closed.execution, null);

		pass('Closed and replacement sessions reject stale review requests');

		const secondReview = (await readConcurrentWorkspace(second.cookie)).review;
		await prepare(second.cookie, secondContext.generation);
		const freshReview = secondReview ?? (await readConcurrentWorkspace(second.cookie)).review;
		const freshBody = new URLSearchParams({
			confirmation: 'approve-and-execute',
			generation: secondContext.generation,
			reviewId: freshReview.reviewId,
			planDigest: freshReview.planDigest
		}).toString();
		const failure = armRefreshFailure(2);
		try {
			await execute(second.cookie, freshBody, 403);
			assert.equal(failure.injected, true);
		} finally {
			refreshFailure = null;
		}
		assert.equal((await readConcurrentWorkspace(second.cookie)).execution, null);
		await execute(second.cookie, freshBody, 409);
		pass('HTTP execution independently refreshes authentication before admission');

		await closeReviewSession(second.cookie);
	}

	// Reset only the disposable application process so the existing browser
	// acceptance starts with independent session and admission budgets.
	await stop(app);

	app = startApp('dev', 'true', ids);
	await waitFor(devUrl, app);

	pass('Disposable application restarted before browser acceptance');

	await runWorkspaceBrowserAcceptance({
		base: devUrl,
		workspacePath,
		ownerCookie,
		workspaceCookie,
		pass
	});

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

	response = await post(previewUrl, 'executeReview', ownerCookie);
	assert.equal(response.status, 404);
	assertNoStore(response);

	pass('Production rejects workspace even with explicit enablement');

	const capturedMail = await requestHttp(mailUrl);
	assert.equal(capturedMail.status, 200);
	assert.deepEqual(JSON.parse(await capturedMail.text()).messages, []);
	pass('Disposable mail capture records no execution email');

	console.log(`\nHTTP acceptance checks passed: ${passed}`);
} finally {
	refreshFailure = null;
	refreshHold?.release();
	refreshHold = null;

	if (authProxy?.listening) {
		authProxy.closeAllConnections();
		await new Promise((done) => authProxy.close(done));
	}

	for (const child of [...children].reverse()) {
		await stop(child);
	}

	rmSync(temp, { recursive: true, force: true });

	console.log('Disposable HTTP acceptance services and data removed.');
}
