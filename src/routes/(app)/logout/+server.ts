import { workspaceSessions } from '$lib/server/intelligence/workspace/sessions';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Signs the user out by clearing the per-request auth store; the hooks
 * pipeline then persists the emptied store back to the session cookie.
 */
export const POST: RequestHandler = async ({ locals, cookies, url }) => {
	// Discard disposable intelligence sessions before clearing authentication.
	if (locals.user?.id) {
		workspaceSessions.revokeOwner(locals.user.id);
	}

	cookies.delete('flihub_application_workspace', {
		path: '/development/intelligence/operations',
		httpOnly: true,
		sameSite: 'strict',
		secure: url.protocol === 'https:'
	});

	locals.pb?.authStore.clear();
	redirect(303, '/');
};
