import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engineeringFiles } from '../orchestration/contracts.ts';
import { createDirector, reservation, runWorkflow } from '../orchestration/engine.ts';
import { workflowStore } from '../orchestration/store.ts';
import { engineeringWorker, namespaceAvailable } from './worker.ts';

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== '--live-jev' && arg !== '--probe'))
	throw new Error('Invalid option.');
const live = args[0] === '--live-jev';
const directory =
	process.env.FLIHUB_GUARDRAIL_AUDIT_DIR ?? mkdtempSync(join(tmpdir(), 'flihub-engineering-'));
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
if (!(await namespaceAvailable(directory, abort.signal))) {
	console.error(
		'Required Bubblewrap mount, PID and loopback-only network isolation did not pass. Worker disabled.'
	);
	process.exitCode = 2;
} else if (args[0] === '--probe') {
	console.log(
		'Verified an empty private network, separate PID namespace, read-only mounts and a clean environment.'
	);
} else {
	const key = live ? process.env.TYPESAFE_API_KEY : undefined;
	if (live && !key) throw new Error('Live Jev requires a privately configured credential.');
	const store = workflowStore(directory);
	try {
		const state = store.create(
			{
				objective: 'isolated_engineering',
				files: engineeringFiles,
				operations: ['edit', 'verify'],
				protectedTasks: []
			},
			live ? 'jev' : 'mock',
			{ requests: 15, invocations: 6, spendNanodollars: live ? 15 * reservation : 0 },
			'engineering'
		);
		const result = await runWorkflow(
			store,
			state.id,
			createDirector(state.provider, key),
			engineeringWorker(directory, state.id, state.authorized.files),
			abort.signal
		);
		console.log(JSON.stringify({ directory, ...result }, null, 2));
		if (result.status !== 'complete') process.exitCode = 2;
	} finally {
		store.close();
	}
}
