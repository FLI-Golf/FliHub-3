import type { auditStore } from './audit.ts';

type Store = ReturnType<typeof auditStore>;

// This client adds a veto to native prompts. The host owns all permission grants.
export function declineNativeRequest(message: unknown, connectionId: string, audit: Store) {
	if (!message || typeof message !== 'object') return;
	const { id, method, params } = message as Record<string, unknown>;
	if (
		(typeof id !== 'string' || id.length === 0 || id.length > 256) &&
		(typeof id !== 'number' || !Number.isSafeInteger(id))
	)
		return;
	if (
		method !== 'item/commandExecution/requestApproval' &&
		method !== 'item/fileChange/requestApproval' &&
		method !== 'item/permissions/requestApproval'
	)
		return;

	const result =
		method === 'item/permissions/requestApproval'
			? { permissions: {}, scope: 'turn' }
			: { decision: 'decline' };
	try {
		// Bind the exact RPC proposal, while persisting only a keyed digest.
		audit.record(
			{ category: 'unsupported', verdict: 'deny', provider: 'none', reason: 'unsupported' },
			JSON.stringify([method, params]),
			JSON.stringify([connectionId, id])
		);
	} catch {
		// Unavailable audits and repeated requests never change the veto.
	}
	return { id, result };
}
