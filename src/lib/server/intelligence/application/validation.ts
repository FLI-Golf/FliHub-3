import {
	applicationObjectives,
	type ApplicationObjective,
	type ApplicationDecisionRequest,
	type ApplicationDecisionOutcome
} from './contracts.ts';

import { isApplicationCapabilityId, capabilitiesForObjective } from './capabilities.ts';

/**
 * Provisional application recommendation threshold.
 * This is not an authorization or execution policy.
 */
export const APPLICATION_MIN_CONFIDENCE = 0.8;

function isRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);

	return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	return (
		Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
	);
}

export function isApplicationObjective(value: unknown): value is ApplicationObjective {
	return applicationObjectives.some((objective) => objective === value);
}

/**
 * Validate a bounded recommendation request.
 *
 * Candidate compatibility is not operational eligibility.
 * Context-based eligibility is introduced separately.
 */
export function applicationRequestFrom(value: unknown): ApplicationDecisionRequest | null {
	if (!isRecord(value) || !hasExactKeys(value, ['objective', 'candidates'])) {
		return null;
	}

	const { objective, candidates } = value;

	if (!isApplicationObjective(objective) || !Array.isArray(candidates)) {
		return null;
	}

	const compatible = capabilitiesForObjective(objective);

	if (candidates.length > compatible.length) {
		return null;
	}

	const allowed = new Set(compatible.map((capability) => capability.id));

	const validated: ApplicationDecisionRequest['candidates'][number][] = [];

	for (const candidate of candidates) {
		if (
			!isApplicationCapabilityId(candidate) ||
			!allowed.has(candidate) ||
			validated.includes(candidate)
		) {
			return null;
		}

		validated.push(candidate);
	}

	return {
		objective,
		candidates: validated
	};
}

/**
 * Validate a normalized advisory recommendation.
 *
 * This is not the raw TypeSafe API response validator.
 * Provider-specific validation remains a separate boundary.
 */
export function applicationOutcomeFrom(
	request: unknown,
	value: unknown
): ApplicationDecisionOutcome {
	const validated = applicationRequestFrom(request);

	if (!validated) {
		return {
			status: 'unavailable',
			reason: 'invalid_request'
		};
	}

	if (validated.candidates.length === 0) {
		return {
			status: 'abstained',
			reason: 'no_eligible_capability'
		};
	}

	const invalid: ApplicationDecisionOutcome = {
		status: 'unavailable',
		reason: 'invalid_response'
	};

	if (!isRecord(value) || !hasExactKeys(value, ['choice', 'confidence'])) {
		return invalid;
	}

	const { choice, confidence } = value;

	if (
		confidence !== null &&
		(typeof confidence !== 'number' ||
			!Number.isFinite(confidence) ||
			confidence < 0 ||
			confidence > 1)
	) {
		return invalid;
	}

	if (choice === 'abstain') {
		return {
			status: 'abstained',
			reason: 'explicit'
		};
	}

	if (!isApplicationCapabilityId(choice) || !validated.candidates.includes(choice)) {
		return invalid;
	}

	if (confidence === null) {
		return {
			status: 'abstained',
			reason: 'confidence_missing'
		};
	}

	if (confidence < APPLICATION_MIN_CONFIDENCE) {
		return {
			status: 'abstained',
			reason: 'confidence_below_threshold'
		};
	}

	return {
		status: 'suggested',
		capability: choice,
		confidence
	};
}
