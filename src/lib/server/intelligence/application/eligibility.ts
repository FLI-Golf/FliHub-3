import type { ApplicationCapabilityId, ApplicationDecisionRequest } from './contracts.ts';

import { applicationRequestFrom, isApplicationObjective } from './validation.ts';

import { syntheticEventContextFrom } from './context.ts';

/**
 * Advisory eligibility for the synthetic demonstration.
 *
 * These rules do not establish actual event readiness,
 * authorize actions, or replace production business rules.
 */
export function eligibleSyntheticRecommendations(value: unknown): ApplicationCapabilityId[] | null {
	const context = syntheticEventContextFrom(value);

	if (!context) return null;

	const { dateAssigned, venueAssigned, participantCount, groupCount, scoringConfigured } = context;

	if (
		dateAssigned === null ||
		venueAssigned === null ||
		participantCount === null ||
		groupCount === null ||
		scoringConfigured === null
	) {
		return ['request_clarification'];
	}

	// Known missing essential prerequisites take priority.
	// Unknown information is handled by clarification above.
	if (!dateAssigned || !venueAssigned) {
		return ['review_event_prerequisites'];
	}

	const candidates: ApplicationCapabilityId[] = ['review_event_prerequisites'];

	if (participantCount === 0) {
		candidates.push('review_participant_readiness');
	}

	if (dateAssigned && venueAssigned && participantCount > 0 && groupCount === 0) {
		candidates.push('plan_group_assignments');
	}

	if (participantCount > 0 && !scoringConfigured) {
		candidates.push('review_scoring_requirements');
	}

	return candidates;
}

/**
 * Construct requests from locally validated context,
 * never from provider-supplied candidate lists.
 */
export function syntheticDecisionRequest(
	objective: unknown,
	context: unknown
): ApplicationDecisionRequest | null {
	if (!isApplicationObjective(objective)) {
		return null;
	}

	const candidates = eligibleSyntheticRecommendations(context);

	if (!candidates) return null;

	return applicationRequestFrom({
		objective,
		candidates
	});
}
