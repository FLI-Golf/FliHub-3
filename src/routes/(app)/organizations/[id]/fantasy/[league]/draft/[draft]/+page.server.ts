import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { pbErrorMessage, pbErrorStatus } from '$lib/server/auth';

export interface BoardPayload {
	league: { id: string; name: string; owner: string };
	event: { id: string; name: string };
	draft: {
		id: string;
		status: 'ready' | 'active' | 'complete';
		pickSeconds: number;
		currentPick: number;
		totalPicks: number;
		round: number | null;
		onTheClock: { user: string; name: string } | null;
		deadline: string;
		startedAt: string;
		completedAt: string;
	};
	order: { user: string; name: string }[];
	pool: {
		athlete: string;
		name: string;
		gender: string;
		division: 'MPO' | 'FPO';
		teamName: string;
		pickedBy: string | null;
	}[];
	picks: {
		pickNumber: number;
		round: number;
		manager: string;
		managerName: string;
		athlete: string;
		athleteName: string;
		teamName: string;
		auto: boolean;
		substituteAthlete: string | null;
	}[];
	rosters: {
		user: string;
		name: string;
		athletes: {
			pickNumber: number;
			round: number;
			auto: boolean;
			athlete: string;
			name: string;
			gender: string;
			teamName: string;
			substituteAthlete: string | null;
			substituteName: string | null;
		}[];
		maleCount: number;
		femaleCount: number;
	}[];
	pendingSubstitutions: {
		pick: string;
		pickNumber: number;
		managerName: string;
		athleteOutName: string;
		athleteInName: string;
	}[];
	myTurn: boolean;
	me: string;
	serverNow: string;
}

/**
 * Phase 2B — the live draft room. The board (order, current turn, deadline,
 * pool, picks, rosters) is server-owned and comes from the trusted endpoint,
 * so every manager sees the same state and reconnecting is just reloading.
 * The client polls while the draft is active; expired deadlines are
 * processed by the `tick` action (one overdue auto-pick per tick).
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('fantasy:board');
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) error(503, 'PocketBase is not configured.');
	let boardPayload: BoardPayload;
	try {
		boardPayload = await pb.send(`/api/flihub/fantasy/drafts/${params.draft}/board`, {
			method: 'GET'
		});
	} catch (err) {
		error(pbErrorStatus(err), pbErrorMessage(err, 'Draft not found.'));
	}
	return { organizationId: params.id, leagueId: params.league, board: boardPayload };
};

export const actions: Actions = {
	start: async ({ locals, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		try {
			await locals.pb.send(`/api/flihub/fantasy/drafts/${params.draft}/start`, {
				method: 'POST',
				body: {}
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { started: true };
	},

	pick: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const athlete = String((await request.formData()).get('athlete') ?? '');
		try {
			await locals.pb.send(`/api/flihub/fantasy/drafts/${params.draft}/pick`, {
				method: 'POST',
				body: { athlete }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { picked: true };
	},

	tick: async ({ locals, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		try {
			await locals.pb.send(`/api/flihub/fantasy/drafts/${params.draft}/tick`, {
				method: 'POST',
				body: {}
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { ticked: true };
	},

	applySubstitution: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const pick = String((await request.formData()).get('pick') ?? '');
		try {
			await locals.pb.send(`/api/flihub/fantasy/picks/${pick}/apply-substitution`, {
				method: 'POST',
				body: {}
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { substituted: true };
	}
};
