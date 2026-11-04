// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type PocketBase from 'pocketbase';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * Per-request PocketBase client created in `src/hooks.server.ts`,
			 * or `null` when no PocketBase instance is configured.
			 * Never shared between requests.
			 */
			pb: PocketBase | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
