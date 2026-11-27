import {
	mkdirSync,
	lstatSync,
	openSync,
	writeFileSync,
	fsyncSync,
	closeSync,
	constants
} from 'node:fs';
import { join, isAbsolute } from 'node:path';

export type ExperimentClaim =
	| { status: 'claimed' }
	| {
			status: 'rejected';
			reason: 'already_claimed' | 'invalid_claim' | 'storage_unavailable';
	  };

function errorCode(error: unknown): unknown {
	return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

/**
 * Local filesystem replay protection for the first synthetic experiment.
 *
 * Claims are never automatically removed, including after failed writes.
 * This is not distributed authorization or authentication.
 */
export function claimExperimentAuthorization(directory: string, digest: string): ExperimentClaim {
	if (!isAbsolute(directory) || !/^[a-f0-9]{64}$/.test(digest)) {
		return { status: 'rejected', reason: 'invalid_claim' };
	}

	try {
		mkdirSync(directory, { recursive: true, mode: 0o700 });

		const info = lstatSync(directory);

		if (
			!info.isDirectory() ||
			(info.mode & 0o077) !== 0 ||
			(process.getuid && info.uid !== process.getuid())
		) {
			return { status: 'rejected', reason: 'storage_unavailable' };
		}

		const path = join(directory, 'synthetic-event-assessment.claim');

		let fd: number;

		try {
			fd = openSync(
				path,
				constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
				0o600
			);
		} catch (error) {
			return {
				status: 'rejected',
				reason: errorCode(error) === 'EEXIST' ? 'already_claimed' : 'storage_unavailable'
			};
		}

		try {
			writeFileSync(
				fd,
				JSON.stringify({
					experiment: 'synthetic_event_assessment',
					requestSha256: digest,
					claimedAt: new Date().toISOString()
				}) + '\n'
			);

			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}

		const directoryFd = openSync(
			directory,
			constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
		);

		try {
			fsyncSync(directoryFd);
		} finally {
			closeSync(directoryFd);
		}

		return { status: 'claimed' };
	} catch {
		return { status: 'rejected', reason: 'storage_unavailable' };
	}
}
