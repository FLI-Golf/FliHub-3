import { types } from 'node:util';
import { ADVISORY_LIMITS, type DevelopmentAdvisoryRequest } from './contracts.ts';
import { validateAdvisoryRequest } from './validation.ts';
import {
	canonicalJson,
	canonicalSha256
} from '../../../src/lib/server/intelligence/application/operations/canonical.ts';

export const DISCLOSURE_VERSION = 1 as const;

export const DISCLOSURE_LIMITS = Object.freeze({
	maxInputTokens: 100_000_000,
	maxCostUsdMicros: 100_000_000,
	maxTimeoutMs: 10_000,
	maxRequests: 1
});

export type DisclosureLimits = {
	maxRequests: 1;
	maxInputTokens: number;
	maxCostUsdMicros: number;
	timeoutMs: number;
};

export type DisclosureSource =
	| 'roadmap-objective'
	| 'operator-objective'
	| 'repository-facts'
	| 'documentation-references'
	| 'evidence-summaries';

export type DisclosureEnvelope = {
	version: typeof DISCLOSURE_VERSION;
	provider: 'jev';
	destination: 'typesafe-jev-api';
	decision: DevelopmentAdvisoryRequest['kind'];
	purpose: 'bounded-development-planning' | 'bounded-development-evidence-assessment';
	sources: readonly DisclosureSource[];
	limits: Readonly<DisclosureLimits> & { maxPayloadBytes: number };
	retention: {
		flihub: 'process-memory-only';
		provider: 'unverified';
	};
	payload: {
		encoding: 'utf-8';
		mediaType: 'application/json';
		byteLength: number;
		sha256: string;
		canonicalJson: string;
	};
};

export type PreparedDisclosure = {
	envelope: DisclosureEnvelope;
	reviewDigest: string;
	reviewText: string;
};

function fail(): never {
	throw new Error('Invalid development advisory disclosure');
}

function ownDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
	if (typeof value !== 'object' || value === null) return fail();
	if (types.isProxy(value)) return fail();
	if (Array.isArray(value)) return fail();
	if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
		return fail();
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actualKeys = Reflect.ownKeys(descriptors);
	if (
		actualKeys.length !== keys.length ||
		actualKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
	)
		return fail();
	const output: Record<string, unknown> = Object.create(null);
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return fail();
		output[key] = descriptor.value;
	}
	return output;
}

function copyLimits(value: unknown): DisclosureLimits {
	const input = ownDataRecord(value, [
		'maxRequests',
		'maxInputTokens',
		'maxCostUsdMicros',
		'timeoutMs'
	]);
	if (
		input.maxRequests !== DISCLOSURE_LIMITS.maxRequests ||
		!Number.isSafeInteger(input.maxInputTokens) ||
		(input.maxInputTokens as number) < 1 ||
		(input.maxInputTokens as number) > DISCLOSURE_LIMITS.maxInputTokens ||
		!Number.isSafeInteger(input.maxCostUsdMicros) ||
		(input.maxCostUsdMicros as number) < 1 ||
		(input.maxCostUsdMicros as number) > DISCLOSURE_LIMITS.maxCostUsdMicros ||
		!Number.isSafeInteger(input.timeoutMs) ||
		(input.timeoutMs as number) < 1 ||
		(input.timeoutMs as number) > DISCLOSURE_LIMITS.maxTimeoutMs
	)
		return fail();
	return Object.freeze({
		maxRequests: 1,
		maxInputTokens: input.maxInputTokens as number,
		maxCostUsdMicros: input.maxCostUsdMicros as number,
		timeoutMs: input.timeoutMs as number
	});
}

function freezeTree<T>(value: T): T {
	if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
		for (const key of Reflect.ownKeys(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (descriptor && Object.hasOwn(descriptor, 'value')) freezeTree(descriptor.value);
		}
		Object.freeze(value);
	}
	return value;
}

function sourceList(request: DevelopmentAdvisoryRequest): readonly DisclosureSource[] {
	const sources: DisclosureSource[] = [
		request.context.objective.kind === 'roadmap' ? 'roadmap-objective' : 'operator-objective'
	];
	if (request.context.repositoryFacts.length) sources.push('repository-facts');
	if (request.context.documentationReferences.length) sources.push('documentation-references');
	if (request.kind === 'evidence-assessment' && request.evidenceSummaries.length)
		sources.push('evidence-summaries');
	return Object.freeze(sources);
}

function renderReview(envelope: DisclosureEnvelope, reviewDigest: string): string {
	return [
		'FliHub Qualified Development Advisory — outbound disclosure review',
		`Disclosure format: ${envelope.version}`,
		`Provider: ${envelope.provider}`,
		`Destination: ${envelope.destination}`,
		`Decision: ${envelope.decision}`,
		`Purpose: ${envelope.purpose}`,
		`Sources: ${envelope.sources.join(', ')}`,
		`Limits: maxRequests=${envelope.limits.maxRequests}; maxInputTokens=${envelope.limits.maxInputTokens}; maxCostUsdMicros=${envelope.limits.maxCostUsdMicros}; timeoutMs=${envelope.limits.timeoutMs}; maxPayloadBytes=${envelope.limits.maxPayloadBytes}`,
		`Retention: FliHub=${envelope.retention.flihub}; provider=${envelope.retention.provider}`,
		`Payload encoding: ${envelope.payload.encoding}`,
		`Payload media type: ${envelope.payload.mediaType}`,
		`Payload bytes: ${envelope.payload.byteLength}`,
		`Payload SHA-256: ${envelope.payload.sha256}`,
		`Review SHA-256: ${reviewDigest}`,
		'Exact canonical payload follows:',
		envelope.payload.canonicalJson,
		'',
		'Approval covers this exact disclosure only. It does not authorize provider dispatch, execution, Codex, or acceptance.'
	].join('\n');
}

/** Build a detached immutable, bounded snapshot for offline human review. */
export function createDisclosure(input: { request: unknown; limits: unknown }): PreparedDisclosure {
	const fields = ownDataRecord(input, ['request', 'limits']);
	const validation = validateAdvisoryRequest(fields.request);
	if (!validation.ok) return fail();
	const request = freezeTree(validation.value);
	const limits = copyLimits(fields.limits);
	const canonicalPayload = canonicalJson(request);
	const byteLength = Buffer.byteLength(canonicalPayload, 'utf8');
	if (byteLength > ADVISORY_LIMITS.requestBytes) return fail();
	const payloadDigest = canonicalSha256(request);
	const envelope: DisclosureEnvelope = freezeTree({
		version: DISCLOSURE_VERSION,
		provider: 'jev',
		destination: 'typesafe-jev-api',
		decision: request.kind,
		purpose:
			request.kind === 'planning'
				? 'bounded-development-planning'
				: 'bounded-development-evidence-assessment',
		sources: sourceList(request),
		limits: Object.freeze({ ...limits, maxPayloadBytes: ADVISORY_LIMITS.requestBytes }),
		retention: Object.freeze({ flihub: 'process-memory-only', provider: 'unverified' }),
		payload: Object.freeze({
			encoding: 'utf-8',
			mediaType: 'application/json',
			byteLength,
			sha256: payloadDigest,
			canonicalJson: canonicalPayload
		})
	});
	const reviewDigest = canonicalSha256(envelope);
	return Object.freeze({
		envelope,
		reviewDigest,
		reviewText: renderReview(envelope, reviewDigest)
	});
}
