export interface NavigationCount {
	tone?: 'red' | 'blue';
	group?: 'positions';
	label: string;
	shortLabel: string;
	value: number | null;
}
export type OrganizationNavigationCounts = Record<string, NavigationCount[]>;
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
interface Definition {
	params?: Record<string, string>;
	tone?: 'red' | 'blue';
	group?: 'positions';
	collection: string;
	label: string;
	shortLabel: string;
	condition?: string;
	scope?: 'fantasy';
}
const definitions: Record<string, Definition[]> = {
	overview: [{ collection: 'memberships', label: 'Members', shortLabel: '' }],
	athletes: [
		{
			collection: 'athletes',
			label: 'Non-archived athletes',
			shortLabel: '',
			condition: 'status != "archived"'
		}
	],
	teams: [
		{
			collection: 'teams',
			label: 'Non-archived teams',
			shortLabel: 'Teams',
			condition: 'status != "archived"'
		},
		{
			collection: 'roster_memberships',
			label: 'Non-archived season roster spots',
			shortLabel: 'Roster spots',
			condition: 'status != "archived"'
		}
	],
	'leagues-seasons': [
		{
			collection: 'leagues',
			label: 'Non-archived leagues',
			shortLabel: 'Leagues',
			condition: 'status != "archived"'
		},
		{
			collection: 'seasons',
			label: 'Non-archived seasons',
			shortLabel: 'Seasons',
			condition: 'status != "archived"'
		}
	],
	'venues-courses': [
		{
			collection: 'courses',
			label: 'Non-archived courses',
			shortLabel: 'Courses',
			condition: 'status != "archived"'
		},
		{
			collection: 'course_holes',
			label: 'Non-archived physical holes on non-archived courses',
			shortLabel: 'Physical holes',
			condition: 'status != "archived" && course.status != "archived"'
		},
		{
			collection: 'hole_positions',
			label: 'Saved Red positions on non-archived physical holes and courses',
			shortLabel: 'Red',
			condition:
				'status != "archived" && hole.status != "archived" && hole.course.status != "archived" && label = {:position}',
			params: { position: 'Red' },
			tone: 'red',
			group: 'positions'
		},
		{
			collection: 'hole_positions',
			label: 'Saved Blue positions on non-archived physical holes and courses',
			shortLabel: 'Blue',
			condition:
				'status != "archived" && hole.status != "archived" && hole.course.status != "archived" && label = {:position}',
			params: { position: 'Blue' },
			tone: 'blue',
			group: 'positions'
		}
	],
	events: [
		{
			collection: 'events',
			label: 'Non-archived events',
			shortLabel: '',
			condition: 'status != "archived"'
		}
	],
	'scoring-results': [
		{
			collection: 'scorecards',
			label: 'Visible scorecards for non-archived events',
			shortLabel: 'Cards',
			condition: 'event.status != "archived"'
		},
		{
			collection: 'event_results',
			label: 'Visible published official results for non-archived events',
			shortLabel: 'Published',
			condition: 'publishedVersion > 0 && event.status != "archived"'
		}
	],
	standings: [
		{
			collection: 'event_results',
			label: 'Visible published official results for non-archived events',
			shortLabel: 'Results',
			condition: 'publishedVersion > 0 && event.status != "archived"'
		}
	],
	sponsorships: [
		{
			collection: 'sponsors',
			label: 'Active sponsors',
			shortLabel: '',
			condition: 'archived = false'
		}
	],
	fantasy: [
		{
			collection: 'fantasy_members',
			label:
				'My fantasy leagues, including pending invitations and excluding declined or removed seats',
			shortLabel: 'My leagues',
			scope: 'fantasy',
			condition: 'status != "declined" && status != "removed"'
		}
	]
};

/** Call only after the loader has verified membership. The request-scoped SDK
 * client retains all collection rules; this never uses a superuser identity.
 */
export async function loadOrganizationNavigationCounts(
	pb: Reader,
	context: {
		organizationId: string;
		userId: string;
		isMember: boolean;
		enabled: string[];
	}
): Promise<OrganizationNavigationCounts> {
	if (!context.isMember || !/^[a-z0-9]{15}$/.test(context.organizationId) || !context.userId)
		return {};
	const cache = new Map<string, Promise<number | null>>();
	const query = (definition: Definition) => {
		const base =
			definition.scope === 'fantasy'
				? 'league.organization = {:org} && user = {:user}'
				: 'organization = {:org}';
		const expression = definition.condition ? `${base} && (${definition.condition})` : base;
		const params: Record<string, string> = { ...definition.params, org: context.organizationId };
		if (definition.scope === 'fantasy') params.user = context.userId;
		const filter = pb.filter(expression, params);
		const key = `${definition.collection}:${filter}`;
		if (!cache.has(key)) {
			cache.set(
				key,
				(async () => {
					try {
						const result = await pb
							.collection(definition.collection)
							.getList(1, 1, { filter, fields: 'id' });
						return Number.isSafeInteger(result.totalItems) && result.totalItems >= 0
							? result.totalItems
							: null;
					} catch {
						return null;
					}
				})()
			);
		}
		return cache.get(key)!;
	};
	const ids = ['overview', ...new Set(context.enabled.filter((id) => id !== 'overview'))];
	const entries = await Promise.all(
		ids
			.filter((id) => definitions[id])
			.map(async (id) => {
				const counts = await Promise.all(
					definitions[id].map(async (definition) => ({
						label: definition.label,
						shortLabel: definition.shortLabel,
						...(definition.tone ? { tone: definition.tone } : {}),
						...(definition.group ? { group: definition.group } : {}),
						value: await query(definition)
					}))
				);
				return [id, counts] as const;
			})
	);
	return Object.fromEntries(entries);
}
