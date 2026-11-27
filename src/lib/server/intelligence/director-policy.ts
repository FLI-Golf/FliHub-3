import { directorDefinitions, type DirectorId } from './director.ts';

export const directorConfidenceDefaults = Object.freeze({
	taskSelection: 0,
	taskPriority: 0,
	implementationApproach: 0,
	verificationStrategy: 0,
	defectTriage: 0,
	riskClassification: 0.9,
	testAssessment: 0,
	retryEscalation: 0,
	acceptanceReadiness: 0,
	nextAction: 0
} satisfies Record<DirectorId, number>);

export type DirectorConfidencePolicy = Readonly<Record<DirectorId, number>>;

// This is private operator configuration. Neither the workflow request nor the
// provider can supply a threshold. Reject the entire override on invalid input.
export function directorConfidencePolicy(value?: string): DirectorConfidencePolicy | undefined {
	if (value === undefined) return directorConfidenceDefaults;
	if (value.length > 4096) return;
	let overrides: unknown;
	try {
		overrides = JSON.parse(value);
	} catch {
		return;
	}
	if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return;

	const policy = { ...directorConfidenceDefaults };
	for (const [id, minimum] of Object.entries(overrides)) {
		if (
			!Object.hasOwn(directorDefinitions, id) ||
			typeof minimum !== 'number' ||
			!Number.isFinite(minimum) ||
			minimum < 0 ||
			minimum > 1 ||
			(id === 'riskClassification' && minimum < directorConfidenceDefaults.riskClassification)
		)
			return;
		policy[id as DirectorId] = minimum;
	}
	return Object.freeze(policy);
}
