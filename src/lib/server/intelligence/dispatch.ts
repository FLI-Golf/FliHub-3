/**
 * Process-local intelligence dispatch resource controls.
 *
 * Shared infrastructure, not an authorization boundary.
 * Keep one controller per intelligence service instance.
 */

import { MODEL } from './providers.ts';
import { record, usageFrom } from './validation.ts';
import type { Failure } from './types.ts';

interface DispatchLimits {
	readonly timeoutMs: number;
	readonly requestsPerMinute: number;
	readonly concurrency: number;
	readonly budget: number;
	readonly reservation: number;
}

type DispatchResult =
	| {
			status: 'settled';
			result: Record<string, unknown> | undefined;
			reconcile: (inputTokens: number) => void;
	  }
	| {
			status: 'unavailable';
			reason: Failure;
	  };

export function createDispatchResources(limits: DispatchLimits) {
	const { timeoutMs, requestsPerMinute, concurrency, budget, reservation } = limits;

	let committedTokens = 0;
	let budgetClosed = false;
	let inFlight = 0;
	const starts: number[] = [];

	return {
		async dispatch(
			started: number,
			invoke: (signal: AbortSignal) => Promise<unknown>
		): Promise<DispatchResult> {
			if (inFlight >= concurrency) {
				return { status: 'unavailable', reason: 'concurrency' };
			}

			while (starts.length && started - starts[0] >= 60_000) {
				starts.shift();
			}

			if (starts.length >= requestsPerMinute) {
				return { status: 'unavailable', reason: 'rate' };
			}

			if (budgetClosed || committedTokens + reservation > budget) {
				return { status: 'unavailable', reason: 'budget' };
			}

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

			const pending = Promise.resolve()
				.then(() => invoke(controller.signal))
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

			if (result === null) {
				return { status: 'unavailable', reason: 'timeout' };
			}

			const reportedInputTokens =
				result?.model === MODEL ? usageFrom(result.usage)?.inputTokens : undefined;

			let reconciled = false;

			return {
				status: 'settled',
				result,
				reconcile(inputTokens: number) {
					if (
						reconciled ||
						!reservation ||
						!Number.isSafeInteger(inputTokens) ||
						inputTokens <= 0 ||
						inputTokens > reservation
					) {
						return;
					}

					if (reportedInputTokens !== inputTokens) {
						return;
					}

					reconciled = true;
					committedTokens -= reservation - inputTokens;
				}
			};
		}
	};
}
