// Identifiers and descriptions are registered server-side. Callers cannot supply prose.
export const directorDefinitions = {
	taskSelection: ['implementation', 'checks', 'integration'],
	taskPriority: ['implementation', 'checks', 'integration'],
	implementationApproach: ['minimal_change', 'add_fixture'],
	riskClassification: ['routine', 'sensitive'],
	verificationStrategy: ['targeted', 'broader'],
	testAssessment: ['passing', 'failing', 'insufficient'],
	defectTriage: ['fixture_defect', 'implementation_defect', 'unknown_defect'],
	retryEscalation: ['retry', 'escalate'],
	acceptanceReadiness: ['ready', 'not_ready'],
	nextAction: [
		'implement_next',
		'verify_targeted',
		'verify_broader',
		'correct_defect',
		'reconsider',
		'clarify',
		'request_approval',
		'recommend_completion',
		'stop_blocker',
		'stop_budget'
	]
} as const;

export const directorOperatingPrinciples =
	'Direct the engineering worker to make useful progress within the operator-authorized scope. ' +
	'Choose the most useful eligible option when several are viable. Prefer bounded implementation, ' +
	'verification, learning and correction. Pause only for a material blocker, missing evidence or required approval. ' +
	'Never expand scope, bypass a protection, or claim acceptance without verification. ';

export const directorInstructions: Record<keyof typeof directorDefinitions, string> = {
	taskSelection: 'Select the eligible task that best advances the objective now.',
	taskPriority: 'Prioritize the eligible task that most improves progress or reduces uncertainty.',
	implementationApproach:
		'Choose the smallest effective approach that meets the fixture requirements.',
	riskClassification:
		'Classify the concrete operation. Report sensitive when there is evidence of a protected or non-routine effect.',
	verificationStrategy:
		'Choose the least costly eligible check that can produce the missing acceptance evidence.',
	testAssessment: 'How should the observed test evidence be classified?',
	defectTriage:
		'Identify the most likely actionable defect indicated by the evidence. Use unknown only when the available evidence does not support a concrete diagnosis. Treat the diagnosis as a hypothesis to check through independent verification.',
	retryEscalation:
		'Prefer one eligible correction when the evidence supports it. Escalate when correction needs information or authority the worker lacks.',
	acceptanceReadiness: 'How ready is the synthetic workflow for acceptance?',
	nextAction:
		'Select an eligible action that advances implementation or verification. Pause or stop for a material blocker.'
};

export const directorStates = [
	'initial',
	'implementation_done',
	'checks_done',
	'verification_pending',
	'verification_failed',
	'verification_passed',
	'correction_done',
	'acceptance_pending'
] as const;

export type DirectorId = keyof typeof directorDefinitions;
export type DirectorCandidate = (typeof directorDefinitions)[DirectorId][number];
export type DirectorState = (typeof directorStates)[number];

export const directorContext: Record<DirectorState, string> = {
	initial:
		'An operator authorized implementation and verification of a small synthetic fixture. Work has not started. Implementation supplies the fixture behavior and checks supplies its acceptance assertions.',
	implementation_done:
		'At least one synthetic task passed its immediate evidence check. Select only from remaining eligible work. Integration requires both implementation and checks.',
	checks_done:
		'The synthetic acceptance assertions are ready. Complete remaining eligible fixture work.',
	verification_pending:
		'All authorized fixture tasks have evidence. The required verification has yet to pass.',
	verification_failed:
		'The independent synthetic check observed a fixture mismatch. A single correction may be attempted before repeating verification.',
	verification_passed:
		'The independent synthetic verification passed and all authorized fixture tasks have evidence.',
	correction_done:
		'A bounded fixture correction completed. Passing verification is still required.',
	acceptance_pending:
		'All synthetic tasks have evidence and the independent check passed. The host independently enforces acceptance.'
};

export const candidateDescriptions: Record<DirectorCandidate, string> = {
	implementation: 'Implement the small synthetic fixture behavior first.',
	checks: 'Prepare deterministic assertions to characterize and verify the synthetic fixture.',
	integration: 'Connect the implemented behavior to its assertions after both prerequisites.',
	minimal_change: 'Use the compact canonical fixture representation.',
	add_fixture: 'Use the expanded fixture representation with explanatory structure.',
	routine: 'The described fixture correction remains routine and within its preauthorized scope.',
	sensitive: 'The stated evidence suggests a sensitive or non-routine action that should pause.',
	targeted: 'Run the direct fixture contract checks with no broader fixture validation.',
	broader: 'Run the direct contract checks and the independent fixture consistency checks.',
	passing: 'Observed deterministic verification succeeded.',
	failing: 'Observed deterministic verification found a concrete mismatch.',
	insufficient: 'There is insufficient execution evidence to assess verification.',
	fixture_defect: 'The synthetic fixture data or representation caused the observed mismatch.',
	implementation_defect: 'The implemented behavior disagrees with its required result.',
	unknown_defect: 'The available evidence cannot distinguish the cause.',
	retry: 'Attempt one authorized correction before repeating a check.',
	escalate: 'Pause for operator review before another correction.',
	ready: 'All required fixture checks and completion evidence are present.',
	not_ready: 'More evidence or operator review is needed.',
	implement_next: 'Dispatch one of the authorized eligible tasks.',
	verify_targeted: 'Run only the direct fixture contract verification.',
	verify_broader: 'Run direct and extra fixture consistency verification.',
	correct_defect: 'Correct the concrete synthetic mismatch in the authorized fixture.',
	reconsider: 'Use a different eligible fixture representation to address the mismatch.',
	clarify: 'Pause because a material ambiguity requires operator clarification.',
	request_approval: 'Pause for independent operator review.',
	recommend_completion: 'Recommend acceptance based on passing evidence.',
	stop_blocker: 'Stop because progress cannot continue on the evidence provided.',
	stop_budget: 'Stop because further work would be disproportionate to remaining work.'
};
