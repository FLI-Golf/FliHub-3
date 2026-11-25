import type { ApplicationCapabilityId } from '../contracts.ts';

/**
 * Controlled application operations are separate from
 * advisory intelligence capabilities.
 *
 * Recognition of an operation does not authorize execution.
 */

export const applicationOperationIds = Object.freeze([
	'create_synthetic_group_assignments'
] as const);

export type ApplicationOperationId = (typeof applicationOperationIds)[number];

export type ApplicationOperationScope = 'synthetic-only';

export type ApplicationOperationEffect = 'create-synthetic-groups';

export interface ApplicationOperationDefinition {
	readonly id: ApplicationOperationId;
	readonly label: string;
	readonly description: string;
	readonly recommendation: ApplicationCapabilityId;
	readonly scope: ApplicationOperationScope;
	readonly effect: ApplicationOperationEffect;
	readonly approvalRequired: true;
	readonly execution: 'not-implemented';
}

export interface ApplicationOperationRequest {
	readonly operationId: ApplicationOperationId;
	readonly fixtureId: 'spring_invitational';
}

export const applicationOperationFailureReasons = Object.freeze([
	'invalid_request',
	'unknown_operation',
	'unsupported_fixture',
	'unauthorized_actor',
	'invalid_scope',
	'prerequisites_not_met',
	'invalid_plan',
	'approval_required',
	'invalid_approval',
	'stale_state',
	'replay_detected',
	'execution_failed',
	'verification_failed',
	'operation_unavailable'
] as const);

export type ApplicationOperationFailureReason = (typeof applicationOperationFailureReasons)[number];

export type ApplicationOperationRequestOutcome =
	| {
			readonly status: 'recognized';
			readonly request: ApplicationOperationRequest;
	  }
	| {
			readonly status: 'rejected';
			readonly reason: ApplicationOperationFailureReason;
	  };
