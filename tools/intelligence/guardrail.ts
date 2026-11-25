import { realpathSync } from 'node:fs';
import { createIntelligence } from '../../src/lib/server/intelligence/service.ts';
import type { Decision } from './audit.ts';

export const fixtures = Object.freeze({
	read: 'printf FLIHUB_READ_FIXTURE',
	test: 'printf FLIHUB_UNIT_TEST_FIXTURE',
	dependency: 'printf FLIHUB_DEPENDENCY_FIXTURE',
	secret: 'printf FLIHUB_PROTECTED_FIXTURE',
	restricted: 'printf FLIHUB_RESTRICTED_FIXTURE'
});
export type Fixture = keyof typeof fixtures;
export const mock = createIntelligence({
	FLIHUB_INTELLIGENCE_ENABLED: 'true',
	FLIHUB_INTELLIGENCE_PROVIDER: 'mock'
});

export async function decideFixture(
	fixture: Fixture | 'unsupported',
	provider = mock,
	providerName: Decision['provider'] = 'mock'
) {
	const deterministic: Decision =
		fixture === 'read'
			? { category: fixture, verdict: 'allow', reason: 'readonly', provider: 'none' }
			: fixture === 'test' || fixture === 'dependency'
				? { category: fixture, verdict: 'review', reason: 'human_review', provider: 'none' }
				: {
						category: fixture,
						verdict: 'deny',
						reason: fixture === 'unsupported' ? 'unsupported' : 'mandatory',
						provider: 'none'
					};
	if (deterministic.verdict !== 'review')
		return { deterministic, decision: deterministic, recommendation: undefined };

	const recommendation = await provider.decide({
		id: 'developmentRisk',
		state:
			fixture === 'test'
				? 'running an ordinary local unit test'
				: 'installing an unfamiliar dependency'
	});
	const elevated = recommendation.status === 'suggested' && recommendation.choice === 'elevated';
	const decision: Decision = {
		...deterministic,
		provider: providerName,
		verdict: elevated ? 'deny' : 'review',
		reason: elevated ? 'elevated' : 'human_review'
	};
	return { deterministic, decision, recommendation };
}

type HookEvent = {
	hook_event_name?: unknown;
	tool_name?: unknown;
	tool_input?: { command?: unknown; workdir?: unknown };
	cwd?: unknown;
	session_id?: unknown;
	turn_id?: unknown;
	tool_use_id?: unknown;
};

// stdin is a trusted Codex hook channel. Only exact inert commands are recognized.
// Raw strings are never parsed as shell syntax or returned to the model.
export function classify(event: HookEvent | undefined, root: string) {
	let fixture: Fixture | 'unsupported' = 'unsupported';
	let binding: string | undefined;
	if (
		event?.hook_event_name === 'PreToolUse' &&
		event.tool_name === 'Bash' &&
		typeof event.cwd === 'string' &&
		typeof event.session_id === 'string' &&
		typeof event.turn_id === 'string' &&
		typeof event.tool_use_id === 'string' &&
		[event.session_id, event.turn_id, event.tool_use_id].every(
			(value) => value.length > 0 && value.length <= 256
		)
	) {
		binding = JSON.stringify([event.session_id, event.turn_id, event.tool_use_id]);
		try {
			if (
				realpathSync(event.cwd) === root &&
				(event.tool_input?.workdir === undefined || event.tool_input.workdir === root)
			) {
				fixture =
					(Object.keys(fixtures) as Fixture[]).find(
						(key) => fixtures[key] === event.tool_input?.command
					) ?? 'unsupported';
			}
		} catch {
			// Unresolvable working directories are unsupported.
		}
	}
	return {
		fixture,
		binding,
		proposal: JSON.stringify([root, fixture, event?.tool_input?.command])
	};
}
