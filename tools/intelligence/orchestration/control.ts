import { engineeringWorker } from '../engineering/worker.ts';
import { fixtureWorker } from './fixture-worker.ts';
import { command, createDirector, runWorkflow } from './engine.ts';
import { workflowStore } from './store.ts';
import { mockWorker } from './worker.ts';

const [action, id] = process.argv.slice(2);
const directory = process.env.FLIHUB_GUARDRAIL_AUDIT_DIR;
if (
	!directory ||
	!/^[a-f0-9-]{36}$/.test(id ?? '') ||
	(action !== 'inspect' &&
		action !== 'pause' &&
		action !== 'resume' &&
		action !== 'approve' &&
		action !== 'cancel')
) {
	throw new Error(
		'Set FLIHUB_GUARDRAIL_AUDIT_DIR and supply inspect|pause|resume|approve|cancel and the workflow ID.'
	);
}
const store = workflowStore(directory);
try {
	let state = store.get(id);
	if (!state) throw new Error('Unknown workflow.');
	if (action !== 'inspect') state = command(store, id, action);
	if (
		(action === 'resume' || action === 'approve') &&
		state?.status === 'active' &&
		state.provider === 'mock'
	) {
		state = await runWorkflow(
			store,
			id,
			createDirector('mock'),
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
					: mockWorker
		);
	}
	console.log(JSON.stringify(state, null, 2));
} finally {
	store.close();
}
