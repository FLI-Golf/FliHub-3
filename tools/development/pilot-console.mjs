import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditStore } from '../intelligence/audit.ts';
import { readPilotContext, teeTimePilot } from '../intelligence/engineering/project-context.ts';
import {
	exportPilotReview,
	pilotAuthorization,
	requestPilotApproval,
	runOfflinePilot
} from '../intelligence/engineering/project-pilot.ts';

const baseline = '0aefda71e04ed3dfab213ee6d27c8d91c4bdae6d';
const year = "${part('year')}";

function fixture(context, method) {
	return JSON.stringify({
		file: teeTimePilot.path,
		source: context.content.replace(year, "${part('year')?." + method + "(4, '0')}")
	});
}

/**
 * @param {{question: (prompt: string) => Promise<string>, print: (value: unknown) => void,
 * directory: string, repository: string, signal: AbortSignal}} options
 */
export async function runPilotConsole({ question, print, directory, repository, signal }) {
	const objective = (await question('Development objective (blank cancels): ')).trim();
	// Exclude terminal controls, unpaired surrogates and overly long input.
	if (!objective || Buffer.byteLength(objective) > 512 || /[\p{C}]/u.test(objective)) {
		print('No valid objective entered.');
		return;
	}
	const context = readPilotContext(repository, baseline);
	const envelope = pilotAuthorization(context);
	print({
		mode: 'Offline fixture proposals with isolated FliHub verification',
		objective,
		plan: 'Demonstrate year padding, protected verification and one correction on the registered tee-time pilot.',
		acceptance: teeTimePilot.acceptance,
		unavailable:
			'Live Jev planning and authenticated Codex dispatch require verified tool and egress controls.',
		usage: { jevRequests: 0, codexLaunches: 0, authenticatedUsage: 'unavailable' },
		scope: envelope
	});
	if (
		(await question('Enter authorize to approve this fixed offline plan: ')).trim() !==
			'authorize' ||
		signal.aborted
	) {
		print('Plan rejected. No workflow started.');
		return;
	}
	const binding = JSON.stringify(envelope);
	const approval = requestPilotApproval(directory, context, binding);
	const audit = auditStore(directory);
	try {
		if (!audit.human(approval, binding, undefined, 'approve'))
			throw new Error('Pilot approval unavailable.');
	} finally {
		audit.close();
	}
	const correct = fixture(context, 'padStart');
	const state = await runOfflinePilot(
		directory,
		context,
		approval,
		[fixture(context, 'padEnd'), correct],
		signal,
		[],
		({ id, pending, events }) => print({ id, pending, latest: events.at(-1) })
	);
	print({ workflow: state.id, evidence: state.events, acceptedCandidate: state.accepted });
	if (!state.accepted || signal.aborted) return;
	if (
		(await question('Enter export to write the verified review artifact: ')).trim() !== 'export' ||
		signal.aborted
	)
		return;
	const review = exportPilotReview(directory, context, state.id, correct);
	const path = join(directory, 'pilot-review-' + state.id + '.json');
	const contents = JSON.stringify(review, null, 2) + '\n';
	if (Buffer.byteLength(contents) > envelope.reviewBytes)
		throw new Error('Pilot artifact exceeds the authorized size.');
	writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
	print({ review: path, patchDigest: review.patchDigest });
	return review;
}
