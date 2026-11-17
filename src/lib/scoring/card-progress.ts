export interface ProgressScore {
	round: string;
	group: string;
	athlete: string;
	hole: string;
	strokes: number | null;
}
/** Saved-score completeness only; submission/approval remain separate states. */
export function cardProgress(
	roundId: string,
	groupId: string,
	holes: { id: string }[],
	athletes: { athlete: string }[],
	scores: ProgressScore[]
) {
	const holeIds = new Set(holes.map((hole) => hole.id));
	const athleteIds = new Set(athletes.map((athlete) => athlete.athlete));
	const required = holeIds.size * athleteIds.size;
	const recorded = new Set(
		scores
			.filter(
				(score) =>
					score.round === roundId &&
					score.group === groupId &&
					holeIds.has(score.hole) &&
					athleteIds.has(score.athlete) &&
					typeof score.strokes === 'number' &&
					Number.isInteger(score.strokes) &&
					score.strokes > 0
			)
			.map((score) => `${score.athlete}:${score.hole}`)
	).size;
	return {
		required,
		recorded,
		missing: required - recorded,
		complete: required > 0 && recorded === required
	};
}
