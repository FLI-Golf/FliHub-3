import { error } from '@sveltejs/kit';
import { capabilityDefinitions } from '$lib/capabilities/catalog';
import { toOrganizationDTO } from '$lib/server/auth';
import { loadOrganizationNavigationCounts } from '$lib/server/organization-navigation-counts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { pb, user }, params, parent }) => {
	await parent();
	if (!pb || !user) error(503, 'PocketBase is not configured.');
	if (!/^[a-z0-9]{15}$/.test(params.id)) error(404, 'Organization not found.');

	const { items } = await pb.collection('memberships').getList(1, 1, {
		filter: pb.filter('organization = {:organization} && user = {:user}', {
			organization: params.id,
			user: user.id
		}),
		expand: 'organization'
	});
	const membership = items[0];
	const organization = membership?.expand?.organization;
	if (!organization) return { organizationNav: null };

	const dto = toOrganizationDTO(organization);
	const enabledCapabilities = capabilityDefinitions.filter((item) =>
		dto.capabilities.includes(item.id)
	);
	const counts = await loadOrganizationNavigationCounts(pb, {
		organizationId: dto.id,
		userId: user.id,
		isMember: true,
		enabled: enabledCapabilities
			.filter((item) => item.availability === 'available')
			.map((item) => item.id)
	});

	return {
		organizationNav: {
			orgId: dto.id,
			profile: dto.profile,
			name: dto.name,
			canManage: membership.role === 'owner' || membership.role === 'admin',
			enabledCapabilities,
			counts
		}
	};
};
