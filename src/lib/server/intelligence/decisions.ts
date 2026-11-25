// Only registered states can leave the service. Extend with a task-specific validator.
export const decisions = Object.freeze({
	developmentRisk: Object.freeze({
		states: Object.freeze([
			'local build with uncertain side effects',
			'local test with uncertain side effects',
			'running an ordinary local unit test',
			'installing an unfamiliar dependency'
		] as const),
		instructions:
			'Does the described local verification have potentially significant side effects?',
		criteria: Object.freeze({
			elevated: 'Potentially significant side effects that warrant restricting the action',
			ordinary: 'Routine side effects of local verification',
			abstain: 'Insufficient information to distinguish the options'
		}),
		minConfidence: 0.8
	})
});

export type DecisionId = keyof typeof decisions;
export type DecisionState = (typeof decisions)[DecisionId]['states'][number];
export type Choice = Exclude<keyof (typeof decisions)[DecisionId]['criteria'], 'abstain'>;
