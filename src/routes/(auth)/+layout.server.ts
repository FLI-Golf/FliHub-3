import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { safeNextPath } from '$lib/server/auth';

/**
 * Auth screens (login/register) are only for signed-out visitors.
 * Signed-in users are sent to their organizations (or their original
 * destination via a validated `next` path).
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		redirect(303, safeNextPath(url.searchParams.get('next')));
	}
};
