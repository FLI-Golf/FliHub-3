import type { Selection } from './preview';

/** The first reviewed mapping creates an organization only, not a competition. */
export function creationPlan(selection: Selection) {
	if (
		selection.activity === 'charity-run-walk' &&
		selection.format === 'single' &&
		selection.competitors === 'individual' &&
		selection.result === 'participation'
	) {
		return {
			template: 'race-event',
			profile: 'charity-run-walk',
			capabilities: [],
			raceDistances: [{ key: '5k', label: '5K', distance: 5, unit: 'km' }]
		};
	}

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
