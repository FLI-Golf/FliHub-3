import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { pbErrorMessage, pbErrorStatus } from '$lib/server/auth';

interface AthleteRow {
	athlete: string;
	name: string;
	originalName: string | null;
	division: string;
	teamName: string;
	score: number | null;
	strokes: number | null;
	par: number | null;
	rounds: { number: number; name: string; strokes: number; par: number; score: number }[];
}
interface Standings {
	league: { id: string; name: string };
	event: { id: string; name: string };
	draft: string;
	state: 'published' | 'awaiting_results' | 'roster_incomplete' | 'legacy_snapshot' | 'unavailable';
	message: string;
	version: number | null;
	publishedAt: string;
	correctionPending: boolean;
	rosterLockedAt: string;
	rows: {
		user: string;
		name: string;
		complete: boolean;
		scoredAthletes: number;
		score: number | null;
		rank: number | null;
		athletes: AthleteRow[];
	}[];
}
export const load: PageServerLoad = async ({ locals, params, depends, setHeaders }) => {
	if (!locals.pb || !locals.user) error(503, 'PocketBase is not configured.');
	depends('fantasy:standings');
	setHeaders({ 'cache-control': 'private, no-store' });
	let standings: Standings;
	try {
		standings = await locals.pb.send<Standings>(
			`/api/flihub/fantasy/organizations/${params.id}/leagues/${params.league}/drafts/${params.draft}/standings`,
			{ method: 'GET' }
		);
	} catch (err) {
		error(pbErrorStatus(err), pbErrorMessage(err, 'Standings not found.'));
	}
	return { organizationId: params.id, standings };
};
