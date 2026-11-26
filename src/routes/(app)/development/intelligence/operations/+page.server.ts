import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import { workspaceAccess, workspaceAllowedOwners } from '$lib/server/intelligence/workspace/access';
import { workspaceSessions, workspaceLimits } from '$lib/server/intelligence/workspace/sessions';
import { validateWorkspaceRequest } from '$lib/server/intelligence/workspace/requests';
import { parseWorkspaceAssessmentRequest } from '$lib/server/intelligence/workspace/assessment-request';
import { workspaceAssessment } from '$lib/server/intelligence/workspace/assessment';
import { parseWorkspaceReviewRequest } from '$lib/server/intelligence/workspace/review-request';
import type { Actions, PageServerLoad } from './$types';

const cookieName = 'flihub_application_workspace';
const cookiePath = '/development/intelligence/operations';

function requireAccess(locals: App.Locals) {
	const input = {
		development: dev,
		enabled: process.env.FLIHUB_APPLICATION_WORKSPACE_ENABLED,
		allowedUserIds: process.env.FLIHUB_APPLICATION_WORKSPACE_ALLOWED_USER_IDS,
		userId: locals.user?.id ?? null,
		sessionVerified: locals.sessionVerified
	};

	workspaceSessions.revokeExcept(workspaceAllowedOwners(input));

	const access = workspaceAccess(input);

	if (!access.allowed) {
		if (locals.user?.id) {
			workspaceSessions.revokeOwner(locals.user.id);
		}
		error(access.status, 'Workspace access unavailable');
	}

	return access.userId;
}

/**
 * Revalidate the request's authenticated identity against PocketBase.
 * Never trust an identity supplied by an assessment form.
 */
async function refreshWorkspaceAccess(locals: App.Locals, expectedOwner: string): Promise<boolean> {
	const pb = locals.pb;

	locals.sessionVerified = false;

	if (!pb || !pb.authStore.isValid) {
		workspaceSessions.revokeOwner(expectedOwner);
		locals.user = null;
		return false;
	}

	try {
		await pb.collection('users').authRefresh();

		const record = pb.authStore.record;

		if (!pb.authStore.isValid || !record || record.id !== expectedOwner) {
			workspaceSessions.revokeOwner(expectedOwner);
			pb.authStore.clear();
			locals.user = null;
			return false;
		}

		locals.user = record;
		locals.sessionVerified = true;

		if (requireAccess(locals) !== expectedOwner) {
			workspaceSessions.revokeOwner(expectedOwner);
			locals.sessionVerified = false;
			return false;
		}

		return true;
	} catch {
		workspaceSessions.revokeOwner(expectedOwner);
		locals.sessionVerified = false;
		return false;
	}
}

export const load: PageServerLoad = ({ locals, cookies }) => {
	const owner = requireAccess(locals);

	return {
		session: workspaceSessions.read(owner, cookies.get(cookieName)),
		assessmentSummary: workspaceAssessment.readSummary(owner, cookies.get(cookieName)),
		review: workspaceSessions.readReview(owner, cookies.get(cookieName)),
		reviewGeneration: workspaceSessions.readCurrentRecommendation(owner, cookies.get(cookieName))
			?.generation,
		execution: workspaceSessions.readExecution(owner, cookies.get(cookieName)),
		reviewAvailability: workspaceSessions.readReviewAvailability(owner, cookies.get(cookieName)),
		limits: workspaceLimits
	};
};

export const actions = {
	assess: async ({ locals, cookies, request, url }) => {
		const owner = requireAccess(locals);

		const parsed = await parseWorkspaceAssessmentRequest(request, url.origin);

		if (parsed.status !== 'valid') {
			return fail(parsed.code, {
				message: 'Invalid workspace assessment request.'
			});
		}

		requireAccess(locals);

		const sessionId = cookies.get(cookieName);

		if (!workspaceSessions.read(owner, sessionId)) {
			return fail(409, {
				message: 'Start an active workspace session before requesting an assessment.'
			});
		}

		if (!(await refreshWorkspaceAccess(locals, owner))) {
			return fail(403, {
				message: 'Workspace assessment access unavailable.'
			});
		}

		const { mode, objective, fixtureId, actorId } = parsed.input;

		const response = await workspaceAssessment.assess(
			owner,
			sessionId,
			mode,
			objective,
			fixtureId,
			actorId,
			() => refreshWorkspaceAccess(locals, owner)
		);

		switch (response.status) {
			case 'missing_session':
				return fail(409, {
					message: 'The workspace session is no longer active.'
				});

			case 'concluded':
				return fail(409, { message: 'Start a new workspace to begin another scenario.' });

			case 'busy':
				return fail(409, {
					message: 'An assessment is already running in this session.'
				});

			case 'rate_limited':
				return fail(429, {
					message: 'Workspace assessment limit reached. Try again later.'
				});

			case 'discarded':
				return fail(403, {
					message: 'Assessment discarded because workspace access is no longer valid.'
				});

			case 'completed':
				if (response.result.status === 'unavailable') {
					return fail(503, {
						message: 'Assessment unavailable. Continue with manual review.',
						assessment: response.result
					});
				}

				if (response.result.status === 'rejected') {
					return fail(400, {
						message: 'The requested assessment is not supported.',
						assessment: response.result
					});
				}

				return {
					message: 'Offline assessment completed.',
					assessment: response.result
				};
		}
	},

	prepareReview: async ({ locals, cookies, request, url }) => {
		const owner = requireAccess(locals);

		const parsed = await parseWorkspaceReviewRequest(request, url.origin, 'prepare');

		if (parsed.status !== 'valid') {
			return fail(parsed.code, {
				message: 'Invalid workspace review request.'
			});
		}

		if (parsed.input.action !== 'prepare') {
			return fail(400, {
				message: 'Invalid workspace review request.'
			});
		}

		const sessionId = cookies.get(cookieName);

		if (!workspaceSessions.read(owner, sessionId)) {
			return fail(409, {
				message: 'The workspace session is no longer active.'
			});
		}

		if (!(await refreshWorkspaceAccess(locals, owner))) {
			return fail(403, {
				message: 'Workspace review access unavailable.'
			});
		}

		const result = workspaceSessions.prepareReview(owner, sessionId, parsed.input.generation);

		switch (result.status) {
			case 'prepared':
				return {
					message: 'Exact synthetic operation review ready.'
				};

			case 'missing_session':
				return fail(409, {
					message: 'The workspace session is no longer active.'
				});

			case 'concluded':
				return fail(409, { message: 'Start a new workspace to begin another scenario.' });

			case 'busy':
				return fail(409, {
					message: 'An assessment is already running.'
				});

			case 'stale_context':
			case 'review_consumed':
				return fail(409, {
					message: 'Complete a new assessment before preparing a review.'
				});

			case 'no_operation':
			case 'review_rejected':
				return fail(400, {
					message: 'No eligible operation review is available.'
				});
		}
	},

	executeReview: async ({ locals, cookies, request, url }) => {
		const owner = requireAccess(locals);
		const parsed = await parseWorkspaceReviewRequest(request, url.origin, 'execute');
		if (parsed.status !== 'valid') {
			return fail(parsed.code, { message: 'Invalid workspace execution request.' });
		}
		if (parsed.input.action !== 'execute') {
			return fail(400, { message: 'Invalid workspace execution request.' });
		}
		if (!(await refreshWorkspaceAccess(locals, owner))) {
			return fail(403, { message: 'Workspace execution access unavailable.' });
		}

		const result = workspaceSessions.executeReview(owner, cookies.get(cookieName), parsed.input);
		if (result.status !== 'completed') {
			return fail(409, { message: 'Execution confirmation is no longer available.' });
		}
		return { message: 'The execution attempt has concluded.' };
	},

	cancelReview: async ({ locals, cookies, request, url }) => {
		const owner = requireAccess(locals);

		const parsed = await parseWorkspaceReviewRequest(request, url.origin, 'cancel');

		if (parsed.status !== 'valid') {
			return fail(parsed.code, {
				message: 'Invalid workspace review request.'
			});
		}

		if (parsed.input.action !== 'cancel') {
			return fail(400, {
				message: 'Invalid workspace review request.'
			});
		}

		const sessionId = cookies.get(cookieName);

		if (!workspaceSessions.read(owner, sessionId)) {
			return fail(409, {
				message: 'The workspace session is no longer active.'
			});
		}

		if (!(await refreshWorkspaceAccess(locals, owner))) {
			return fail(403, {
				message: 'Workspace review access unavailable.'
			});
		}

		const result = workspaceSessions.cancelReview(owner, sessionId, parsed.input.reviewId);

		if (result.status !== 'cancelled') {
			return fail(409, {
				message: 'The requested review is no longer current.'
			});
		}

		return {
			message: 'Operation review cancelled. No changes were made.'
		};
	},

	start: async ({ locals, cookies, request, url }) => {
		const owner = requireAccess(locals);
		const invalid = await validateWorkspaceRequest(request, url.origin);

		if (invalid !== null) {
			return fail(invalid, { message: 'Invalid workspace request.' });
		}

		requireAccess(locals);

		const result = workspaceSessions.start(owner, cookies.get(cookieName));

		if (!result) {
			return fail(429, {
				message: 'Workspace session capacity or creation limit reached. Try again later.'
			});
		}

		cookies.set(cookieName, result.id, {
			path: cookiePath,
			httpOnly: true,
			sameSite: 'strict',
			secure: url.protocol === 'https:',
			maxAge: workspaceLimits.absoluteMs / 1000
		});

		return { message: 'Disposable workspace session started.' };
	},

	close: async ({ locals, cookies, request, url }) => {
		const owner = requireAccess(locals);
		const invalid = await validateWorkspaceRequest(request, url.origin);

		if (invalid !== null) {
			return fail(invalid, { message: 'Invalid workspace request.' });
		}

		requireAccess(locals);

		workspaceSessions.close(owner, cookies.get(cookieName));
		cookies.delete(cookieName, {
			path: cookiePath,
			httpOnly: true,
			sameSite: 'strict',
			secure: url.protocol === 'https:'
		});

		return { message: 'Workspace session closed.' };
	}
} satisfies Actions;
