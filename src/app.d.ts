// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

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
			/**
			 * The authenticated PocketBase user record for this request after
			 * server-side session validation (auth refresh) in
			 * `src/hooks.server.ts`, or `null` when signed out.
			 */
			user: RecordModel | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
