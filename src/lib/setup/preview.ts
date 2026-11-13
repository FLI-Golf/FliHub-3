/** Presentation-only suggestions. This catalog never grants capabilities or writes records. */
export interface Choice {
	id: string;
	label: string;
	description: string;
}
export interface Activity extends Choice {
	formats: string[];
	competitors: string[];
	results: string[];
	features: string[];
}
export interface Selection {
	activity: string;
	format: string;
	competitors: string;
	result: string;
}
export const formats: Choice[] = [
	{ id: 'league', label: 'League season', description: 'Scheduled competition over a season.' },
	{
		id: 'tournament',
		label: 'Tournament',
		description: 'A defined competition with rounds or stages; brackets need their own rules.'
	},
	{
		id: 'series',
		label: 'Series',
		description: 'Several related events with an agreed overall ranking policy.'
	},
	{
		id: 'single',
		label: 'Single event',
		description: 'One event without requiring a league or season.'
	},
	{
		id: 'show',
		label: 'Judged show',
		description: 'Classes or categories evaluated through judging.'
	}
];
export const competitors: Choice[] = [
	{
		id: 'individual',
		label: 'Individuals',
		description: 'People compete individually; an account is not required for each competitor.'
	},
	{
		id: 'team',
		label: 'Teams',
		description: 'Groups of people with roster and eligibility rules.'
	},
	{
		id: 'pair',
		label: 'Pairs',
		description: 'Two people competing together; pair-specific rules need review.'
	},
	{ id: 'relay', label: 'Relay teams', description: 'A team whose members complete defined legs.' },
	{
		id: 'contestant',
		label: 'Contestants',
		description: 'People assessed across agreed categories or rounds.'
	},
	{
		id: 'animal',
		label: 'Animals',
		description: 'Animals linked to owners or handlers; dedicated records are planned.'
	},
	{
		id: 'vehicle',
		label: 'Vehicles',
		description: 'Vehicles linked to owners or exhibitors; dedicated records are planned.'
	},
	{
		id: 'exhibit',
		label: 'Exhibits',
		description: 'Items or submissions linked to exhibitors; dedicated records are planned.'
	}
];
export const results: Choice[] = [
	{
		id: 'strokes',
		label: 'Strokes',
		description: 'Scores for holes and rounds; lower complete totals lead.'
	},
	{
		id: 'time',
		label: 'Elapsed time',
		description: 'Valid finish times with penalties and exceptional outcomes defined separately.'
	},
	{
		id: 'pins',
		label: 'Pin totals',
		description: 'Pins across games or series; handicap and aggregation rules need review.'
	},
	{
		id: 'points',
		label: 'Points',
		description: 'Totals using the activity’s agreed scoring and ranking rules.'
	},
	{
		id: 'matches',
		label: 'Match results',
		description: 'Games or matches with activity-specific win, tie, and progression rules.'
	},
	{
		id: 'measurement',
		label: 'Measurements',
		description: 'Measured distance, height, or another explicitly defined quantity.'
	},
	{
		id: 'judging',
		label: 'Judged criteria',
		description: 'Defined criteria, judges, weights, and tie handling.'
	},
	{
		id: 'voting',
		label: 'Voting',
		description: 'Eligible voters, counting rules, and an audited outcome.'
	},
	{
		id: 'awards',
		label: 'Placements or awards',
		description: 'Recorded category placements or awards, without assuming a numeric score.'
	}
];
const sportFormats = ['league', 'tournament', 'series', 'single'];
export const activities: Activity[] = [
	{
		id: 'disc-golf',
		label: 'Disc golf',
		description: 'Courses, holes, and stroke play.',
		formats: sportFormats,
		competitors: ['individual', 'team', 'pair'],
		results: ['strokes'],
		features: [
			'Courses, holes, and basket positions',
			'Rounds and scorekeeper assignments',
			'Stroke scorecards and official publication'
		]
	},
	{
		id: 'golf',
		label: 'Golf',
		description:
			'Explore course and stroke-based competition; specific formats still need validation.',
		formats: sportFormats,
		competitors: ['individual', 'team', 'pair'],
		results: ['strokes'],
		features: [
			'Course and hole configuration',
			'Rounds and stroke totals',
			'Review format-specific rules before use'
		]
	},
	{
		id: 'baseball',
		label: 'Baseball',
		description: 'Team games, seasons, and tournaments.',
		formats: sportFormats,
		competitors: ['team'],
		results: ['matches'],
		features: [
			'Team rosters and game schedule',
			'Game scores and win/loss records',
			'Standings and tie policies — planned'
		]
	},
	{
		id: 'basketball',
		label: 'Basketball',
		description: 'Team games and competition records.',
		formats: sportFormats,
		competitors: ['team'],
		results: ['matches'],
		features: [
			'Teams, rosters, and scheduled games',
			'Game scores and competition records',
			'Ranking and progression — planned'
		]
	},
	{
		id: 'bowling',
		label: 'Bowling',
		description: 'Individual or team games and series.',
		formats: sportFormats,
		competitors: ['individual', 'team', 'pair'],
		results: ['pins'],
		features: [
			'Participants, optional teams, and lanes',
			'Games and pin totals',
			'Series and handicap rules — planned'
		]
	},
	{
		id: 'running',
		label: 'Running / race',
		description: 'Distances, runners, and finish times.',
		formats: ['single', 'series', 'league'],
		competitors: ['individual', 'relay'],
		results: ['time'],
		features: [
			'Race distances, route, and start waves',
			'Participant or relay entries',
			'Timing, penalties, and race results — planned'
		]
	},
	{
		id: 'pickleball',
		label: 'Pickleball',
		description: 'Singles or doubles games and matches.',
		formats: sportFormats,
		competitors: ['individual', 'pair'],
		results: ['matches'],
		features: [
			'Singles or pairs',
			'Courts, games, and matches',
			'Match rules and progression — planned'
		]
	},
	{
		id: 'darts',
		label: 'Darts',
		description: 'Individual, pairs, or team competition.',
		formats: sportFormats,
		competitors: ['individual', 'pair', 'team'],
		results: ['matches', 'points'],
		features: [
			'Players and optional teams',
			'Agreed legs, sets, or points rules',
			'Match results and ranking — planned'
		]
	},
	{
		id: 'billiards',
		label: 'Billiards',
		description: 'Individual, pairs, or team play under a selected discipline.',
		formats: sportFormats,
		competitors: ['individual', 'pair', 'team'],
		results: ['matches', 'points'],
		features: [
			'Players, tables, and discipline',
			'Agreed racks, frames, or points rules',
			'Results and progression — planned'
		]
	},
	{
		id: 'archery',
		label: 'Archery',
		description: 'Points-based rounds for individuals or teams.',
		formats: sportFormats,
		competitors: ['individual', 'team'],
		results: ['points'],
		features: [
			'Divisions and participant entries',
			'Ends, rounds, and point totals',
			'Scoring and tie rules — planned'
		]
	},
	{
		id: 'dog-show',
		label: 'Dog show',
		description: 'Animals, handlers, classes, and awards.',
		formats: ['show', 'single', 'series'],
		competitors: ['animal'],
		results: ['judging', 'awards'],
		features: [
			'Dogs linked to owners or handlers',
			'Classes and judging sessions',
			'Placements and awards — planned'
		]
	},
	{
		id: 'car-show',
		label: 'Car show',
		description: 'Vehicles, exhibitors, categories, and awards.',
		formats: ['show', 'single', 'series'],
		competitors: ['vehicle'],
		results: ['judging', 'voting', 'awards'],
		features: [
			'Vehicles linked to exhibitors',
			'Display categories',
			'Judging, voting, and awards — planned'
		]
	},
	{
		id: 'pageant',
		label: 'Beauty pageant',
		description: 'Contestants and judged categories.',
		formats: ['show', 'single', 'series'],
		competitors: ['contestant'],
		results: ['judging', 'awards'],
		features: [
			'Contestant entries',
			'Categories, criteria, and judging rounds',
			'Reviewed placements and awards — planned'
		]
	},
	{
		id: 'other',
		label: 'Other activity',
		description: 'Explore a general configuration; detailed rules remain to be designed.',
		formats: formats.map((item) => item.id),
		competitors: competitors.map((item) => item.id),
		results: results.map((item) => item.id),
		features: [
			'Describe competing identities',
			'Define event structure and required inputs',
			'Review ranking, permissions, and publication rules'
		]
	}
];
export const blankSelection: Selection = { activity: '', format: '', competitors: '', result: '' };
export function choicesFor(
	selection: Selection,
	field: 'format' | 'competitors' | 'result'
): Choice[] {
	const activity = activities.find((item) => item.id === selection.activity);
	if (!activity) return [];
	if (field === 'format') return formats.filter((item) => activity.formats.includes(item.id));
	if (!activity.formats.includes(selection.format)) return [];
	if (field === 'competitors')
		return competitors.filter((item) => activity.competitors.includes(item.id));
	if (!activity.competitors.includes(selection.competitors)) return [];
	return results.filter((item) => activity.results.includes(item.id));
}
/** Remove incompatible downstream answers; keep compatible answers on Back/Next. */
export function reconcile(selection: Selection): Selection {
	const next = { ...selection };
	if (!activities.some((item) => item.id === next.activity)) return { ...blankSelection };
	for (const field of ['format', 'competitors', 'result'] as const) {
		if (!choicesFor(next, field).some((item) => item.id === next[field])) next[field] = '';
	}
	return next;
}
