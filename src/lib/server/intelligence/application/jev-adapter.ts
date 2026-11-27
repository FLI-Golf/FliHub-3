import { MODEL } from '../providers.ts';
import { applicationBatchFrom, applicationAnswersFrom } from './batch.ts';

/**
 * Offline wire-contract adapter for registered synthetic
 * application assessments.
 *
 * This module does not perform network requests,
 * authorize execution, or access application records.
 */

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return null;
	}

	const prototype = Object.getPrototypeOf(value);

	if (prototype !== Object.prototype && prototype !== null) {
		return null;
	}

	const descriptors = Object.getOwnPropertyDescriptors(value);

	if (
		Reflect.ownKeys(descriptors).length !== keys.length ||
		!keys.every(
			(key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value')
		)
	) {
		return null;
	}

	return value as Record<string, unknown>;
}

function tokenCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Construct only registered synthetic requests.
 * No arbitrary state, prompts or provider parameters.
 */
export function applicationJevRequestFrom(input: unknown) {
	const batch = applicationBatchFrom(input);

	if (!batch) return null;

	return {
		model: MODEL,
		state: batch.state,
		questions: batch.questions
	};
}

/**
 * Validate provider metadata and the complete answer set.
 * Valid usage remains available even when answers are invalid.
 */
export function applicationJevResponseFrom(input: unknown, value: unknown) {
	if (!applicationBatchFrom(input)) {
		return {
			status: 'unavailable',
			reason: 'invalid_input'
		} as const;
	}

	const envelope = exactRecord(value, ['model', 'answers', 'usage']);

	if (!envelope || envelope.model !== MODEL) {
		return {
			status: 'unavailable',
			reason: 'invalid_output'
		} as const;
	}

	const usage = exactRecord(envelope.usage, ['input_tokens', 'output_tokens']);

	if (
		!usage ||
		!tokenCount(usage.input_tokens) ||
		usage.input_tokens === 0 ||
		!tokenCount(usage.output_tokens)
	) {
		return {
			status: 'unavailable',
			reason: 'invalid_output'
		} as const;
	}

	const metadata = {
		model: MODEL,
		usage: {
			inputTokens: usage.input_tokens,
			outputTokens: usage.output_tokens
		}
	};

	const answers = applicationAnswersFrom(input, envelope.answers);

	if (!answers) {
		return {
			status: 'unavailable',
			reason: 'invalid_output',
			...metadata
		} as const;
	}

	return {
		status: 'assessed',
		answers,
		...metadata
	} as const;
}
