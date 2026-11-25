const fixtureMetadataWarning =
	'Model metadata for `gpt-5.4` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.';

export function fixtureProposalEvidence(output: string) {
	if (!output.endsWith('\n')) return { failure: 'partial_jsonl' } as const;
	let proposal: unknown;
	let complete = false;
	try {
		for (const line of output.slice(0, -1).split('\n')) {
			const event = JSON.parse(line);
			if (complete) return { failure: 'event_after_completion' } as const;
			switch (event.type) {
				case 'thread.started':
				case 'turn.started':
					break;
				case 'turn.completed':
					if (
						![event.usage?.input_tokens, event.usage?.output_tokens].every(
							(count) => Number.isSafeInteger(count) && count >= 0
						)
					)
						return { failure: 'malformed_usage' } as const;
					complete = true;
					break;
				case 'item.started':
				case 'item.updated':
				case 'item.completed':
					if (event.item?.type === 'reasoning') break;
					if (event.item?.type === 'error') {
						if (event.type === 'item.completed' && event.item.message === fixtureMetadataWarning)
							break;
						return { failure: 'codex_item_error' } as const;
					}
					if (event.item?.type !== 'agent_message') return { failure: 'unexpected_item' } as const;
					if (event.type !== 'item.completed') break;
					if (proposal !== undefined) return { failure: 'duplicate_proposal' } as const;
					if (typeof event.item.text !== 'string') return { failure: 'malformed_jsonl' } as const;
					proposal = JSON.parse(event.item.text);
					break;
				default:
					return { failure: 'unexpected_event' } as const;
			}
		}
	} catch {
		return { failure: 'malformed_jsonl' } as const;
	}
	if (!complete || proposal === undefined) return { failure: 'missing_terminal_evidence' } as const;
	return { proposal };
}
