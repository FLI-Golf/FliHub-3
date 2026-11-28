import { createHash } from 'node:crypto';
import {
	cancelDisclosureReview,
	confirmDisclosureReview,
	consumeDisclosureApproval,
	createDisclosureReview,
	type DisclosureReview
} from './approval.ts';
import { ADVISORY_LIMITS, ADVISORY_VERSION, type AdvisoryKind } from './contracts.ts';
import { createDisclosure, type PreparedDisclosure } from './disclosure.ts';
import { validateAdvisoryOutcome } from './validation.ts';

const identity = 'offline-fixture-simulator';
const scenarios = [
	'recommendation',
	'abstention',
	'unavailable',
	'invalid-request',
	'oversized-request',
	'invalid-response',
	'oversized-response',
	'wrong-decision',
	'failure',
	'delayed'
] as const;
type Scenario = (typeof scenarios)[number];

const fixtureUsage = Object.freeze({ inputTokens: 50, costUsdMicros: 10 });

function fixtureRequest(kind: AdvisoryKind, scenario: Scenario) {
	const context = {
		objective: { kind: 'custom', summary: 'Review the synthetic café assignment' },
		repositoryFacts: [{ kind: 'working-tree', value: 'clean' }],
		documentationReferences: [{ id: 'intelligence-roadmap', section: 'ADM-6D' }]
	};
	if (scenario === 'oversized-request') {
		context.objective.summary = 'é'.repeat(ADVISORY_LIMITS.requestBytes);
	}
	const request = { version: scenario === 'invalid-request' ? 0 : ADVISORY_VERSION, kind, context };
	return kind === 'planning'
		? { ...request, requestedRecommendation: 'next-planning-step' }
		: {
				...request,
				evidenceSummaries: [
					{ provenance: 'worker-reported-unverified', summary: 'Synthetic worker claim' }
				],
				requestedRecommendation: 'next-evidence-review-step'
			};
}

function sha256(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function simulate(bytes: Buffer, reviewedDigest: string, scenario: Scenario) {
	const observed = Object.freeze({ byteLength: bytes.length, sha256: sha256(bytes) });
	if (observed.sha256 !== reviewedDigest) throw new Error('Simulation snapshot mismatch');
	const { kind } = JSON.parse(bytes.toString('utf8')) as { kind: AdvisoryKind };
	const base = { version: ADVISORY_VERSION, kind };
	let response: string;
	switch (scenario) {
		case 'failure':
			throw new Error('Synthetic simulator failure');
		case 'invalid-response':
			response = JSON.stringify({ ...base, status: 'recommendation' });
			break;
		case 'oversized-response':
			response = 'x'.repeat(ADVISORY_LIMITS.responseBytes + 1);
			break;
		case 'wrong-decision':
			response = JSON.stringify({
				...base,
				kind: kind === 'planning' ? 'evidence-assessment' : 'planning',
				status: 'abstention',
				reason: 'explicit'
			});
			break;
		case 'abstention':
			response = JSON.stringify({ ...base, status: 'abstention', reason: 'explicit' });
			break;
		case 'unavailable':
			response = JSON.stringify({
				...base,
				status: 'unavailable',
				reason: 'provider-unavailable'
			});
			break;
		default:
			response = JSON.stringify({
				...base,
				status: 'recommendation',
				recommendation:
					kind === 'planning' ? 'review-proposed-scope' : 'request-independent-verification',
				confidence: 1
			});
	}
	return { observed, response };
}

type ActiveReview = {
	review: DisclosureReview;
	snapshot: PreparedDisclosure;
	scenario: Scenario;
};

function fallback(reason: string, simulatorCalls: 0 | 1 = 0) {
	return { mode: identity, status: 'manual-fallback' as const, reason, simulatorCalls };
}

/**
 * Local preview for registered synthetic cases. Each prepare replaces the selected
 * fixture and its limits, invalidating any previous review or in-flight result.
 * The fixed simulator cannot be replaced with a transport or arbitrary callback.
 */
export function createAdvisorySimulation(enabled = false) {
	let active: ActiveReview | undefined;
	let cancelRun: (() => void) | undefined;
	let invocationCount = 0;

	function cancel() {
		cancelRun?.();
		if (active) {
			const { sessionId, reviewId } = active.review;
			cancelDisclosureReview({ sessionId, reviewId });
			active = undefined;
		}
	}

	function prepare(kind: AdvisoryKind, scenario: Scenario, limits: unknown) {
		cancel();
		if (enabled !== true) return fallback('disabled');
		if ((kind !== 'planning' && kind !== 'evidence-assessment') || !scenarios.includes(scenario))
			return fallback('invalid-fixture');
		const input = { request: fixtureRequest(kind, scenario), limits };
		let snapshot: PreparedDisclosure;
		try {
			snapshot = createDisclosure(input);
		} catch {
			return fallback('invalid-disclosure');
		}
		const result = createDisclosureReview(input);
		if (!result.ok) return fallback(result.reason);
		if (result.value.reviewDigest !== snapshot.reviewDigest) {
			const { sessionId, reviewId } = result.value;
			cancelDisclosureReview({ sessionId, reviewId });
			return fallback('snapshot-mismatch');
		}
		active = { review: result.value, snapshot, scenario };
		return {
			mode: identity,
			status: 'review' as const,
			notice: 'Offline simulation only. The destination shown in this review is never contacted.',
			review: result.value
		};
	}

	function selected(sessionId: string, reviewId: string) {
		return active?.review.sessionId === sessionId && active.review.reviewId === reviewId
			? active
			: undefined;
	}

	function approve(sessionId: string, reviewId: string, confirmation: string) {
		if (!selected(sessionId, reviewId)) return { ok: false as const, reason: 'unknown-review' };
		return confirmDisclosureReview({ sessionId, reviewId, confirmation });
	}

	function run(sessionId: string, reviewId: string, reviewDigest: string, approvalId: string) {
		const selection = selected(sessionId, reviewId);
		if (!selection) return Promise.resolve(fallback('unknown-review'));
		const { snapshot, scenario } = selection;
		const { envelope } = snapshot;
		const { limits, payload } = envelope;
		const bytes = Buffer.from(payload.canonicalJson, 'utf8');
		if (
			bytes.length !== payload.byteLength ||
			bytes.length > limits.maxPayloadBytes ||
			sha256(bytes) !== payload.sha256
		) {
			cancel();
			return Promise.resolve(fallback('snapshot-mismatch'));
		}
		const grant = consumeDisclosureApproval({ sessionId, reviewId, reviewDigest, approvalId });
		if (!grant.ok) return Promise.resolve(fallback(grant.reason));
		// Consume synchronously before yielding. No concurrent run can reuse this review.
		active = undefined;
		if (
			grant.value.reviewDigest !== snapshot.reviewDigest ||
			grant.value.sessionId !== sessionId ||
			grant.value.reviewId !== reviewId
		) {
			return Promise.resolve(fallback('snapshot-mismatch'));
		}
		const reviewed = {
			mode: identity,
			reviewDigest: grant.value.reviewDigest,
			decision: envelope.decision,
			sources: envelope.sources
		};
		function failure(reason: string, calls: 0 | 1) {
			return {
				...fallback(reason, calls),
				provenance: Object.freeze({
					...reviewed,
					payloadDigest: payload.sha256,
					payloadBytes: payload.byteLength,
					outcome: reason
				})
			};
		}
		if (
			limits.maxRequests !== 1 ||
			fixtureUsage.inputTokens > limits.maxInputTokens ||
			fixtureUsage.costUsdMicros > limits.maxCostUsdMicros
		) {
			return Promise.resolve(failure('simulated-limit', 0));
		}

		type Result = ReturnType<typeof failure> | ReturnType<typeof complete>;
		function complete(observed: ReturnType<typeof simulate>) {
			if (Buffer.byteLength(observed.response, 'utf8') > ADVISORY_LIMITS.responseBytes)
				return failure('invalid-response', 1);
			const validated = validateAdvisoryOutcome(JSON.parse(observed.response), envelope.decision);
			if (!validated.ok) return failure(validated.reason, 1);
			const outcome = validated.value;
			const provenance = Object.freeze({
				...reviewed,
				payloadDigest: observed.observed.sha256,
				payloadBytes: observed.observed.byteLength,
				outcome: outcome.status
			});
			return {
				mode: identity,
				status:
					outcome.status === 'recommendation'
						? ('advisory' as const)
						: ('manual-fallback' as const),
				outcome,
				provenance,
				simulatorCalls: 1 as const
			};
		}

		return new Promise<Result>((resolve) => {
			let settled = false;
			const finish = (result: Result) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				cancelRun = undefined;
				resolve(result);
			};
			const timeout = setTimeout(() => finish(failure('timeout', 1)), limits.timeoutMs);
			cancelRun = () => finish(failure('cancelled', 1));
			try {
				invocationCount++;
				const output = simulate(bytes, payload.sha256, scenario);
				if (scenario === 'delayed') {
					// Deliver a deliberately late fixture result to exercise the guard.
					setTimeout(() => {
						if (!settled) finish(complete(output));
					}, limits.timeoutMs + 1);
				} else {
					finish(complete(output));
				}
			} catch {
				finish(failure('simulator-failure', 1));
			}
		});
	}

	return Object.freeze({ prepare, approve, run, cancel, invocationCount: () => invocationCount });
}
