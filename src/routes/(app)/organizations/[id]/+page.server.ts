import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrgRole } from '$lib/server/auth';
import {
	pbErrorMessage,
	pbErrorStatus,
	setActiveOrgCookie,
	toOrganizationDTO
} from '$lib/server/auth';
import { capabilityDefinitions } from '$lib/capabilities/catalog';

interface MemberDTO {
	id: string;
	userId: string;
	role: OrgRole;
	name: string;
	email: string | null;
	isYou: boolean;
	created: string;
}

interface InvitationDTO {
	id: string;
	email: string;
	role: string;
	status: string;
	expiresAt: string;
	created: string;
}

interface MembershipEventDTO {
	id: string;
	action: string;
	actorName: string | null;
	subjectName: string | null;
	subjectEmail: string | null;
	details: string | null;
	created: string;
}

/** PocketBase record ids are `[a-z0-9]{15}`; reject anything else before it
 * reaches a filter string. */
const ID_PATTERN = /^[a-z0-9]{15}$/;

export const load: PageServerLoad = async ({ locals, params, cookies }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) {
		error(503, 'PocketBase is not configured.');
	}
	if (!ID_PATTERN.test(params.id)) {
		error(404, 'Organization not found.');
	}

	// Collection rules restrict these lists to organizations the caller
	// belongs to; an empty result therefore means "not a member".
	const membershipRecords = await pb.collection('memberships').getFullList({
		filter: `organization = "${params.id}"`,
		expand: 'user',
		sort: 'created'
	});
	const mine = membershipRecords.find((m) => String(m.user) === user.id);
	if (!mine) {
		error(404, 'Organization not found.');
	}

	// Visiting an organization page makes it the active organization.
	setActiveOrgCookie(cookies, params.id);

	const organization = await pb.collection('organizations').getOne(params.id);
	const myRole = String(mine.role) as OrgRole;
	const canManage = myRole === 'owner' || myRole === 'admin';

	const members: MemberDTO[] = membershipRecords.map((m) => {
		const u = m.expand?.user;
		const email = String(u?.email ?? '');
		return {
			id: m.id,
			userId: String(m.user),
			role: String(m.role) as OrgRole,
			name: String(u?.name ?? '') || 'Unnamed member',
			// PocketBase only exposes other users' emails when emailVisibility
			// is enabled; fall back to the display name.
			email: email || null,
			isYou: String(m.user) === user.id,
			created: String(m.created ?? '')
		};
	});

	let invitations: InvitationDTO[] | null = null;
	let events: MembershipEventDTO[] | null = null;
	if (canManage) {
		const invitationRecords = await pb.collection('invitations').getFullList({
			filter: `organization = "${params.id}"`,
			sort: '-created'
		});
		invitations = invitationRecords.map((i) => ({
			id: i.id,
			email: String(i.email ?? ''),
			role: String(i.role ?? ''),
			status: String(i.status ?? ''),
			expiresAt: String(i.expires_at ?? ''),
			created: String(i.created ?? '')
		}));

		const eventRecords = await pb.collection('membership_events').getFullList({
			filter: `organization = "${params.id}"`,
			expand: 'actor,subject_user',
			sort: '-created'
		});
		events = eventRecords.map((e) => {
			const details = e.details;
			return {
				id: e.id,
				action: String(e.action ?? ''),
				actorName: e.expand?.actor ? String(e.expand.actor.name ?? '') || null : null,
				subjectName: e.expand?.subject_user
					? String(e.expand.subject_user.name ?? '') || null
					: null,
				subjectEmail: String(e.subject_email ?? '') || null,
				details: details ? JSON.stringify(details) : null,
				created: String(e.created ?? '')
			};
		});
	}

	return {
		organization: toOrganizationDTO(organization),
		myRole,
		canManage,
		enabledCapabilities: capabilityDefinitions.filter((c) =>
			toOrganizationDTO(organization).capabilities.includes(c.id)
		),
		members,
		invitations,
		events
	};
};

export const actions: Actions = {
	/**
	 * Invites by email through the trusted hook. Invitations are copy-link:
	 * the single-use link is shown once to the inviter and must be passed to
	 * the recipient out of band. Email delivery is not claimed (see
	 * docs/ROADMAP.md).
	 */
	invite: async ({ locals, request, params, url }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const role = String(form.get('role') ?? '');

		try {
			const result = await locals.pb.send<{ token: string; email: string; role: string }>(
				'/api/flihub/invitations',
				{ method: 'POST', body: { organization: params.id, email, role } }
			);
			return {
				inviteLink: `${url.origin}/invitations/accept?token=${result.token}`,
				inviteEmail: result.email,
				inviteRole: result.role
			};
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	revokeInvitation: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const invitationId = String(form.get('invitation') ?? '');
		try {
			await locals.pb.send(`/api/flihub/invitations/${invitationId}/revoke`, { method: 'POST' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	changeRole: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const membershipId = String(form.get('membership') ?? '');
		const role = String(form.get('role') ?? '');
		try {
			await locals.pb.send(`/api/flihub/memberships/${membershipId}/role`, {
				method: 'POST',
				body: { role }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	removeMember: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const membershipId = String(form.get('membership') ?? '');
		try {
			await locals.pb.send(`/api/flihub/memberships/${membershipId}/remove`, { method: 'POST' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	transfer: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const membershipId = String(form.get('membership') ?? '');
		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/transfer`, {
				method: 'POST',
				body: { membership: membershipId }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	leave: async ({ locals, params }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/leave`, { method: 'POST' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		// After leaving, the caller no longer has access; return to the list.
		redirect(303, '/organizations');
	}
};
