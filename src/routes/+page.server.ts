// Vite discovers these files during the build, including on Netlify.
const walkthroughFiles = import.meta.glob('/static/walkthroughs/*', {
	query: '?url',
	import: 'default'
});
import type { PageServerLoad } from './$types';

/**
 * Maps walkthrough routes to their reviewed playback assets (see
 * recordings/README.md). A card links to its walkthrough only when the asset
 * is present at build time; otherwise it shows "Walkthrough coming soon" — never a
 * broken link.
 */
const WALKTHROUGH_ASSETS: Record<string, string[]> = {
	'/walkthroughs/phase2ab-setup': ['static/walkthroughs/phase2ab-setup-walkthrough-narrated.mp4'],
	'/walkthroughs/phase2ab-live': ['static/walkthroughs/phase2ab-live-walkthrough-narrated.mp4'],
	'/walkthroughs/phase1a': [
		'static/walkthroughs/phase1a-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1a-walkthrough.webm'
	],
	'/walkthroughs/phase1b': [
		'static/walkthroughs/phase1b-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1b-walkthrough.webm'
	],
	'/walkthroughs/phase1c': [
		'static/walkthroughs/phase1c-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1c-walkthrough.webm'
	],
	'/walkthroughs/phase1d': [
		'static/walkthroughs/phase1d-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1d-walkthrough.webm'
	],
	'/walkthroughs/phase1e': [
		'static/walkthroughs/phase1e-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1e-walkthrough.webm'
	],
	'/walkthroughs/phase1f': [
		'static/walkthroughs/phase1f-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1f-walkthrough.webm'
	],
	'/walkthroughs/phase1g': [
		'static/walkthroughs/phase1g-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1g-walkthrough.webm'
	],
	'/walkthroughs/phase1h': [
		'static/walkthroughs/phase1h-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1h-walkthrough.webm'
	],
	'/walkthroughs/phase1i': [
		'static/walkthroughs/phase1i-walkthrough-narrated.mp4',
		'static/walkthroughs/phase1i-walkthrough.webm'
	]
};

export const load: PageServerLoad = () => {
	const available: Record<string, boolean> = {};
	for (const [route, assets] of Object.entries(WALKTHROUGH_ASSETS)) {
		available[route] = assets.some((asset) => Object.hasOwn(walkthroughFiles, `/${asset}`));
	}
	return { walkthroughAvailable: available };
};
