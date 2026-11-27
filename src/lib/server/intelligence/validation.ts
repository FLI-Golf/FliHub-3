import { directorConfidenceDefaults, type DirectorConfidencePolicy } from './director-policy.ts';
import {
	candidateDescriptions,
	directorDefinitions,
	directorInstructions,
	directorOperatingPrinciples,
	directorStates
} from './director.ts';
import type { DirectorId, DirectorCandidate, DirectorState } from './director.ts';
import { decisions } from './decisions.ts';
import type { Choice, DecisionId } from './decisions.ts';
import type { Outcome, Request, Usage } from './types.ts';

export function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

export function probability(value: unknown): value is number {
	return typeof value === 'number' && value >= 0 && value <= 1;
}

export function requestFrom(input: unknown): Request | undefined {
	const value = record(input);
	if (
		!value ||
		!Object.hasOwn(value, 'id') ||
		!Object.hasOwn(value, 'state') ||
		typeof value.id !== 'string'
	)
		return;
	if (Object.hasOwn(decisions, value.id) && Object.keys(value).length === 2) {
		const id = value.id as DecisionId;
		const state = decisions[id].states.find((state) => state === value.state);
		if (state) return { id, state };
	}
	if (
		!Object.hasOwn(directorDefinitions, value.id) ||
		!Object.hasOwn(value, 'candidates') ||
		Object.keys(value).length !== 3 ||
		!Array.isArray(value.candidates)
	)
		return;
	const id = value.id as DirectorId;
	const state = directorStates.find((state) => state === value.state);
	const allowed: readonly string[] = directorDefinitions[id];
	if (!value.candidates.length || value.candidates.length > allowed.length) return;
	const candidates: unknown[] = Array.from(value.candidates);
	if (
		!state ||
		new Set(candidates).size !== candidates.length ||
		!candidates.every((candidate) => typeof candidate === 'string' && allowed.includes(candidate))
	)
		return;
	return { id, state: state as DirectorState, candidates: candidates as DirectorCandidate[] };
}

export function definitionFor(
	request: Request,
	policy: DirectorConfidencePolicy = directorConfidenceDefaults
) {
	if (!('candidates' in request)) return decisions[request.id];
	return {
		instructions: directorOperatingPrinciples + directorInstructions[request.id],
		criteria: Object.fromEntries([
			...request.candidates.map((candidate) => [candidate, candidateDescriptions[candidate]]),
			[
				'abstain',
				'The evidence does not support any eligible choice. Use this only for material uncertainty, not because several authorized options are viable.'
			]
		]),
		minConfidence: policy[request.id]
	};
}

export function usageFrom(value: unknown): Usage | undefined {
	const usage = record(value);
	const { inputTokens, outputTokens } = usage ?? {};
	if (
		typeof inputTokens === 'number' &&
		Number.isSafeInteger(inputTokens) &&
		inputTokens >= 0 &&
		typeof outputTokens === 'number' &&
		Number.isSafeInteger(outputTokens) &&
		outputTokens >= 0
	) {
		return { inputTokens, outputTokens };
	}
}

export function outcomeFrom(
	raw: Record<string, unknown> | undefined,
	request: Request,
	policy?: DirectorConfidencePolicy
): Outcome {
	if (raw?.status === 'abstained') return { status: 'abstained' };
	if (raw?.status === 'unavailable') {
		switch (raw.reason) {
			case 'authentication':
			case 'billing':
			case 'invalid_input':
			case 'invalid_output':
			case 'rate':
			case 'provider':
				return { status: 'unavailable', reason: raw.reason };
		}
	}
	const { criteria, minConfidence } = definitionFor(request, policy);
	const { choice, confidence } = raw ?? {};
	if (
		raw?.status !== 'suggested' ||
		typeof choice !== 'string' ||
		!Object.hasOwn(criteria, choice) ||
		(confidence !== null && !probability(confidence))
	) {
		return { status: 'unavailable', reason: 'invalid_output' };
	}
	if (choice === 'abstain') return { status: 'abstained', abstention: 'explicit' };
	// A formally valid null score may be ignored only where no minimum is required.
	if (confidence === null && minConfidence > 0)
		return { status: 'abstained', abstention: 'confidence_missing' };
	if (confidence !== null && confidence < minConfidence)
		return { status: 'abstained', abstention: 'confidence_below_threshold', confidence };
	return { status: 'suggested', choice: choice as Choice | DirectorCandidate, confidence };
}
