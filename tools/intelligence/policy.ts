import { createIntelligence } from '../../src/lib/server/intelligence/service.ts';

const categories = [
	'read',
	'edit',
	'test',
	'build',
	'dependency',
	'authorization',
	'secret',
	'network',
	'paid',
	'destructive',
	'commit',
	'push',
	'merge',
	'charity'
] as const;

type Category = (typeof categories)[number];
type Verdict = 'allow' | 'review' | 'deny';
const blocked: readonly Category[] = [
	'authorization',
	'secret',
	'paid',
	'destructive',
	'commit',
	'push',
	'merge',
	'charity'
];

const mock = createIntelligence({
	FLIHUB_INTELLIGENCE_ENABLED: 'true',
	FLIHUB_INTELLIGENCE_PROVIDER: 'mock'
});

// These are synthetic classifications supplied by the fixture author. A future
// host must derive classifications and permission facts independently.
export async function evaluate(input: unknown) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return { verdict: 'deny', reason: 'invalid_proposal' } as const;
	}
	const proposal = input as Record<string, unknown>;
	const category = categories.find((candidate) => candidate === proposal.category);
	if (
		!category ||
		Object.keys(proposal).length !== 4 ||
		!Object.hasOwn(proposal, 'category') ||
		!Object.hasOwn(proposal, 'scope') ||
		!Object.hasOwn(proposal, 'nativePermission') ||
		!Object.hasOwn(proposal, 'ambiguous') ||
		typeof proposal.ambiguous !== 'boolean' ||
		!['workspace', 'outside'].some((scope) => scope === proposal.scope) ||
		!['permitted', 'review', 'denied'].some(
			(permission) => permission === proposal.nativePermission
		)
	) {
		return { verdict: 'deny', reason: 'invalid_proposal' } as const;
	}

	let verdict: Verdict;
	let reason: string;
	if (
		blocked.includes(category) ||
		proposal.scope === 'outside' ||
		proposal.nativePermission === 'denied'
	) {
		verdict = 'deny';
		reason = 'mandatory_policy';
	} else if (
		proposal.nativePermission === 'review' ||
		category === 'dependency' ||
		category === 'network'
	) {
		verdict = 'review';
		reason = 'human_authorization_required';
	} else if (proposal.ambiguous) {
		const assessment =
			category === 'build' || category === 'test'
				? await mock.decide({
						id: 'developmentRisk',
						state:
							category === 'build'
								? 'local build with uncertain side effects'
								: 'local test with uncertain side effects'
					})
				: undefined;
		const elevated = assessment?.status === 'suggested' && assessment.choice === 'elevated';
		verdict = elevated ? 'deny' : 'review';
		reason = elevated ? 'elevated_risk' : 'human_authorization_required';
	} else {
		verdict = 'allow';
		reason = 'already_permitted';
	}
	return { category, verdict, reason };
}

if (import.meta.main) {
	let input: unknown;
	try {
		input = JSON.parse(process.argv[2] ?? '');
	} catch {
		// Invalid input is evaluated as denied.
	}
	console.log(JSON.stringify(await evaluate(input)));
}
