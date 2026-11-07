import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrgRole } from '$lib/server/auth';
import { pbErrorMessage, pbErrorStatus, toOrganizationDTO } from '$lib/server/auth';
import { capabilityDefinitions } from '$lib/capabilities/catalog';
import type { PublicPagePayload } from '$lib/public-page';

const ID_PATTERN = /^[a-z0-9]{15}$/;

/**
 * Phase 1I — public page management and preview.
 *
 * Any member may preview (the preview endpoint re-validates membership);
 * slug, branding, publish state, and per-record publication toggles are
 * Owner/Admin only — enforced by the trusted public-page hook and the
 * collection update rules, not by this UI.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) error(503, 'PocketBase is not configured.');
	if (!ID_PATTERN.test(params.id)) error(404, 'Organization not found.');

	const memberships = await pb.collection('memberships').getFullList({
		filter: `organization = "${params.id}" && user = "${user.id}"`
	});
	const mine = memberships[0];
	if (!mine) error(404, 'Organization not found.');
	const myRole = String(mine.role) as OrgRole;

	const organization = await pb.collection('organizations').getOne(params.id);
	const dto = toOrganizationDTO(organization);

	let preview: { preview: { published: boolean; slug: string }; page: PublicPagePayload };
	try {
		preview = await pb.send(`/api/flihub/organizations/${params.id}/public-preview`, {
			method: 'GET'
		});
	} catch (err) {
		error(pbErrorStatus(err), pbErrorMessage(err));
	}

	const orgFilter = `organization = "${params.id}"`;
	const [eventRows, teamRows, athleteRows, resultRows] = await Promise.all([
		pb.collection('events').getFullList({ filter: orgFilter, sort: 'startsAt,name' }),
		pb.collection('teams').getFullList({ filter: orgFilter, sort: 'name' }),
		pb.collection('athletes').getFullList({ filter: orgFilter, sort: 'lastName,firstName' }),
		pb.collection('event_results').getFullList({ filter: orgFilter })
	]);
	const publishedResultByEvent = new Map(
		resultRows.map((r) => [String(r.event), Number(r.publishedVersion ?? 0)])
	);

	return {
		organizationId: params.id,
		organizationName: String(organization.name ?? ''),
		myRole,
		canManage: myRole === 'owner' || myRole === 'admin',
		enabledCapabilities: capabilityDefinitions.filter((c) => dto.capabilities.includes(c.id)),
		publicPage: {
			slug: String(organization.publicSlug ?? ''),
			published: Boolean(organization.publicPublished),
			tagline: String(organization.tagline ?? ''),
			logoUrl: String(organization.logoUrl ?? ''),
			themePrimary: String(organization.themePrimary ?? ''),
			themeSecondary: String(organization.themeSecondary ?? '')
		},
		preview: preview.page,
		records: {
			events: eventRows
				.filter((ev) => String(ev.status) !== 'archived')
				.map((ev) => ({
					id: String(ev.id),
					name: String(ev.name),
					status: String(ev.status),
					publicPublished: Boolean(ev.publicPublished),
					officialResultPublished: (publishedResultByEvent.get(String(ev.id)) ?? 0) >= 1
				})),
			teams: teamRows
				.filter((t) => String(t.status) === 'active')
				.map((t) => ({
					id: String(t.id),
					name: String(t.name),
					publicPublished: Boolean(t.publicPublished)
				})),
			athletes: athleteRows
				.filter((a) => String(a.status) === 'active')
				.map((a) => ({
					id: String(a.id),
					name:
						String(a.displayName ?? '') ||
						`${String(a.firstName ?? '')} ${String(a.lastName ?? '')}`.trim(),
					publicPublished: Boolean(a.publicPublished)
				}))
		}
	};
};

export const actions: Actions = {
	/** Slug + branding through the validated, audited trusted endpoint. */
	saveSettings: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const body: Record<string, unknown> = {
			tagline: String(form.get('tagline') ?? '').trim(),
			logoUrl: String(form.get('logoUrl') ?? '').trim(),
			themePrimary: String(form.get('themePrimary') ?? '').trim(),
			themeSecondary: String(form.get('themeSecondary') ?? '').trim()
		};
		const slug = String(form.get('slug') ?? '').trim();
		// The slug is reserved once provided; an empty input leaves it unchanged.
		if (slug !== '') body.slug = slug;
		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/public-page`, {
				method: 'POST',
				body
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { saved: true };
	},

	publish: async ({ locals, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/public-page`, {
				method: 'POST',
				body: { published: true }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { published: true };
	},

	unpublish: async ({ locals, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/public-page`, {
				method: 'POST',
				body: { published: false }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { unpublished: true };
	},

	/**
	 * Per-record publication toggles (events/teams/athletes). The collection
	 * update rules restrict these to Owners/Admins; unpublishing never
	 * deletes anything.
	 */
	toggleRecord: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const collection = String(form.get('collection') ?? '');
		const id = String(form.get('id') ?? '');
		const next = String(form.get('next') ?? '') === 'true';
		if (!['events', 'teams', 'athletes'].includes(collection) || !ID_PATTERN.test(id)) {
			return fail(400, { message: 'Invalid publication toggle.' });
		}
		try {
			await locals.pb.collection(collection).update(id, { publicPublished: next });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { toggled: true };
	}
};
