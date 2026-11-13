import { existsSync, statSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const videos: Record<string, { title: string; description: string; file: string }> = {
	'phase2ab-setup': {
		title: 'League Setup & Draft Prep',
		description:
			'The owner creates a six-person fantasy league, invites five users, approves them after each accepts, and prepares and starts the event draft. Recorded with fictional users on a disposable demo stack.',
		file: 'phase2ab-setup-walkthrough-narrated.mp4'
	},
	'phase2ab-live': {
		title: 'Live Draft & Roster Rules',
		description:
			'Six approved fantasy participants take turns in a four-round snake draft. Round 3 offers only the eligible division after two FPO or two MPO selections; round 4 narrows to the missing division. Every completed roster holds exactly 2 MPO and 2 FPO. Recorded with fictional users on a disposable demo stack.',
		file: 'phase2ab-live-walkthrough-narrated.mp4'
	}
};

export const load: PageServerLoad = ({ params }) => {
	if (!Object.hasOwn(videos, params.walkthrough)) error(404, 'Walkthrough not found.');
	const video = videos[params.walkthrough];
	const file = `static/walkthroughs/${video.file}`;
	return {
		...video,
		captions: `/walkthroughs/${video.file.replace('-narrated.mp4', '.vtt')}`,
		src: existsSync(file) ? `/walkthroughs/${video.file}` : null,
		sizeMb: existsSync(file) ? Math.round((statSync(file).size / 1024 / 1024) * 10) / 10 : null
	};
};

// Generate these pages while static video files are available during the build.
export const prerender = true;
export const entries = () => [{ walkthrough: 'phase2ab-setup' }, { walkthrough: 'phase2ab-live' }];
