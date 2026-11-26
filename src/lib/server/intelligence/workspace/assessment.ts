import { workspaceAdvisory, type WorkspaceAdvisoryResult } from './advisory.ts';

import {
	workspaceSessions,
	type createWorkspaceSessions,
	type WorkspaceRecommendationContext
} from './sessions.ts';

import { getApplicationCapability } from '../application/capabilities.ts';

import { syntheticActorIds } from '../application/operations/fixtures.ts';

const objectiveLabels = {
	prepare_tournament: 'Prepare a tournament',
	assess_readiness: 'Assess tournament readiness'
} as const;

const fixtureLabels = {
	spring_invitational: 'Spring Invitational',
	participants_missing: 'Participants Missing',
	groups_prepared: 'Groups Prepared',
	preparation_review: 'Preparation Review',
	venue_missing: 'Venue Missing',
	information_missing: 'Information Missing'
} as const;

const actorLabels = {
	[syntheticActorIds.owner]: 'Organization owner',
	[syntheticActorIds.admin]: 'Organization admin',
	[syntheticActorIds.scorekeeper]: 'Scorekeeper',
	[syntheticActorIds.viewer]: 'Viewer',
	[syntheticActorIds.outsider]: 'Outside organization owner',
	[syntheticActorIds.inactive]: 'Inactive administrator'
} as const;

const reasonMessages = {
	empty_objective: 'Enter an objective or select a registered objective.',
	ambiguous_objective: 'Specify tournament preparation or readiness assessment.',
	invalid_objective: 'The supplied objective is invalid.',
	objective_too_long: 'The objective exceeds the permitted length.',
	unsupported_objective: 'This objective is not supported by the offline workspace.',
	invalid_objective_mode: 'Select a supported objective input mode.',
	unsupported_fixture: 'Select a registered synthetic scenario.',
	unsupported_actor: 'Select a registered simulated operator.',
	assessment_unavailable: 'Assessment unavailable. Continue with manual review.'
} as const;

function labelFrom(labels: Readonly<Record<string, string>>, key: string): string | null {
	return Object.hasOwn(labels, key) ? labels[key] : null;
}

function unavailable() {
	return {
		status: 'unavailable',
		message: reasonMessages.assessment_unavailable
	} as const;
}

export function projectWorkspaceAdvisory(result: WorkspaceAdvisoryResult) {
	if (result.status !== 'advised') {
		return {
			status: result.status,
			message: labelFrom(reasonMessages, result.reason) ?? reasonMessages.assessment_unavailable
		};
	}

	const objective = labelFrom(objectiveLabels, result.objectiveId);
	const scenario = labelFrom(fixtureLabels, result.fixtureId);
	const actor = labelFrom(actorLabels, result.actorId);

	if (!objective || !scenario || !actor) {
		return unavailable();
	}

	const { plan, explanation } = result.advisory;

	if (
		result.effect !== 'recommendation-only' ||
		result.advisory.source !== 'mock' ||
		plan.effect !== 'recommendation-only' ||
		plan.execution !== 'not-implemented' ||
		plan.facts.source !== 'synthetic'
	) {
		return unavailable();
	}

	const facts = plan.facts;

	return {
		status: 'advised',
		source: 'mock',
		effect: 'recommendation-only',
		execution: 'disabled',

		objective,
		scenario,
		actor,

		decision: plan.decision.status,

		context: {
			source: 'synthetic',
			activity: facts.activity,
			status: facts.status,
			dateAssigned: facts.dateAssigned,
			venueAssigned: facts.venueAssigned,
			participantCount: facts.participantCount,
			groupCount: facts.groupCount,
			scoringConfigured: facts.scoringConfigured
		},

		nextStep: plan.nextStep
			? {
					label: plan.nextStep.label,
					description: plan.nextStep.description
				}
			: null,

		readiness: plan.readiness
			? {
					score: plan.readiness.score,
					maximum: plan.readiness.maximum,
					interpretation: 'qualitative-only'
				}
			: null,

		prerequisiteReviewSuggested: plan.prerequisiteReviewSuggested,

		explanation: {
			heading: explanation.heading,
			summary: explanation.summary,
			recommendation: explanation.recommendation,
			reasoning: explanation.reasoning,
			alternatives: [...explanation.alternatives],
			readiness: explanation.readiness,
			notices: [...explanation.notices],
			disclaimer: explanation.disclaimer
		},

		manualFallback: 'Continue with manual review when necessary.'
	} as const;
}

export type WorkspacePublicAdvisory = ReturnType<typeof projectWorkspaceAdvisory>;

type SessionStore = ReturnType<typeof createWorkspaceSessions>;

type AdvisoryService = Pick<typeof workspaceAdvisory, 'assess'>;

export function createWorkspaceAssessment(
	sessions: SessionStore = workspaceSessions,
	advisory: AdvisoryService = workspaceAdvisory
) {
	return Object.freeze({
		async assess(
			owner: string,
			sessionId: string | undefined,
			mode: unknown,
			objective: unknown,
			fixtureId: unknown,
			actorId: unknown,
			canPublish: () => boolean | Promise<boolean>
		) {
			const admission = sessions.beginAssessment(owner, sessionId);

			if (admission.status !== 'admitted') {
				return { status: admission.status } as const;
			}

			let result: WorkspacePublicAdvisory;
			let recommendation: WorkspaceRecommendationContext | null = null;

			try {
				const internal = await advisory.assess(mode, objective, fixtureId, actorId);

				result = projectWorkspaceAdvisory(internal);

				if (
					internal.status === 'advised' &&
					result.status === 'advised' &&
					result.decision === 'recommended'
				) {
					const { plan } = internal.advisory;

					if (
						plan.decision.status === 'recommended' &&
						plan.nextStep &&
						plan.nextStep.effect === 'recommendation-only' &&
						plan.nextStep.capability === plan.decision.capability &&
						internal.fixtureId === fixtureId &&
						internal.actorId === actorId
					) {
						const capability = getApplicationCapability(plan.nextStep.capability);

						if (capability) {
							recommendation = {
								objectiveId: internal.objectiveId,
								fixtureId: internal.fixtureId,
								actorId: internal.actorId,
								capability: capability.id
							};
						}
					}
				}
			} catch {
				recommendation = null;
				result = unavailable();
			}

			try {
				if ((await canPublish()) !== true) {
					admission.finish('unavailable');
					return { status: 'discarded' } as const;
				}
			} catch {
				admission.finish('unavailable');
				return { status: 'discarded' } as const;
			}

			if (
				!admission.finish(
					result.status === 'advised' && result.decision === 'clarification'
						? 'clarification'
						: result.status,
					recommendation
				)
			) {
				return { status: 'discarded' } as const;
			}

			return {
				status: 'completed',
				result
			} as const;
		},

		readSummary(owner: string, sessionId: string | undefined) {
			const history = sessions.readAssessmentHistory(owner, sessionId);

			if (!history) return null;

			return {
				history,
				usage: {
					retainedAssessments: history.length,
					completedAssessments: history.at(-1)?.sequence ?? 0,
					paidProviderRequests: 0,
					paidProviderCost: 0,
					source: 'mock'
				}
			};
		}
	});
}

export const workspaceAssessment = createWorkspaceAssessment();
