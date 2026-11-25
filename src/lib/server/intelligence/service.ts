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
import { outcomeFrom, record, requestFrom, usageFrom } from './validation.ts';
import type { Audit, Outcome, Provider, Request, Usage } from './types.ts';

type Environment = Readonly<Record<string, string | undefined>>;
type Options = { fetch?: typeof fetch; audit?: (event: Audit) => void };

function limit(value: string | undefined, fallback: number, max: number) {
	if (value === undefined) return fallback;
	if (!/^[1-9][0-9]*$/.test(value)) return 0;
	const number = Number(value);
	return number <= max ? number : 0;
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
	let committedTokens = 0;
	let budgetClosed = false;
	let inFlight = 0;
	const starts: number[] = [];

	return {
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
			if (inFlight >= concurrency) return finish({ status: 'unavailable', reason: 'concurrency' });
			while (starts.length && started - starts[0] >= 60_000) starts.shift();
			if (starts.length >= requestsPerMinute)
				return finish({ status: 'unavailable', reason: 'rate' });
			if (budgetClosed || committedTokens + reservation > budget)
				return finish({ status: 'unavailable', reason: 'budget' });

			starts.push(started);
			committedTokens += reservation;
			inFlight++;
			const controller = new AbortController();
			let timer: ReturnType<typeof setTimeout> | undefined;
			const timedOut = new Promise<null>((resolve) => {
				timer = setTimeout(() => {
					resolve(null);
					controller.abort();
				}, timeoutMs);
			});
			const pending = provider
				.decide(request, controller.signal)
				.then(record, (): Record<string, unknown> => ({
					status: 'unavailable',
					reason: 'provider'
				}))
				.then((result) => {
					if (
						reservation &&
						result?.model === MODEL &&
						(usageFrom(result.usage)?.inputTokens ?? 0) > reservation
					) {
						budgetClosed = true;
					}
					return result;
				})
				.finally(() => {
					inFlight--;
				});
			const result = await Promise.race([pending, timedOut]);
			clearTimeout(timer);
			if (result === null) return finish({ status: 'unavailable', reason: 'timeout' });
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
				if (outcome.status !== 'unavailable') committedTokens -= reservation - usage.inputTokens;
			}
			return finish(outcome, usage, model);
		}
	};
}
