/**
 * Accepts the event's holes in playing order, including subsequent rounds.
 * A hole key must include the round ID because a course hole can be replayed.
 * startedHoles contains holes with at least one recorded score for the group.
 */
function splitScoringSlot(holes, startedHoles, firstReserveHole, outgoing, reserve) {
	const cutoff = holes.indexOf(firstReserveHole);
	if (cutoff <= 0 || new Set(holes).size !== holes.length)
		throw new Error('Choose a valid handoff hole after play has started.');
	if (!outgoing || !reserve || outgoing === reserve)
		throw new Error('Choose a different athlete as the reserve.');

	const started = new Set(startedHoles);
	if (!started.has(holes[cutoff - 1]) || holes.slice(cutoff).some((hole) => started.has(hole)))
		throw new Error('The reserve must start on the next unstarted hole.');

	return holes.map((hole, index) => ({
		hole,
		athlete: index < cutoff ? outgoing : reserve
	}));
}

function splitSlotAward(awardCents, outgoingHoles, reserveHoles) {
	if (
		!Number.isSafeInteger(awardCents) ||
		awardCents < 0 ||
		!Number.isSafeInteger(outgoingHoles) ||
		outgoingHoles < 1 ||
		!Number.isSafeInteger(reserveHoles) ||
		reserveHoles < 1
	)
		throw new Error('Use a whole-cent award and positive hole counts.');

	const total = outgoingHoles + reserveHoles;
	const weighted = awardCents * outgoingHoles;
	if (!Number.isSafeInteger(total) || !Number.isSafeInteger(weighted + Math.floor(total / 2)))
		throw new Error('The amount or hole count is too large.');

	// Round the outgoing share to the nearest cent. Give the reserve the
	// remainder so the two shares always add back to the exact slot award.
	const outgoingCents = Math.floor((weighted + Math.floor(total / 2)) / total);
	return { outgoingCents, reserveCents: awardCents - outgoingCents };
}

/**
 * Validate a between-hole change from the saved group score matrix. The
 * caller supplies the authoritative lineup and chronologically ordered
 * round/hole keys. This function does not edit any recorded strokes.
 */
function planInjuryHandoff(holes, lineup, scores, firstReserveHole, outgoing, reserve) {
	const athletes = new Set(lineup);
	if (athletes.size !== lineup.length || !athletes.has(outgoing) || athletes.has(reserve)) {
		throw new Error('Choose a player in the group and a reserve outside the lineup.');
	}

	const saved = new Map(holes.map((hole) => [hole, new Set()]));
	for (const score of scores) {
		const players = saved.get(score.hole);
		if (
			!players ||
			!athletes.has(score.athlete) ||
			players.has(score.athlete) ||
			!Number.isSafeInteger(score.strokes) ||
			score.strokes < 1
		) {
			throw new Error('The saved score matrix contains an unexpected score.');
		}
		players.add(score.athlete);
	}

	const started = holes.filter((hole) => saved.get(hole).size > 0);
	const slot = splitScoringSlot(holes, started, firstReserveHole, outgoing, reserve);
	const cutoff = holes.indexOf(firstReserveHole);
	for (const hole of holes.slice(0, cutoff)) {
		if (saved.get(hole).size !== lineup.length) {
			throw new Error('Complete every score before the handoff hole.');
		}
	}

	return {
		lineups: slot.map(({ hole, athlete }) => ({
			hole,
			athletes: lineup.map((player) => (player === outgoing ? athlete : player))
		})),
		outgoingHoles: cutoff,
		reserveHoles: holes.length - cutoff
	};
}

module.exports = { splitScoringSlot, splitSlotAward, planInjuryHandoff };
