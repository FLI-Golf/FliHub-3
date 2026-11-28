import {
	canonicalJson,
	canonicalSha256
} from '../../../src/lib/server/intelligence/application/operations/canonical.ts';
import {
	contextLimits,
	isObjective,
	observationTime,
	requireFact,
	validateContext,
	type Context,
	type Objective
} from './contract.ts';

export const contextLifetimeMs = 60_000;
const purpose = 'bounded-real-development-advisory-review';
type Collect = (objective: Objective, includeQualification: boolean) => Promise<Context>;

function comparable(context: Context): string {
	return canonicalSha256({
		...context,
		facts: context.facts.map(({ observedAt, ...fact }) => {
			observationTime(observedAt);
			return fact;
		})
	});
}

function checkedClock(now: () => number) {
	const stamp = now();
	requireFact(
		Number.isSafeInteger(stamp) && stamp >= Date.UTC(2000, 0, 1) && stamp < Date.UTC(2100, 0, 1)
	);
	return stamp;
}

export async function prepareRealContextReview(
	collect: Collect,
	objective: Objective,
	includeQualification = false,
	now: () => number = Date.now
) {
	async function freshContext() {
		const start = checkedClock(now);
		const context = validateContext(await collect(objective, includeQualification));
		const finish = checkedClock(now);
		requireFact(
			context.objective === objective && finish >= start && finish - start < contextLifetimeMs
		);
		const times = context.facts.map((f) => observationTime(f.observedAt));
		requireFact(times.every((t) => t >= start && t <= finish));
		const optional = context.facts.some((f) => f.id === 'engineering-qualification');
		requireFact(optional === includeQualification);
		return { context, start, finish, oldest: Math.min(...times) };
	}
	requireFact(isObjective(objective));
	const initial = await freshContext();
	const contextDigest = canonicalSha256(initial.context);
	const envelope = {
		version: 1,
		mode: 'offline-review-only',
		purpose,
		proposedDestination: 'typesafe-jev-api',
		dispatchAuthorized: false,
		executionAuthorized: false,
		limits: contextLimits,
		contextDigest,
		context: initial.context
	};
	const canonicalPayload = canonicalJson(envelope);
	const bytes = Buffer.byteLength(canonicalPayload, 'utf8');
	requireFact(bytes <= contextLimits.requestBytes);
	const reviewDigest = canonicalSha256(envelope);
	const identity = comparable(initial.context);
	const expiresAt = initial.oldest + contextLifetimeMs;
	let available = true;
	let cancelled = false;

	return Object.freeze({
		canonicalPayload,
		bytes,
		reviewDigest,
		contextDigest,
		expiresAt,
		cancel() {
			cancelled = true;
			available = false;
		},
		async confirm(confirmation: string) {
			// Attempt consumes the local review, even if it fails or is concurrent.
			if (!available) return false;
			available = false;
			if (confirmation !== `APPROVE ${reviewDigest}`) return false;
			try {
				const time = checkedClock(now);
				requireFact(time >= initial.finish && time < expiresAt);
				const refreshed = await freshContext();
				requireFact(refreshed.start >= time && refreshed.finish < expiresAt);
				return !cancelled && comparable(refreshed.context) === identity;
			} catch {
				return false;
			}
		}
	});
}
