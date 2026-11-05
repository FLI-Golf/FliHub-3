import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Landing target for the verification link PocketBase emails (template in
 * `pocketbase/pb_migrations/1793832000_phase1a_email_templates.js`).
 * Confirms the token with PocketBase; no sign-in required.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.pb) {
		error(503, 'PocketBase is not configured.');
	}
	try {
		await locals.pb.collection('users').confirmVerification(params.token);
		return { verified: true };
	} catch {
		return { verified: false };
	}
};
