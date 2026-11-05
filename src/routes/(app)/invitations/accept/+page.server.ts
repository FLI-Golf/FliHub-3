import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { pbErrorMessage, pbErrorStatus, setActiveOrgCookie } from '$lib/server/auth';

interface InvitationLookup {
	organizationName: string;
	role: string;
	status: string;
	emailMatches: boolean;
	alreadyMember: boolean;
	expiresAt: string;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const pb = locals.pb;
	if (!pb || !locals.user) {
		error(503, 'PocketBase is not configured.');
	}
	const token = url.searchParams.get('token') ?? '';
	if (!token) {
		error(400, 'Missing invitation token.');
	}

	try {
		const info = await pb.send<InvitationLookup>('/api/flihub/invitations/lookup', {
			method: 'GET',
			query: { token }
		});
		return { token, info, lookupError: null };
	} catch (err) {
		return {
			token,
			info: null,
			lookupError: pbErrorMessage(err, 'This invitation link is not valid.')
		};
	}
};

export const actions: Actions = {
	default: async ({ locals, request, cookies }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		if (!token) {
			return fail(400, { message: 'Missing invitation token.' });
		}

		let organizationId: string;
		try {
			const result = await locals.pb.send<{ organization: string }>(
				'/api/flihub/invitations/accept',
				{ method: 'POST', body: { token } }
			);
			organizationId = result.organization;
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}

		setActiveOrgCookie(cookies, organizationId);
		redirect(303, `/organizations/${organizationId}`);
	}
};
