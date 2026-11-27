import { createIntelligence } from '../../src/lib/server/intelligence/service.ts';
import {
	NANODOLLARS_PER_TOKEN,
	RESERVED_TOKENS
} from '../../src/lib/server/intelligence/providers.ts';
import type { Audit } from '../../src/lib/server/intelligence/types.ts';
import { decideFixture } from './guardrail.ts';

// Two eligible fixtures. Reserve an entire default context for each.
export const maxEstimatedUsd = (2 * RESERVED_TOKENS * NANODOLLARS_PER_TOKEN) / 1e9;

export async function smoke(optIn: boolean, key?: string, fetcher?: typeof fetch) {
	if (!optIn || !key || !/^\S+$/.test(key)) return { status: 'disabled', maxEstimatedUsd };
	let usage: Audit | undefined;
	const provider = createIntelligence(
		{
			FLIHUB_INTELLIGENCE_ENABLED: 'true',
			FLIHUB_INTELLIGENCE_PROVIDER: 'jev',
			FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '2',
			FLIHUB_INTELLIGENCE_CONCURRENCY: '1',
			FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS: String(2 * RESERVED_TOKENS),
			TYPESAFE_API_KEY: key
		},
		{
			fetch: fetcher,
			audit: (event) => {
				usage = event;
			}
		}
	);

	const results = [];
	// Always exercise mandatory policy locally, even if a later call fails.
	for (const fixture of ['secret', 'test', 'dependency'] as const) {
		usage = undefined;
		const result = await decideFixture(fixture, provider, 'jev');
		results.push({ fixture, ...result, usage: usage as Audit | undefined });
		if (
			result.recommendation &&
			(result.recommendation.status === 'disabled' ||
				result.recommendation.status === 'unavailable' ||
				!(usage as Audit | undefined)?.usage)
		) {
			return { status: 'stopped', results, maxEstimatedUsd };
		}
	}
	return { status: 'complete', results, maxEstimatedUsd };
}

if (import.meta.main) {
	const optIn = process.argv.length === 3 && process.argv[2] === '--live';
	const result = await smoke(optIn, optIn ? process.env.TYPESAFE_API_KEY : undefined);
	console.log(JSON.stringify(result, null, 2));
	if (result.status !== 'complete') process.exitCode = 2;
}
