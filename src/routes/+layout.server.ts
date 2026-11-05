import type { LayoutServerLoad } from './$types';
import { getPocketBaseUrl } from '$lib/server/pocketbase';
import { listMyMemberships, resolveActiveOrgId, toUserDTO } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const url = getPocketBaseUrl();

	let user = null;
	let memberships = null;
	let activeOrgId = null;
	if (locals.pb && locals.user) {
		user = toUserDTO(locals.user);
		memberships = await listMyMemberships(locals.pb, locals.user.id);
		activeOrgId = resolveActiveOrgId(cookies, memberships);
	}

	return {
		pocketbase: {
			/** Whether a PocketBase instance URL is configured on the server. */
			configured: url !== null,
			/** The configured URL, surfaced deliberately for setup help. */
			url
		},
		/** The signed-in user, or null when signed out. */
		user,
		/** The user's organization memberships (empty array when signed in with none). */
		memberships,
		/** The active organization id, validated against memberships. */
		activeOrgId
	};
};
