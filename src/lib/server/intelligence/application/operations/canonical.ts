import { createHash } from 'node:crypto';
import { types } from 'node:util';

const maxDepth = 32;
const maxNodes = 20000;
const maxStringLength = 16384;
const maxSerializedBytes = 262144;

/**
 * Canonical serialization for bounded local synthetic data.
 *
 * Object keys are sorted. Array order is preserved.
 * Accessors, unsupported values, cycles and unexpected
 * object prototypes are rejected.
 *
 * This is a local versioned format, not a claim of
 * compatibility with an external canonical JSON standard.
 */
export function canonicalJson(value: unknown): string {
	let nodes = 0;

	const ancestors = new Set<object>();

	function encode(input: unknown, depth: number): string {
		nodes++;

		if (depth > maxDepth || nodes > maxNodes) {
			throw new Error('Canonical data limit exceeded');
		}

		if (input === null) return 'null';

		if (typeof input === 'boolean') {
			return input ? 'true' : 'false';
		}

		if (typeof input === 'string') {
			if (input.length > maxStringLength) {
				throw new Error('String limit exceeded');
			}

			return JSON.stringify(input);
		}

		if (typeof input === 'number') {
			if (!Number.isSafeInteger(input) || Object.is(input, -0)) {
				throw new Error('Unsupported number');
			}

			return JSON.stringify(input);
		}

		if (typeof input !== 'object') {
			throw new Error('Unsupported canonical value');
		}

		if (types.isProxy(input)) {
			throw new Error('Proxy values are not supported');
		}

		if (ancestors.has(input)) {
			throw new Error('Cyclic canonical data');
		}

		ancestors.add(input);

		try {
			const descriptors = Object.getOwnPropertyDescriptors(input);

			const keys = Reflect.ownKeys(descriptors);

			if (keys.some((key) => typeof key !== 'string')) {
				throw new Error('Unsupported property key');
			}

			if (Array.isArray(input)) {
				if (
					Object.getPrototypeOf(input) !== Array.prototype ||
					input.length > maxNodes ||
					keys.length !== input.length + 1
				) {
					throw new Error('Unsupported array');
				}

				const values: string[] = [];

				for (let index = 0; index < input.length; index++) {
					const descriptor = descriptors[String(index)];

					if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
						throw new Error('Invalid array element');
					}

					values.push(encode(descriptor.value, depth + 1));
				}

				return `[${values.join(',')}]`;
			}

			const prototype = Object.getPrototypeOf(input);

			if (prototype !== Object.prototype && prototype !== null) {
				throw new Error('Unsupported object prototype');
			}

			const values: string[] = [];

			for (const key of Object.keys(descriptors).sort()) {
				const descriptor = descriptors[key];

				if (
					!Object.hasOwn(descriptor, 'value') ||
					!descriptor.enumerable ||
					key.length > maxStringLength
				) {
					throw new Error('Invalid object property');
				}

				values.push(`${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}`);
			}

			return `{${values.join(',')}}`;
		} finally {
			ancestors.delete(input);
		}
	}

	const result = encode(value, 0);

	if (Buffer.byteLength(result, 'utf8') > maxSerializedBytes) {
		throw new Error('Canonical byte limit exceeded');
	}

	return result;
}

export function canonicalSha256(value: unknown): string {
	return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
