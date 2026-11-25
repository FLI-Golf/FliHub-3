import { fileURLToPath } from 'node:url';

import { applicationJevRequestFrom } from '../../src/lib/server/intelligence/application/jev-adapter.ts';

import {
	MODEL,
	RESERVED_TOKENS,
	NANODOLLARS_PER_TOKEN
} from '../../src/lib/server/intelligence/providers.ts';

import {
	experimentAuthorizationFrom,
	experimentRequestDigest
} from './experiment-authorization.ts';

import { runApplicationExperiment } from './experiment-orchestration.ts';

// Remain locked until provider contract qualification and
// explicit authorization of the first paid experiment.
const LIVE_RELEASE_ENABLED: boolean = false;

const evidenceDirectory = fileURLToPath(new URL('../../.flihub-intelligence/', import.meta.url));

async function main(): Promise<void> {
	const input = {
		objectiveId: 'prepare_tournament',
		fixtureId: 'spring_invitational'
	};

	const request = applicationJevRequestFrom(input);

	if (!request) {
		console.error('Registered experiment is invalid.');
		process.exitCode = 1;
		return;
	}

	const body = JSON.stringify(request);
	const digest = experimentRequestDigest(body);

	const authorization = experimentAuthorizationFrom(process.argv.slice(2), body);

	if (authorization.status === 'rejected') {
		console.error('Experiment authorization rejected:', authorization.reason);
		process.exitCode = 1;
		return;
	}

	if (authorization.status === 'preview') {
		const estimatedReservationNanodollars = RESERVED_TOKENS * NANODOLLARS_PER_TOKEN;

		console.log(
			JSON.stringify(
				{
					experiment: 'synthetic_event_assessment',
					mode: 'offline_preview',
					provider: 'jev',
					model: MODEL,
					input,
					requestCountLimit: 1,
					questionCount: Object.keys(request.questions).length,
					requestBytes: Buffer.byteLength(body, 'utf8'),
					reservedInputTokens: RESERVED_TOKENS,
					estimatedReservationNanodollars,
					estimatedReservationUsd: estimatedReservationNanodollars / 1_000_000_000,
					requestSha256: digest,
					liveDispatchEnabled: LIVE_RELEASE_ENABLED,
					providerRequestsExecuted: 0,
					automaticRetries: false,
					request,
					exactRequestBody: body
				},
				null,
				2
			)
		);

		return;
	}

	if (!LIVE_RELEASE_ENABLED) {
		console.error('Live experiment release is locked.');
		process.exitCode = 1;
		return;
	}

	const result = await runApplicationExperiment(
		process.argv.slice(2),
		process.env.TYPESAFE_API_KEY,
		evidenceDirectory,
		fetch
	);

	console.log(JSON.stringify(result, null, 2));

	if (result.status !== 'assessed') {
		process.exitCode = 1;
	}
}

main().catch(() => {
	console.error('Experiment interrupted. Do not retry automatically.');
	process.exitCode = 1;
});
