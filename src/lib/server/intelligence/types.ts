import type { DirectorCandidate, DirectorId, DirectorState } from './director.ts';
import type { Choice, DecisionId, DecisionState } from './decisions.ts';

export type Request =
	| { id: DecisionId; state: DecisionState }
	| { id: DirectorId; state: DirectorState; candidates: readonly DirectorCandidate[] };
export type Usage = { inputTokens: number; outputTokens: number };
export type Failure =
	| 'invalid_input'
	| 'invalid_output'
	| 'timeout'
	| 'rate'
	| 'concurrency'
	| 'budget'
	| 'authentication'
	| 'billing'
	| 'provider';

export type Outcome =
	| { status: 'suggested'; choice: Choice | DirectorCandidate; confidence: number | null }
	| {
			status: 'abstained';
			abstention?: 'explicit' | 'confidence_missing' | 'confidence_below_threshold';
			confidence?: number;
	  }
	| { status: 'disabled' }
	| { status: 'unavailable'; reason: Failure };

export interface Provider {
	readonly name: 'disabled' | 'mock' | 'jev';
	decide(request: Request, signal: AbortSignal): Promise<unknown>;
}

export type Audit = {
	requestId: string;
	decision?: Request['id'];
	provider: Provider['name'];
	model?: 'jev-1.14.0';
	status: Outcome['status'];
	reason?: Failure;
	durationMs: number;
	usage?: Usage;
	estimatedCostNanodollars?: number;
};
