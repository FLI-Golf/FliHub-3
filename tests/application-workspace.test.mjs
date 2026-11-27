import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceAccess } from '../src/lib/server/intelligence/workspace/access.ts';
import {
	createWorkspaceSessions,
	workspaceLimits
} from '../src/lib/server/intelligence/workspace/sessions.ts';
import { validateWorkspaceRequest } from '../src/lib/server/intelligence/workspace/requests.ts';

const owner = 'aaaaaaaaaaaaaaa';
const other = 'bbbbbbbbbbbbbbb';

const validAccess = {
	development: true,
	enabled: 'true',
	allowedUserIds: owner,
	userId: owner,
	sessionVerified: true
};

test('explicit development access is accepted', () => {
	assert.deepEqual(workspaceAccess(validAccess), {
		allowed: true,
		userId: owner
	});
});

test('production cannot enable workspace access', () => {
	assert.deepEqual(workspaceAccess({ ...validAccess, development: false }), {
		allowed: false,
		status: 404
	});
});

test('disabled and malformed configuration fails closed', () => {
	for (const patch of [
		{ enabled: undefined },
		{ enabled: 'false' },
		{ enabled: 'TRUE' },
		{ allowedUserIds: undefined },
		{ allowedUserIds: '' },
		{ allowedUserIds: '*' },
		{ allowedUserIds: `${owner},` },
		{ allowedUserIds: `${owner},${owner}` }
	]) {
		assert.deepEqual(workspaceAccess({ ...validAccess, ...patch }), {
			allowed: false,
			status: 404
		});
	}
});

test('fresh authentication is required', () => {
	for (const patch of [{ sessionVerified: false }, { userId: null }]) {
		assert.deepEqual(workspaceAccess({ ...validAccess, ...patch }), {
			allowed: false,
			status: 401
		});
	}
});

test('authenticated users outside the allowlist are denied', () => {
	assert.deepEqual(workspaceAccess({ ...validAccess, userId: other }), {
		allowed: false,
		status: 403
	});
});

test('session ownership isolates accounts', () => {
	const store = createWorkspaceSessions();
	const result = store.start(owner);
	assert.ok(result);
	assert.equal(result.id.length, 64);
	assert.ok(store.read(owner, result.id));
	assert.equal(store.read(other, result.id), null);
	assert.equal(store.close(other, result.id), false);
	assert.ok(store.read(owner, result.id));
});

test('session views do not expose ownership or internal identifiers', () => {
	const store = createWorkspaceSessions();
	const result = store.start(owner);
	assert.deepEqual(Object.keys(result.session).sort(), [
		'absoluteExpiresAt',
		'createdAt',
		'idleExpiresAt'
	]);
	result.session.createdAt = -1;
	assert.notEqual(store.read(owner, result.id).createdAt, -1);
});

test('starting an existing session does not create another session', () => {
	const store = createWorkspaceSessions();
	const first = store.start(owner);
	const second = store.start(owner, first.id);
	assert.equal(first.id, second.id);
	assert.deepEqual(first.session, second.session);
});

test('per-user capacity is enforced', () => {
	const store = createWorkspaceSessions();
	assert.ok(store.start(owner));
	assert.ok(store.start(owner));
	assert.equal(store.start(owner), null);
	assert.ok(store.start(other));
});

test('global capacity is enforced', () => {
	const store = createWorkspaceSessions();

	for (let index = 0; index < workspaceLimits.maxSessions; index++) {
		assert.ok(store.start(`user-${index}`));
	}

	assert.equal(store.start('overflow'), null);
});

test('closing a session prevents reuse', () => {
	const store = createWorkspaceSessions();
	const result = store.start(owner);
	assert.equal(store.close(owner, result.id), true);
	assert.equal(store.read(owner, result.id), null);
	assert.equal(store.close(owner, result.id), false);
});

test('idle expiration discards sessions and releases capacity', () => {
	let time = 1000;
	const store = createWorkspaceSessions(() => time);
	const first = store.start(owner);
	const second = store.start(owner);
	time += workspaceLimits.idleMs;
	assert.equal(store.read(owner, first.id), null);
	assert.equal(store.read(owner, second.id), null);
	assert.ok(store.start(owner));
});

test('restart cannot recover previous process-local sessions', () => {
	const first = createWorkspaceSessions().start(owner);
	assert.equal(createWorkspaceSessions().read(owner, first.id), null);
});

test('foreign session selectors cannot transfer ownership', () => {
	const store = createWorkspaceSessions();
	const first = store.start(owner);
	const second = store.start(other, first.id);
	assert.notEqual(first.id, second.id);
	assert.equal(store.read(other, first.id), null);
	assert.equal(store.read(owner, second.id), null);
});

const origin = 'https://workspace.example';

function request(headers = {}, body = '', method = 'POST') {
	return new Request(origin, {
		method,
		headers: {
			origin,
			'content-type': 'application/x-www-form-urlencoded',
			...headers
		},
		...(method === 'POST' ? { body } : {})
	});
}

test('empty same-origin session requests are accepted', async () => {
	assert.equal(await validateWorkspaceRequest(request(), origin), null);
});

test('unsupported methods are rejected', async () => {
	assert.equal(await validateWorkspaceRequest(request({}, '', 'GET'), origin), 405);
});

test('foreign, opaque and missing origins are rejected', async () => {
	for (const value of ['https://other.example', 'null', 'http://workspace.example']) {
		assert.equal(await validateWorkspaceRequest(request({ origin: value }), origin), 403);
	}

	assert.equal(
		await validateWorkspaceRequest(new Request(origin, { method: 'POST' }), origin),
		403
	);
});

test('unsupported content types are rejected', async () => {
	assert.equal(
		await validateWorkspaceRequest(request({ 'content-type': 'application/json' }), origin),
		415
	);
});

test('unexpected form fields are rejected', async () => {
	for (const body of ['owner=other', 'id=123&id=456', 'approve=true']) {
		assert.equal(await validateWorkspaceRequest(request({}, body), origin), 400);
	}
});

test('oversized declared and actual bodies are rejected', async () => {
	assert.equal(await validateWorkspaceRequest(request({ 'content-length': '8193' }), origin), 413);

	assert.equal(await validateWorkspaceRequest(request({}, 'x'.repeat(8193)), origin), 413);
});

test('closing sessions cannot bypass per-user admission limits', () => {
	let time = 1000;
	const store = createWorkspaceSessions(() => time);

	for (let index = 0; index < workspaceLimits.maxStartsPerUserPerWindow; index++) {
		const result = store.start(owner);
		assert.ok(result);
		assert.equal(store.close(owner, result.id), true);
	}

	assert.equal(store.start(owner), null);
	assert.ok(store.start(other));

	time += workspaceLimits.admissionWindowMs;
	assert.ok(store.start(owner));
});

test('global admission limits survive session closure', () => {
	let time = 1000;
	const store = createWorkspaceSessions(() => time);

	for (let index = 0; index < workspaceLimits.maxStartsPerWindow; index++) {
		const user = `synthetic-user-${index}`;
		const result = store.start(user);
		assert.ok(result);
		assert.equal(store.close(user, result.id), true);
	}

	assert.equal(store.start('overflow'), null);

	time += workspaceLimits.admissionWindowMs;
	assert.ok(store.start('overflow'));
});

test('reusing an existing session does not consume new admissions', () => {
	const store = createWorkspaceSessions();
	const first = store.start(owner);
	assert.ok(first);

	for (let index = 0; index < 100; index++) {
		assert.equal(store.start(owner, first.id).id, first.id);
	}

	assert.ok(store.start(owner));
});

test('session reads do not extend the idle expiration', () => {
	let time = 1000;
	const store = createWorkspaceSessions(() => time);
	const result = store.start(owner);
	assert.ok(result);

	time += workspaceLimits.idleMs - 1;

	assert.ok(store.read(owner, result.id));

	time += 1;

	assert.equal(store.read(owner, result.id), null);
});

test('malformed session selectors cannot access or close a session', () => {
	const store = createWorkspaceSessions();
	const result = store.start(owner);
	assert.ok(result);

	for (const selector of ['', 'not-a-session', 'a'.repeat(65), '../session', 'F'.repeat(64)]) {
		assert.equal(store.read(owner, selector), null);
		assert.equal(store.close(owner, selector), false);
	}

	assert.ok(store.read(owner, result.id));
});

test('stalled request bodies are rejected and cancelled', async () => {
	let cancelled = false;

	const body = new ReadableStream({
		cancel() {
			cancelled = true;
		}
	});

	const stalled = new Request(origin, {
		method: 'POST',
		headers: {
			origin,
			'content-type': 'application/x-www-form-urlencoded'
		},
		body,
		duplex: 'half'
	});

	assert.equal(await validateWorkspaceRequest(stalled, origin, 20), 408);

	assert.equal(cancelled, true);
});

test('streaming form fields are rejected without full buffering', async () => {
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('owner=other'));
			controller.close();
		}
	});

	const streamed = new Request(origin, {
		method: 'POST',
		headers: {
			origin,
			'content-type': 'application/x-www-form-urlencoded'
		},
		body,
		duplex: 'half'
	});

	assert.equal(await validateWorkspaceRequest(streamed, origin, 100), 400);
});

test('malformed declared body lengths are rejected', async () => {
	for (const length of ['-1', '1.5', 'unknown', '1,2']) {
		assert.equal(
			await validateWorkspaceRequest(request({ 'content-length': length }), origin),
			400
		);
	}
});

test('owner revocation invalidates all sessions belonging to that owner', () => {
	const store = createWorkspaceSessions();

	const first = store.start(owner);
	const second = store.start(owner);
	const unrelated = store.start(other);

	assert.equal(store.revokeOwner(owner), 2);
	assert.equal(store.read(owner, first.id), null);
	assert.equal(store.read(owner, second.id), null);
	assert.ok(store.read(other, unrelated.id));
	assert.equal(store.revokeOwner(owner), 0);
});

test('allowlist changes revoke excluded owners without affecting retained owners', () => {
	const store = createWorkspaceSessions();

	const first = store.start(owner);
	const second = store.start(other);

	assert.equal(store.revokeExcept(new Set([owner])), 1);
	assert.ok(store.read(owner, first.id));
	assert.equal(store.read(other, second.id), null);
});

test('disabling the workspace invalidates every existing session', () => {
	const store = createWorkspaceSessions();

	const first = store.start(owner);
	const second = store.start(other);

	assert.equal(store.revokeExcept(new Set()), 2);
	assert.equal(store.read(owner, first.id), null);
	assert.equal(store.read(other, second.id), null);
});

test('revocation does not reset admission limits', () => {
	const store = createWorkspaceSessions();

	for (let index = 0; index < workspaceLimits.maxStartsPerUserPerWindow; index++) {
		assert.ok(store.start(owner));
		store.revokeOwner(owner);
	}

	assert.equal(store.start(owner), null);
});

test('revoked session identifiers cannot recover discarded state', () => {
	const store = createWorkspaceSessions();

	const original = store.start(owner);
	store.revokeOwner(owner);

	const replacement = store.start(owner, original.id);

	assert.ok(replacement);
	assert.notEqual(original.id, replacement.id);
	assert.equal(store.read(owner, original.id), null);
});

test('access configuration and revocation policy agree', async () => {
	const { workspaceAllowedOwners } =
		await import('../src/lib/server/intelligence/workspace/access.ts');

	assert.deepEqual([...workspaceAllowedOwners(validAccess)], [owner]);

	for (const patch of [
		{ development: false },
		{ enabled: 'false' },
		{ allowedUserIds: '' },
		{ allowedUserIds: '*' },
		{ allowedUserIds: `${owner},${owner}` }
	]) {
		assert.equal(workspaceAllowedOwners({ ...validAccess, ...patch }).size, 0);
	}
});

test('small invalid request bodies are consumed without cancellation', async () => {
	let cancelled = false;

	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('invalid=true'));
			controller.close();
		},
		cancel() {
			cancelled = true;
		}
	});

	const streamed = new Request(origin, {
		method: 'POST',
		headers: {
			origin,
			'content-type': 'application/x-www-form-urlencoded'
		},
		body,
		duplex: 'half'
	});

	assert.equal(await validateWorkspaceRequest(streamed, origin, 100), 400);

	assert.equal(cancelled, false);
});

test('streaming body limit applies across multiple chunks', async () => {
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(4096));
			controller.enqueue(new Uint8Array(4096));
			controller.enqueue(new Uint8Array(1));
			controller.close();
		}
	});

	const streamed = new Request(origin, {
		method: 'POST',
		headers: {
			origin,
			'content-type': 'application/x-www-form-urlencoded'
		},
		body,
		duplex: 'half'
	});

	assert.equal(await validateWorkspaceRequest(streamed, origin, 100), 413);
});
