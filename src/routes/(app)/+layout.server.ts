import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * Everything in the (app) group requires a validated session. Signed-out
 * visitors are sent to login with their intended destination preserved in
 * a validated `next` parameter.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}
};
