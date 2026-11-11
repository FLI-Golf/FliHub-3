import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listMyMemberships } from '$lib/server/auth';

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
	return { activity, leagues };
};
