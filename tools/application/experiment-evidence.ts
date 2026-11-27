import { lstatSync, openSync, writeFileSync, fsyncSync, closeSync, constants } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { MODEL, RESERVED_TOKENS } from '../../src/lib/server/intelligence/providers.ts';
import type { ExperimentAudit } from './experiment-audit.ts';

type EvidenceKind = 'intent' | 'outcome';

function writeEvidence(directory: string, kind: EvidenceKind, record: object): boolean {
	if (!isAbsolute(directory)) return false;

	try {
		const info = lstatSync(directory);

		if (
			!info.isDirectory() ||
			(info.mode & 0o077) !== 0 ||
			(process.getuid && info.uid !== process.getuid())
		) {
			return false;
		}

		const claim = lstatSync(join(directory, 'synthetic-event-assessment.claim'));

		if (
			!claim.isFile() ||
			(claim.mode & 0o077) !== 0 ||
			(process.getuid && claim.uid !== process.getuid())
		) {
			return false;
		}

		const path = join(directory, `synthetic-event-assessment.${kind}.json`);

		const fd = openSync(
			path,
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
			0o600
		);

		try {
			writeFileSync(fd, JSON.stringify(record, null, 2) + '\n');
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

		return true;
	} catch {
		return false;
	}
}

/**
 * Record dispatch intent before allowing network access.
 * Intent is not proof that a provider received a request.
 */
export function persistExperimentIntent(directory: string, digest: string): boolean {
	if (!/^[a-f0-9]{64}$/.test(digest)) return false;

	return writeEvidence(directory, 'intent', {
		experiment: 'synthetic_event_assessment',
		requestSha256: digest,
		provider: 'jev',
		requestedModel: MODEL,
		recordedAt: new Date().toISOString(),
		status: 'dispatch_intent',
		requestCountLimit: 1,
		reservedInputTokens: RESERVED_TOKENS,
		automaticRetries: false
	});
}

/**
 * Persist the sanitized internal dispatcher audit.
 * Never serialize the full assessment or provider response.
 */
export function persistExperimentOutcome(directory: string, event: ExperimentAudit): boolean {
	if (!event.requestSha256 || !/^[a-f0-9]{64}$/.test(event.requestSha256)) {
		return false;
	}

	return writeEvidence(directory, 'outcome', {
		experiment: 'synthetic_event_assessment',
		requestId: event.requestId,
		requestSha256: event.requestSha256,
		provider: 'jev',
		requestedModel: MODEL,
		reportedModel: event.reportedModel,
		recordedAt: new Date().toISOString(),
		status: event.status,
		reason: event.reason,
		durationMs: event.durationMs,
		transportAttempts: event.transportAttempts,
		reservation: event.reservation,
		usage: event.usage
			? {
					inputTokens: event.usage.inputTokens,
					outputTokens: event.usage.outputTokens
				}
			: undefined,
		estimatedCostNanodollars: event.estimatedCostNanodollars
	});
}
