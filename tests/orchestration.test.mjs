import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	command,
	createDirector,
	eligible,
	reservation,
	runWorkflow
} from '../tools/intelligence/orchestration/engine.ts';
import { workflowStore } from '../tools/intelligence/orchestration/store.ts';
import { mockWorker } from '../tools/intelligence/orchestration/worker.ts';
import { requestFrom } from '../src/lib/server/intelligence/validation.ts';
import { directorDefinitions } from '../src/lib/server/intelligence/director.ts';

const auth = {
	objective: 'synthetic_development',
	files: ['implementation.txt', 'checks.txt'],
	operations: ['edit', 'verify'],
	protectedTasks: []
};
function setup(t) {
	const root = mkdtempSync(join(tmpdir(), 'flihub-orchestration-test-'));
	const store = workflowStore(root);
	t.after(() => store.close());
	return { root, store };
}
function reply(choice, tokens = 100) {
	return Response.json({
		model: 'jev-1.14.0',
		usage: { input_tokens: tokens, output_tokens: 9 },
		answers: { assessment: choice }
	});
}

test('registered choices validate all ten contract families and reject duplicates, extras and private state', () => {
	for (const [id, candidates] of Object.entries(directorDefinitions)) {
		assert.ok(requestFrom({ id, state: 'initial', candidates }));
		assert.equal(requestFrom({ id, state: 'a private string', candidates }), undefined);
		assert.equal(
			requestFrom({ id, state: 'initial', candidates: [candidates[0], candidates[0]] }),
			undefined
		);
		assert.equal(requestFrom({ id, state: 'initial', candidates: ['unregistered'] }), undefined);
		assert.equal(requestFrom({ id, state: 'initial', candidates, command: 'raw' }), undefined);
	}
});

test('mock dispatches eligible tasks, recovers a failed verification and verifies acceptance', async (t) => {
	const { store } = setup(t);
	const state = store.create(auth, 'mock');
	assert.deepEqual(eligible(state), ['implementation', 'checks']);
	const result = await runWorkflow(store, state.id, createDirector('mock'), mockWorker);
	assert.equal(result.status, 'complete');
	assert.deepEqual(result.done, ['checks', 'implementation', 'integration']);
	assert.ok(result.events.some((event) => event.category === 'evidence' && event.value === 'fail'));
	assert.ok(result.events.some((event) => event.task === 'correct_defect'));
	assert.equal(result.events.at(-1).value, 'verified_acceptance');
	assert.equal(result.verification, 'pass');
});

test('a valid Jev HTTP choice changes dispatch order and eligibility filters dependent tasks', async (t) => {
	const { store } = setup(t);
	const state = store.create(auth, 'jev', { invocations: 1 });
	const choices = [];
	const director = createDirector('jev', 'synthetic-key', async (_url, init) => {
		const question = JSON.parse(init.body).questions.assessment;
		choices.push(Object.keys(question.criteria));
		const option = Object.hasOwn(question.criteria, 'implement_next')
			? 'implement_next'
			: Object.hasOwn(question.criteria, 'implementation')
				? 'implementation'
				: Object.keys(question.criteria)[0];
		return reply({
			type: 'choice',
			choice: option,
			confidence: 1,
			probabilities: Object.fromEntries(
				Object.keys(question.criteria).map((key) => [key, Number(key === option)])
			)
		});
	});
	const result = await runWorkflow(store, state.id, director, mockWorker);
	assert.deepEqual(result.done, ['implementation']);
	assert.equal(result.events.find((event) => event.category === 'taskSelection').source, 'jev');
	assert.ok(!choices[0].includes('integration'));
	assert.equal(result.spent, result.requests * 100 * 42);
});

test('mandatory scope and approval constraints precede execution', async (t) => {
	const { store } = setup(t);
	const unauthorized = store.create({ ...auth, files: [] }, 'mock');
	const denied = await runWorkflow(store, unauthorized.id, createDirector('mock'), mockWorker);
	assert.equal(denied.reason, 'unauthorized_scope');
	assert.equal(denied.requests, 0);
	const state = store.create({ ...auth, protectedTasks: ['checks'] }, 'mock');
	const paused = await runWorkflow(store, state.id, createDirector('mock'), mockWorker);
	assert.equal(paused.reason, 'human_approval_required');
	assert.equal(paused.invocations, 0);
	command(store, state.id, 'approve');
	const done = await runWorkflow(store, state.id, createDirector('mock'), mockWorker);
	assert.equal(done.status, 'complete');
	assert.equal(done.events.filter((event) => event.category === 'approval').length, 1);
});

test('abstention, invalid candidates and disabled provider never dispatch', async (t) => {
	const { store } = setup(t);
	for (const outcome of [
		{ status: 'abstained' },
		{ status: 'suggested', choice: 'recommend_completion', confidence: 1 }
	]) {
		const state = store.create(auth, 'mock');
		const result = await runWorkflow(
			store,
			state.id,
			{ source: 'mock', decide: async () => ({ outcome }) },
			mockWorker
		);
		assert.equal(result.status, 'stopped');
		assert.equal(result.invocations, 0);
	}
	const state = store.create(auth, 'disabled');
	const result = await runWorkflow(store, state.id, createDirector('disabled'), mockWorker);
	assert.equal(result.invocations, 0);
});

test('reservations precede requests and uncertain usage is retained without retry', async (t) => {
	const { store } = setup(t);
	const state = store.create(auth, 'jev', { spendNanodollars: reservation });
	let calls = 0;
	const director = createDirector('jev', 'fixture-key', async () => {
		calls++;
		assert.equal(store.get(state.id).spent, reservation);
		return new Response('', { status: 529 });
	});
	const result = await runWorkflow(store, state.id, director, mockWorker);
	assert.equal(result.reason, 'billing_uncertain');
	assert.equal(result.spent, reservation);
	assert.equal(calls, 1);
	const limited = store.create(auth, 'jev', { spendNanodollars: reservation - 1 });
	assert.equal(
		(await runWorkflow(store, limited.id, director, mockWorker)).reason,
		'provider_budget_exhausted'
	);
	assert.equal(calls, 1);
});

test('no acceptance on insufficient evidence, unexpected changes, or repeated failure', async (t) => {
	const { store, root } = setup(t);
	for (const [worker, reason] of [
		[
			{
				...mockWorker,
				execute: async () => ({ evidence: 'pass', changed: ['private-command-string'] })
			},
			'unexpected'
		],
		[{ ...mockWorker, execute: async () => ({ evidence: 'pass', changed: [] }) }, 'missing'],
		[
			{ ...mockWorker, execute: (job, signal) => mockWorker.execute(job, signal, false) },
			'repeated_failure'
		]
	]) {
		const state = store.create(auth, 'mock');
		const result = await runWorkflow(store, state.id, createDirector('mock'), worker);
		assert.equal(result.reason, reason);
		assert.equal(result.status, 'stopped');
	}
	assert.doesNotMatch(
		readFileSync(join(root, 'workflows.sqlite')).toString(),
		/private-command-string/
	);
});

test('recovery blocks uncertain dispatch, resumes safe pause, and honours cancellation', async (t) => {
	const { store } = setup(t);
	const state = store.create(auth, 'mock');
	const inFlight = store.save({
		...state,
		pending: { kind: 'worker', id: 'fixture' },
		invocations: 1
	});
	assert.equal(
		(await runWorkflow(store, state.id, createDirector('mock'), mockWorker)).version,
		inFlight.version
	);
	assert.equal(
		command(store, state.id, 'resume').reason,
		'interrupted_execution_evidence_required'
	);
	assert.equal(command(store, state.id, 'cancel').status, 'cancelled');
	const idle = store.create(auth, 'mock');
	assert.equal(command(store, idle.id, 'pause').status, 'paused');
	assert.equal(command(store, idle.id, 'resume').status, 'active');
	const abort = new AbortController();
	const worker = {
		...mockWorker,
		execute: async (_job, signal) => {
			abort.abort();
			assert.equal(signal.aborted, true);
			return { evidence: 'missing', changed: [] };
		}
	};
	assert.equal(
		(await runWorkflow(store, idle.id, createDirector('mock'), worker, abort.signal)).status,
		'cancelled'
	);
});

test('workflow deadlines abort a hanging worker and prevent any subsequent dispatch', async (t) => {
	const { store } = setup(t);
	const state = store.create(auth, 'mock', { durationMs: 150 });
	let observed;
	const worker = {
		...mockWorker,
		execute: async (_job, signal) => {
			observed = signal;
			return new Promise(() => {});
		}
	};
	const result = await runWorkflow(store, state.id, createDirector('mock'), worker);
	assert.equal(result.reason, 'duration_exhausted');
	assert.equal(observed.aborted, true);
	assert.equal(result.invocations, 1);
});

test('routine director choices proceed at weak or null concentration without inventing confidence', async () => {
	for (const [id, candidate, other] of [
		['taskSelection', 'checks', 'implementation'],
		['taskPriority', 'checks', 'implementation'],
		['implementationApproach', 'add_fixture', 'minimal_change'],
		['verificationStrategy', 'broader', 'targeted']
	]) {
		for (const confidence of [0.1, null]) {
			const director = createDirector('jev', 'fixture', async (_url, init) => {
				const { questions } = JSON.parse(init.body);
				assert.match(questions.assessment.instructions, /make useful progress/);
				assert.match(questions.assessment.criteria.abstain, /material uncertainty/);
				return reply({
					type: 'choice',
					choice: candidate,
					confidence,
					probabilities: { [candidate]: 0.4, [other]: 0.35, abstain: 0.25 }
				});
			});
			assert.deepEqual((await director.decide(id, 'initial', [candidate, other])).outcome, {
				status: 'suggested',
				choice: candidate,
				confidence
			});
		}
	}
});

test('confidence overrides are isolated by decision and preserve abstention and the security floor', async () => {
	let dispatched = 0;
	const fetcher = (choice, confidence, probabilities) => async () => {
		dispatched++;
		return reply({ type: 'choice', choice, confidence, probabilities });
	};
	const routine = { checks: 0.55, implementation: 0.3, abstain: 0.15 };
	const use = (id, candidates, choice, confidence, probs, overrides) =>
		createDirector('jev', 'fixture', fetcher(choice, confidence, probs), overrides).decide(
			id,
			'initial',
			candidates
		);

	const override = '{"taskSelection":0.5}';
	assert.equal(
		(await use('taskSelection', ['checks', 'implementation'], 'checks', 0.325, routine, override))
			.outcome.abstention,
		'confidence_below_threshold'
	);
	assert.equal(
		(await use('taskPriority', ['checks', 'implementation'], 'checks', 0.325, routine, override))
			.outcome.status,
		'suggested'
	);
	assert.equal(
		(
			await use(
				'taskSelection',
				['checks', 'implementation'],
				'abstain',
				0.85,
				{ checks: 0.05, implementation: 0.05, abstain: 0.9 },
				override
			)
		).outcome.abstention,
		'explicit'
	);

	const triage = ['fixture_defect', 'unknown_defect'];
	for (const [confidence, expected] of [
		[0, 'suggested'],
		[0.44, 'suggested'],
		[0.6, 'suggested']
	]) {
		const top = (1 + 2 * confidence) / 3;
		assert.equal(
			(
				await use('defectTriage', triage, 'fixture_defect', confidence, {
					fixture_defect: top,
					unknown_defect: confidence === 0 ? top : (1 - top) / 2,
					abstain: confidence === 0 ? top : (1 - top) / 2
				})
			).outcome.status,
			expected
		);
	}

	const risk = ['routine', 'sensitive'];
	for (const [confidence, expected] of [
		[0.89, 'abstained'],
		[0.9, 'suggested']
	]) {
		const top = (1 + 2 * confidence) / 3;
		assert.equal(
			(
				await use('riskClassification', risk, 'routine', confidence, {
					routine: top,
					sensitive: (1 - top) / 2,
					abstain: (1 - top) / 2
				})
			).outcome.status,
			expected
		);
	}
	const count = dispatched;
	for (const invalid of [
		'{',
		'{"riskClassification":0.89}',
		'{"unknown":0.5}',
		'{"taskSelection":"0.5"}'
	]) {
		assert.deepEqual(
			(await use('taskSelection', ['checks', 'implementation'], 'checks', 0.325, routine, invalid))
				.outcome,
			{ status: 'unavailable', reason: 'invalid_input' }
		);
	}
	assert.equal(dispatched, count);
});

test('a low-confidence alternate task controls dispatch and cannot bypass protected work', async (t) => {
	const { store } = setup(t);
	const result = await Promise.all(
		[false, true].map(async (protectedTask) => {
			const state = store.create(
				{ ...auth, protectedTasks: protectedTask ? ['implementation'] : [] },
				'mock',
				{ invocations: 1 }
			);
			const director = {
				source: 'mock',
				async decide(id, _phase, candidates) {
					const choice =
						id === 'taskSelection' && candidates.includes('implementation')
							? 'implementation'
							: candidates[0];
					return { outcome: { status: 'suggested', choice, confidence: 0.1 } };
				}
			};
			return runWorkflow(store, state.id, director, mockWorker);
		})
	);
	assert.deepEqual(result[0].done, ['implementation']);
	assert.equal(result[1].reason, 'human_approval_required');
	assert.equal(result[1].invocations, 0);
});
