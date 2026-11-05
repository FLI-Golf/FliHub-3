import { dev } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { ClientResponseError } from 'pocketbase';
import { AUTH_COOKIE_NAME, createPocketBaseClient } from '$lib/server/pocketbase';

/**
 * Phase 1A request pipeline.
 *
 * Creates a dedicated PocketBase client for every incoming request and
 * stores it on `event.locals`. The client is never shared between
 * requests, so an authenticated session can never leak across users.
 *
 * The session cookie is validated against PocketBase on every request
 * (auth refresh) before it is trusted, per docs/DECISIONS.md D4. Invalid
 * or expired sessions are cleared; PocketBase outages never silently
 * downgrade a request to "authenticated".
 *
 * When no PocketBase URL is configured, `locals.pb` is `null` and the
 * application renders setup instructions instead of failing.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const pb = createPocketBaseClient();
	event.locals.pb = pb;
	event.locals.user = null;

	if (pb) {
		// Hydrate this request's auth store from the session cookie.
		pb.authStore.loadFromCookie(event.request.headers.get('cookie') ?? '', AUTH_COOKIE_NAME);

		if (pb.authStore.isValid) {
			try {
				// Server-side session validation: confirm the token and user
				// record are still accepted by PocketBase.
				await pb.collection('users').authRefresh();
			} catch (err) {
				// Rejected/expired tokens (4xx) clear the session. Network or
				// server errors keep the cookie so a PocketBase restart does
				// not sign users out.
				if (
					err instanceof ClientResponseError &&
					err.status >= 400 &&
					err.status < 500 &&
					err.status !== 429
				) {
					pb.authStore.clear();
				}
			}
		}

		event.locals.user = pb.authStore.isValid ? pb.authStore.record : null;
	}

	const response = await resolve(event);

	if (pb) {
		// Persist any auth-store change back to the hardened session cookie.
		response.headers.append(
			'set-cookie',
			pb.authStore.exportToCookie(
				{
					httpOnly: true,
					secure: !dev,
					sameSite: 'Strict',
					path: '/'
				},
				AUTH_COOKIE_NAME
			)
		);
	}

	return response;
};
