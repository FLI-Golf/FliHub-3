import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { invitationNotice } from '$lib/server/invitation-notifications';

export const GET: RequestHandler = async ({ locals }) => {
	const headers = { 'Cache-Control': 'private, no-store' };
	if (!locals.user || !locals.pb) return json({ state: 'none' }, { status: 401, headers });
	const state = await invitationNotice(locals.pb, Boolean(locals.user.verified));
	return json({ state }, { status: state === 'unavailable' ? 503 : 200, headers });
};
