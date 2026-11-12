import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { pbErrorMessage, pbErrorStatus } from '$lib/server/auth';

export interface LobbyPayload {
	league: {
		id: string;
		name: string;
		owner: string;
		participantLimit: number;
		organization: string;
	};
	me: { user: string; role: string; status: string };
	isOwner: boolean;
	members: { id: string; user: string; name: string; role: string; status: string }[];
	approvedCount: number;
	seatsFilled: boolean;
	drafts: {
		id: string;
		event: string;
		eventName: string;
		status: string;
		pickSeconds: number;
		currentPick: number;
	}[];
	events: { id: string; name: string }[];
}

/**
 * Phases 2A–2B — fantasy league lobby. Access is FANTASY membership (any
 * non-declined seat), resolved by the trusted lobby endpoint; organization
 * staff roles play no part. Writes all go through the flihub_fantasy hook.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) error(503, 'PocketBase is not configured.');
	let lobby: LobbyPayload;
	try {
		lobby = await pb.send(`/api/flihub/fantasy/leagues/${params.league}/lobby`, {
			method: 'GET'
		});
	} catch (err) {
		error(pbErrorStatus(err), pbErrorMessage(err, 'League not found.'));
	}
	return { organizationId: params.id, lobby };
};

export const actions: Actions = {
 seedDemoParticipants: async ({ locals, request, params }) => {
  if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
  const password = String((await request.formData()).get('demoPassword') ?? '');
  try {
   const result = await locals.pb.send<{ count: number; created: { name: string; email: string }[] }>(
    `/api/flihub/demo/fantasy/${params.league}/fill-participants`,
    { method: 'POST', body: { password } }
   );
   return { demoParticipantsAdded: result.count, demoAccounts: result.created };
  } catch (err) {
   return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
  }
 },
	invite: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const email = String((await request.formData()).get('email') ?? '').trim();
		try {
			await locals.pb.send(`/api/flihub/fantasy/leagues/${params.league}/invite`, {
				method: 'POST',
				body: { email }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { invited: true };
	},

	approve: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const membershipId = String((await request.formData()).get('membership') ?? '');
		try {
			await locals.pb.send(`/api/flihub/fantasy/members/${membershipId}/approve`, {
				method: 'POST',
				body: {}
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { approved: true };
	},

	remove: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const membershipId = String((await request.formData()).get('membership') ?? '');
		try {
			await locals.pb.send(`/api/flihub/fantasy/members/${membershipId}/remove`, {
				method: 'POST',
				body: {}
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { removed: true };
	},

	createDraft: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const event = String(form.get('event') ?? '');
		const pickSeconds = Number(form.get('pickSeconds') ?? 30);
		try {
			const created = (await locals.pb.send(`/api/flihub/fantasy/leagues/${params.league}/drafts`, {
				method: 'POST',
				body: { event, pickSeconds }
			})) as { id: string };
			redirect(303, `/organizations/${params.id}/fantasy/${params.league}/draft/${created.id}`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	}
};
