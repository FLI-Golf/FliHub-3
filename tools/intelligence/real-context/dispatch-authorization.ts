import { createHash, randomUUID } from 'node:crypto';
import {
	canonicalJson,
	canonicalSha256
} from '../../../src/lib/server/intelligence/application/operations/canonical.ts';
import { ownerAccountId } from './collector.ts';
import {
	contextLimits,
	repository,
	requireFact,
	validateContext,
	type Context,
	type Objective
} from './contract.ts';
import { checkedClock, contextIdentity, prepareRealContextReview } from './review.ts';

const lifetimeMs = 30_000;
const transport = Object.freeze({
	provider: 'flihub-development-fixture',
	destination: 'in-process-redemption',
	protocol: 'flihub-fixture-v1',
	configuration: 'no-external-transport-v1'
});
const limits = Object.freeze({
	...contextLimits,
	maximumRequests: 1,
	maximumConcurrency: 1,
	billableUsageAuthorized: false
});
const scope = 'simulated-development-advisory-redemption';

export type AuthorizationState = 'issued' | 'redeemed' | 'cancelled' | 'expired' | 'invalidated';
type QualifiedCollect = (
	objective: Objective,
	includeQualification: boolean
) => Promise<{ context: Context; operator: number }>;

export type DispatchAuthorization = {
	version: 1;
	repository: typeof repository;
	objective: Objective;
	operator: typeof ownerAccountId;
	reviewId: string;
	authorizationId: string;
	contextDigest: string;
	disclosureDigest: string;
	requestDigest: string;
	transport: typeof transport;
	limits: typeof limits;
	pinsDigest: string;
	purpose: typeof scope;
	scope: 'offline-simulation-only';
	issuedAt: number;
	expiresAt: number;
};

export async function prepareDispatchSession(
	qualifiedCollect: QualifiedCollect,
	objective: Objective,
	includeQualification = false,
	now: () => number = Date.now
) {
	let last = checkedClock(now);
	const clock = () => {
		const time = checkedClock(now);
		requireFact(time >= last);
		last = time;
		return time;
	};
	const collect = async (id: Objective, include: boolean) => {
		const scope = await qualifiedCollect(id, include);
		requireFact(scope.operator === ownerAccountId);
		return scope.context;
	};
	const review = await prepareRealContextReview(collect, objective, includeQualification, clock);
	const { context } = JSON.parse(review.canonicalPayload) as { context: Context };
	const pinsDigest = contextIdentity(context);
	const reviewId = randomUUID();
	// An exact fixture request is shown separately. It is never a Jev wire request.
	const request = canonicalJson({
		version: 1,
		scope,
		repository,
		objective,
		transport,
		context
	});
	requireFact(Buffer.byteLength(request, 'utf8') <= limits.requestBytes);
	const requestDigest = createHash('sha256').update(request, 'utf8').digest('hex');
	const binding: Omit<DispatchAuthorization, 'authorizationId' | 'issuedAt' | 'expiresAt'> = {
		version: 1 as const,
		repository,
		objective,
		operator: ownerAccountId,
		reviewId,
		contextDigest: review.contextDigest,
		disclosureDigest: review.reviewDigest,
		requestDigest,
		transport,
		limits,
		pinsDigest,
		purpose: scope,
		scope: 'offline-simulation-only' as const
	};
	const bindingDigest = canonicalSha256(binding);
	let confirmed = false;
	let confirmationStarted = false;
	let cancelled = false;
	let issued: DispatchAuthorization | undefined;
	let state: AuthorizationState | undefined;
	let redeeming = false;

	function currentState() {
		if (state === 'issued' && issued) {
			try {
				if (clock() >= issued.expiresAt) state = 'expired';
			} catch {
				state = 'invalidated';
			}
		}
		return state;
	}

	return Object.freeze({
		disclosure: review.canonicalPayload,
		disclosureDigest: review.reviewDigest,
		request,
		requestDigest,
		bindingDigest,
		authorizationPreview: canonicalJson(binding),
		state: currentState,
		async confirm(text: string) {
			if (cancelled || confirmationStarted) return false;
			confirmationStarted = true;
			confirmed = (await review.confirm(text)) && !cancelled;
			return confirmed;
		},
		authorize(text: string): string | undefined {
			if (cancelled || !confirmed || issued || text !== `AUTHORIZE SIMULATION ${bindingDigest}`)
				return undefined;
			try {
				const issuedAt = clock();
				requireFact(issuedAt < review.expiresAt);
				issued = {
					...binding,
					authorizationId: randomUUID(),
					issuedAt,
					expiresAt: Math.min(review.expiresAt, issuedAt + lifetimeMs)
				};
				state = 'issued';
				return canonicalJson(issued);
			} catch {
				state = 'invalidated';
				cancelled = true;
				return undefined;
			}
		},
		cancel() {
			cancelled = true;
			review.cancel();
			if (currentState() === 'issued') state = 'cancelled';
		},
		async redeem(candidate: unknown, exactRequest: unknown, operator: unknown) {
			if (currentState() !== 'issued' || !issued || redeeming || cancelled) return undefined;
			redeeming = true;
			try {
				// Exact canonical equality to a locally issued contract rejects changed
				// fields, unsupported versions, extraneous fields and cross-session grants.
				requireFact(typeof candidate === 'string' && candidate === canonicalJson(issued));
				requireFact(
					typeof exactRequest === 'string' &&
						exactRequest === request &&
						operator === issued.operator
				);
				const refreshed = await prepareRealContextReview(
					collect,
					objective,
					includeQualification,
					clock
				);
				try {
					const current = validateContext(JSON.parse(refreshed.canonicalPayload).context);
					requireFact(
						currentState() === 'issued' &&
							!cancelled &&
							contextIdentity(current) === issued.pinsDigest
					);
				} finally {
					refreshed.cancel();
				}
				state = 'redeemed';
				return Object.freeze({
					state,
					authorizationId: issued.authorizationId,
					requestDigest,
					reservation: 'unavailable' as const,
					externalRequests: 0,
					providerDispatchAuthorized: false,
					engineeringExecutionAuthorized: false
				});
			} catch {
				if (currentState() === 'issued') state = 'invalidated';
				return undefined;
			}
		}
	});
}
