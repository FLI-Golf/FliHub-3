import { createHash, randomUUID } from 'node:crypto';
import { scopedReplacementSnapshot } from './scoped-proposal.ts';
import { auditStore } from '../audit.ts';
import { workflowStore, type WorkflowStore } from '../orchestration/store.ts';
import { assertPilotContext, readPilotContext, teeTimePilot } from './project-context.ts';
import { pilotHarnessDigest, pilotRuntimePolicy, verifyPilotSource } from './pilot-runtime.ts';

const hash = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
type Context = ReturnType<typeof readPilotContext>;
const year = "${part('year')}";
const permitted = ["${part('year')?.padStart(4, '0')}", "${part('year')?.padEnd(4, '0')}"];
const limit = 16_384;

export function validatePilotProposal(context: Context, value: unknown) {
	assertPilotContext(context);
	if (typeof value !== 'string' || Buffer.byteLength(value) > limit)
		throw new Error('Invalid pilot proposal size.');
	let proposal: { file?: unknown; source?: unknown } | null;
	try {
		proposal = JSON.parse(value);
	} catch {
		throw new Error('Invalid pilot proposal JSON.');
	}
	if (
		!proposal ||
		typeof proposal !== 'object' ||
		Object.keys(proposal).length !== 2 ||
		proposal.file !== teeTimePilot.path ||
		typeof proposal.source !== 'string' ||
		context.content.split(year).length !== 2 ||
		!permitted.some((expression) => context.content.replace(year, expression) === proposal.source)
	)
		throw new Error('Invalid pilot proposal scope.');
	const snapshot = scopedReplacementSnapshot(
		{ context: context.digest, files: [context.inventory] },
		JSON.stringify({
			context: context.digest,
			replacements: [
				{ path: proposal.file, before: context.inventory.sha256, source: proposal.source }
			]
		})
	);
	const replacement = snapshot.files[0];
	return Object.freeze({
		file: replacement.path,
		source: replacement.source,
		digest: replacement.digest
	});
}

export function pilotAuthorization(context: Context) {
	assertPilotContext(context);
	return Object.freeze({
		repository: teeTimePilot.repository,
		objective: teeTimePilot.objective,
		commit: context.commit,
		context: context.digest,
		path: teeTimePilot.path,
		transport: 'offline-fixture',
		operations: teeTimePilot.operations,
		maxOperations: 4,
		maxCorrections: 1,
		elapsedMs: 30_000,
		proposalBytes: limit,
		reviewBytes: limit,
		verification: {
			...pilotRuntimePolicy,
			nodeVersion: process.version,
			acceptance: pilotHarnessDigest()
		},
		retentionMs: 7 * 24 * 60 * 60 * 1000,
		export: 'review-only'
	} as const);
}

export type PilotCheckpoint = {
	id: string;
	version: number;
	authorization: string;
	scope: string;
	started: number;
	updated: number;
	pending?: string;
	events: { operation: string; outcome: string; candidate?: string }[];
	accepted?: string;
};

function saveIntent(store: WorkflowStore, state: PilotCheckpoint, operation: string) {
	if (state.events.length >= 4 || state.pending) throw new Error('Pilot cannot dispatch.');
	return store.savePilot({ ...state, pending: operation });
}

export function requestPilotApproval(directory: string, context: Context, reviewed?: string) {
	const binding = JSON.stringify(pilotAuthorization(context));
	if (reviewed !== undefined && reviewed !== binding)
		throw new Error('Pilot scope changed after review.');
	const audit = auditStore(directory);
	try {
		return audit.record(
			{ category: 'test', verdict: 'review', reason: 'human_review', provider: 'none' },
			binding
		);
	} finally {
		audit.close();
	}
}

export async function runOfflinePilot(
	directory: string,
	context: Context,
	approval: string,
	fixtures: readonly unknown[],
	signal: AbortSignal,
	canaries: readonly string[] = [],
	onCheckpoint?: (state: PilotCheckpoint) => void
) {
	const envelope = pilotAuthorization(context);
	const binding = JSON.stringify(envelope);
	const scope = hash(binding);
	if (signal.aborted || fixtures.length < 1 || fixtures.length > 2)
		throw new Error('Pilot fixtures unavailable.');
	const audit = auditStore(directory);
	try {
		if (!audit.consume(approval, binding)) throw new Error('Pilot authorization unavailable.');
	} finally {
		audit.close();
	}
	const store = workflowStore(directory);
	const started = Date.now();
	const deadline = AbortSignal.any([signal, AbortSignal.timeout(envelope.elapsedMs)]);
	try {
		let state = store.createPilot({
			id: randomUUID(),
			version: 0,
			authorization: approval,
			scope,
			started,
			updated: started,
			events: []
		});
		const publish = () => onCheckpoint?.(structuredClone(state));
		publish();
		for (const [index, fixture] of fixtures.entries()) {
			if (deadline.aborted) break;
			const edit = index === 0 ? 'implementation' : 'correct_defect';
			const verify = index === 0 ? 'verify_targeted' : 'verify_broader';
			state = saveIntent(store, state, edit);
			publish();
			let candidate;
			try {
				candidate = validatePilotProposal(context, fixture);
			} catch {
				state = store.savePilot({
					...state,
					pending: undefined,
					events: [...state.events, { operation: edit, outcome: 'invalid_proposal' }]
				});
				publish();
				break;
			}
			state = store.savePilot({
				...state,
				pending: undefined,
				events: [
					...state.events,
					{ operation: edit, outcome: 'proposed', candidate: candidate.digest }
				]
			});
			publish();
			if (deadline.aborted) break;
			state = saveIntent(store, state, verify);
			publish();
			const result = await verifyPilotSource(
				candidate.source,
				deadline,
				canaries,
				envelope.verification.acceptance
			);
			const outcome = deadline.aborted ? 'cancelled' : result;
			state = store.savePilot({
				...state,
				pending: undefined,
				accepted: outcome === 'pass' ? candidate.digest : undefined,
				events: [...state.events, { operation: verify, outcome, candidate: candidate.digest }]
			});
			publish();
			if (outcome !== 'year_padding') break;
		}
		return state;
	} finally {
		store.close();
	}
}

export function exportPilotReview(
	directory: string,
	context: Context,
	workflow: string,
	proposal: unknown
) {
	const envelope = pilotAuthorization(context);
	const scope = hash(JSON.stringify(envelope));
	const candidate = validatePilotProposal(context, proposal);
	const store = workflowStore(directory);
	try {
		const state = store.getPilot(workflow);
		const last = state?.events.at(-1);
		if (
			!state ||
			state.pending ||
			state.scope !== scope ||
			state.accepted !== candidate.digest ||
			last?.outcome !== 'pass' ||
			last.candidate !== candidate.digest ||
			!['verify_targeted', 'verify_broader'].includes(last.operation) ||
			Date.now() >= state.started + envelope.retentionMs
		)
			throw new Error('Pilot review requires matching verified evidence.');
		const before = context.content.trimEnd().split('\n');
		const after = candidate.source.trimEnd().split('\n');
		const line = before.findIndex((text, index) => text !== after[index]);
		const start = Math.max(0, line - 3);
		const end = Math.min(before.length, line + 4);
		const path = teeTimePilot.path;
		const patch = [
			`diff --git a/${path} b/${path}`,
			`--- a/${path}`,
			`+++ b/${path}`,
			`@@ -${start + 1},${end - start} +${start + 1},${end - start} @@`,
			...before.slice(start, line).map((text) => ' ' + text),
			'-' + before[line],
			'+' + after[line],
			...before.slice(line + 1, end).map((text) => ' ' + text),
			''
		].join('\n');
		return {
			workflow,
			commit: context.commit,
			objective: envelope.objective,
			path,
			candidate: candidate.digest,
			scope,
			evidence: last,
			patchDigest: hash(patch),
			patch
		};
	} finally {
		store.close();
	}
}
