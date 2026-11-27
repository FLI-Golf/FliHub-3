import { types } from 'node:util';
import {
	ABSTENTION_REASONS,
	ADVISORY_LIMITS,
	ADVISORY_VERSION,
	DOCUMENTATION_IDS,
	EVIDENCE_PROVENANCE,
	EVIDENCE_RECOMMENDATIONS,
	PLANNING_RECOMMENDATIONS,
	ROADMAP_OBJECTIVES,
	UNAVAILABLE_REASONS,
	type AdvisoryKind,
	type DevelopmentAdvisoryOutcome,
	type DevelopmentAdvisoryRequest
} from './contracts.ts';

type DataRecord = Record<string, unknown>;

type ValidationResult<T> =
	{ ok: true; value: T } | { ok: false; reason: 'invalid-request' | 'invalid-response' };

class InvalidAdvisoryData extends Error {
	constructor() {
		super('Invalid development advisory data');
	}
}

function requireCondition(condition: unknown): asserts condition {
	if (!condition) throw new InvalidAdvisoryData();
}

/**
 * Reject recognizable credential signatures as defense in depth.
 * This is not a comprehensive secret or private-data detector.
 */
function containsCredentialSignature(value: string): boolean {
	return [
		/-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
		/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/,
		/\bsk-[A-Za-z0-9_-]{12,}\b/,
		/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
		/\b(?:api[_ -]?key|access[_ -]?token|password|secret|authorization)\s*[:=]\s*\S+/i,
		/\bBearer\s+[A-Za-z0-9._~+/-]{8,}/i
	].some((pattern) => pattern.test(value));
}

function safeText(value: unknown, maxBytes: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value === value.trim() &&
		Buffer.byteLength(value, 'utf8') <= maxBytes &&
		!/[\p{C}\p{Zl}\p{Zp}]/u.test(value) &&
		!containsCredentialSignature(value)
	);
}

/**
 * Copy only bounded, ordinary data.
 *
 * Never invoke getters, proxy traps, custom serializers or
 * user-provided iteration methods. Reject cyclic structures.
 */
function copyData(input: unknown, byteLimit: number): unknown {
	let nodes = 0;
	let textBytes = 0;
	const ancestors = new Set<object>();

	function accountText(value: string): void {
		textBytes += Buffer.byteLength(value, 'utf8');
		requireCondition(textBytes <= byteLimit);
	}

	function visit(value: unknown, depth: number): unknown {
		requireCondition(depth <= 12 && ++nodes <= 512);

		if (value === null || typeof value === 'boolean') return value;

		if (typeof value === 'string') {
			requireCondition(safeText(value, ADVISORY_LIMITS.objectiveBytes));
			accountText(value);
			return value;
		}

		if (typeof value === 'number') {
			requireCondition(Number.isFinite(value) && !Object.is(value, -0));
			return value;
		}

		requireCondition(typeof value === 'object' && value !== null);
		requireCondition(!types.isProxy(value));
		requireCondition(!ancestors.has(value));

		ancestors.add(value);

		try {
			if (Array.isArray(value)) {
				requireCondition(Object.getPrototypeOf(value) === Array.prototype);

				const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;

				requireCondition(
					typeof length === 'number' && Number.isSafeInteger(length) && length >= 0 && length <= 8
				);

				const keys = Reflect.ownKeys(value);
				requireCondition(keys.length === length + 1);

				const result: unknown[] = [];

				for (let index = 0; index < length; index++) {
					const descriptor = Object.getOwnPropertyDescriptor(value, String(index));

					requireCondition(
						descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value')
					);

					result.push(visit(descriptor.value, depth + 1));
				}

				return result;
			}

			const prototype = Object.getPrototypeOf(value);
			requireCondition(prototype === Object.prototype || prototype === null);

			const keys = Reflect.ownKeys(value);
			requireCondition(keys.length <= 8);

			const result: DataRecord = Object.create(null);

			for (const key of keys) {
				requireCondition(typeof key === 'string');
				requireCondition(/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(key));
				requireCondition(key !== '__proto__' && key !== 'constructor' && key !== 'prototype');

				const descriptor = Object.getOwnPropertyDescriptor(value, key);

				requireCondition(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));

				accountText(key);
				result[key] = visit(descriptor.value, depth + 1);
			}

			return result;
		} finally {
			ancestors.delete(value);
		}
	}

	const result = visit(input, 0);
	requireCondition(Buffer.byteLength(JSON.stringify(result), 'utf8') <= byteLimit);
	return result;
}

function record(value: unknown): DataRecord {
	requireCondition(typeof value === 'object' && value !== null && !Array.isArray(value));

	return value as DataRecord;
}

function exact(value: unknown, keys: readonly string[]): DataRecord {
	const result = record(value);

	requireCondition(
		Object.keys(result).length === keys.length && keys.every((key) => Object.hasOwn(result, key))
	);

	return result;
}

function member<T extends string>(value: unknown, allowed: readonly T[]): value is T {
	return typeof value === 'string' && allowed.includes(value as T);
}

function boundedArray(value: unknown, limit: number): unknown[] {
	requireCondition(Array.isArray(value) && value.length <= limit);
	return value;
}

function unique(seen: Set<string>, key: string): void {
	requireCondition(!seen.has(key));
	seen.add(key);
}

function validateObjective(value: unknown): void {
	const objective = record(value);

	if (objective.kind === 'roadmap') {
		exact(objective, ['kind', 'id']);
		requireCondition(member(objective.id, ROADMAP_OBJECTIVES));
		return;
	}

	requireCondition(objective.kind === 'custom');
	exact(objective, ['kind', 'summary']);
	requireCondition(safeText(objective.summary, ADVISORY_LIMITS.objectiveBytes));
}

function validateRepositoryFacts(value: unknown): void {
	const seen = new Set<string>();

	for (const item of boundedArray(value, ADVISORY_LIMITS.repositoryFacts)) {
		const fact = exact(item, ['kind', 'value']);

		switch (fact.kind) {
			case 'starting-checkpoint':
			case 'current-checkpoint':
				requireCondition(typeof fact.value === 'string' && /^[a-f0-9]{40}$/.test(fact.value));
				break;

			case 'working-tree':
				requireCondition(member(fact.value, ['clean', 'modified', 'unknown']));
				break;

			case 'tracking-relationship':
				requireCondition(
					member(fact.value, ['synchronized', 'ahead', 'behind', 'diverged', 'unknown'])
				);
				break;

			default:
				throw new InvalidAdvisoryData();
		}

		unique(seen, fact.kind);
	}
}

function validateDocumentationReferences(value: unknown): void {
	const seen = new Set<string>();

	for (const item of boundedArray(value, ADVISORY_LIMITS.documentationReferences)) {
		const reference = exact(item, ['id', 'section']);

		requireCondition(member(reference.id, DOCUMENTATION_IDS));
		requireCondition(safeText(reference.section, ADVISORY_LIMITS.summaryBytes));

		unique(seen, JSON.stringify([reference.id, reference.section]));
	}
}

function validateContext(value: unknown): void {
	const context = exact(value, ['objective', 'repositoryFacts', 'documentationReferences']);

	validateObjective(context.objective);
	validateRepositoryFacts(context.repositoryFacts);
	validateDocumentationReferences(context.documentationReferences);
}

function validateEvidence(value: unknown): void {
	const seen = new Set<string>();

	for (const item of boundedArray(value, ADVISORY_LIMITS.evidenceSummaries)) {
		const evidence = exact(item, ['provenance', 'summary']);

		requireCondition(member(evidence.provenance, EVIDENCE_PROVENANCE));
		requireCondition(safeText(evidence.summary, ADVISORY_LIMITS.summaryBytes));

		unique(seen, JSON.stringify([evidence.provenance, evidence.summary]));
	}
}

function validKind(value: unknown): value is AdvisoryKind {
	return value === 'planning' || value === 'evidence-assessment';
}

/**
 * Structural validation does not approve outbound disclosure,
 * authenticate repository facts or verify evidence provenance.
 */
export function validateAdvisoryRequest(
	input: unknown
): ValidationResult<DevelopmentAdvisoryRequest> {
	try {
		const request = record(copyData(input, ADVISORY_LIMITS.requestBytes));

		requireCondition(request.version === ADVISORY_VERSION);
		requireCondition(validKind(request.kind));

		if (request.kind === 'planning') {
			exact(request, ['version', 'kind', 'context', 'requestedRecommendation']);
			requireCondition(request.requestedRecommendation === 'next-planning-step');
		} else {
			exact(request, [
				'version',
				'kind',
				'context',
				'evidenceSummaries',
				'requestedRecommendation'
			]);

			requireCondition(request.requestedRecommendation === 'next-evidence-review-step');
			validateEvidence(request.evidenceSummaries);
		}

		validateContext(request.context);

		return {
			ok: true,
			value: request as unknown as DevelopmentAdvisoryRequest
		};
	} catch (error) {
		if (!(error instanceof InvalidAdvisoryData)) throw error;
		return { ok: false, reason: 'invalid-request' };
	}
}

/**
 * Outcomes must match the expected advisory kind.
 * A valid recommendation remains advisory and non-authoritative.
 */
export function validateAdvisoryOutcome(
	input: unknown,
	expectedKind: AdvisoryKind
): ValidationResult<DevelopmentAdvisoryOutcome> {
	try {
		requireCondition(validKind(expectedKind));

		const outcome = record(copyData(input, ADVISORY_LIMITS.responseBytes));

		requireCondition(outcome.version === ADVISORY_VERSION);
		requireCondition(outcome.kind === expectedKind);

		switch (outcome.status) {
			case 'recommendation': {
				exact(outcome, ['version', 'kind', 'status', 'recommendation', 'confidence']);

				const allowed =
					expectedKind === 'planning' ? PLANNING_RECOMMENDATIONS : EVIDENCE_RECOMMENDATIONS;

				requireCondition(member(outcome.recommendation, allowed));

				requireCondition(
					outcome.confidence === null ||
						(typeof outcome.confidence === 'number' &&
							Number.isFinite(outcome.confidence) &&
							outcome.confidence >= 0 &&
							outcome.confidence <= 1)
				);

				break;
			}

			case 'abstention':
				exact(outcome, ['version', 'kind', 'status', 'reason']);
				requireCondition(member(outcome.reason, ABSTENTION_REASONS));
				break;

			case 'unavailable':
				exact(outcome, ['version', 'kind', 'status', 'reason']);
				requireCondition(member(outcome.reason, UNAVAILABLE_REASONS));
				break;

			default:
				throw new InvalidAdvisoryData();
		}

		return {
			ok: true,
			value: outcome as unknown as DevelopmentAdvisoryOutcome
		};
	} catch (error) {
		if (!(error instanceof InvalidAdvisoryData)) throw error;
		return { ok: false, reason: 'invalid-response' };
	}
}
