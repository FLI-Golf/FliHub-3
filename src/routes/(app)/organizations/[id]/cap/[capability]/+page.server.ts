import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { OrgRole } from '$lib/server/auth';
import { toOrganizationDTO } from '$lib/server/auth';
import { capabilityDefinitions, getCapability } from '$lib/capabilities/catalog';

const ID_PATTERN = /^[a-z0-9]{15}$/;

/**
 * Capability destination pages. Access rules, enforced server-side here and
 * by collection rules on the data itself:
 * - non-members never see the page (404);
 * - members see an honest "not enabled" state when the capability is off;
 * - enabled planned/upcoming capabilities show their honest status — no fake
 *   CRUD screens, no working-looking buttons.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) {
		error(503, 'PocketBase is not configured.');
	}
	if (!ID_PATTERN.test(params.id)) {
		error(404, 'Organization not found.');
	}

	const capability = getCapability(params.capability);
	if (!capability) {
		error(404, 'Unknown capability.');
	}

	const memberships = await pb.collection('memberships').getFullList({
		filter: `organization = "${params.id}" && user = "${user.id}"`
	});
	const mine = memberships[0];
	if (!mine) {
		error(404, 'Organization not found.');
	}
	const myRole = String(mine.role) as OrgRole;

	const organization = await pb.collection('organizations').getOne(params.id);
	const dto = toOrganizationDTO(organization);

	return {
		organization: dto,
		myRole,
		canManage: myRole === 'owner' || myRole === 'admin',
		capability,
		enabled: dto.capabilities.includes(capability.id),
		enabledCapabilities: capabilityDefinitions.filter((c) => dto.capabilities.includes(c.id))
	};
};
