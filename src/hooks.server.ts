import { dev } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { AUTH_COOKIE_NAME, createPocketBaseClient } from '$lib/server/pocketbase';

/**
 * Foundation request pipeline.
 *
 * Creates a dedicated PocketBase client for every incoming request and
 * stores it on `event.locals`. The client is never shared between
 * requests, so an authenticated session can never leak across users.
 *
 * When no PocketBase URL is configured, `locals.pb` is `null` and the
 * application renders setup instructions instead of failing.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const pb = createPocketBaseClient();
	event.locals.pb = pb;

	if (pb) {
		// Hydrate this request's auth store from the session cookie.
		// NOTE: server-side session validation (auth refresh against the
		// PocketBase instance) is intentionally deferred to the
		// authentication milestone. See docs/DECISIONS.md.
		pb.authStore.loadFromCookie(event.request.headers.get('cookie') ?? '', AUTH_COOKIE_NAME);
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
