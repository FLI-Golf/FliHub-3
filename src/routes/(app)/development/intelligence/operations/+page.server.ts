import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import { workspaceAccess, workspaceAllowedOwners } from '$lib/server/intelligence/workspace/access';
import { workspaceSessions, workspaceLimits } from '$lib/server/intelligence/workspace/sessions';
import { validateWorkspaceRequest } from '$lib/server/intelligence/workspace/requests';
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

export const load: PageServerLoad = ({ locals, cookies }) => {
	const owner = requireAccess(locals);

	return {
		session: workspaceSessions.read(owner, cookies.get(cookieName)),
		limits: workspaceLimits
	};
};

export const actions = {
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
