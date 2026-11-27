import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
	APPROVAL_LIFETIME_MS,
	cancelDisclosureReview,
	confirmDisclosureReview,
	consumeDisclosureApproval,
	createDisclosureReview,
	REVIEW_LIFETIME_MS
} from '../tools/intelligence/development-advisory/approval.ts';
import {
	createDisclosure,
	DISCLOSURE_LIMITS
} from '../tools/intelligence/development-advisory/disclosure.ts';
import { ADVISORY_VERSION } from '../tools/intelligence/development-advisory/contracts.ts';
import { canonicalSha256 } from '../src/lib/server/intelligence/application/operations/canonical.ts';

function planningRequest() {
	return {
		version: ADVISORY_VERSION,
		kind: 'planning',
		context: {
			objective: { kind: 'custom', summary: 'Review the assignment preparation plan' },
			repositoryFacts: [{ kind: 'working-tree', value: 'clean' }],
			documentationReferences: [{ id: 'intelligence-roadmap', section: 'ADM-6C' }]
		},
		requestedRecommendation: 'next-planning-step'
	};
}

function evidenceRequest() {
	return {
		version: ADVISORY_VERSION,
		kind: 'evidence-assessment',
		context: {
			objective: { kind: 'roadmap', id: 'adm-3-assignment-review-export' },
			repositoryFacts: [],
			documentationReferences: []
		},
		evidenceSummaries: [
			{ provenance: 'worker-reported-unverified', summary: 'Worker states local checks passed' }
		],
		requestedRecommendation: 'next-evidence-review-step'
	};
}

function limits(overrides = {}) {
	return {
		maxRequests: 1,
		maxInputTokens: 65_536,
		maxCostUsdMicros: 25_000,
		timeoutMs: 1_500,
		...overrides
	};
}

function createReview(request = planningRequest(), reviewLimits = limits()) {
	const result = createDisclosureReview({ request, limits: reviewLimits });
	assert.equal(result.ok, true);
	return result.value;
}

function approve(review) {
	return confirmDisclosureReview({
		sessionId: review.sessionId,
		reviewId: review.reviewId,
		confirmation: `APPROVE ${review.reviewDigest}`
	});
}

function consume(review, approval, digest = review.reviewDigest) {
	return consumeDisclosureApproval({
		sessionId: review.sessionId,
		reviewId: review.reviewId,
		approvalId: approval.value.approvalId,
		reviewDigest: digest
	});
}

function withClock(value, action) {
	const original = Date.now;
	Date.now = typeof value === 'function' ? value : () => value;
	try {
		return action();
	} finally {
		Date.now = original;
	}
}

test('canonical payload bytes and SHA-256 bind validated planning context and disclosure metadata', () => {
	const input = planningRequest();
	const prepared = createDisclosure({ request: input, limits: limits() });
	const envelope = prepared.envelope;
	const bytes = Buffer.from(envelope.payload.canonicalJson, 'utf8');

	assert.equal(envelope.version, 1);
	assert.equal(envelope.provider, 'jev');
	assert.equal(envelope.destination, 'typesafe-jev-api');
	assert.equal(envelope.decision, 'planning');
	assert.equal(envelope.purpose, 'bounded-development-planning');
	assert.deepEqual(envelope.sources, [
		'operator-objective',
		'repository-facts',
		'documentation-references'
	]);
	assert.deepEqual(envelope.limits, {
		...limits(),
		maxPayloadBytes: 16 * 1024
	});
	assert.deepEqual(envelope.retention, {
		flihub: 'process-memory-only',
		provider: 'unverified'
	});
	assert.equal(envelope.payload.encoding, 'utf-8');
	assert.equal(envelope.payload.byteLength, bytes.length);
	assert.equal(envelope.payload.sha256, createHash('sha256').update(bytes).digest('hex'));
	assert.equal(
		envelope.payload.sha256,
		canonicalSha256(JSON.parse(envelope.payload.canonicalJson))
	);
	assert.equal(prepared.reviewDigest, canonicalSha256(envelope));
	assert.match(prepared.reviewText, /Exact canonical payload follows:/);
	assert.ok(prepared.reviewText.includes(envelope.payload.canonicalJson + '\n\nApproval covers'));
	assert.ok(Object.isFrozen(envelope));
	assert.ok(Object.isFrozen(envelope.payload));
	assert.ok(Object.isFrozen(envelope.sources));
	input.context.objective.summary = 'Mutated after snapshot';
	assert.equal(
		JSON.parse(envelope.payload.canonicalJson).context.objective.summary,
		'Review the assignment preparation plan'
	);
});

test('evidence review binds decision, purpose, evidence source and full payload', () => {
	const prepared = createDisclosure({ request: evidenceRequest(), limits: limits() });
	assert.equal(prepared.envelope.decision, 'evidence-assessment');
	assert.equal(prepared.envelope.purpose, 'bounded-development-evidence-assessment');
	assert.deepEqual(prepared.envelope.sources, ['roadmap-objective', 'evidence-summaries']);
	assert.ok(prepared.reviewText.includes(prepared.envelope.payload.canonicalJson));
	assert.ok(prepared.reviewText.includes(prepared.envelope.payload.sha256));
});

test('rejects malformed requests and unsafe limit metadata', () => {
	const revokedDisclosure = Proxy.revocable({}, {});
	revokedDisclosure.revoke();
	const revokedApproval = Proxy.revocable({}, {});
	revokedApproval.revoke();
	for (const badLimits of [
		limits({ maxRequests: 2 }),
		limits({ maxInputTokens: 0 }),
		limits({ maxInputTokens: DISCLOSURE_LIMITS.maxInputTokens + 1 }),
		limits({ maxCostUsdMicros: 0 }),
		limits({ timeoutMs: 10_001 }),
		{ ...limits(), provider: 'other' },
		Object.defineProperty(limits(), 'timeoutMs', {
			get() {
				throw new Error('getter');
			}
		}),
		new Proxy(limits(), {
			get() {
				throw new Error('proxy');
			}
		})
	]) {
		assert.throws(() => createDisclosure({ request: planningRequest(), limits: badLimits }));
	}
	assert.throws(() =>
		createDisclosure({ request: { ...planningRequest(), execute: true }, limits: limits() })
	);
	assert.throws(() =>
		createDisclosure(
			new Proxy(
				{},
				{
					get() {
						throw new Error('input proxy');
					}
				}
			)
		)
	);
	assert.throws(() => createDisclosure(revokedDisclosure.proxy));
	assert.deepEqual(confirmDisclosureReview(revokedApproval.proxy), {
		ok: false,
		reason: 'invalid-input'
	});
});

test('review presentation is complete and approval requires explicit exact digest confirmation', () => {
	const review = createReview();
	for (const expected of [
		`Provider: jev`,
		`Destination: typesafe-jev-api`,
		`Decision: planning`,
		`Purpose: bounded-development-planning`,
		`Sources: operator-objective, repository-facts, documentation-references`,
		`Payload SHA-256: ${review.reviewText.match(/Payload SHA-256: ([a-f0-9]{64})/)[1]}`,
		`Review SHA-256: ${review.reviewDigest}`,
		'process-memory-only',
		'provider=unverified',
		'Approval covers this exact disclosure only'
	])
		assert.ok(review.reviewText.includes(expected));
	assert.ok(Object.isFrozen(review));
	assert.equal(Object.hasOwn(review, 'approvalId'), false);
	assert.deepEqual(
		confirmDisclosureReview({
			sessionId: review.sessionId,
			reviewId: review.reviewId,
			confirmation: review.reviewDigest
		}),
		{ ok: false, reason: 'confirmation-mismatch' }
	);
	assert.equal(approve(review).reason, 'unknown-review');
});

test('approval is digest-bound, synchronous, single-use and grants no dispatch or execution authority', () => {
	const review = createReview();
	const approval = approve(review);
	assert.equal(approval.ok, true);
	const receipt = consume(review, approval);
	assert.equal(receipt.ok, true);
	assert.equal(receipt.value.status, 'consumed');
	assert.equal(receipt.value.dispatchAuthorized, false);
	assert.equal(receipt.value.executionAuthorized, false);
	assert.deepEqual(
		Object.keys(receipt.value).sort(),
		[
			'approvalId',
			'approvedAt',
			'consumedAt',
			'dispatchAuthorized',
			'executionAuthorized',
			'reviewDigest',
			'reviewId',
			'sessionId',
			'status',
			'version'
		].sort()
	);
	assert.equal(consume(review, approval).reason, 'unknown-review');
});

test('forged approval IDs are rejected without consuming the real approval', () => {
	const review = createReview();
	const approval = approve(review);
	const forged = consumeDisclosureApproval({
		sessionId: review.sessionId,
		reviewId: review.reviewId,
		approvalId: '00000000-0000-4000-8000-000000000000',
		reviewDigest: review.reviewDigest
	});
	assert.deepEqual(forged, { ok: false, reason: 'approval-mismatch' });
	assert.equal(consume(review, approval).ok, true);
});

test('changed review digest invalidates pending review and approved disclosure', () => {
	const pending = createReview();
	const rejected = confirmDisclosureReview({
		sessionId: pending.sessionId,
		reviewId: pending.reviewId,
		confirmation: `APPROVE ${'0'.repeat(64)}`
	});
	assert.deepEqual(rejected, { ok: false, reason: 'confirmation-mismatch' });

	const approvedReview = createReview();
	const approval = approve(approvedReview);
	assert.equal(approval.ok, true);
	assert.deepEqual(consume(approvedReview, approval, 'f'.repeat(64)), {
		ok: false,
		reason: 'digest-mismatch'
	});
	assert.equal(consume(approvedReview, approval).reason, 'unknown-review');

	const originalRequest = planningRequest();
	const boundReview = createReview(originalRequest);
	const boundApproval = approve(boundReview);
	assert.equal(boundApproval.ok, true);
	originalRequest.context.objective.summary = 'A materially changed objective';
	const changedDisclosure = createDisclosure({ request: originalRequest, limits: limits() });
	assert.notEqual(changedDisclosure.reviewDigest, boundReview.reviewDigest);
	assert.equal(
		consume(boundReview, boundApproval, changedDisclosure.reviewDigest).reason,
		'digest-mismatch'
	);
});

test('cancellation revokes pending and approved reviews', () => {
	const pending = createReview();
	assert.deepEqual(
		cancelDisclosureReview({ sessionId: pending.sessionId, reviewId: pending.reviewId }),
		{
			ok: true,
			value: { cancelled: true }
		}
	);
	assert.equal(approve(pending).reason, 'unknown-review');

	const approved = createReview();
	const approval = approve(approved);
	assert.equal(approval.ok, true);
	assert.equal(
		cancelDisclosureReview({ sessionId: approved.sessionId, reviewId: approved.reviewId }).ok,
		true
	);
	assert.equal(consume(approved, approval).reason, 'unknown-review');
});

test('review expires after five minutes and approval expires after two minutes', () => {
	withClock(1_000_000, () => {
		const review = createReview();
		assert.equal(review.expiresAt, 1_000_000 + REVIEW_LIFETIME_MS);
		Date.now = () => review.expiresAt;
		assert.equal(approve(review).reason, 'review-expired');
	});

	withClock(2_000_000, () => {
		const review = createReview();
		const approval = approve(review);
		assert.equal(approval.value.expiresAt, 2_000_000 + APPROVAL_LIFETIME_MS);
		Date.now = () => approval.value.expiresAt;
		assert.equal(consume(review, approval).reason, 'approval-expired');
	});
});

test('clock exceptions, invalid time and backwards movement fail closed', () => {
	const brokenAtCreation = withClock(
		() => NaN,
		() =>
			createDisclosureReview({
				request: planningRequest(),
				limits: limits()
			})
	);
	assert.deepEqual(brokenAtCreation, { ok: false, reason: 'clock-failure' });

	withClock(3_000_000, () => {
		const review = createReview();
		Date.now = () => {
			throw new Error('clock unavailable');
		};
		assert.equal(approve(review).reason, 'clock-failure');
		Date.now = () => 3_000_001;
		assert.equal(approve(review).reason, 'unknown-review');
	});

	withClock(4_000_000, () => {
		const review = createReview();
		Date.now = () => 3_999_999;
		assert.equal(approve(review).reason, 'clock-failure');
		Date.now = () => 4_000_001;
		assert.equal(approve(review).reason, 'unknown-review');
	});
});

test('review/session IDs are unique and cannot be substituted across sessions', () => {
	const first = createReview();
	const second = createReview();
	assert.notEqual(first.sessionId, second.sessionId);
	assert.notEqual(first.reviewId, second.reviewId);
	assert.deepEqual(
		confirmDisclosureReview({
			sessionId: second.sessionId,
			reviewId: first.reviewId,
			confirmation: `APPROVE ${first.reviewDigest}`
		}),
		{ ok: false, reason: 'unknown-review' }
	);
	assert.equal(approve(first).ok, true);
});

test('approval review and consumption never call a provider or create execution authority', () => {
	let calls = 0;
	const originalFetch = globalThis.fetch;
	globalThis.fetch = () => {
		calls++;
		throw new Error('unexpected network');
	};
	try {
		const review = createReview();
		const approval = approve(review);
		assert.equal(approval.ok, true);
		const receipt = consume(review, approval);
		assert.equal(receipt.ok, true);
		assert.equal(calls, 0);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
