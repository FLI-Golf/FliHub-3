import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrgRole } from '$lib/server/auth';
import { pbErrorMessage, pbErrorStatus, toOrganizationDTO } from '$lib/server/auth';
import { capabilityDefinitions, templates } from '$lib/capabilities/catalog';

const ID_PATTERN = /^[a-z0-9]{15}$/;

export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) {
		error(503, 'PocketBase is not configured.');
	}
	if (!ID_PATTERN.test(params.id)) {
		error(404, 'Organization not found.');
	}

	// Collection rules scope this to organizations the caller belongs to.
	const memberships = await pb.collection('memberships').getFullList({
		filter: `organization = "${params.id}" && user = "${user.id}"`
	});
	const mine = memberships[0];
	if (!mine) {
		error(404, 'Organization not found.');
	}
	const myRole = String(mine.role) as OrgRole;

	const organization = await pb.collection('organizations').getOne(params.id);

	return {
		organization: toOrganizationDTO(organization),
		myRole,
		canManage: myRole === 'owner' || myRole === 'admin',
		catalog: { templates, capabilities: capabilityDefinitions }
	};
};

export const actions: Actions = {
	/**
	 * Saves configuration through the trusted hook (validated, transactional,
	 * audited). Only Owners/Admins pass the hook's role check.
	 */
	configure: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();

		const body: Record<string, unknown> = {
			name: String(form.get('name') ?? '').trim(),
			template: String(form.get('template') ?? ''),
			capabilities: form.getAll('capability').map(String),
			completeOnboarding: true
		};
		const rawDistances = String(form.get('raceDistances') ?? '');
		if (rawDistances) {
			try {
				body.raceDistances = JSON.parse(rawDistances);
			} catch {
				return fail(400, { message: 'Invalid race distance configuration.' });
			}
		}

		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/configure`, {
				method: 'POST',
				body
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}

		return { saved: true };
	}
};
