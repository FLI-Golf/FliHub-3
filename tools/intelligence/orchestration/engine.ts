import {
	directorConfidenceDefaults,
	directorConfidencePolicy
} from '../../../src/lib/server/intelligence/director-policy.ts';
import { randomUUID } from 'node:crypto';
import { createIntelligence } from '../../../src/lib/server/intelligence/service.ts';
import {
	NANODOLLARS_PER_TOKEN,
	RESERVED_TOKENS
} from '../../../src/lib/server/intelligence/providers.ts';
import type {
	DirectorCandidate,
	DirectorId,
	DirectorState
} from '../../../src/lib/server/intelligence/director.ts';
import type { Audit, Outcome } from '../../../src/lib/server/intelligence/types.ts';
import { probability, usageFrom } from '../../../src/lib/server/intelligence/validation.ts';
import {
	jobFile,
	tasks,
	type Event,
	type Job,
	type Task,
	type Worker,
	type WorkerResult,
	type Workflow
} from './contracts.ts';
import type { WorkflowStore } from './store.ts';

export const reservation = RESERVED_TOKENS * NANODOLLARS_PER_TOKEN;
export type Director = {
	source: Workflow['provider'];
	minimumConfidence?: (id: DirectorId) => number;
	decide(
		id: DirectorId,
		state: DirectorState,
		candidates: readonly DirectorCandidate[]
	): Promise<{ outcome: Outcome; audit?: Audit }>;
};

export function createDirector(
	source: Workflow['provider'],
	key?: string,
	fetcher?: typeof fetch,
	confidenceOverrides = process.env.FLIHUB_DIRECTOR_CONFIDENCE
): Director {
	let audit: Audit | undefined;
	const policy = directorConfidencePolicy(confidenceOverrides);
	const service = createIntelligence(
		{
			FLIHUB_INTELLIGENCE_ENABLED: 'true',
			FLIHUB_INTELLIGENCE_PROVIDER: source,
			FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '20',
			FLIHUB_INTELLIGENCE_CONCURRENCY: '1',
			FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS: String(20 * RESERVED_TOKENS),
			TYPESAFE_API_KEY: key,
			FLIHUB_DIRECTOR_CONFIDENCE: confidenceOverrides
		},
		{
			fetch: fetcher,
			audit: (event) => {
				audit = event;
			}
		}
	);
	return {
		source,
		minimumConfidence: (id) => (policy ?? directorConfidenceDefaults)[id],
		async decide(id, state, candidates) {
			audit = undefined;
			const outcome = await service.decide({ id, state, candidates });
			return { outcome, audit };
		}
	};
}

export function eligible(state: Workflow): Task[] {
	return (Object.keys(tasks) as Task[]).filter(
		(task) =>
			!state.done.includes(task) &&
			state.authorized.operations.includes(tasks[task].operation) &&
			state.authorized.files.includes(jobFile(task, state.authorized.objective)!) &&
			tasks[task].dependencies.every((dependency) => state.done.includes(dependency))
	);
}

function add(state: Workflow, event: Omit<Event, 'at'>) {
	state.events.push({ ...event, at: Date.now() });
}

export function command(
	store: WorkflowStore,
	id: string,
	action: 'pause' | 'resume' | 'approve' | 'cancel'
) {
	const state = store.get(id);
	if (
		!state ||
		state.status === 'complete' ||
		state.status === 'cancelled' ||
		state.status === 'stopped'
	)
		return state;
	if (action === 'cancel') {
		state.status = 'cancelled';
		state.reason = 'operator_cancelled';
		delete state.approved;
		delete state.approval;
	} else if (action === 'pause' && state.status === 'active') {
		state.status = 'paused';
		state.reason = 'operator_paused';
	} else if ((action === 'resume' || action === 'approve') && state.pending) {
		state.status = 'paused';
		state.reason = 'interrupted_execution_evidence_required';
	} else if (
		action === 'approve' &&
		state.status === 'paused' &&
		state.approval &&
		Date.now() < state.approval.expires
	) {
		state.approved = state.approval;
		delete state.approval;
		state.status = 'active';
		state.reason = 'operator_approved';
	} else if (
		action === 'resume' &&
		state.status === 'paused' &&
		state.reason === 'operator_paused'
	) {
		state.status = 'active';
		state.reason = 'operator_resumed';
	} else {
		return state;
	}
	add(state, { source: 'human', category: 'workflow_transition', value: state.reason });
	return store.save(state);
}

function validateEvidence(result: WorkerResult, job: Job, state: Workflow): WorkerResult {
	const file = jobFile(job, state.authorized.objective);
	if (
		!result ||
		!['pass', 'fail', 'missing', 'unexpected', 'timeout', 'cancelled'].includes(result.evidence) ||
		!Array.isArray(result.changed)
	)
		return { evidence: 'missing', changed: [] };
	if (
		result.changed.length > 1 ||
		[...result.changed].some((item) => item !== file || !state.authorized.files.includes(item))
	) {
		return { evidence: 'unexpected', changed: [] };
	}
	if (result.evidence === 'pass' && file && !result.changed.includes(file))
		return { evidence: 'missing', changed: [] };
	return result;
}

async function bounded<T>(
	work: (signal: AbortSignal) => Promise<T>,
	duration: number,
	external?: AbortSignal,
	shouldInterrupt?: () => boolean
): Promise<T | undefined> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let poll: ReturnType<typeof setInterval> | undefined;
	let cancel: (() => void) | undefined;
	try {
		return await Promise.race([
			new Promise<undefined>((resolve) => {
				cancel = () => {
					resolve(undefined);
					controller.abort();
				};
				timer = setTimeout(cancel, Math.max(0, duration));
				external?.addEventListener('abort', cancel, { once: true });
				if (shouldInterrupt)
					poll = setInterval(() => {
						try {
							if (shouldInterrupt()) cancel?.();
						} catch {
							cancel?.();
						}
					}, 100);
				if (external?.aborted) cancel();
			}),
			Promise.resolve().then(() =>
				controller.signal.aborted ? undefined : work(controller.signal)
			)
		]);
	} finally {
		clearTimeout(timer);
		clearInterval(poll);
		if (cancel) external?.removeEventListener('abort', cancel);
	}
}

export async function runWorkflow(
	store: WorkflowStore,
	id: string,
	director: Director,
	worker: Worker,
	signal?: AbortSignal
) {
	let state = store.get(id);
	if (!state) throw new Error('Unknown workflow.');
	if (
		worker.source !== 'mock' &&
		worker.source !== 'codex' &&
		worker.source !== 'fixture' &&
		worker.source !== 'engineering'
	)
		throw new Error('Unknown worker.');
	if (
		(state.worker === 'fixture') !== (worker.source === 'fixture') ||
		(state.worker === 'engineering') !== (worker.source === 'engineering')
	)
		throw new Error('Worker does not match the authorized workflow.');
	if (state.provider !== director.source)
		throw new Error('Provider does not match the authorized workflow.');
	if (state.status !== 'active') return state;
	if (state.pending) return state;

	const save = () => {
		state = store.save(state!);
	};
	const finish = (status: Workflow['status'], reason: string) => {
		state!.status = status;
		state!.reason = reason;
		add(state!, { source: 'deterministic', category: 'workflow_transition', value: reason });
		save();
		return state!;
	};
	const current = () => {
		const latest = store.get(id);
		if (!latest) throw new Error('Workflow disappeared.');
		if (latest.version !== state!.version) return latest;
	};
	const gate = () =>
		signal?.aborted
			? finish('cancelled', 'operator_cancelled')
			: Date.now() >= state!.deadline
				? finish('stopped', 'duration_exhausted')
				: undefined;

	const choose = async (
		id: DirectorId,
		phase: DirectorState,
		candidates: readonly DirectorCandidate[]
	) => {
		const interrupted = gate();
		if (interrupted) return;
		const cost = director.source === 'jev' ? reservation : 0;
		if (
			state!.requests >= state!.limits.requests ||
			state!.spent + cost > state!.limits.spendNanodollars
		) {
			finish('stopped', 'provider_budget_exhausted');
			return;
		}
		state!.requests++;
		state!.spent += cost;
		state!.pending = { kind: 'decision', id: randomUUID() };
		save();
		let result;
		try {
			result = await bounded(
				() => director.decide(id, phase, candidates),
				state!.deadline - Date.now(),
				signal,
				() => Boolean(current())
			);
		} catch {
			// External errors cannot authorize a fallback.
		}
		const changed = current();
		if (changed) {
			state = changed;
			return;
		}
		delete state!.pending;
		if (gate()) return;
		const usage = result?.audit?.provider === 'jev' ? usageFrom(result.audit.usage) : undefined;
		if (
			cost &&
			(!usage ||
				usage.inputTokens <= 0 ||
				usage.inputTokens > RESERVED_TOKENS ||
				!result ||
				!['suggested', 'abstained'].includes(result.outcome.status))
		) {
			finish('stopped', 'billing_uncertain');
			return;
		}
		if (cost && usage) state!.spent -= cost - usage.inputTokens * NANODOLLARS_PER_TOKEN;
		const outcome = result?.outcome;
		const minConfidence = Math.max(
			director.minimumConfidence?.(id) ?? directorConfidenceDefaults[id],
			id === 'riskClassification' ? directorConfidenceDefaults.riskClassification : 0
		);
		if (
			outcome?.status !== 'suggested' ||
			(outcome.confidence === null
				? minConfidence > 0
				: !probability(outcome.confidence) || outcome.confidence < minConfidence) ||
			!candidates.some((candidate) => candidate === outcome.choice)
		) {
			add(state!, {
				source: director.source,
				category: id,
				value:
					outcome?.status === 'abstained'
						? (outcome.abstention ?? 'abstained')
						: 'invalid_or_unavailable',
				phase,
				minConfidence,
				candidates: [...candidates],
				confidence:
					outcome?.status === 'abstained' && probability(outcome.confidence)
						? outcome.confidence
						: undefined
			});
			finish(
				'stopped',
				outcome?.status === 'abstained' ? 'provider_abstained' : 'provider_unavailable_or_invalid'
			);
			return;
		}
		add(state!, {
			source: director.source,
			category: id,
			value: outcome.choice,
			confidence: outcome.confidence ?? undefined,
			minConfidence,
			phase,
			candidates: [...candidates]
		});
		save();
		return outcome.choice;
	};

	const dispatch = async (job: Job, approach?: 'minimal_change' | 'add_fixture') => {
		if (gate()) return false;
		const scopeFile = jobFile(job, state!.authorized.objective);
		if (
			scopeFile
				? !state!.authorized.operations.includes('edit') ||
					!state!.authorized.files.includes(scopeFile)
				: !state!.authorized.operations.includes('verify')
		) {
			finish('stopped', 'unauthorized_scope');
			return false;
		}
		if (
			scopeFile &&
			!state!.changes.includes(scopeFile) &&
			state!.changes.length >= state!.limits.changes
		) {
			finish('stopped', 'change_budget_exhausted');
			return false;
		}
		if (state!.invocations >= state!.limits.invocations) {
			finish('stopped', 'worker_budget_exhausted');
			return false;
		}
		state!.invocations++;
		state!.pending = { kind: 'worker', id: randomUUID() };
		add(state!, { source: 'deterministic', category: 'dispatch', value: job, task: job });
		save();
		let result: WorkerResult;
		let deadlineReached = false;
		const remaining = state!.deadline - Date.now();
		try {
			const evidence = await bounded(
				(deadline) => worker.execute(job, deadline, state!.corrected, approach),
				Math.min(15_000, remaining),
				signal,
				() => Boolean(current())
			);
			deadlineReached = evidence === undefined && remaining <= 15_000;
			result = evidence ?? { evidence: 'timeout', changed: [] };
		} catch {
			result = { evidence: 'missing', changed: [] };
		}
		const changed = current();
		if (changed) {
			state = changed;
			return false;
		}
		delete state!.pending;
		if (gate()) return false;
		if (deadlineReached) {
			finish('stopped', 'duration_exhausted');
			return false;
		}
		result = validateEvidence(result, job, state!);
		if (
			(worker.source === 'fixture' || worker.source === 'engineering') &&
			(result.evidence === 'pass' || result.evidence === 'fail')
		) {
			if (!/^[a-f0-9]{64}$/.test(result.checkpoint ?? '')) {
				finish('stopped', 'missing_fixture_checkpoint');
				return false;
			}
			state!.checkpoint = result.checkpoint;
			if ((state!.localFixturePort !== undefined || worker.source === 'engineering') && scopeFile) {
				if (result.codexAcknowledged !== true) {
					finish('stopped', 'missing_codex_acknowledgement');
					return false;
				}
				add(state!, { source: 'codex', category: 'fixture_ack', value: 'verified', task: job });
			}
			if (job === 'verify_targeted' || job === 'verify_broader') {
				if (
					typeof result.checks?.test !== 'boolean' ||
					typeof result.checks.build !== 'boolean' ||
					(result.evidence === 'pass' && !(result.checks.test && result.checks.build))
				) {
					finish('stopped', 'missing_test_or_build_evidence');
					return false;
				}
				add(state!, {
					source: 'deterministic',
					category: 'build',
					value: result.checks.build ? 'pass' : 'fail',
					task: job
				});
				add(state!, {
					source: 'deterministic',
					category: 'test',
					value: result.checks.test ? 'pass' : 'fail',
					task: job
				});
			}
		}
		add(state!, { source: worker.source, category: 'evidence', value: result.evidence, task: job });
		if (result.evidence !== 'pass' && result.evidence !== 'fail') {
			finish('stopped', result.evidence);
			return false;
		}
		for (const file of result.changed)
			if (!state!.changes.includes(file)) state!.changes.push(file);
		if (scopeFile && result.evidence === 'fail') {
			finish('stopped', 'implementation_failed');
			return false;
		}
		if (job === 'correct_defect' || job === 'reconsider') {
			state!.corrected = true;
			state!.verification = 'pending';
		} else if (job === 'verify_targeted' || job === 'verify_broader') {
			state!.verification = result.evidence;
			if (result.evidence === 'fail') {
				state!.failures++;
				state!.lastFailed = job;
			}
		} else {
			state!.done.push(job);
		}
		save();
		return true;
	};

	while (state.status === 'active') {
		const interrupted = gate();
		if (interrupted) return interrupted;
		if (state.iterations >= state.limits.iterations)
			return finish('stopped', 'iteration_budget_exhausted');
		state.iterations++;
		save();
		const available = eligible(state);
		const allDone = state.done.length === Object.keys(tasks).length;
		if (!available.length && !allDone) return finish('stopped', 'unauthorized_scope');
		if (allDone && !state.authorized.operations.includes('verify'))
			return finish('stopped', 'unauthorized_scope');
		if (
			state.verification === 'fail' &&
			(state.failures >= state.limits.repeatedFailures || state.retries >= state.limits.retries)
		) {
			return finish('stopped', 'repeated_failure');
		}
		const phase: DirectorState = !allDone
			? state.done.length
				? 'implementation_done'
				: 'initial'
			: state.verification === 'pass'
				? 'verification_passed'
				: state.verification === 'fail'
					? 'verification_failed'
					: state.corrected
						? 'correction_done'
						: 'verification_pending';
		// Scope, approvals and budget already have deterministic gates.
		// Only offer recovery alternatives that can be acted on in this phase.
		const actions: DirectorCandidate[] = ['clarify', 'stop_blocker'];
		if (available.length) actions.push('implement_next');
		else if (state.verification === 'pass') actions.push('recommend_completion');
		else if (state.verification === 'fail') actions.push('correct_defect', 'reconsider');
		else actions.push('verify_targeted', 'verify_broader');
		// Once the operator has authorized this objective, the initial question is
		// which eligible task to perform. Ask about branching only when needed.
		let action;
		if (available.length) action = 'implement_next';
		else if (state.verification === 'pending') {
			const strategy = await choose('verificationStrategy', phase, ['targeted', 'broader']);
			if (strategy) action = strategy === 'broader' ? 'verify_broader' : 'verify_targeted';
		} else action = await choose('nextAction', phase, actions);
		if (!action) break;
		if (action === 'implement_next') {
			const task = await choose('taskSelection', phase, available);
			if (!task) break;
			if (!available.includes(task as Task)) return finish('stopped', 'unauthorized_scope');
			const selected = task as Task;
			if (state.authorized.protectedTasks.includes(selected)) {
				if (state.approved?.task !== selected || state.approved.expires <= Date.now()) {
					state.approval = {
						task: selected,
						expires: Math.min(state.deadline, Date.now() + 120_000)
					};
					return finish('paused', 'human_approval_required');
				}
				delete state.approved;
				add(state, {
					source: 'deterministic',
					category: 'approval',
					value: 'consumed',
					task: selected
				});
				// Consumption and the worker's in-flight marker are saved together before dispatch.
			}
			const approach =
				selected === 'implementation'
					? await choose('implementationApproach', phase, ['minimal_change', 'add_fixture'])
					: undefined;
			if (
				selected === 'implementation' &&
				approach !== 'minimal_change' &&
				approach !== 'add_fixture'
			)
				break;
			if (!(await dispatch(selected, approach === 'add_fixture' ? approach : undefined))) break;
		} else if (action === 'verify_targeted' || action === 'verify_broader') {
			if (!(await dispatch(action))) break;
			const assessed = await choose(
				'testAssessment',
				state.verification === 'pass' ? 'verification_passed' : 'verification_failed',
				['passing', 'failing', 'insufficient']
			);
			if (!assessed) break;
			if (assessed !== (state.verification === 'pass' ? 'passing' : 'failing'))
				return finish('paused', 'assessment_conflicts_with_evidence');
		} else if (action === 'correct_defect' || action === 'reconsider') {
			const defect = await choose('defectTriage', phase, [
				'fixture_defect',
				'implementation_defect',
				'unknown_defect'
			]);
			if (!defect) break;
			if (defect === 'unknown_defect') return finish('paused', 'defect_evidence_required');
			const retry = await choose('retryEscalation', phase, ['retry', 'escalate']);
			if (!retry) break;
			if (retry === 'escalate') return finish('paused', 'retry_escalated');
			const risk = await choose('riskClassification', phase, ['routine', 'sensitive']);
			if (!risk) break;
			if (risk === 'sensitive') return finish('paused', 'risk_review');
			state.retries++;
			if (!(await dispatch(action))) break;
		} else if (action === 'recommend_completion') {
			const readiness = await choose('acceptanceReadiness', 'acceptance_pending', [
				'ready',
				'not_ready'
			]);
			if (!readiness) break;
			if (readiness !== 'ready') return finish('paused', 'acceptance_review');
			if (!allDone || state.verification !== 'pass')
				return finish('stopped', 'acceptance_evidence_missing');
			return finish('complete', 'verified_acceptance');
		} else if (action === 'clarify' || action === 'request_approval') {
			return finish('paused', action);
		} else {
			return finish('stopped', action);
		}
	}
	return state;
}
