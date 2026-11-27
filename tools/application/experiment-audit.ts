import type { Failure, Usage } from '../../src/lib/server/intelligence/types.ts';
import { MODEL } from '../../src/lib/server/intelligence/providers.ts';

export type ExperimentAudit = {
	experiment: 'synthetic_event_assessment';
	requestId: string;
	requestSha256?: string;
	provider: 'jev';
	reportedModel?: typeof MODEL;
	status: 'assessed' | 'disabled' | 'unavailable';
	reason?:
		Failure | 'authorization_required' | 'authorization_consumed' | 'credentials_unavailable';
	durationMs: number;
	transportAttempts: 0 | 1;
	reservation: 'not_reserved' | 'retained' | 'reconciled';
	usage?: Usage;
	estimatedCostNanodollars?: number;
};
