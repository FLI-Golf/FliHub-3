import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { PendingInvitations } from '$lib/server/invitation-notifications';
import { pbErrorMessage, pbErrorStatus, setActiveOrgCookie } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store' });
	if (!locals.pb || !locals.user) error(503, 'PocketBase is not configured.');
	if (!locals.user.verified)
		return { verifyRequired: true, items: [], page: 1, hasMore: false, loadError: null };
	const page = Number(url.searchParams.get('page') || 1);
	if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
		error(400, 'Invalid invitation page.');
	try {
		const result = await locals.pb.send<PendingInvitations>('/api/flihub/invitations/pending', {
			method: 'GET',
			query: { page, perPage: 20 }
		});
		return { verifyRequired: false, ...result, loadError: null };
	} catch (err) {
		return {
			verifyRequired: false,
			items: [],
			page,
			hasMore: false,
			loadError: pbErrorMessage(err, 'Unable to check invitations. Try again.')
		};
	}
};
export const actions: Actions = {
	accept: async ({ locals, request, cookies }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		if (!locals.user.verified)
			return fail(403, { message: 'Verify your email before accepting invitations.' });
		const invitationId = String((await request.formData()).get('invitationId') ?? '');
		if (!/^[a-z0-9]{15}$/.test(invitationId))
			return fail(400, { message: 'Invalid invitation reference.' });
		let organizationId: string;
		try {
			const result = await locals.pb.send<{ organization: string }>(
				'/api/flihub/invitations/accept',
				{ method: 'POST', body: { invitationId } }
			);
			organizationId = result.organization;
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		setActiveOrgCookie(cookies, organizationId);
		redirect(303, `/organizations/${organizationId}`);
	}
};
