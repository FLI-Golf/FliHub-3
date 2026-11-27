import { createHash } from 'node:crypto';

export function experimentRequestDigest(body: string): string {
	return createHash('sha256').update(body, 'utf8').digest('hex');
}

export type ExperimentAuthorization =
	| { status: 'preview' }
	| { status: 'authorized' }
	| {
			status: 'rejected';
			reason: 'invalid_arguments' | 'digest_mismatch';
	  };

/**
 * Validate explicit opt-in against the exact request body.
 *
 * This is not authentication or persistent replay protection.
 * This module does not access credentials or perform dispatch.
 */
export function experimentAuthorizationFrom(
	args: readonly string[],
	body: string
): ExperimentAuthorization {
	if (args.length === 0) {
		return { status: 'preview' };
	}

	if (
		args.length !== 3 ||
		args[0] !== '--live' ||
		args[1] !== '--authorize-sha256' ||
		!/^[a-f0-9]{64}$/.test(args[2])
	) {
		return {
			status: 'rejected',
			reason: 'invalid_arguments'
		};
	}

	if (args[2] !== experimentRequestDigest(body)) {
		return {
			status: 'rejected',
			reason: 'digest_mismatch'
		};
	}

	return { status: 'authorized' };
}
