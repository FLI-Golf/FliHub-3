import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start, status, stop } from '../tools/development/services.mjs';
import { fixtureWorker } from '../tools/intelligence/orchestration/fixture-worker.ts';
import { createDirector, runWorkflow } from '../tools/intelligence/orchestration/engine.ts';
import { workflowStore } from '../tools/intelligence/orchestration/store.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'flihub-unified-test-'));
const auth = {
	objective: 'synthetic_development',
	files: ['implementation.txt', 'checks.txt'],
	operations: ['edit', 'verify'],
	protectedTasks: []
};

test('host-mediated fixture workflow changes only the two authorized files and records independent checks', async () => {
	const root = dir();
	const store = workflowStore(root);
	try {
		const state = store.create(auth, 'mock', {}, 'fixture');
		const result = await runWorkflow(
			store,
			state.id,
			createDirector('mock'),
			fixtureWorker(root, state.id, state.authorized.files)
		);
		assert.equal(result.status, 'complete');
		assert.equal(
			result.events.some((event) => event.category === 'test' && event.value === 'fail'),
			true
		);
		assert.equal(
			result.events.some((event) => event.category === 'test' && event.value === 'pass'),
			true
		);
		assert.equal(
			result.events.some((event) => event.category === 'build' && event.value === 'pass'),
			true
		);
		assert.equal(
			readFileSync(join(root, 'fixture-' + state.id, 'implementation.txt'), 'utf8'),
			'export const answer = 42;\n'
		);
	} finally {
		store.close();
	}
});

test('fixture worker rejects unauthorized targets, symlinks and changes between checkpoints', async () => {
	const root = dir();
	const store = workflowStore(root);
	try {
		const state = store.create(auth, 'mock');
		const restricted = fixtureWorker(root, state.id, ['checks.txt']);
		const signal = new AbortController().signal;
		assert.equal(
			(await restricted.execute('implementation', signal, false)).evidence,
			'unexpected'
		);
		const first = await restricted.execute('checks', signal, false);
		assert.equal(first.evidence, 'pass');
		writeFileSync(join(root, 'fixture-' + state.id, 'checks.txt'), 'expected=42\nintegrated=yes\n');
		assert.equal((await restricted.execute('integration', signal, false)).evidence, 'unexpected');
		const second = store.create(auth, 'mock');
		const worker = fixtureWorker(root, second.id, auth.files);
		const outside = join(root, 'outside');
		writeFileSync(outside, 'preserved');
		symlinkSync(outside, join(root, 'fixture-' + second.id, 'implementation.txt'));
		assert.equal((await worker.execute('implementation', signal, false)).evidence, 'unexpected');
		assert.equal(readFileSync(outside, 'utf8'), 'preserved');
	} finally {
		store.close();
	}
});

async function reservePort() {
	const socket = createServer();
	await new Promise((resolve, reject) => {
		socket.once('error', reject);
		socket.listen(0, '127.0.0.1', resolve);
	});
	return socket;
}

test('managed services recognize existing workers, recover partial starts and preserve data on stop', async () => {
	const root = dir();
	const reserved = await reservePort();
	const port = reserved.address().port;
	await new Promise((resolve) => reserved.close(resolve));
	const script = join(root, 'service.mjs');
	writeFileSync(
		script,
		`import {createServer} from 'node:http';
		createServer((_request,response)=>response.end(process.env.TYPESAFE_API_KEY ? 'leaked' : 'healthy'))
			.listen(${port},'127.0.0.1');`
	);
	const good = {
		name: 'fixture',
		ports: [port],
		url: 'http://127.0.0.1:' + port,
		path: '/',
		valid: (body) => body === 'healthy',
		command: process.execPath,
		args: [script]
	};
	const bad = {
		...good,
		name: 'broken',
		url: 'http://127.0.0.1:1',
		ports: [1],
		command: '/missing-fixture-command'
	};
	const sentinel = join(root, 'persistent-data');
	writeFileSync(sentinel, 'retain');
	try {
		assert.equal((await status(root, [good])).services[0].ready, false);
		assert.equal(existsSync(join(root, 'services.json')), false);
		await assert.rejects(start(root, [good, bad], 2000), /broken failed readiness/);
		const first = (await status(root, [good])).services[0];
		assert.equal(first.ready, true);
		assert.equal(first.owned, true);
		await start(root, [good], 2000);
		assert.equal((await status(root, [good])).services[0].pid, first.pid);
		const independentDirectory = dir();
		await start(independentDirectory, [good], 2000);
		assert.equal((await status(independentDirectory, [good])).services[0].owned, false);
		await stop(independentDirectory, [good]);
		assert.equal((await status(root, [good])).services[0].ready, true);
	} finally {
		await stop(root, [good]);
	}
	assert.equal((await status(root, [good])).services[0].ready, false);
	assert.equal(readFileSync(sentinel, 'utf8'), 'retain');
});
