/**
 * Minimized synthetic event context.
 *
 * This contract does not represent an authoritative
 * PocketBase event or production readiness policy.
 */

export interface SyntheticEventContext {
	readonly source: 'synthetic';
	readonly activity: 'disc-golf';
	readonly status: 'draft';
	readonly dateAssigned: boolean | null;
	readonly venueAssigned: boolean | null;
	readonly participantCount: number | null;
	readonly groupCount: number | null;
	readonly scoringConfigured: boolean | null;
}

const contextKeys = [
	'source',
	'activity',
	'status',
	'dateAssigned',
	'venueAssigned',
	'participantCount',
	'groupCount',
	'scoringConfigured'
] as const;

function nullableBoolean(value: unknown): value is boolean | null {
	return value === null || typeof value === 'boolean';
}

function nullableCount(value: unknown): value is number | null {
	return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}

export function syntheticEventContextFrom(value: unknown): SyntheticEventContext | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return null;
	}

	const prototype = Object.getPrototypeOf(value);

	if (prototype !== Object.prototype && prototype !== null) {
		return null;
	}

	const descriptors = Object.getOwnPropertyDescriptors(value);

	if (
		Reflect.ownKeys(descriptors).length !== contextKeys.length ||
		!contextKeys.every(
			(key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value')
		)
	) {
		return null;
	}

	const {
		source,
		activity,
		status,
		dateAssigned,
		venueAssigned,
		participantCount,
		groupCount,
		scoringConfigured
	} = value as Record<string, unknown>;

	if (
		source !== 'synthetic' ||
		activity !== 'disc-golf' ||
		status !== 'draft' ||
		!nullableBoolean(dateAssigned) ||
		!nullableBoolean(venueAssigned) ||
		!nullableCount(participantCount) ||
		!nullableCount(groupCount) ||
		!nullableBoolean(scoringConfigured)
	) {
		return null;
	}

	// Consistency rule for this synthetic fixture only.
	if (participantCount !== null && groupCount !== null && groupCount > participantCount) {
		return null;
	}

	return {
		source,
		activity,
		status,
		dateAssigned,
		venueAssigned,
		participantCount,
		groupCount,
		scoringConfigured
	};
}
