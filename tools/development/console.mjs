import { runCompletionReportImport } from './completion-report.mjs';
import { runAssignmentBuilder } from './assignment-builder.mjs';
import { runPilotConsole } from './pilot-console.mjs';
import { engineeringFiles } from '../intelligence/orchestration/contracts.ts';
import { engineeringWorker } from '../intelligence/engineering/worker.ts';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { command, createDirector, runWorkflow } from '../intelligence/orchestration/engine.ts';
import { workflowStore, workflowSummary } from '../intelligence/orchestration/store.ts';
import { fixtureWorker } from '../intelligence/orchestration/fixture-worker.ts';
import { mockWorker } from '../intelligence/orchestration/worker.ts';

const directory =
	process.env.FLIHUB_GUARDRAIL_AUDIT_DIR ?? join(homedir(), '.flihub-dev-guardrail');
const print = (value) => console.log(JSON.stringify(value, null, 2));

if (!process.stdin.isTTY) {
	console.error('jev:develop requires an interactive terminal. Use the offline demo for scripts.');
	process.exitCode = 2;
} else {
	const io = createInterface({ input: process.stdin, output: process.stdout });
	let active;
	io.on('SIGINT', () => {
		if (active) active.abort();
		else io.close();
	});
	async function run(store, state) {
		if (state.provider !== 'mock' || state.status !== 'active') return print(state);
		active = new AbortController();
		try {
			const worker =
				state.worker === 'engineering'
					? engineeringWorker(directory, state.id, state.authorized.files, state.checkpoint)
					: state.worker === 'fixture'
						? fixtureWorker(
								directory,
								state.id,
								state.authorized.files,
								state.checkpoint,
								state.localFixturePort
							)
						: mockWorker;
			print(await runWorkflow(store, state.id, createDirector('mock'), worker, active.signal));
		} finally {
			active = undefined;
		}
	}
	try {
		while (true) {
			const action = (
				await io.question(
					'\n1 New objective  2 Inspect or control  3 History  4 Usage  5 Exit  6 Isolated engineering exercise  7 Offline FliHub pilot  8 Development Assignment Builder  9 Import completion report\n> '
				)
			).trim();
			if (action === '5') break;
			if (action === '3' || action === '4') {
				const summary = workflowSummary(directory);
				print(
					action === '3'
						? summary
						: summary.workflows.map(({ id, provider, requests, spent }) => ({
								id,
								provider,
								requests,
								estimatedUsd: spent / 1e9
							}))
				);
				continue;
			}
			if (action === '8' || action === '9') {
				active = new AbortController();
				try {
					const runConsole = action === '8' ? runAssignmentBuilder : runCompletionReportImport;
					await runConsole({
						question: (prompt) => io.question(prompt, { signal: active.signal }),
						print: console.log,
						repository: process.cwd(),
						signal: active.signal
					});
				} finally {
					active = undefined;
				}
			} else if (action === '7') {
				active = new AbortController();
				try {
					await runPilotConsole({
						question: (prompt) => io.question(prompt, { signal: active.signal }),
						print,
						directory,
						repository: process.cwd(),
						signal: active.signal
					});
				} catch {
					if (active.signal.aborted) print('Pilot cancelled.');
					else print('Pilot could not finish. Inspect its checkpoint before starting another run.');
				} finally {
					active = undefined;
				}
			} else if (action === '6') {
				console.log(
					'Disposable discount source and test exercise. Scope: discount.mjs and discount.test.mjs in a private workspace. Operations: edit and verify. Independent build/tests required. One correction. At most 15 mock decisions and six worker jobs. No paid usage.'
				);
				if ((await io.question('Enter authorize to approve this scope: ')).trim() !== 'authorize')
					continue;
				const store = workflowStore(directory);
				try {
					const state = store.create(
						{
							objective: 'isolated_engineering',
							files: engineeringFiles,
							operations: ['edit', 'verify'],
							protectedTasks: []
						},
						'mock',
						{ requests: 15, invocations: 6, spendNanodollars: 0 },
						'engineering'
					);
					console.log('Workflow ID ' + state.id);
					await run(store, state);
				} finally {
					store.close();
				}
			} else if (action === '1') {
				console.log(
					'Synthetic objective only. The host fixture worker may edit implementation.txt and checks.txt in a private fixture directory, then independently check syntax and behavior.'
				);
				console.log(
					'Mock provider. No paid usage. Limits: five minutes, 20 decisions, 10 worker invocations, 10 iterations, one correction and two fixture files.'
				);
				if (
					(
						await io.question('Authorize these fixture operations by entering authorize: ')
					).trim() !== 'authorize'
				)
					continue;
				const port = (
					await io.question(
						'Optional trusted localhost synthetic Codex endpoint port (blank uses host fixture worker): '
					)
				).trim();
				if (port && (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)) {
					console.log('Invalid port.');
					continue;
				}
				const localPort = port ? Number(port) : undefined;
				const store = workflowStore(directory);
				try {
					const state = store.create(
						{
							objective: 'synthetic_development',
							files: ['implementation.txt', 'checks.txt'],
							operations: ['edit', 'verify'],
							protectedTasks: []
						},
						'mock',
						{ spendNanodollars: 0 },
						'fixture',
						localPort
					);
					console.log('Workflow ID ' + state.id);
					await run(store, state);
				} finally {
					store.close();
				}
			} else if (action === '2') {
				const id = (await io.question('Workflow ID: ')).trim();
				const operation = (await io.question('inspect, pause, resume, approve or cancel: ')).trim();
				if (!['inspect', 'pause', 'resume', 'approve', 'cancel'].includes(operation)) continue;
				if (!workflowSummary(directory).ready) {
					console.log('Workflow storage is not initialized.');
					continue;
				}
				const store = workflowStore(directory);
				try {
					const existing = store.get(id);
					if (!existing && operation === 'inspect') {
						const pilot = store.getPilot(id);
						if (pilot) {
							print({ mode: 'offline-fixture', ...pilot });
							continue;
						}
					}
					if (!existing) {
						console.log('Unknown workflow.');
						continue;
					}
					if (operation === 'inspect') {
						print(existing);
						continue;
					}
					if (
						(operation === 'resume' || operation === 'approve') &&
						(await io.question('Enter authorize to confirm this operation: ')).trim() !==
							'authorize'
					)
						continue;
					const state = command(store, id, operation);
					if ((operation === 'resume' || operation === 'approve') && !state.pending)
						await run(store, state);
					else print(state);
				} finally {
					store.close();
				}
			}
		}
	} catch (error) {
		if (error.code !== 'ERR_USE_AFTER_CLOSE') {
			console.error(error.message);
			process.exitCode = 1;
		}
	} finally {
		io.close();
	}
}
