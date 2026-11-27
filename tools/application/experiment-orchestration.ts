import { lstatSync } from 'node:fs';
import { join } from 'node:path';

import { applicationJevRequestFrom } from '../../src/lib/server/intelligence/application/jev-adapter.ts';

import {
	experimentAuthorizationFrom,
	experimentRequestDigest
} from './experiment-authorization.ts';

import { claimExperimentAuthorization } from './experiment-claim.ts';

import { persistExperimentIntent, persistExperimentOutcome } from './experiment-evidence.ts';

import { createApplicationExperiment } from './experiment-dispatch.ts';

import type { ExperimentAudit } from './experiment-audit.ts';

/**
 * Dedicated terminal orchestration for the first synthetic experiment.
 *
 * No default network implementation or environment access.
 * Persistent authorization is never automatically restored.
 */
export async function runApplicationExperiment(
	args: readonly string[],
	apiKey: string | undefined,
	directory: string,
	fetcher: typeof fetch
) {
	const input = {
		objectiveId: 'prepare_tournament',
		fixtureId: 'spring_invitational'
	};

	const request = applicationJevRequestFrom(input);

	if (!request) {
		return {
			status: 'blocked',
			reason: 'invalid_experiment'
		} as const;
	}

	const body = JSON.stringify(request);
	const digest = experimentRequestDigest(body);
	const authorization = experimentAuthorizationFrom(args, body);

	if (authorization.status !== 'authorized') {
		return {
			status: 'blocked',
			reason: 'authorization_required'
		} as const;
	}

	if (!apiKey || !/^\S+$/.test(apiKey)) {
		return {
			status: 'blocked',
			reason: 'credentials_unavailable'
		} as const;
	}

	const claim = claimExperimentAuthorization(directory, digest);

	if (claim.status !== 'claimed') {
		return {
			status: 'blocked',
			reason: claim.reason
		} as const;
	}

	// Reject existing outcome evidence before dispatch.
	try {
		lstatSync(join(directory, 'synthetic-event-assessment.outcome.json'));

		return {
			status: 'blocked',
			reason: 'outcome_evidence_exists'
		} as const;
	} catch (error) {
		if (
			typeof error !== 'object' ||
			error === null ||
			!('code' in error) ||
			error.code !== 'ENOENT'
		) {
			return {
				status: 'blocked',
				reason: 'storage_unavailable'
			} as const;
		}
	}

	if (!persistExperimentIntent(directory, digest)) {
		return {
			status: 'blocked',
			reason: 'intent_storage_failed'
		} as const;
	}

	let outcomePersisted = false;
	let auditCount = 0;

	const audit = (event: ExperimentAudit): void => {
		auditCount++;

		if (auditCount !== 1 || event.requestSha256 !== digest) {
			outcomePersisted = false;
			return;
		}

		outcomePersisted = persistExperimentOutcome(directory, event);
	};

	const guardedFetch: typeof fetch = (...parameters) => {
		const options = parameters[1];

		if (options?.body !== body || options?.method !== 'POST' || options?.redirect !== 'error') {
			throw new Error('Experiment transport contract mismatch');
		}

		return fetcher(...parameters);
	};

	const run = createApplicationExperiment(guardedFetch, audit);

	try {
		const result = await run(args, apiKey);

		if (!outcomePersisted || auditCount !== 1) {
			return {
				status: 'blocked',
				reason: 'outcome_storage_failed',
				authorizationConsumed: true,
				providerReceiptUnknown: true
			} as const;
		}

		return result;
	} catch {
		return {
			status: 'blocked',
			reason: 'experiment_interrupted',
			authorizationConsumed: true,
			providerReceiptUnknown: true
		} as const;
	}
}
