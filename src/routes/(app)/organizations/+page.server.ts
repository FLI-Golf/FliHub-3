import { teeDisplay, type TeeSchedule } from '$lib/tee-times';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	listMyMemberships,
	pbErrorMessage,
	pbErrorStatus,
	setActiveOrgCookie,
	toOrganizationDTO
} from '$lib/server/auth';
import { capabilityDefinitions, templates } from '$lib/capabilities/catalog';

export const load: PageServerLoad = async ({ locals }) => {
	const memberships = locals.pb && locals.user
		? await listMyMemberships(locals.pb, locals.user.id)
		: [];
	const scorekeeperView = memberships.length > 0 &&
		memberships.every((membership) => membership.role === 'scorekeeper');

	const assignments: {
		id: string;
		organizationId: string;
		organizationName: string;
		eventId: string;
		eventName: string;
		groupName: string;
		rounds: { id: string; number: number; name: string; course: string; position: string; teeTime: string }[];
	}[] = [];

	if (scorekeeperView && locals.pb && locals.user) {
		const pb = locals.pb;
		const userId = locals.user.id;

		const byOrganization = await Promise.all(memberships.map(async (membership) => {
			const orgId = membership.organization.id;
			const organization = toOrganizationDTO(
				await pb.collection('organizations').getOne(orgId)
			);
			if (!organization.capabilities.includes('scoring-results')) return [];

			const filter = pb.filter('organization = {:org}', { org: orgId });
			const [groups, events, rounds, courses] = await Promise.all([
				pb.collection('event_groups').getFullList({
					filter: pb.filter(
						'organization = {:org} && scorekeeper = {:user} && status = "active"',
						{ org: orgId, user: userId }
					),
					sort: 'name'
				}),
				pb.collection('events').getFullList({ filter, sort: 'name' }),
				pb.collection('rounds').getFullList({ filter, sort: 'number' }),
				pb.collection('courses').getFullList({ filter })
			]);

			return groups.flatMap((group) => {
				const event = events.find((item) => item.id === group.event);
				if (!event || event.status === 'archived') return [];
				return [{
					id: group.id,
					organizationId: orgId,
					organizationName: organization.name,
					eventId: event.id,
					eventName: String(event.name ?? ''),
					groupName: String(group.name ?? ''),
					rounds: rounds
						.filter((round) => round.event === event.id && round.status === 'active')
						.map((round) => ({
							id: round.id,
							number: Number(round.number),
							name: String(round.name ?? ''),
							course: String(courses.find((course) => course.id === round.course)?.name ?? ''),
							position: String(round.positionLabel ?? ''),
       teeTime: (() => {
        const schedule = round.teeSchedule as TeeSchedule | null;
        const slot = schedule?.slots.find((slot) => slot.group === group.id);
        return slot && schedule ? teeDisplay(slot.startsAt, schedule.timeZone) : 'Tee time awaiting setup';
       })()
						}))
				}];
			});
		}));
		assignments.push(...byOrganization.flat());
	}

	return {
		scorekeeperView,
		assignments,
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
