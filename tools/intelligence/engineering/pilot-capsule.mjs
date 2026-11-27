import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';

if (process.argv[2] === 'probe') {
	for (const name of [
		'TYPESAFE_API_KEY',
		'OPENAI_API_KEY',
		'CODEX_API_KEY',
		'GITHUB_TOKEN',
		'SSH_AUTH_SOCK',
		'CODESPACES_SYNTHETIC_SECRET',
		'FLIHUB_PILOT_ENV_CANARY'
	])
		assert.equal(process.env[name], undefined);
	for (const path of [
		'/home/operator/.codex/auth.json',
		'/home/operator/.git-credentials',
		'/home/operator/.ssh/id_ed25519',
		'/run/docker.sock',
		'/audit/workflows.sqlite',
		'/original/src/lib/tee-times.ts',
		'/persistent/data.db',
		'/bin/sh',
		...process.argv.slice(5)
	])
		assert.throws(() => readFileSync(path), { code: 'ENOENT' });
	assert.notEqual(readlinkSync('/proc/self/ns/pid'), process.argv[3]);
	assert.notEqual(readlinkSync('/proc/self/ns/net'), process.argv[4]);
	assert.deepEqual(Object.keys(networkInterfaces()), ['lo']);
	const workMount = readFileSync('/proc/self/mountinfo', 'utf8')
		.split('\n')
		.map((line) => line.split(' '))
		.find((fields) => fields[4] === '/work');
	assert.ok(workMount?.[5].split(',').includes('ro'));
	assert.throws(() => writeFileSync('/work/pilot-capsule.mjs', 'tampered'), {
		code: 'ERR_ACCESS_DENIED'
	});
	assert.throws(() => spawnSync('/node', ['--version']), { code: 'ERR_ACCESS_DENIED' });
	await new Promise((resolve, reject) => {
		const socket = connect(443, '192.0.2.1');
		socket.once('connect', () => {
			socket.destroy();
			reject(new Error('Unexpected network route.'));
		});
		socket.once('error', (error) => {
			if ('code' in error && error.code === 'ENETUNREACH') resolve(undefined);
			else reject(error);
		});
	});
	for (const path of process.argv.slice(5).filter((item) => item.endsWith('/docker.sock'))) {
		await new Promise((resolve, reject) => {
			const socket = connect(path);
			socket.once('connect', () => {
				socket.destroy();
				reject(new Error('Unexpected host socket.'));
			});
			socket.once('error', (error) => {
				if ('code' in error && error.code === 'ENOENT') resolve(undefined);
				else reject(error);
			});
		});
	}
	console.log('pilot-isolated-v1');
} else {
	const ts = createRequire(import.meta.url)('./node_modules/typescript/lib/typescript.js');
	const program = ts.createProgram(['/work/tee-times.ts'], {
		strict: true,
		noEmit: true,
		types: [],
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		lib: [
			'lib.es5.d.ts',
			'lib.es2015.core.d.ts',
			'lib.es2017.intl.d.ts',
			'lib.es2017.string.d.ts',
			'lib.es2020.intl.d.ts'
		]
	});
	if (ts.getPreEmitDiagnostics(program).length) {
		console.log('pilot-types-failed-v1');
		process.exit(4);
	}
	// Dynamic import keeps the preflight independent of candidate code.
	const candidate = new URL('./tee-times.ts', import.meta.url).href;
	const { teeLocal, generateTeeTimes, toTeeInstant } = await import(candidate);
	const preserve = [
		teeLocal('1000-01-02T03:04:00Z', 'UTC') === '1000-01-02T03:04',
		teeLocal('2027-06-06T07:10:00Z', 'America/Phoenix') === '2027-06-06T00:10',
		JSON.stringify(generateTeeTimes('2027-06-05T23:55', 15, 2, 'America/Phoenix')) ===
			'["2027-06-06T06:55:00.000Z","2027-06-06T07:10:00.000Z"]'
	];
	assert.ok(preserve.every(Boolean));
	for (const instant of ['2027-03-14T02:30', '2027-11-07T01:30'])
		assert.throws(() => toTeeInstant(instant, 'America/Los_Angeles'));
	for (const interval of [0, -1, 1.5, 241])
		assert.throws(() => generateTeeTimes('2027-06-05T09:00', interval, 2, 'UTC'));
	assert.throws(() => toTeeInstant('2027-02-30T09:00', 'UTC'));
	assert.throws(() => toTeeInstant('2027-06-05T09:00', 'invalid'));
	const padded =
		teeLocal('0001-01-02T03:04:00Z', 'UTC') === '0001-01-02T03:04' &&
		teeLocal('0999-12-31T23:59:00Z', 'UTC') === '0999-12-31T23:59';
	if (padded) console.log('pilot-pass-v1');
	else {
		console.log('pilot-year-padding-failed-v1');
		process.exitCode = 3;
	}
}
