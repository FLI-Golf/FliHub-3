import { createIntelligence, type ApplicationAdvice } from '../service.ts';

import { getSyntheticFixture } from '../application/fixtures.ts';

import { syntheticActorIds } from '../application/operations/fixtures.ts';

import { resolveRegisteredWorkspaceObjective, resolveWorkspaceObjective } from './objectives.ts';

export type WorkspaceAdvisoryResult =
	| {
			readonly status: 'advised';
			readonly effect: 'recommendation-only';
			readonly objectiveId: string;
			readonly fixtureId: string;
			readonly actorId: string;
			readonly advisory: Extract<ApplicationAdvice, { status: 'advised' }>;
	  }
	| {
			readonly status: 'clarification' | 'rejected' | 'unavailable';
			readonly reason: string;
	  };

export function createWorkspaceAdvisory() {
	let assessmentAttempts = 0;
	let blockedFetchAttempts = 0;

	const intelligence = createIntelligence(
		{
			FLIHUB_INTELLIGENCE_ENABLED: 'true',
			FLIHUB_INTELLIGENCE_PROVIDER: 'mock',
			FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '60',
			FLIHUB_INTELLIGENCE_CONCURRENCY: '8'
		},
		{
			fetch: async () => {
				blockedFetchAttempts++;
				throw new Error('External provider access is disabled.');
			},
			applicationAudit: () => {
				assessmentAttempts++;
			}
		}
	);

	const actors: readonly string[] = Object.values(syntheticActorIds);

	return Object.freeze({
		async assess(
			mode: unknown,
			objective: unknown,
			fixtureId: unknown,
			actorId: unknown
		): Promise<WorkspaceAdvisoryResult> {
			if (mode !== 'registered' && mode !== 'natural') {
				return {
					status: 'rejected',
					reason: 'invalid_objective_mode'
				};
			}

			const resolution =
				mode === 'registered'
					? resolveRegisteredWorkspaceObjective(objective)
					: resolveWorkspaceObjective(objective);

			if (resolution.status !== 'resolved') {
				return resolution;
			}

			if (typeof fixtureId !== 'string' || !getSyntheticFixture(fixtureId)) {
				return {
					status: 'rejected',
					reason: 'unsupported_fixture'
				};
			}

			if (typeof actorId !== 'string' || !actors.includes(actorId)) {
				return {
					status: 'rejected',
					reason: 'unsupported_actor'
				};
			}

			try {
				const advisory = await intelligence.adviseApplication({
					objectiveId: resolution.objectiveId,
					fixtureId
				});

				if (advisory.status !== 'advised') {
					return {
						status: 'unavailable',
						reason: 'assessment_unavailable'
					};
				}

				return {
					status: 'advised',
					effect: 'recommendation-only',
					objectiveId: resolution.objectiveId,
					fixtureId,
					actorId,
					advisory
				};
			} catch {
				return {
					status: 'unavailable',
					reason: 'assessment_unavailable'
				};
			}
		},

		getUsage() {
			return Object.freeze({
				provider: 'mock',
				assessmentAttempts,
				blockedFetchAttempts,
				paidProviderRequests: 0,
				paidProviderCost: 0,
				persistentStorage: false,
				operationExecution: false
			});
		}
	});
}

export const workspaceAdvisory = createWorkspaceAdvisory();
