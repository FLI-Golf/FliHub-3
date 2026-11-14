export interface ChecklistStep {
	id: string;
	title: string;
	description: string;
	capability: string;
	required: string[];
	collections: { name: string; label: string }[];
	color: string;
}
const definitions: ChecklistStep[] = [
	{
		id: 'structure',
		title: 'Create a league and season',
		description:
			'Create a league and its first season together, or add a season to an existing league.',
		capability: 'leagues-seasons',
		required: ['leagues-seasons'],
		collections: [
			{ name: 'leagues', label: 'Leagues' },
			{ name: 'seasons', label: 'Seasons' }
		],
		color: 'border-blue-200 bg-blue-50 text-blue-950'
	},
	{
		id: 'teams',
		title: 'Add teams',
		description: 'Create or import the teams that will enter your season.',
		capability: 'teams',
		required: ['teams', 'athletes'],
		collections: [{ name: 'teams', label: 'Teams' }],
		color: 'border-violet-200 bg-violet-50 text-violet-950'
	},
	{
		id: 'athletes',
		title: 'Add athletes',
		description:
			'Create or import human athlete identities. Private contact fields retain their existing access restrictions.',
		capability: 'athletes',
		required: ['athletes'],
		collections: [{ name: 'athletes', label: 'Athletes' }],
		color: 'border-cyan-200 bg-cyan-50 text-cyan-950'
	},
	{
		id: 'rosters',
		title: 'Enter teams and build season rosters',
		description:
			'Enter each team in the intended season from Leagues & seasons, then assign its athletes from Teams & rosters.',
		capability: 'teams',
		required: ['teams', 'athletes', 'leagues-seasons'],
		collections: [
			{ name: 'season_entries', label: 'Season team entries' },
			{ name: 'roster_memberships', label: 'Roster memberships' }
		],
		color: 'border-indigo-200 bg-indigo-50 text-indigo-950'
	},
	{
		id: 'courses',
		title: 'Configure courses and holes',
		description:
			'Add course holes, pars, and positions. Finding a course or hole does not establish a complete playable layout.',
		capability: 'venues-courses',
		required: ['venues-courses'],
		collections: [
			{ name: 'courses', label: 'Courses' },
			{ name: 'course_holes', label: 'Holes' }
		],
		color: 'border-emerald-200 bg-emerald-50 text-emerald-950'
	},
	{
		id: 'events',
		title: 'Schedule an event',
		description:
			'Create an event linked to the intended season. Check its date and status in the event tools.',
		capability: 'events',
		required: ['events'],
		collections: [{ name: 'events', label: 'Events' }],
		color: 'border-orange-200 bg-orange-50 text-orange-950'
	},
	{
		id: 'operations',
		title: 'Prepare rounds and scoring groups',
		description:
			'Select courses and positions for rounds, assign teams and athletes to groups, and assign authorized scorekeepers. Review the actual event before scoring.',
		capability: 'events',
		required: ['events', 'teams', 'athletes', 'leagues-seasons', 'venues-courses'],
		collections: [
			{ name: 'rounds', label: 'Rounds' },
			{ name: 'event_groups', label: 'Event groups' },
			{ name: 'group_teams', label: 'Group team assignments' },
			{ name: 'group_athletes', label: 'Group athlete assignments' }
		],
		color: 'border-rose-200 bg-rose-50 text-rose-950'
	}
];
export interface SetupChecklist {
	steps: (ChecklistStep & {
		state: 'disabled' | 'unknown' | 'started' | 'empty';
		counts: { label: string; count: number | null }[];
	})[];
}
interface Reader {
	filter: (expression: string, params: Record<string, string>) => string;
	collection: (name: string) => {
		getList: (
			page: number,
			perPage: number,
			options: { filter: string; fields: string }
		) => Promise<{ totalItems: number }>;
	};
}
/** Recognize trusted creation audit provenance, not a template-name guess. */
export function isGuidedDiscGolf(details: unknown): boolean {
	let value = details;
	try {
		for (let attempt = 0; attempt < 2 && typeof value === 'string'; attempt++)
			value = JSON.parse(value);
	} catch {
		return false;
	}
	if (!value || typeof value !== 'object' || !('guidedSetup' in value)) return false;
	const setup = value.guidedSetup;
	if (!setup || typeof setup !== 'object') return false;
	return (
		'version' in setup &&
		setup.version === 1 &&
		'activity' in setup &&
		setup.activity === 'disc-golf' &&
		'format' in setup &&
		setup.format === 'league' &&
		'competitors' in setup &&
		setup.competitors === 'team' &&
		'result' in setup &&
		setup.result === 'strokes'
	);
}
/** Read-only, organization-scoped presence hints. They never establish readiness. */
export async function loadSetupChecklist(
	pb: Reader,
	context: {
		canManage: boolean;
		organizationId: string;
		capabilities: string[];
		creationDetails: unknown;
	}
): Promise<SetupChecklist | null> {
	if (!context.canManage || !isGuidedDiscGolf(context.creationDetails)) return null;
	const filter = pb.filter('organization = {:org} && status != "archived"', {
		org: context.organizationId
	});
	const steps = await Promise.all(
		definitions.map(async (definition) => {
			const enabled = definition.required.every((capability) =>
				context.capabilities.includes(capability)
			);
			const counts = await Promise.all(
				definition.collections.map(async (collection) => {
					if (!enabled) return { label: collection.label, count: null };
					try {
						const result = await pb
							.collection(collection.name)
							.getList(1, 1, { filter, fields: 'id' });
						const count =
							Number.isSafeInteger(result.totalItems) && result.totalItems >= 0
								? result.totalItems
								: null;
						return { label: collection.label, count };
					} catch {
						return { label: collection.label, count: null };
					}
				})
			);
			const state = !enabled
				? 'disabled'
				: counts.some((item) => item.count === null)
					? 'unknown'
					: counts.every((item) => Number(item.count) > 0)
						? 'started'
						: 'empty';
			return { ...definition, state, counts } as SetupChecklist['steps'][number];
		})
	);
	return { steps };
}
