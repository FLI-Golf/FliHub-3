import { realpathSync } from 'node:fs';
import { auditStore } from './audit.ts';
import { classify, decideFixture } from './guardrail.ts';

function deny(reason: string) {
	return {
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecision: 'deny',
			permissionDecisionReason: reason
		}
	};
}

export async function handleHook(
	event: Parameters<typeof classify>[0],
	root: string,
	directory?: string
) {
	try {
		const { fixture, binding, proposal } = classify(event, root);
		const { decision } = await decideFixture(fixture);
		const audit = auditStore(directory);
		try {
			const id = audit.record(decision, proposal, binding);
			if (decision.verdict === 'allow') return {};
			return deny(
				`Development policy: ${decision.verdict}; decision ${id}. No execution authorized by the hook.`
			);
		} finally {
			audit.close();
		}
	} catch {
		return deny('Development audit or policy unavailable.');
	}
}

if (import.meta.main) {
	let result: Awaited<ReturnType<typeof handleHook>> = deny('Malformed development hook input.');
	try {
		const root = process.argv[2];
		if (!root) throw new Error('Missing trusted root');
		let input = '';
		for await (const chunk of process.stdin) {
			input += chunk.toString();
			if (input.length > 8192) throw new Error('Oversized input');
		}
		result = await handleHook(JSON.parse(input), realpathSync(root), process.argv[3]);
	} catch {
		// Emit a valid denial for errors under the handler's control.
	}
	console.log(JSON.stringify(result));
}
