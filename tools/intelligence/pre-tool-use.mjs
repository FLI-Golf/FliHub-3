// Opt-in example for a dedicated, restricted Codex session.
// A single exact shell call is exempt. Native permissions remain authoritative.
/** @param {{hook_event_name?: unknown, tool_name?: unknown, tool_input?: {command?: unknown}} | null | undefined} event */
export function hookResult(event) {
	if (
		event?.hook_event_name === 'PreToolUse' &&
		event?.tool_name === 'Bash' &&
		event?.tool_input?.command === 'git status --short --branch'
	) {
		return {};
	}
	return {
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecision: 'deny',
			permissionDecisionReason: 'This hook only permits the exact Git status inspection fixture.'
		}
	};
}

if (import.meta.main) {
	process.stdin.setEncoding('utf8');
	let input = '';
	let oversized = false;
	for await (const chunk of process.stdin) {
		if (!oversized) input += chunk;
		if (input.length > 8192) {
			oversized = true;
			input = '';
		}
	}
	let event;
	try {
		event = JSON.parse(input);
	} catch {
		// Malformed or oversized events produce a denial.
	}
	console.log(JSON.stringify(hookResult(event)));
}
