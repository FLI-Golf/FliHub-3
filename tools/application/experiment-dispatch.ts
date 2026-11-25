import {
	applicationJevRequestFrom,
	applicationJevResponseFrom
} from '../../src/lib/server/intelligence/application/jev-adapter.ts';

import { createDispatchResources } from '../../src/lib/server/intelligence/dispatch.ts';

import { requestJev } from '../../src/lib/server/intelligence/jev-transport.ts';

import { RESERVED_TOKENS } from '../../src/lib/server/intelligence/providers.ts';

import {
	providerUsageFrom,
	estimatedUsageCostNanodollars
} from '../../src/lib/server/intelligence/usage-accounting.ts';

import { applicationAnswersFrom } from '../../src/lib/server/intelligence/application/batch.ts';
import type { Failure } from '../../src/lib/server/intelligence/types.ts';

import { applicationAdvisoryPlanFrom } from '../../src/lib/server/intelligence/application/plan.ts';
import { applicationExplanationFrom } from '../../src/lib/server/intelligence/application/explanation.ts';

import {
	experimentAuthorizationFrom,
	experimentRequestDigest
} from './experiment-authorization.ts';
import { randomUUID } from 'node:crypto';
import type { ExperimentAudit } from './experiment-audit.ts';

export const EXPERIMENT_TIMEOUT_MS = 10000;

function failureFrom(value: unknown): Failure {
	switch (value) {
		case 'authentication':
		case 'billing':
		case 'invalid_input':
		case 'invalid_output':
		case 'rate':
		case 'concurrency':
		case 'budget':
		case 'timeout':
		case 'provider':
			return value;
		default:
			return 'provider';
	}
}

/**
 * Single-use synthetic experiment dispatcher.
 *
 * No default network implementation.
 * No environment access.
 * No application mutations.
 * No automatic retries.
 */
export function createApplicationExperiment(
	fetcher: typeof fetch,
	audit?: (event: ExperimentAudit) => void
) {
	let consumed = false;

	const resources = createDispatchResources({
		timeoutMs: EXPERIMENT_TIMEOUT_MS,
		requestsPerMinute: 1,
		concurrency: 1,
		budget: RESERVED_TOKENS,
		reservation: RESERVED_TOKENS
	});

	return async function run(args: readonly string[], apiKey?: string) {
		const started = performance.now();
		const requestId = randomUUID();

		const input = {
			objectiveId: 'prepare_tournament',
			fixtureId: 'spring_invitational'
		};

		const request = applicationJevRequestFrom(input);

		const requestSha256 = request ? experimentRequestDigest(JSON.stringify(request)) : undefined;

		let transportAttempts: 0 | 1 = 0;
		let reservation: ExperimentAudit['reservation'] = 'not_reserved';

		function finish<
			T extends {
				status: ExperimentAudit['status'];
				reason?: ExperimentAudit['reason'];
				model?: ExperimentAudit['reportedModel'];
				usage?: ExperimentAudit['usage'];
				estimatedCostNanodollars?: number;
			}
		>(outcome: T): T {
			const event: ExperimentAudit = {
				experiment: 'synthetic_event_assessment',
				requestId,
				requestSha256,
				provider: 'jev',
				status: outcome.status,
				reason: outcome.reason,
				reportedModel: outcome.model,
				durationMs: Math.round(performance.now() - started),
				transportAttempts,
				reservation,
				usage: outcome.usage
					? {
							inputTokens: outcome.usage.inputTokens,
							outputTokens: outcome.usage.outputTokens
						}
					: undefined,
				estimatedCostNanodollars: outcome.estimatedCostNanodollars
			};

			try {
				audit?.(event);
			} catch {
				// An observer failure cannot retry or alter an assessment.
			}

			return outcome;
		}

		if (!request) {
			return finish({
				status: 'unavailable',
				reason: 'invalid_input'
			} as const);
		}

		const body = JSON.stringify(request);

		const authorization = experimentAuthorizationFrom(args, body);

		if (authorization.status !== 'authorized') {
			return finish({
				status: 'disabled',
				reason: 'authorization_required'
			} as const);
		}

		if (consumed) {
			return finish({
				status: 'disabled',
				reason: 'authorization_consumed'
			} as const);
		}

		if (!apiKey || !/^\S+$/.test(apiKey)) {
			return finish({
				status: 'disabled',
				reason: 'credentials_unavailable'
			} as const);
		}

		// Consume authorization before asynchronous work.
		// Failure, timeout and rejection never restore it.
		consumed = true;

		const dispatched = await resources.dispatch(started, async (signal) => {
			reservation = 'retained';

			const countedFetch: typeof fetch = (...parameters) => {
				transportAttempts = 1;
				return fetcher(...parameters);
			};

			const response = await requestJev(apiKey, countedFetch, body, signal);

			if (response.status !== 'received') {
				return response;
			}

			return applicationJevResponseFrom(input, response.payload);
		});

		if (dispatched.status === 'unavailable') {
			return finish(dispatched);
		}

		const result = dispatched.result;

		const { model, usage } = providerUsageFrom(result, RESERVED_TOKENS);

		const metadata = {
			model,
			usage,
			estimatedCostNanodollars: estimatedUsageCostNanodollars(usage),
			durationMs: Math.round(performance.now() - started)
		};

		if (usage && usage.inputTokens > RESERVED_TOKENS) {
			return finish({
				status: 'unavailable',
				reason: 'budget',
				...metadata
			} as const);
		}

		if (result?.status !== 'assessed' || !usage || !usage.inputTokens) {
			return finish({
				status: 'unavailable',
				reason: result?.status === 'unavailable' ? failureFrom(result.reason) : 'invalid_output',
				...metadata
			} as const);
		}

		const answers = applicationAnswersFrom(input, result.answers);

		if (!answers) {
			return finish({
				status: 'unavailable',
				reason: 'invalid_output',
				...metadata
			} as const);
		}

		const plan = applicationAdvisoryPlanFrom(input, answers);
		const explanation = applicationExplanationFrom(input, answers);

		if (!plan || !explanation) {
			return finish({
				status: 'unavailable',
				reason: 'invalid_output',
				...metadata
			} as const);
		}

		dispatched.reconcile(usage.inputTokens);
		reservation = 'reconciled';

		return finish({
			status: 'assessed',
			answers,
			plan,
			explanation,
			...metadata
		} as const);
	};
}
