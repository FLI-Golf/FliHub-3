import { createIntelligence } from '../../src/lib/server/intelligence/service.ts';

import { getSyntheticFixture } from '../../src/lib/server/intelligence/application/fixtures.ts';

import { operationsForRecommendation } from '../../src/lib/server/intelligence/application/operations/registry.ts';

import { createSyntheticApprovalSession } from '../../src/lib/server/intelligence/application/operations/approval.ts';

import { syntheticActorIds } from '../../src/lib/server/intelligence/application/operations/fixtures.ts';

/**
 * Offline operator workflow.
 *
 * Intelligence can suggest an operation, but cannot
 * authorize, approve or execute it.
 *
 * Only registered objectives, fixtures and simulated
 * actor identities are accepted.
 */
export function createOfflineOperationWorkflow() {
	let assessmentAttempts = 0;
	let blockedFetchAttempts = 0;

	const intelligence = createIntelligence(
		{
			FLIHUB_INTELLIGENCE_ENABLED: 'true',
			FLIHUB_INTELLIGENCE_PROVIDER: 'mock',
			FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '10',
			FLIHUB_INTELLIGENCE_CONCURRENCY: '1'
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

	return Object.freeze({
		async prepare(objectiveId, fixtureId, actorId) {
			if (objectiveId !== 'prepare_tournament' && objectiveId !== 'assess_readiness') {
				return {
					status: 'rejected',
					reason: 'unsupported_objective'
				};
			}

			if (!getSyntheticFixture(fixtureId)) {
				return {
					status: 'rejected',
					reason: 'unsupported_fixture'
				};
			}

			if (typeof actorId !== 'string' || !Object.values(syntheticActorIds).includes(actorId)) {
				return {
					status: 'rejected',
					reason: 'unauthorized_actor'
				};
			}

			try {
				const advisory = await intelligence.adviseApplication({
					objectiveId,
					fixtureId
				});

				if (advisory.status !== 'advised') {
					return {
						status: 'rejected',
						reason: 'assessment_unavailable'
					};
				}

				const { plan, explanation } = advisory;

				if (
					objectiveId !== 'prepare_tournament' ||
					plan.decision.status !== 'recommended' ||
					!plan.nextStep ||
					plan.nextStep.capability !== plan.decision.capability
				) {
					return {
						status: 'advisory_only',
						advisory
					};
				}

				const operations = operationsForRecommendation(plan.decision.capability);

				if (operations.length !== 1 || fixtureId !== 'spring_invitational') {
					return {
						status: 'advisory_only',
						advisory
					};
				}

				const operation = operations[0];

				if (operation.scope !== 'synthetic-only' || operation.approvalRequired !== true) {
					return {
						status: 'rejected',
						reason: 'operation_unavailable'
					};
				}

				const created = createSyntheticApprovalSession(fixtureId, actorId);

				if (created.status !== 'created') {
					return {
						status: 'rejected',
						reason: created.reason,
						advisory
					};
				}

				const { session } = created;

				const prepared = session.prepare({
					operationId: operation.id,
					fixtureId
				});

				if (prepared.status !== 'prepared') {
					session.cancel();

					return {
						status: 'rejected',
						reason: prepared.reason,
						advisory
					};
				}

				const review = session.getReview();

				if (!review || review.planDigest !== prepared.plan.digest) {
					session.cancel();

					return {
						status: 'rejected',
						reason: 'invalid_plan'
					};
				}

				return {
					status: 'review_required',
					advisory,
					explanation,
					operation,
					plan: prepared.plan,
					review,
					session
				};
			} catch {
				return {
					status: 'rejected',
					reason: 'workflow_unavailable'
				};
			}
		},

		getUsage() {
			return Object.freeze({
				provider: 'mock',
				assessmentAttempts,
				blockedFetchAttempts,
				paidProviderRequests: 0,
				persistentStorage: false
			});
		}
	});
}
