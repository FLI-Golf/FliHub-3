import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Explicit environment variable declarations for FliHub.
 * See https://svelte.dev/docs/kit/environment-variables
 *
 * Values are read from `.env` (git-ignored) or the process environment.
 * `.env.example` documents each variable and contains no secrets.
 */
export const variables = defineEnvVars({
	POCKETBASE_URL: {
		description:
			'Base URL of the PocketBase instance the FliHub server talks to. Server-only; optional — the app starts without it and shows setup instructions.',
		schema: (value) => {
			if (value === undefined || value.trim() === '') {
				return undefined;
			}
			return value.trim().replace(/\/+$/, '');
		}
	}
});
