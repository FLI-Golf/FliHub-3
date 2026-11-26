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

async function postChunkedAssessment(base, cookie, chunks, stalled = false) {
	return new Promise((resolve, reject) => {
		const startedAt = Date.now();

		const request = httpRequest(
			`${base}${workspacePath}?/assess`,
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
	for (const port of [8198, 8199, 5274, 5275]) {
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

	authProxy = createAuthorizationProxy();
	authProxy.listen(8199, '127.0.0.1');
	await once(authProxy, 'listening');

	const proxyHealth = await requestHttp(`${authProxyUrl}/api/health`);

	assert.equal(proxyHealth.status, 200);

	pass('Disposable authorization proxy available');

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

	pass('Production rejects workspace even with explicit enablement');

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
