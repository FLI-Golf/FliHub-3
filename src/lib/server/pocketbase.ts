import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$app/env/private';

/**
 * Name of the hardened httpOnly session cookie that will carry the
 * PocketBase auth token between the browser and the FliHub server.
 *
 * Authentication itself is not implemented yet — see docs/DECISIONS.md
 * for the intended session-cookie and server-side validation approach.
 */
export const AUTH_COOKIE_NAME = 'pb_auth';

/**
 * Returns the configured PocketBase base URL, or `null` when no instance
 * is configured yet.
 *
 * The value comes from a server-only environment variable (declared in
 * `src/env.ts`) so instance details never ship inside the browser bundle.
 */
export function getPocketBaseUrl(): string | null {
	return POCKETBASE_URL ?? null;
}

/**
 * Creates a fresh PocketBase client.
 *
 * Call this once per incoming request (see `src/hooks.server.ts`) and
 * never from module scope: an authenticated PocketBase client is mutable
 * request state and must never be shared between users.
 *
 * Returns `null` when `POCKETBASE_URL` is not configured so the
 * application starts and renders setup instructions without a running
 * PocketBase instance.
 */
export function createPocketBaseClient(): PocketBase | null {
	const url = getPocketBaseUrl();
	if (!url) {
		return null;
	}
	return new PocketBase(url);
}
