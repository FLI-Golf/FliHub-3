import {
	APPLICATION_BATCH_ID,
	applicationBatchFrom,
	applicationAnswersFrom,
	type ApplicationAnswers
} from './application/batch.ts';
import { mockApplicationAssessment } from './application/mock.ts';
import { applicationAdvisoryPlanFrom, type ApplicationAdvisoryPlan } from './application/plan.ts';
import {
	applicationExplanationFrom,
	type ApplicationExplanation
} from './application/explanation.ts';
import type { Failure } from './types.ts';
import { createDispatchResources } from './dispatch.ts';
import { directorConfidencePolicy } from './director-policy.ts';
import { randomUUID } from 'node:crypto';
import {
	disabledProvider,
	jevProvider,
	mockProvider,
	MODEL,
	NANODOLLARS_PER_TOKEN,
	RESERVED_TOKENS
} from './providers.ts';
import { outcomeFrom, requestFrom, usageFrom } from './validation.ts';
import type { Audit, Outcome, Provider, Request, Usage } from './types.ts';

type Environment = Readonly<Record<string, string | undefined>>;
export type ApplicationAssessment =
	| {
			status: 'assessed';
			source: 'mock';
			answers: ApplicationAnswers;
	  }
	| { status: 'disabled' }
	| { status: 'unavailable'; reason: Failure };

export type ApplicationAdvice =
	| {
			status: 'advised';
			source: 'mock';
			answers: ApplicationAnswers;
			plan: ApplicationAdvisoryPlan;
			explanation: ApplicationExplanation;
	  }
	| Exclude<ApplicationAssessment, { status: 'assessed' }>;

export type ApplicationAudit = {
	requestId: string;
	decision: typeof APPLICATION_BATCH_ID;
	provider: Provider['name'];
	status: ApplicationAssessment['status'];
	reason?: Failure;
	durationMs: number;
};

type Options = {
	fetch?: typeof fetch;
	audit?: (event: Audit) => void;
	applicationAudit?: (event: ApplicationAudit) => void;
};

function limit(value: string | undefined, fallback: number, max: number) {
	if (value === undefined) return fallback;
	if (!/^[1-9][0-9]*$/.test(value)) return 0;
	const number = Number(value);
	return number <= max ? number : 0;
}

function snapshotApplicationRequest(input: unknown) {
	try {
		if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;

		const prototype = Object.getPrototypeOf(input);

		if (prototype !== Object.prototype && prototype !== null) return null;

		const descriptors = Object.getOwnPropertyDescriptors(input);
		const keys = Reflect.ownKeys(descriptors);

		if (
			keys.length !== 2 ||
			!keys.includes('objectiveId') ||
			!keys.includes('fixtureId') ||
			!Object.hasOwn(descriptors.objectiveId, 'value') ||
			!Object.hasOwn(descriptors.fixtureId, 'value')
		)
			return null;

		const objectiveId = descriptors.objectiveId.value;
		const fixtureId = descriptors.fixtureId.value;

		if (typeof objectiveId !== 'string' || typeof fixtureId !== 'string') return null;

		return { objectiveId, fixtureId };
	} catch {
		return null;
	}
}

// Keep one instance for the lifetime of the calling process.
export function createIntelligence(env: Environment = {}, options: Options = {}) {
	const directorPolicy = directorConfidencePolicy(env.FLIHUB_DIRECTOR_CONFIDENCE);
	const timeoutMs = limit(env.FLIHUB_INTELLIGENCE_TIMEOUT_MS, 1500, 10_000);
	const requestsPerMinute = limit(env.FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE, 10, 60);
	const concurrency = limit(env.FLIHUB_INTELLIGENCE_CONCURRENCY, 2, 8);
	const budget = limit(env.FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS, 0, 100_000_000);
	let provider: Provider = disabledProvider;
	if (env.FLIHUB_INTELLIGENCE_ENABLED === 'true' && timeoutMs && requestsPerMinute && concurrency) {
		if (env.FLIHUB_INTELLIGENCE_PROVIDER === 'mock') provider = mockProvider;
		if (env.FLIHUB_INTELLIGENCE_PROVIDER === 'jev' && budget >= RESERVED_TOKENS) {
			const key = env.TYPESAFE_API_KEY;
			if (key && /^\S+$/.test(key)) provider = jevProvider(key, options.fetch ?? fetch);
		}
	}
	const reservation = provider.name === 'jev' ? RESERVED_TOKENS : 0;
	const resources = createDispatchResources({
		timeoutMs,
		requestsPerMinute,
		concurrency,
		budget,
		reservation
	});

	async function assessApplication(input: unknown): Promise<ApplicationAssessment> {
		const started = performance.now();

		const finish = (outcome: ApplicationAssessment) => {
			try {
				options.applicationAudit?.({
					requestId: randomUUID(),
					decision: APPLICATION_BATCH_ID,
					provider: provider.name,
					status: outcome.status,
					reason: outcome.status === 'unavailable' ? outcome.reason : undefined,
					durationMs: Math.round(performance.now() - started)
				});
			} catch {
				// Optional telemetry must not break caller fallback.
			}
			return outcome;
		};

		// Live application dispatch remains deliberately disabled.
		if (provider.name !== 'mock') {
			return finish({ status: 'disabled' });
		}

		const snapshot = snapshotApplicationRequest(input);
		const batch = snapshot ? applicationBatchFrom(snapshot) : null;

		if (!batch) {
			return finish({
				status: 'unavailable',
				reason: 'invalid_input'
			});
		}

		const registeredBatch = batch;

		const dispatched = await resources.dispatch(started, () =>
			mockApplicationAssessment(registeredBatch)
		);

		if (dispatched.status === 'unavailable') {
			return finish(dispatched);
		}

		if (dispatched.result?.status === 'unavailable') {
			return finish({
				status: 'unavailable',
				reason: 'provider'
			});
		}

		const answers = applicationAnswersFrom(snapshot, dispatched.result?.answers);

		if (!answers) {
			return finish({
				status: 'unavailable',
				reason: 'invalid_output'
			});
		}

		return finish({
			status: 'assessed',
			source: 'mock',
			answers
		});
	}

	return {
		assessApplication,

		async adviseApplication(input: unknown): Promise<ApplicationAdvice> {
			// Preserve the existing disabled-provider behavior.
			if (provider.name !== 'mock') {
				const result = await assessApplication(null);

				return result.status === 'assessed'
					? { status: 'unavailable', reason: 'invalid_output' }
					: result;
			}

			// Capture the original input before any asynchronous work.
			const snapshot = snapshotApplicationRequest(input);

			// Exactly one assessment dispatch, using shared controls.
			const assessment = await assessApplication(snapshot);

			if (assessment.status !== 'assessed') {
				return assessment;
			}

			if (!snapshot) {
				return { status: 'unavailable', reason: 'invalid_input' };
			}

			const plan = applicationAdvisoryPlanFrom(snapshot, assessment.answers);

			const explanation = applicationExplanationFrom(snapshot, assessment.answers);

			if (!plan || !explanation) {
				return { status: 'unavailable', reason: 'invalid_output' };
			}

			return {
				status: 'advised',
				source: assessment.source,
				answers: assessment.answers,
				plan,
				explanation
			};
		},

		async decide(input: unknown): Promise<Outcome> {
			const started = performance.now();
			let request: Request | undefined;
			try {
				request = requestFrom(input);
			} catch {
				// Invalid objects fail closed without retaining input or exception details.
			}
			const finish = (outcome: Outcome, usage?: Usage, model?: typeof MODEL) => {
				try {
					options.audit?.({
						requestId: randomUUID(),
						decision: request?.id,
						provider: provider.name,
						model,
						status: outcome.status,
						reason: outcome.status === 'unavailable' ? outcome.reason : undefined,
						durationMs: Math.round(performance.now() - started),
						usage,
						estimatedCostNanodollars:
							usage && usage.inputTokens <= RESERVED_TOKENS
								? usage.inputTokens * NANODOLLARS_PER_TOKEN
								: undefined
					});
				} catch {
					// Optional telemetry must not break caller fallback.
				}
				return outcome;
			};

			if (provider.name === 'disabled') return finish({ status: 'disabled' });
			if (!request || ('candidates' in request && !directorPolicy)) {
				return finish({ status: 'unavailable', reason: 'invalid_input' });
			}
			const dispatched = await resources.dispatch(started, (signal) =>
				provider.decide(request, signal)
			);

			if (dispatched.status === 'unavailable') {
				return finish(dispatched);
			}

			const result = dispatched.result;

			const model = result?.model === MODEL && reservation ? MODEL : undefined;
			const usage = model ? usageFrom(result?.usage) : undefined;
			const outcome = outcomeFrom(result, request, directorPolicy);
			if (reservation && usage && usage.inputTokens > reservation) {
				return finish({ status: 'unavailable', reason: 'budget' }, usage, model);
			}
			if (
				reservation &&
				(outcome.status !== 'unavailable' || outcome.reason === 'invalid_output')
			) {
				if (!usage || !usage.inputTokens)
					return finish({ status: 'unavailable', reason: 'invalid_output' }, undefined, model);
				if (outcome.status !== 'unavailable') dispatched.reconcile(usage.inputTokens);
			}
			return finish(outcome, usage, model);
		}
	};
}
