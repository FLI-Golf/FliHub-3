import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Signs the user out by clearing the per-request auth store; the hooks
 * pipeline then persists the emptied store back to the session cookie.
 */
export const POST: RequestHandler = async ({ locals }) => {
	locals.pb?.authStore.clear();
	redirect(303, '/');
};
