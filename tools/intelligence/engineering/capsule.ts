import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFileSync, writeFileSync, readdirSync, readlinkSync } from 'node:fs';

const [mode, node, codex, job, approach] = process.argv.slice(2);
const result = (value: unknown) => console.log(JSON.stringify(value));

if (mode === 'probe') {
	let isolated = false;
	try {
		readFileSync('/workspaces/FliHub-3/AGENTS.md');
	} catch {
		isolated = !process.env.TYPESAFE_API_KEY && !process.env.FLIHUB_SECRET_PROBE;
	}
	for (const path of ['/work/unapproved', '/usr/unauthorized']) {
		try {
			writeFileSync(path, 'denied', { flag: 'wx' });
			isolated = false;
		} catch (error) {
			// A pre-existing entry or ordinary file permissions do not prove a read-only mount.
			if ((error as NodeJS.ErrnoException).code !== 'EROFS') isolated = false;
		}
	}
	result({
		isolated,
		networkDevices: Object.keys(networkInterfaces()),
		pidNamespace: readlinkSync('/proc/self/ns/pid'),
		netNamespace: readlinkSync('/proc/self/ns/net')
	});
} else if (mode === 'verify') {
	const run = (args: string[]) =>
		spawnSync(node, args, { cwd: '/work', timeout: 2500, maxBuffer: 32_768 });
	const build = run(['--check', '/work/discount.mjs']);
	const checks = run(['--test', '/harness/acceptance.mjs']);
	const integration = run(['--test', '/work/discount.test.mjs']);
	result({
		build: build.status === 0,
		test: checks.status === 0 && integration.status === 0,
		missing: [build, checks, integration].some((item) => item.status === null)
	});
} else if (mode === 'codex') {
	const target = ['implementation', 'correct_defect', 'reconsider'].includes(job)
		? 'discount.mjs'
		: 'discount.test.mjs';
	const code =
		job === 'implementation'
			? `export const discount = (cents) => Math.round(cents * 0.90);\n`
			: job === 'correct_defect' || job === 'reconsider'
				? `export const discount = (cents) => Math.round(cents * 0.80);\n`
				: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { discount } from './discount.mjs';\n" +
					(job === 'checks'
						? "test('nonnegative', () => assert.ok(discount(100) >= 0));\n"
						: "test('nonnegative', () => assert.ok(discount(100) >= 0));\ntest('zero', () => assert.equal(discount(0), 0));\n");
	const source =
		target === 'discount.mjs' && approach === 'add_fixture'
			? '// Synthetic integer-cent discount\n' + code
			: code;
	const authorizedContext = readdirSync('/work')
		.sort()
		.map((name) => ({
			file: name,
			content: readFileSync('/work/' + name, 'utf8')
		}));
	const server = createServer((req, res) => {
		if (req.method !== 'POST' || req.url !== '/v1/responses') {
			res.writeHead(404).end();
			return;
		}
		let size = 0;
		req.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > 1_000_000) req.destroy();
		});
		req.on('end', () => {
			const item = {
				type: 'message',
				id: 'msg_fixture',
				role: 'assistant',
				status: 'completed',
				content: [
					{ type: 'output_text', text: JSON.stringify({ file: target, source }), annotations: [] }
				]
			};
			const response = { id: 'resp_fixture', object: 'response', created_at: 0, model: 'gpt-5.4' };
			res.writeHead(200, { 'Content-Type': 'text/event-stream' });
			const events = [
				{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
				{ type: 'response.output_item.added', output_index: 0, item },
				{ type: 'response.output_item.done', output_index: 0, item },
				{
					type: 'response.completed',
					response: {
						...response,
						status: 'completed',
						output: [item],
						usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
					}
				}
			];
			res.end(
				events
					.map(
						(event, sequence_number) =>
							'data: ' + JSON.stringify({ ...event, sequence_number }) + '\n\n'
					)
					.join('')
			);
		});
	});
	server.listen(0, '127.0.0.1');
	await new Promise<void>((resolve, reject) => {
		server.once('listening', resolve);
		server.once('error', reject);
	});
	try {
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('No synthetic endpoint.');
		const { execFile } = await import('node:child_process');
		const output = await new Promise<string>((resolve, reject) => {
			const child = execFile(
				codex,
				[
					'-a',
					'never',
					'exec',
					'--ignore-user-config',
					'--ephemeral',
					'--skip-git-repo-check',
					'--json',
					'--sandbox',
					'read-only',
					'-C',
					'/work',
					'-m',
					'gpt-5.4',
					'-c',
					'model_provider="fixture"',
					'-c',
					'web_search="disabled"',
					'-c',
					'model_providers.fixture.name="Capsule fixture"',
					'-c',
					'model_providers.fixture.wire_api="responses"',
					'-c',
					`model_providers.fixture.base_url="http://127.0.0.1:${address.port}/v1"`,
					'-c',
					'model_providers.fixture.request_max_retries=0',
					'-c',
					'model_providers.fixture.stream_max_retries=0',
					'Implement the authorized integer-cent discount fixture as a JSON file proposal. ' +
						'Return only file and source. Task: ' +
						job +
						'. Authorized project context: ' +
						JSON.stringify(authorizedContext)
				],
				{ timeout: 9000, maxBuffer: 131_072 },
				(error, stdout) => (error ? reject(error) : resolve(stdout))
			);
			child.stdin?.end();
		});
		const lines = output
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		if (
			lines.some((event) =>
				['command_execution', 'file_change', 'mcp_tool_call'].includes(event.item?.type)
			) ||
			!lines.some((event) => event.type === 'turn.completed')
		)
			throw new Error('Missing clean turn evidence.');
		const final = lines.filter(
			(event) => event.type === 'item.completed' && event.item?.type === 'agent_message'
		);
		if (final.length !== 1) throw new Error('Missing unique proposal.');
		result(JSON.parse(final[0].item.text));
	} finally {
		server.close();
	}
} else {
	throw new Error('Unsupported capsule mode.');
}
