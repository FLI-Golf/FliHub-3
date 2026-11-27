import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { command, createDirector, reservation, runWorkflow, type Director } from './engine.ts';
import { mockWorker } from './worker.ts';
import { workflowStore } from './store.ts';
import { type Authorization, type Worker } from './contracts.ts';

const cases = [
	'success',
	'abstain',
	'invalid',
	'budget',
	'repeat',
	'scope',
	'approval',
	'cancel',
	'recover',
	'--live',
	'--live-first'
] as const;
const scenario = process.argv[2] ?? 'success';
if (!cases.some((name) => name === scenario) || process.argv.length > 3)
	throw new Error('Unknown scenario.');
const first = scenario === '--live-first';
const live = scenario === '--live' || first;
const key = live ? process.env.TYPESAFE_API_KEY : undefined;
if (live && !key) {
	console.log(JSON.stringify({ status: 'disabled', reason: 'credential_unavailable' }));
	process.exitCode = 2;
} else {
	const directory =
		process.env.FLIHUB_GUARDRAIL_AUDIT_DIR ?? mkdtempSync(join(tmpdir(), 'flihub-orchestration-'));
	const store = workflowStore(directory);
	try {
		const authorized: Authorization = {
			objective: 'synthetic_development',
			files: scenario === 'scope' ? [] : ['implementation.txt', 'checks.txt'],
			operations: ['edit', 'verify'],
			protectedTasks: scenario === 'approval' ? ['checks'] : []
		};
		const state = store.create(authorized, live ? 'jev' : 'mock', {
			requests: scenario === 'budget' ? 0 : first ? 1 : live ? 15 : 20,
			invocations: first ? 0 : 10,
			spendNanodollars: (first ? 1 : 15) * reservation
		});
		let director: Director = createDirector(state.provider, key);
		let worker: Worker = mockWorker;
		if (scenario === 'abstain')
			director = { source: 'mock', decide: async () => ({ outcome: { status: 'abstained' } }) };
		if (scenario === 'invalid')
			director = {
				source: 'mock',
				decide: async () => ({
					outcome: { status: 'suggested', choice: 'ordinary', confidence: 1 }
				})
			};
		if (scenario === 'repeat')
			worker = { ...mockWorker, execute: (job, signal) => mockWorker.execute(job, signal, false) };
		if (scenario === 'cancel') command(store, state.id, 'cancel');
		if (scenario === 'recover') {
			store.save({ ...state, pending: { kind: 'worker', id: randomUUID() }, invocations: 1 });
			command(store, state.id, 'resume');
		}
		const result = await runWorkflow(store, state.id, director, worker);
		console.log(
			JSON.stringify({ directory, ...result, estimatedUsd: result.spent / 1e9 }, null, 2)
		);
		if (live && result.status !== 'complete') process.exitCode = 2;
	} finally {
		store.close();
	}
}
