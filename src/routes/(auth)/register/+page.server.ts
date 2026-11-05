import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.pb) {
			return fail(503, {
				message: 'PocketBase is not configured. See the setup instructions.',
				name: '',
				email: ''
			});
		}
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		const passwordConfirm = String(form.get('passwordConfirm') ?? '');

		if (!name || !email) {
			return fail(400, { message: 'Enter a display name and email address.', name, email });
		}
		if (password.length < 8) {
			return fail(400, { message: 'Passwords need at least 8 characters.', name, email });
		}
		if (password !== passwordConfirm) {
			return fail(400, { message: 'Passwords do not match.', name, email });
		}

		try {
			await locals.pb.collection('users').create({ email, password, passwordConfirm, name });
		} catch {
			return fail(400, {
				message: 'Could not create the account. The email may already be registered.',
				name,
				email
			});
		}

		// Verification email goes through the configured SMTP transport —
		// captured by mailpit in local development.
		let verificationSent = true;
		try {
			await locals.pb.collection('users').requestVerification(email);
		} catch {
			verificationSent = false;
		}

		return { registered: true, name, email, verificationSent };
	}
};
