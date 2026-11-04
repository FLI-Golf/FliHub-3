import type { LayoutServerLoad } from './$types';
import { getPocketBaseUrl } from '$lib/server/pocketbase';

export const load: LayoutServerLoad = () => {
	const url = getPocketBaseUrl();
	return {
		pocketbase: {
			/** Whether a PocketBase instance URL is configured on the server. */
			configured: url !== null,
			/** The configured URL, surfaced deliberately for setup help. */
			url
		}
	};
};
