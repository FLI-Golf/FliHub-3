import type { SyntheticPublicationOutcome } from './approval.ts';

import type { SyntheticOperationState } from './synthetic-state.ts';

export const SYNTHETIC_AUDIT_LIMIT = 100;

type PublicationFailure = Extract<SyntheticPublicationOutcome, { status: 'rejected' }>['reason'];

export interface SyntheticPublicationAuditRecord {
	readonly sequence: number;
	readonly scope: 'synthetic-only';
	readonly operationId: 'create_synthetic_group_assignments';
	readonly sessionId: string;
	readonly reviewId: string | null;
	readonly planDigest: string | null;
	readonly actorId: string;
	readonly outcome: 'published' | 'rejected';
	readonly failureReason: PublicationFailure | null;
	readonly verification: 'passed' | 'failed' | 'not-performed';
	readonly revisionBefore: number;
	readonly revisionAfter: number;
	readonly stateChanged: boolean;
	readonly groupsCreated: number;
	readonly teamsAssigned: number;
	readonly athletesAssigned: number;
}

export interface SyntheticSessionSnapshot {
	readonly state: SyntheticOperationState;
	readonly audit: readonly SyntheticPublicationAuditRecord[];
	readonly lastSequence: number;
}

export interface SyntheticAuditIdentity {
	readonly sessionId: string;
	readonly reviewId: string | null;
	readonly planDigest: string | null;
	readonly actorId: string;
}

/**
 * Internal snapshot construction for trusted local
 * operation results. No external receipt is inspected.
 *
 * This is bounded process-local history, not a durable
 * production audit ledger.
 */
export function appendSyntheticPublicationAudit(
	previous: SyntheticSessionSnapshot,
	nextState: SyntheticOperationState,
	identity: SyntheticAuditIdentity,
	outcome: SyntheticPublicationOutcome,
	verification: SyntheticPublicationAuditRecord['verification']
): SyntheticSessionSnapshot {
	const published = outcome.status === 'published';

	if (
		!Number.isSafeInteger(previous.lastSequence) ||
		previous.lastSequence < 0 ||
		previous.lastSequence >= Number.MAX_SAFE_INTEGER
	) {
		throw new Error('Invalid audit sequence');
	}

	if (
		published &&
		(verification !== 'passed' ||
			nextState === previous.state ||
			nextState.revision !== previous.state.revision + 1 ||
			outcome.revisionBefore !== previous.state.revision ||
			outcome.revisionAfter !== nextState.revision)
	) {
		throw new Error('Invalid publication audit');
	}

	if (!published && nextState !== previous.state) {
		throw new Error('Rejected operation cannot change state');
	}

	const record: SyntheticPublicationAuditRecord = Object.freeze({
		sequence: previous.lastSequence + 1,
		scope: 'synthetic-only',
		operationId: 'create_synthetic_group_assignments',
		sessionId: identity.sessionId,
		reviewId: identity.reviewId,
		planDigest: identity.planDigest,
		actorId: identity.actorId,
		outcome: outcome.status,
		failureReason: published ? null : outcome.reason,
		verification,
		revisionBefore: previous.state.revision,
		revisionAfter: nextState.revision,
		stateChanged: published,
		groupsCreated: published ? outcome.groupsCreated : 0,
		teamsAssigned: published ? outcome.teamsAssigned : 0,
		athletesAssigned: published ? outcome.athletesAssigned : 0
	});

	const audit = Object.freeze([...previous.audit, record].slice(-SYNTHETIC_AUDIT_LIMIT));

	return Object.freeze({
		state: nextState,
		audit,
		lastSequence: record.sequence
	});
}
