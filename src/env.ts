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
	},
	POCKETBASE_ADMIN_EMAIL: {
		description:
			'Superuser email for trusted server-side operations only (e.g. transactional membership changes). Server-only; optional. Never the normal application identity.',
		schema: (value) => {
			if (value === undefined || value.trim() === '') {
				return undefined;
			}
			return value.trim();
		}
	},
	POCKETBASE_ADMIN_PASSWORD: {
		description:
			'Superuser password paired with POCKETBASE_ADMIN_EMAIL. Server-only; optional. Must never ship in the browser bundle.',
		schema: (value) => {
			if (value === undefined || value === '') {
				return undefined;
			}
			return value;
		}
	}
});
