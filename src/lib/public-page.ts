/**
 * Phase 1I — public page payload types.
 *
 * These mirror the shared publication-rule layer
 * (pocketbase/pb_hooks/public_rules.js) exactly: every field here is
 * explicitly public. Never add a field on the client side — extend the rule
 * layer (and its tests) instead.
 */

export interface PublicScheduleEntry {
	event: string;
	name: string;
	status: string;
	startsAt: string;
	seasonName: string | null;
}

export interface PublicTeam {
	name: string;
}

export interface PublicAthlete {
	displayName: string;
	gender: string;
	nationality: string;
}

export interface PublicResultTeamRow {
	teamName: string;
	entry: string;
	total: number;
	par: number | null;
	rank: number;
}

export interface PublicResultAthleteRow {
	athleteName: string;
	teamName: string;
	entry: string;
	athlete: string;
	total: number;
	par: number | null;
	rank: number;
}

export interface PublicEventResult {
	event: string;
	eventName: string;
	startsAt: string;
	season: string | null;
	corrected: boolean;
	correctedAt: string | null;
	publishedAt: string;
	teams: PublicResultTeamRow[];
	athletes: PublicResultAthleteRow[];
}

export interface StandingsRow {
	name: string;
	played: number;
	/** Events counted in this standings view (denominator for "X of Y"). */
	eventsCounted: number;
	total: number;
	par: number | null;
	diff: number | null;
	/**
	 * Shared competition rank among fully-participating rows, or null when the
	 * row is Unranked (no result in every counted event — D17).
	 */
	rank: number | null;
}

export interface StandingsTable {
	scope: 'season' | 'event';
	season?: string;
	seasonName?: string;
	event?: string;
	eventName?: string;
	events: { event: string; eventName: string }[];
	teams: StandingsRow[];
	athletes: StandingsRow[];
}

export type PublicSection = 'schedule' | 'teams' | 'athletes' | 'results' | 'standings';

export interface PublicPagePayload {
	organization: {
		name: string;
		tagline: string;
		logoUrl: string;
		themePrimary: string;
		themeSecondary: string;
		slug: string;
	};
	sections: PublicSection[];
	schedule?: PublicScheduleEntry[];
	teams?: PublicTeam[];
	athletes?: PublicAthlete[];
	results?: PublicEventResult[];
	standings?: StandingsTable[];
}

/**
 * Score presentation relative to par (Dustin 2026-11-07): under par red,
 * exactly par blue, over par default text. Returns a label like −2 / E / +3
 * and the Tailwind text class to render it with.
 */
export function toParDisplay(
	total: number,
	par: number | null
): { label: string; className: string } {
	if (par === null) {
		return { label: '', className: '' };
	}
	const diff = total - par;
	if (diff < 0) return { label: `\u2212${Math.abs(diff)}`, className: 'text-red-600' };
	if (diff === 0) return { label: 'E', className: 'text-blue-600' };
	return { label: `+${diff}`, className: 'text-foreground' };
}
