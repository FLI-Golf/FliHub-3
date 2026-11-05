import { existsSync } from 'node:fs';
import type { PageServerLoad } from './$types';

/**
 * Maps walkthrough routes to their reviewed playback assets (see
 * recordings/README.md). A card links to its walkthrough only when the asset
 * exists on disk; otherwise it shows "Walkthrough coming soon" — never a
 * broken link.
 */
const WALKTHROUGH_ASSETS: Record<string, string[]> = {
	'/walkthroughs/phase1a': [
		'static/walkthroughs/phase1a-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1a-walkthrough.webm'
	]
	// Phase 1B has no reviewed recording yet — intentionally absent.
};

export const load: PageServerLoad = () => {
	const available: Record<string, boolean> = {};
	for (const [route, assets] of Object.entries(WALKTHROUGH_ASSETS)) {
		available[route] = assets.some((asset) => existsSync(asset));
	}
	return { walkthroughAvailable: available };
};
