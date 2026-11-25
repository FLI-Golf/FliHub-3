import { MODEL, NANODOLLARS_PER_TOKEN, RESERVED_TOKENS } from './providers.ts';
import { usageFrom } from './validation.ts';
import type { Usage } from './types.ts';

/**
 * Shared provider usage accounting.
 *
 * Reported usage is not proof of a provider invoice.
 * Reservation and reconciliation remain the responsibility
 * of the shared dispatch controller.
 */

export function providerUsageFrom(
	result: Record<string, unknown> | undefined,
	reservation: number
): {
	model?: typeof MODEL;
	usage?: Usage;
} {
	if (!reservation || result?.model !== MODEL) {
		return {};
	}

	return {
		model: MODEL,
		usage: usageFrom(result.usage)
	};
}

export function estimatedUsageCostNanodollars(usage: Usage | undefined): number | undefined {
	const validated = usageFrom(usage);

	if (!validated || validated.inputTokens > RESERVED_TOKENS) {
		return undefined;
	}

	return validated.inputTokens * NANODOLLARS_PER_TOKEN;
}
