import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPocketBaseUrl } from '$lib/server/pocketbase';
import type { PublicPagePayload } from '$lib/public-page';

/**
 * Phase 1I hosted public page. Entirely unauthenticated: the payload comes
 * from the shared publication-rule layer endpoint, which returns only
 * explicitly published, whitelisted data. Unknown and unpublished slugs are
 * the same 404 (hidden, no coming-soon placeholder — Dustin 2026-11-07).
 */
export const load: PageServerLoad = async ({ params, fetch }) => {
	const base = getPocketBaseUrl();
	if (!base) {
		error(503, 'PocketBase is not configured.');
	}
	const response = await fetch(
		`${base}/api/flihub/public/${encodeURIComponent(params.slug)}`
	).catch(() => null);
	if (!response || response.status === 404) {
		error(404, 'Page not found.');
	}
	if (!response.ok) {
		error(502, 'The public page is temporarily unavailable.');
	}
	const page = (await response.json()) as PublicPagePayload;
	return { page };
};
