import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { safeNextPath } from '$lib/server/auth';

export const actions: Actions = {
	default: async ({ locals, request, url }) => {
		if (!locals.pb) {
			return fail(503, {
				message: 'PocketBase is not configured. See the setup instructions.',
				email: ''
			});
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { message: 'Enter your email and password.', email });
		}

		try {
			await locals.pb.collection('users').authWithPassword(email, password);
		} catch {
			return fail(400, { message: 'Invalid email or password.', email });
		}

		// The hooks pipeline persists the authenticated session cookie.
		redirect(303, safeNextPath(url.searchParams.get('next')));
	}
};
