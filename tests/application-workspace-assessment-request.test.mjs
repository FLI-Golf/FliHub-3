import assert from 'node:assert/strict';
import test from 'node:test';

import { parseWorkspaceAssessmentRequest } from '../src/lib/server/intelligence/workspace/assessment-request.ts';

import { workspaceLimits } from '../src/lib/server/intelligence/workspace/sessions.ts';

const origin = 'https://workspace.example';

const valid = {
	mode: 'registered',
	objective: 'prepare_tournament',
	fixtureId: 'spring_invitational',
	actorId: 'synthetic-actor-owner'
};

function encode(fields = valid) {
	return new URLSearchParams(fields).toString();
}

function request(body = encode(), headers = {}, method = 'POST') {
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

function streamed(body, headers = {}) {
	return new Request(origin, {
		method: 'POST',
		headers: {
			origin,
			'content-type': 'application/x-www-form-urlencoded',
			...headers
		},
		body,
		duplex: 'half'
	});
}

async function reject(req, code, deadline) {
	assert.deepEqual(await parseWorkspaceAssessmentRequest(req, origin, deadline), {
		status: 'invalid',
		code
	});
}

test('registered objective request is accepted', async () => {
	const result = await parseWorkspaceAssessmentRequest(request(), origin);

	assert.deepEqual(result, {
		status: 'valid',
		input: valid
	});

	assert.equal(Object.isFrozen(result.input), true);
});

test('natural-language objective is decoded correctly', async () => {
	const fields = {
		...valid,
		mode: 'natural',
		objective: 'Help me prepare our next tournament.'
	};

	const result = await parseWorkspaceAssessmentRequest(request(encode(fields)), origin);

	assert.deepEqual(result, {
		status: 'valid',
		input: fields
	});
});

test('empty objective remains available for clarification', async () => {
	const result = await parseWorkspaceAssessmentRequest(
		request(
			encode({
				...valid,
				mode: 'natural',
				objective: ''
			})
		),
		origin
	);

	assert.equal(result.status, 'valid');
	assert.equal(result.input.objective, '');
});

test('field ordering does not affect validation', async () => {
	const body = new URLSearchParams(Object.entries(valid).reverse()).toString();

	const result = await parseWorkspaceAssessmentRequest(request(body), origin);

	assert.deepEqual(result.input, valid);
});

test('unsupported HTTP methods are rejected', async () => {
	await reject(request('', {}, 'GET'), 405);
});

test('foreign and opaque origins are rejected', async () => {
	for (const value of ['https://foreign.example', 'http://workspace.example', 'null']) {
		await reject(request(encode(), { origin: value }), 403);
	}
});

test('missing origin is rejected', async () => {
	const req = request();
	req.headers.delete('origin');

	await reject(req, 403);
});

test('unsupported content types are rejected', async () => {
	for (const value of ['application/json', 'text/plain', 'multipart/form-data']) {
		await reject(request(encode(), { 'content-type': value }), 415);
	}
});

test('URL-encoded content type accepts UTF-8 parameter', async () => {
	const result = await parseWorkspaceAssessmentRequest(
		request(encode(), {
			'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
		}),
		origin
	);

	assert.equal(result.status, 'valid');
});

test('missing content type is rejected', async () => {
	const req = request();
	req.headers.delete('content-type');

	await reject(req, 415);
});

test('missing required fields are rejected', async () => {
	for (const field of Object.keys(valid)) {
		const fields = { ...valid };
		delete fields[field];

		await reject(request(encode(fields)), 400);
	}
});

test('duplicate fields are rejected', async () => {
	for (const field of Object.keys(valid)) {
		await reject(request(`${encode()}&${field}=duplicate`), 400);
	}
});

test('encoded duplicate field names are rejected', async () => {
	await reject(request(`${encode()}&%6Dode=natural`), 400);
});

test('unexpected and privileged fields are rejected', async () => {
	for (const field of [
		'owner',
		'userId',
		'sessionId',
		'approval',
		'execute',
		'provider',
		'apiKey',
		'__proto__',
		'constructor'
	]) {
		await reject(request(`${encode()}&${field}=unexpected`), 400);
	}
});

test('malformed percent encoding is rejected', async () => {
	for (const value of ['%', '%GG', '%C0%AF', '%FF', '%ED%A0%80', '%E2%82']) {
		const body = encode().replace('prepare_tournament', value);

		await reject(request(body), 400);
	}
});

test('malformed field separators are rejected', async () => {
	for (const body of [
		'',
		`${encode()}&`,
		`&${encode()}`,
		`${encode()}&&`,
		`${encode()}&missingEquals`,
		`${encode()}&=value`
	]) {
		await reject(request(body), 400);
	}
});

test('unsupported objective modes are rejected', async () => {
	for (const mode of ['', 'live', 'execute', 'REGISTERED']) {
		await reject(request(encode({ ...valid, mode })), 400);
	}
});

test('objective length boundary is enforced', async () => {
	const fields = {
		...valid,
		mode: 'natural',
		objective: 'a'.repeat(256)
	};

	const result = await parseWorkspaceAssessmentRequest(request(encode(fields)), origin);

	assert.equal(result.status, 'valid');

	await reject(
		request(
			encode({
				...fields,
				objective: 'a'.repeat(257)
			})
		),
		400
	);
});

test('invalid scenario identifiers are rejected', async () => {
	for (const fixtureId of ['', '../spring', 'Spring Invitational', 'a'.repeat(65), '__proto__']) {
		await reject(request(encode({ ...valid, fixtureId })), 400);
	}
});

test('invalid actor identifiers are rejected', async () => {
	for (const actorId of ['', '../owner', 'OWNER', 'synthetic_actor_owner', 'a'.repeat(65)]) {
		await reject(request(encode({ ...valid, actorId })), 400);
	}
});

test('registry membership remains the advisory layer responsibility', async () => {
	const result = await parseWorkspaceAssessmentRequest(
		request(
			encode({
				...valid,
				fixtureId: 'unknown_scenario',
				actorId: 'unknown-actor'
			})
		),
		origin
	);

	assert.equal(result.status, 'valid');
});

test('oversized declared body is rejected', async () => {
	await reject(
		request(encode(), {
			'content-length': String(workspaceLimits.bodyBytes + 1)
		}),
		413
	);
});

test('oversized actual body is rejected', async () => {
	await reject(request('x'.repeat(workspaceLimits.bodyBytes + 1)), 413);
});

test('malformed declared lengths are rejected', async () => {
	for (const length of ['-1', '1.5', 'unknown', '1,2']) {
		await reject(request(encode(), { 'content-length': length }), 400);
	}
});

test('declared and actual length must match', async () => {
	const body = encode();

	for (const length of [Buffer.byteLength(body) - 1, Buffer.byteLength(body) + 1]) {
		await reject(
			request(body, {
				'content-length': String(length)
			}),
			400
		);
	}
});

test('valid declared body length is accepted', async () => {
	const body = encode();

	const result = await parseWorkspaceAssessmentRequest(
		request(body, {
			'content-length': String(Buffer.byteLength(body))
		}),
		origin
	);

	assert.equal(result.status, 'valid');
});

test('invalid raw UTF-8 is rejected', async () => {
	await reject(request(new Uint8Array([255, 254])), 400);
});

test('UTF-8 byte order mark is rejected', async () => {
	const body = new TextEncoder().encode('\uFEFF' + encode());

	await reject(request(body), 400);
});

test('already consumed request body is rejected', async () => {
	const req = request();

	await req.text();

	await reject(req, 400);
});

test('locked request body is rejected', async () => {
	const req = request();
	const reader = req.body.getReader();

	try {
		await reject(req, 400);
	} finally {
		reader.releaseLock();
	}
});

test('valid streaming request is accepted across chunks', async () => {
	const bytes = new TextEncoder().encode(encode());

	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(bytes.subarray(0, 17));
			controller.enqueue(bytes.subarray(17));
			controller.close();
		}
	});

	const result = await parseWorkspaceAssessmentRequest(streamed(body), origin);

	assert.deepEqual(result.input, valid);
});

test('streaming byte limit applies across chunks', async () => {
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(4096));
			controller.enqueue(new Uint8Array(4096));
			controller.enqueue(new Uint8Array(1));
			controller.close();
		}
	});

	await reject(streamed(body), 413);
});

test('stalled streaming body is cancelled', async () => {
	let cancelled = false;

	const body = new ReadableStream({
		cancel() {
			cancelled = true;
		}
	});

	await reject(streamed(body), 408, 20);

	assert.equal(cancelled, true);
});

test('partial body cannot bypass total reading deadline', async () => {
	let cancelled = false;

	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('mode=registered&'));
		},
		cancel() {
			cancelled = true;
		}
	});

	await reject(streamed(body), 408, 20);

	assert.equal(cancelled, true);
});

test('stream errors produce sanitized rejection', async () => {
	const body = new ReadableStream({
		start(controller) {
			controller.error(new Error('PRIVATE_STREAM_ERROR'));
		}
	});

	await reject(streamed(body), 400);
});
