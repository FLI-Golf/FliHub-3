import type { SyntheticEventContext } from './context.ts';

const base: SyntheticEventContext = {
	source: 'synthetic',
	activity: 'disc-golf',
	status: 'draft',
	dateAssigned: true,
	venueAssigned: true,
	participantCount: 24,
	groupCount: 0,
	scoringConfigured: false
};

const fixtures = {
	spring_invitational: {
		...base
	},
	participants_missing: {
		...base,
		participantCount: 0
	},
	groups_prepared: {
		...base,
		groupCount: 6
	},
	preparation_review: {
		...base,
		groupCount: 6,
		scoringConfigured: true
	},
	venue_missing: {
		...base,
		venueAssigned: false
	},
	information_missing: {
		...base,
		participantCount: null
	}
} as const satisfies Record<string, SyntheticEventContext>;

export type SyntheticFixtureId = keyof typeof fixtures;

export function syntheticFixtureIds(): SyntheticFixtureId[] {
	return Object.keys(fixtures) as SyntheticFixtureId[];
}

export function getSyntheticFixture(id: unknown): SyntheticEventContext | null {
	if (typeof id !== 'string' || !Object.hasOwn(fixtures, id)) {
		return null;
	}

	return {
		...fixtures[id as SyntheticFixtureId]
	};
}
