import type { Selection } from './preview';

/** The first reviewed mapping creates an organization only, not a competition. */
export function creationPlan(selection: Selection) {
	if (
		selection.activity !== 'disc-golf' ||
		selection.format !== 'league' ||
		selection.competitors !== 'team' ||
		selection.result !== 'strokes'
	)
		return null;
	return {
		template: 'league',
		capabilities: [
			'athletes',
			'teams',
			'leagues-seasons',
			'venues-courses',
			'events',
			'scoring-results',
			'standings'
		]
	};
}
export interface CreationFeedback {
	message: string;
	name: string;
	selection: Selection;
}
