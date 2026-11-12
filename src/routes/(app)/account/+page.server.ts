import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listMyMemberships, pbErrorMessage, pbErrorStatus } from '$lib/server/auth';

interface AvailableSeason {
 id: string; name: string; startsOn: string; endsOn: string;
 sportsLeague: string; sportsLeagueName: string;
 organization: string; organizationName: string; organizationSlug: string;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.pb || !locals.user) error(503, 'PocketBase is not configured.');
	const memberships = await listMyMemberships(locals.pb, locals.user.id);
	const activity = url.searchParams.get('activity');
	if (activity && !['fantasy', 'organization', 'invitation'].includes(activity)) {
		error(400, 'Choose one of the available activities.');
	}
	// Existing staff and scorekeepers retain their current landing experience.
	if (!activity && url.searchParams.get('choose') !== '1' && memberships.length > 0) {
		redirect(303, '/organizations');
	}
	const seats = activity === 'fantasy' ? await locals.pb.collection('fantasy_members').getFullList({
		filter: locals.pb.filter('user = {:user}', { user: locals.user.id }),
		expand: 'league',
		sort: '-created'
	}) : [];
	const leagues = seats.flatMap((seat) => {
		const league = seat.expand?.league;
		if (!league || ['declined', 'removed'].includes(String(seat.status))) return [];
		return [{ id: league.id, organization: String(league.organization), name: String(league.name), status: String(seat.status) }];
	});
	let available: AvailableSeason[] = [];
	if (activity === 'fantasy') {
		try {
			const payload = await locals.pb.send<{ seasons: AvailableSeason[] }>('/api/flihub/fantasy/available-seasons', { method: 'GET' });
			available = payload.seasons;
		} catch (err) { error(pbErrorStatus(err), pbErrorMessage(err)); }
	}
	const organizationSlug = url.searchParams.get('organization') ?? '';
	if (organizationSlug) available = available.filter((season) => season.organizationSlug === organizationSlug);
	const sportsLeague = url.searchParams.get('sportsLeague') ?? '';
	const seasonId = url.searchParams.get('season') ?? '';
	const selectedSeason = available.find((season) => season.id === seasonId && season.sportsLeague === sportsLeague) ?? null;
	const sportsLeagues = [...new Map(available.map((season) => [season.sportsLeague, {
		id: season.sportsLeague, name: season.sportsLeagueName, organizationName: season.organizationName
	}])).values()];
	return { activity, leagues, sportsLeagues, sportsLeague, selectedSeason, organizationSlug,
		availableSeasons: available.filter((season) => season.sportsLeague === sportsLeague) };
};

export const actions: Actions = {
 createFantasy: async ({ locals, request }) => {
  if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.', name: '', participantLimit: 6 });
  const form = await request.formData();
  const seasonId = String(form.get('season') ?? '');
  const name = String(form.get('name') ?? '').trim();
  const participantLimit = Number(form.get('participantLimit') ?? 6);
  try {
   const payload = await locals.pb.send<{ seasons: AvailableSeason[] }>('/api/flihub/fantasy/available-seasons', { method: 'GET' });
   const season = payload.seasons.find((row) => row.id === seasonId);
   if (!season) return fail(400, { message: 'This season is no longer available for new fantasy leagues.', name, participantLimit });
   const created = await locals.pb.send<{ id: string }>('/api/flihub/fantasy/leagues', {
    method: 'POST', body: { organization: season.organization, season: season.id, name, participantLimit }
   });
   redirect(303, `/organizations/${season.organization}/fantasy/${created.id}`);
  } catch (err) {
   if (isRedirect(err)) throw err;
   return fail(pbErrorStatus(err), { message: pbErrorMessage(err), name, participantLimit });
  }
 }

};
