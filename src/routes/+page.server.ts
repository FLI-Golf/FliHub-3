import { existsSync } from 'node:fs';
import type { PageServerLoad } from './$types';

/**
 * The Phase 1A walkthrough card links to the video only when a reviewed
 * playback asset exists on disk (see recordings/README.md). Otherwise the
 * card shows "Walkthrough coming soon" — never a broken link.
 */
export const load: PageServerLoad = () => {
	return {
		walkthroughVideoAvailable:
			existsSync('static/walkthroughs/phase1a-walkthrough-narrated.mp4') ||
			existsSync('static/walkthroughs/phase1a-walkthrough.webm')
	};
};
