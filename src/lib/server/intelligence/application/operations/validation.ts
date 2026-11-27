import type { ApplicationOperationRequestOutcome } from './contracts.ts';

import { isApplicationOperationId } from './registry.ts';

const requestKeys = ['operationId', 'fixtureId'] as const;

/**
 * Recognize only the registered synthetic operation request.
 *
 * Actor identity, permission claims, approval, arbitrary
 * parameters and execution instructions are not accepted.
 *
 * Recognition is not authorization.
 */
export function validateApplicationOperationRequest(
	value: unknown
): ApplicationOperationRequestOutcome {
	try {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			return {
				status: 'rejected',
				reason: 'invalid_request'
			};
		}

		const prototype = Object.getPrototypeOf(value);

		if (prototype !== Object.prototype && prototype !== null) {
			return {
				status: 'rejected',
				reason: 'invalid_request'
			};
		}

		const descriptors = Object.getOwnPropertyDescriptors(value);

		if (
			Reflect.ownKeys(descriptors).length !== requestKeys.length ||
			!requestKeys.every(
				(key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value')
			)
		) {
			return {
				status: 'rejected',
				reason: 'invalid_request'
			};
		}

		const operationId: unknown = descriptors.operationId.value;

		const fixtureId: unknown = descriptors.fixtureId.value;

		if (!isApplicationOperationId(operationId)) {
			return {
				status: 'rejected',
				reason: 'unknown_operation'
			};
		}

		if (fixtureId !== 'spring_invitational') {
			return {
				status: 'rejected',
				reason: 'unsupported_fixture'
			};
		}

		return {
			status: 'recognized',
			request: {
				operationId,
				fixtureId
			}
		};
	} catch {
		return {
			status: 'rejected',
			reason: 'invalid_request'
		};
	}
}
