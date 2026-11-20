export interface PayoutEvent {
	event: string;
	eventName: string;
	purseCents: number | null;
	playoffWinner?: string | null;
	playoffOrder?: string[] | null;
	leagueId?: string;
	leagueName?: string;
	topWeight?: number;
	lowerWeight?: number;
	perTournament?: boolean;
	eventCurve?: { top: number; lower: number };
	teams: { entry: string; total: number }[];
	athletes: { athlete: string; entry: string; holesPlayed?: number | null; eventHoles?: number | null }[];
}

export const minimumPerProCents = 800_000;

/** Work in pairs of cents so two pros always receive precisely equal amounts. */
export function placeShares(
	purseCents: number,
	teamCount: number,
	topWeight: number,
	lowerWeight = 0
) {
	if (
		!Number.isSafeInteger(purseCents) ||
		teamCount < 1 ||
		purseCents < minimumPerProCents * 2 * teamCount
	)
		return null;
	const pool = BigInt(purseCents) / 2n - BigInt(minimumPerProCents) * BigInt(teamCount);
	const baseWeights = Array.from({ length: teamCount }, (_, i) => {
		const placeWeight = teamCount - i - 1;
		// A zero slider setting gives the agreed linear curve. Higher settings blend toward quadratic.
		return BigInt(placeWeight * (100 - topWeight) + placeWeight * placeWeight * topWeight);
	});
	const weights = liftLowerPlaces(baseWeights, lowerWeight);
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

export function tournamentAwards(event: PayoutEvent, topWeight: number, lowerWeight = 0) {
	const teams = [...event.teams].sort((a, b) => a.total - b.total);
	const shares =
		event.purseCents === null ? null : placeShares(event.purseCents, teams.length, topWeight, lowerWeight);
	const lineups = new Map<string, PayoutEvent['athletes']>();
	for (const athlete of event.athletes) {
		const lineup = lineups.get(athlete.entry) ?? [];
		lineup.push(athlete);
		lineups.set(athlete.entry, lineup);
	}
	if (!shares || teams.some((team) => {
		const lineup = lineups.get(team.entry) ?? [];
		if (new Set(lineup.map((row) => row.athlete)).size !== lineup.length) return true;
		if (lineup.every((row) => row.eventHoles == null && row.holesPlayed == null)) return lineup.length !== 2;
		const holes = lineup[0]?.eventHoles ?? 0;
		return !Number.isSafeInteger(holes) || holes < 1 ||
			lineup.some((row) => row.eventHoles !== holes || !Number.isSafeInteger(row.holesPlayed) ||
				(row.holesPlayed ?? 0) < 1 || (row.holesPlayed ?? 0) > holes) ||
			lineup.reduce((n, row) => n + (row.holesPlayed ?? 0), 0) !== 2 * holes ||
			(lineup.length !== 2 && !(lineup.length === 3 &&
				lineup.filter((row) => row.holesPlayed === holes).length === 1));
	})) return null;
	const awards: { entry: string; athletes: string[]; perPro: number; pending: boolean; athleteCents: Record<string, number> }[] = [];
	function addAward(entry: string, perPro: number, pending: boolean) {
		const lineup = lineups.get(entry) ?? [];
		const athleteCents: Record<string, number> = {};
		let splitAllocated = 0;
		const split = lineup.filter((row) => row.eventHoles != null && row.holesPlayed !== row.eventHoles);
		for (const row of lineup) {
			if (row.eventHoles == null || row.holesPlayed === row.eventHoles) athleteCents[row.athlete] = perPro;
			else {
				const cents = splitAllocated === 0 && row === split[0]
					? Number((BigInt(perPro) * BigInt(row.holesPlayed!) + BigInt(row.eventHoles!) / 2n) / BigInt(row.eventHoles!))
					: perPro - splitAllocated;
				athleteCents[row.athlete] = cents;
				splitAllocated += cents;
			}
		}
		awards.push({ entry, athletes: lineup.map((row) => row.athlete), perPro, pending, athleteCents });
	}
	let unallocated = event.purseCents! % 2;
	let held = 0;
	for (let start = 0; start < teams.length;) {
		let end = start + 1;
		while (end < teams.length && teams[end].total === teams[start].total) end++;
		const pot = shares.slice(start, end).reduce((sum, cents) => sum + cents, 0);
		const tied = teams.slice(start, end);
		const playoff = start <= 1 && tied.length > 1;
		const entries = tied.map((team) => team.entry);
		const legacyWinner = event.playoffWinner;
		const order = event.playoffOrder ?? (entries.length === 2 && legacyWinner && entries.includes(legacyWinner)
			? [legacyWinner, ...entries.filter((entry) => entry !== legacyWinner)]
			: []);
		if (playoff && order.length === tied.length && new Set(order).size === tied.length &&
			order.every((entry) => entries.includes(entry))) {
			for (const [offset, entry] of order.entries()) {
				addAward(entry, shares[start + offset], false);
			}
			start = end;
			continue;
		}
		const pending = playoff;
		const perPro = pending ? 0 : Math.floor(pot / (end - start));
		if (pending) held += pot * 2;
		else unallocated += (pot - perPro * (end - start)) * 2;
		for (const team of teams.slice(start, end)) {
			addAward(team.entry, perPro, pending);
		}
		start = end;
	}
	return { awards, unallocated, held };
}

/** Places 7 and below (index 6 onward) can be lifted by the lower-places slider. */
export const lowerTierStart = 6;

/**
 * Moves pool weight from places 1-6 to places 7 and below. The lift is added equally to each lower
 * place, and places 1-6 shrink proportionally so the total never changes. At 100 the lift stops where
 * 6th place would equal 7th, so the order of finish is never inverted. Zero leaves the curve unchanged.
 */
function liftLowerPlaces(base: bigint[], lowerWeight: number) {
	const setting = BigInt(Math.max(0, Math.min(100, Math.round(lowerWeight || 0))));
	if (!setting || base.length <= lowerTierStart) return base;
	const top = base.slice(0, lowerTierStart);
	const bottom = base.slice(lowerTierStart);
	const topTotal = top.reduce((sum, weight) => sum + weight, 0n);
	const bottomTotal = bottom.reduce((sum, weight) => sum + weight, 0n);
	const sixth = top[lowerTierStart - 1];
	const step = sixth - bottom[0];
	if (topTotal <= 0n || step <= 0n) return base;
	const scale = (sixth * BigInt(bottom.length) + topTotal) * 100n;
	const bottomScaled = bottom.map((weight) => weight * scale + step * topTotal * setting);
	const bottomScaledTotal = bottomScaled.reduce((sum, weight) => sum + weight, 0n);
	const topScaledTotal = (topTotal + bottomTotal) * scale - bottomScaledTotal;
	return [
		...top.map((weight) => weight * topScaledTotal),
		...bottomScaled.map((weight) => weight * topTotal)
	];
}
