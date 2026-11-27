import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { createDisclosure, type PreparedDisclosure } from './disclosure.ts';

export const REVIEW_LIFETIME_MS = 5 * 60_000;
export const APPROVAL_LIFETIME_MS = 2 * 60_000;
const maxActiveReviews = 128;

type ReviewState = {
	sessionId: string;
	reviewId: string;
	disclosure: PreparedDisclosure;
	createdAt: number;
	lastClock: number;
	reviewExpiresAt: number;
	status: 'pending' | 'approved';
	approvalId?: string;
	approvedAt?: number;
	approvalExpiresAt?: number;
};

type FailureReason =
	| 'invalid-input'
	| 'unknown-review'
	| 'review-expired'
	| 'approval-expired'
	| 'invalid-state'
	| 'confirmation-mismatch'
	| 'clock-failure'
	| 'id-generation-failure'
	| 'capacity-exceeded'
	| 'invalid-disclosure'
	| 'approval-mismatch'
	| 'digest-mismatch';

export type ApprovalResult<T> = { ok: true; value: T } | { ok: false; reason: FailureReason };

export type DisclosureReview = {
	sessionId: string;
	reviewId: string;
	createdAt: number;
	expiresAt: number;
	reviewDigest: string;
	reviewText: string;
};

export type ApprovalReceipt = {
	version: 1;
	status: 'consumed';
	sessionId: string;
	reviewId: string;
	approvalId: string;
	reviewDigest: string;
	approvedAt: number;
	consumedAt: number;
	dispatchAuthorized: false;
	executionAuthorized: false;
};

const reviews = new Map<string, ReviewState>();

function reject<T>(reason: FailureReason): ApprovalResult<T> {
	return { ok: false, reason };
}

function fields(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
	if (typeof value !== 'object' || value === null || types.isProxy(value)) return null;
	if (Array.isArray(value)) return null;
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return null;
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actualKeys = Reflect.ownKeys(descriptors);
	if (
		actualKeys.length !== keys.length ||
		actualKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
	)
		return null;
	const result: Record<string, unknown> = Object.create(null);
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
		result[key] = descriptor.value;
	}
	return result;
}

function validId(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
}

function clock(state?: ReviewState): number | null {
	try {
		const value = Date.now();
		if (!Number.isSafeInteger(value) || value < 0 || (state && value < state.lastClock))
			return null;
		if (state) state.lastClock = value;
		return value;
	} catch {
		return null;
	}
}

function expire(state: ReviewState, now: number): FailureReason | null {
	if (state.status === 'pending' && now >= state.reviewExpiresAt) return 'review-expired';
	if (state.status === 'approved' && now >= (state.approvalExpiresAt ?? 0))
		return 'approval-expired';
	return null;
}

function purgeExpired(): void {
	for (const [id, state] of reviews) {
		const stateNow = clock(state);
		if (stateNow === null || expire(state, stateNow)) reviews.delete(id);
	}
}

function uniqueId(): string | null {
	try {
		for (let attempt = 0; attempt < 4; attempt++) {
			const id = randomUUID();
			if (
				![...reviews.values()].some((review) => review.sessionId === id || review.reviewId === id)
			)
				return id;
		}
	} catch {
		return null;
	}
	return null;
}

function lookup(sessionId: unknown, reviewId: unknown): ReviewState | null {
	if (!validId(sessionId) || !validId(reviewId)) return null;
	const state = reviews.get(reviewId);
	return state?.sessionId === sessionId ? state : null;
}

function advanceClock(state: ReviewState): ApprovalResult<number> {
	const now = clock(state);
	if (now === null) {
		reviews.delete(state.reviewId);
		return reject('clock-failure');
	}
	const expired = expire(state, now);
	if (expired) {
		reviews.delete(state.reviewId);
		return reject(expired);
	}
	return { ok: true, value: now };
}

/** Create a private, process-local review. This function never dispatches. */
export function createDisclosureReview(input: {
	request: unknown;
	limits: unknown;
}): ApprovalResult<DisclosureReview> {
	const now = clock();
	if (now === null) return reject('clock-failure');
	purgeExpired();
	if (reviews.size >= maxActiveReviews) return reject('capacity-exceeded');
	let disclosure: PreparedDisclosure;
	try {
		disclosure = createDisclosure(input);
	} catch {
		return reject('invalid-disclosure');
	}
	const sessionId = uniqueId();
	const reviewId = uniqueId();
	if (!sessionId || !reviewId || sessionId === reviewId) return reject('id-generation-failure');
	const expiresAt = now + REVIEW_LIFETIME_MS;
	if (!Number.isSafeInteger(expiresAt)) return reject('clock-failure');
	const state: ReviewState = {
		sessionId,
		reviewId,
		disclosure,
		createdAt: now,
		lastClock: now,
		reviewExpiresAt: expiresAt,
		status: 'pending'
	};
	reviews.set(reviewId, state);
	return {
		ok: true,
		value: Object.freeze({
			sessionId,
			reviewId,
			createdAt: now,
			expiresAt,
			reviewDigest: disclosure.reviewDigest,
			reviewText: disclosure.reviewText
		})
	};
}

/** Explicit confirmation must repeat the exact review digest shown to the operator. */
export function confirmDisclosureReview(input: unknown): ApprovalResult<{
	approvalId: string;
	approvedAt: number;
	expiresAt: number;
	reviewDigest: string;
}> {
	const request = fields(input, ['sessionId', 'reviewId', 'confirmation']);
	if (
		!request ||
		!validId(request.sessionId) ||
		!validId(request.reviewId) ||
		typeof request.confirmation !== 'string'
	)
		return reject('invalid-input');
	const state = lookup(request.sessionId, request.reviewId);
	if (!state) return reject('unknown-review');
	if (state.status !== 'pending') return reject('invalid-state');
	const nowResult = advanceClock(state);
	if (!nowResult.ok) return nowResult;
	if (request.confirmation !== `APPROVE ${state.disclosure.reviewDigest}`) {
		reviews.delete(state.reviewId);
		return reject('confirmation-mismatch');
	}
	const approvalId = uniqueId();
	if (!approvalId) {
		reviews.delete(state.reviewId);
		return reject('id-generation-failure');
	}
	const expiresAt = nowResult.value + APPROVAL_LIFETIME_MS;
	if (!Number.isSafeInteger(expiresAt)) {
		reviews.delete(state.reviewId);
		return reject('clock-failure');
	}
	state.status = 'approved';
	state.approvalId = approvalId;
	state.approvedAt = nowResult.value;
	state.approvalExpiresAt = expiresAt;
	return {
		ok: true,
		value: Object.freeze({
			approvalId,
			approvedAt: nowResult.value,
			expiresAt,
			reviewDigest: state.disclosure.reviewDigest
		})
	};
}

/**
 * Consume the one-use disclosure approval and return a minimal receipt.
 * This does not return payload bytes or authorize dispatch or execution.
 */
export function consumeDisclosureApproval(input: unknown): ApprovalResult<ApprovalReceipt> {
	const request = fields(input, ['sessionId', 'reviewId', 'approvalId', 'reviewDigest']);
	if (
		!request ||
		!validId(request.sessionId) ||
		!validId(request.reviewId) ||
		!validId(request.approvalId) ||
		typeof request.reviewDigest !== 'string' ||
		!/^[a-f0-9]{64}$/.test(request.reviewDigest)
	)
		return reject('invalid-input');
	const state = lookup(request.sessionId, request.reviewId);
	if (!state) return reject('unknown-review');
	if (state.status !== 'approved') return reject('invalid-state');
	if (request.reviewDigest !== state.disclosure.reviewDigest) {
		reviews.delete(state.reviewId);
		return reject('digest-mismatch');
	}
	if (request.approvalId !== state.approvalId) return reject('approval-mismatch');
	const nowResult = advanceClock(state);
	if (!nowResult.ok) return nowResult;
	const receipt: ApprovalReceipt = Object.freeze({
		version: 1,
		status: 'consumed',
		sessionId: state.sessionId,
		reviewId: state.reviewId,
		approvalId: state.approvalId as string,
		reviewDigest: state.disclosure.reviewDigest,
		approvedAt: state.approvedAt as number,
		consumedAt: nowResult.value,
		dispatchAuthorized: false,
		executionAuthorized: false
	});
	reviews.delete(state.reviewId);
	return { ok: true, value: receipt };
}

/** Cancel pending or approved disclosure review without producing authority. */
export function cancelDisclosureReview(input: unknown): ApprovalResult<{ cancelled: true }> {
	const request = fields(input, ['sessionId', 'reviewId']);
	if (!request || !validId(request.sessionId) || !validId(request.reviewId))
		return reject('invalid-input');
	const state = lookup(request.sessionId, request.reviewId);
	if (!state) return reject('unknown-review');
	reviews.delete(state.reviewId);
	return { ok: true, value: Object.freeze({ cancelled: true }) };
}
