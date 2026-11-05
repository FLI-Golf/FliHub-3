import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import {
	listMyMemberships,
	pbErrorMessage,
	pbErrorStatus,
	setActiveOrgCookie
} from '$lib/server/auth';

export const actions: Actions = {
	/**
	 * Creates an organization through the trusted PocketBase hook, which
	 * atomically creates the Owner membership. The new organization becomes
	 * the active one.
	 */
	create: async ({ locals, request, cookies }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.', name: '' });
		}
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();

		let organizationId: string;
		try {
			const result = await locals.pb.send<{ id: string }>('/api/flihub/organizations', {
				method: 'POST',
				body: { name }
			});
			organizationId = result.id;
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err), name });
		}

		setActiveOrgCookie(cookies, organizationId);
		redirect(303, `/organizations/${organizationId}`);
	},

	/**
	 * Switches the active organization. The choice is honored only when the
	 * user is actually a member of the target organization.
	 */
	switch: async ({ locals, request, cookies }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.', messageContext: 'switch' });
		}
		const form = await request.formData();
		const organizationId = String(form.get('organization') ?? '');

		const memberships = await listMyMemberships(locals.pb, locals.user.id);
		if (!memberships.some((m) => m.organization.id === organizationId)) {
			return fail(403, {
				message: 'You are not a member of that organization.',
				messageContext: 'switch'
			});
		}

		setActiveOrgCookie(cookies, organizationId);
		redirect(303, '/organizations');
	}
};
