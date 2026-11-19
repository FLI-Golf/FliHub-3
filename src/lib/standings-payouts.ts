export interface PayoutEvent {
	event: string;
	eventName: string;
	purseCents: number | null;
	leagueId?: string;
	leagueName?: string;
	topWeight?: number;
	teams: { entry: string; total: number }[];
	athletes: { athlete: string; entry: string }[];
}

export const minimumPerProCents = 800_000;

/** Work in pairs of cents so two pros always receive precisely equal amounts. */
export function placeShares(purseCents: number, teamCount: number, topWeight: number) {
	if (
		!Number.isSafeInteger(purseCents) ||
		teamCount < 1 ||
		purseCents < minimumPerProCents * 2 * teamCount
	)
		return null;
	const pool = BigInt(purseCents) / 2n - BigInt(minimumPerProCents) * BigInt(teamCount);
	const weights = Array.from({ length: teamCount }, (_, i) => {
		const placeWeight = teamCount - i - 1;
		// A zero slider setting gives the agreed linear curve. Higher settings blend toward quadratic.
		return BigInt(placeWeight * (100 - topWeight) + placeWeight * placeWeight * topWeight);
	});
	const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
	if (!weightTotal) return [Math.floor(purseCents / 2)];
	const shares = weights.map((weight, i) => ({
		i,
		cents: (pool * weight) / weightTotal,
		remainder: (pool * weight) % weightTotal
	}));
	let leftover = pool - shares.reduce((sum, share) => sum + share.cents, 0n);
	for (const share of [...shares].sort((a, b) =>
		a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1
	)) {
		if (!leftover) break;
		share.cents++;
		leftover--;
	}
	return shares.map((share) => minimumPerProCents + Number(share.cents));
}

export function tournamentAwards(event: PayoutEvent, topWeight: number) {
	const teams = [...event.teams].sort((a, b) => a.total - b.total);
	const shares =
		event.purseCents === null ? null : placeShares(event.purseCents, teams.length, topWeight);
	const lineups = new Map<string, Set<string>>();
	for (const athlete of event.athletes) {
		const lineup = lineups.get(athlete.entry) ?? new Set<string>();
		lineup.add(athlete.athlete);
		lineups.set(athlete.entry, lineup);
	}
	if (!shares || teams.some((team) => lineups.get(team.entry)?.size !== 2)) return null;
	const awards: { entry: string; athletes: string[]; perPro: number; pending: boolean }[] = [];
	let unallocated = event.purseCents! % 2;
	let held = 0;
	for (let start = 0; start < teams.length;) {
		let end = start + 1;
		while (end < teams.length && teams[end].total === teams[start].total) end++;
		const pot = shares.slice(start, end).reduce((sum, cents) => sum + cents, 0);
		const pending = start === 0 && end > 1;
		const perPro = pending ? 0 : Math.floor(pot / (end - start));
		if (pending) held += pot * 2;
		else unallocated += (pot - perPro * (end - start)) * 2;
		for (const team of teams.slice(start, end)) {
			awards.push({ entry: team.entry, athletes: [...lineups.get(team.entry)!], perPro, pending });
		}
		start = end;
	}
	return { awards, unallocated, held };
}
