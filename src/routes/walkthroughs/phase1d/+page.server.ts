export const prerender = true;

import { existsSync, statSync } from 'node:fs';
import type { PageServerLoad } from './$types';

const SILENT = 'static/walkthroughs/phase1d-walkthrough.webm';
const NARRATED = 'static/walkthroughs/phase1d-walkthrough-narrated.mp4';
const CAPTIONS = 'static/walkthroughs/phase1d-walkthrough.vtt';

function sizeMb(file: string): number {
	return Math.round((statSync(file).size / (1024 * 1024)) * 10) / 10;
}

/**
 * Serves the reviewed Phase 1D walkthrough metadata when playback assets
 * exist. Raw Playwright output lives in git-ignored recordings/output/; the
 * reviewed assets are copied to static/walkthroughs/ (see
 * recordings/README.md). The narrated cut is primary; the approved silent
 * original stays downloadable.
 */
export const load: PageServerLoad = () => {
	const narrated = existsSync(NARRATED);
	const silent = existsSync(SILENT);
	return {
		narrated: narrated
			? {
					src: '/walkthroughs/phase1d-walkthrough-narrated.mp4',
					captionsSrc: existsSync(CAPTIONS) ? '/walkthroughs/phase1d-walkthrough.vtt' : null,
					sizeMb: sizeMb(NARRATED)
				}
			: null,
		silent: silent
			? {
					src: '/walkthroughs/phase1d-walkthrough.webm',
					sizeMb: sizeMb(SILENT)
				}
			: null
	};
};
