import type { ApplicationOperationDefinition, ApplicationOperationId } from './contracts.ts';

const definitions = {
	create_synthetic_group_assignments: {
		id: 'create_synthetic_group_assignments',
		label: 'Create synthetic group assignments',
		description:
			'Prepare a controlled proposal to create groups in disposable synthetic event state.',
		recommendation: 'plan_group_assignments',
		scope: 'synthetic-only',
		effect: 'create-synthetic-groups',
		approvalRequired: true,
		execution: 'controlled-synthetic'
	}
} as const satisfies Record<ApplicationOperationId, ApplicationOperationDefinition>;

export function isApplicationOperationId(value: unknown): value is ApplicationOperationId {
	return typeof value === 'string' && Object.hasOwn(definitions, value);
}

export function getApplicationOperation(value: unknown): ApplicationOperationDefinition | null {
	if (!isApplicationOperationId(value)) return null;

	return { ...definitions[value] };
}

export function listApplicationOperations(): ApplicationOperationDefinition[] {
	return Object.values(definitions).map((definition) => ({ ...definition }));
}

/**
 * Resolve only locally registered recommendation mappings.
 * This function does not grant permission or approval.
 */
export function operationsForRecommendation(
	recommendation: unknown
): ApplicationOperationDefinition[] {
	if (typeof recommendation !== 'string') return [];

	return Object.values(definitions)
		.filter((definition) => definition.recommendation === recommendation)
		.map((definition) => ({ ...definition }));
}
