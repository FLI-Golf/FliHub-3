import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	listMyMemberships,
	pbErrorMessage,
	pbErrorStatus,
	setActiveOrgCookie
} from '$lib/server/auth';
import { capabilityDefinitions, templates } from '$lib/capabilities/catalog';

export const load: PageServerLoad = () => {
	// The catalog JSON is shared with the PocketBase hooks — no forked lists.
	return {
		catalog: {
			templates,
			capabilities: capabilityDefinitions
		}
	};
};

export const actions: Actions = {
	/**
	 * Creates an organization through the trusted PocketBase hook, which
	 * atomically creates the Owner membership. Phase 1B: optionally carries the
	 * starter template, capability selection, and race distances. The new
	 * organization becomes the active one.
	 */
	create: async ({ locals, request, cookies }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.', name: '' });
		}
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();

		const template = String(form.get('template') ?? '');
		const body: Record<string, unknown> = { name };
		if (template) {
			body.template = template;
			body.capabilities = form.getAll('capability').map(String);
			const rawDistances = String(form.get('raceDistances') ?? '');
			if (rawDistances) {
				try {
					body.raceDistances = JSON.parse(rawDistances);
				} catch {
					return fail(400, { message: 'Invalid race distance configuration.', name });
				}
			}
		}

		let organizationId: string;
		try {
			const result = await locals.pb.send<{ id: string }>('/api/flihub/organizations', {
				method: 'POST',
				body
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
