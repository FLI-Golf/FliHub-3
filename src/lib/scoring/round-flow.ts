interface RoundOption {
	id: string;
	number: number;
}
interface CardStatus {
	round: string;
	group: string;
	status: string;
}
export function firstUnsubmittedRound(
	rounds: RoundOption[],
	cards: CardStatus[],
	groupId: string
): string | null {
	return (
		[...rounds]
			.sort((a, b) => a.number - b.number)
			.find(
				(round) =>
					!cards.some(
						(card) =>
							card.round === round.id && card.group === groupId && card.status === 'submitted'
					)
			)?.id ?? null
	);
}
/** Entry guidance for this group, not a replacement for backend permissions. */
export function blockingRounds(
	roundId: string,
	groupId: string,
	rounds: RoundOption[],
	cards: CardStatus[]
): number[] {
	const ordered = [...rounds].sort((a, b) => a.number - b.number);
	const index = ordered.findIndex((round) => round.id === roundId);
	// Previously submitted cards stay viewable, including during corrections.
	if (
		index <= 0 ||
		cards.some(
			(card) => card.round === roundId && card.group === groupId && card.status === 'submitted'
		)
	)
		return [];
	return ordered
		.slice(0, index)
		.filter(
			(round) =>
				!cards.some(
					(card) => card.round === round.id && card.group === groupId && card.status === 'submitted'
				)
		)
		.map((round) => round.number);
}
