import { canonicalJson } from '../../../src/lib/server/intelligence/application/operations/canonical.ts';
import { ADVISORY_LIMITS } from '../development-advisory/contracts.ts';

export const repository = 'FLI-Golf/FliHub-3';
export const acceptedSha = '07cc7f6f6bdc08bda6ec5a0d7691cf3cbad19f35';
export const objectives = ['qualification-prerequisite', 'funding-draft-reconciliation'] as const;
export type Objective = (typeof objectives)[number];

type FactValues = {
	repository: { slug: typeof repository; visibility: 'PUBLIC' };
	'adm6d-acceptance': { issue: 94; scope: 'offline-simulation' };
	'adm6d-ci': { status: 'no-matching-run' | 'unverified' };
	'adm6e-gate': {
		section: 'adm-6-qualified-development-advisory';
		gate: 'separate-live-authorization';
	};
	'engineering-qualification': { issue: 62; status: 'Planning' };
	'funding-draft': { pr: 52; state: 'OPEN'; draft: true; reportedBase: string };
	'funding-relationship': { mergeBase: string; ahead: number; behind: number };
	'funding-historical-ci': { pr: 52; run: 45301470515; status: 'passed' };
	'funding-charity-gate': { section: 'charity-development-sequence'; gate: 'ce-6-deferred' };
	'funding-compatibility': { status: 'unverified' };
};

export type FactId = keyof FactValues;
const policy = {
	repository: ['github-repository', 'direct-observation', 'none'],
	'adm6d-acceptance': ['github-94-acceptance', 'public-owner-acceptance', 'revision'],
	'adm6d-ci': ['github-actions-adm6d', 'direct-observation', 'revision'],
	'adm6e-gate': ['intelligence-roadmap', 'direct-observation', 'comparison'],
	'engineering-qualification': ['github-project-21-issue-62', 'direct-observation', 'none'],
	'funding-draft': ['github-pr-52', 'direct-observation', 'comparison'],
	'funding-relationship': ['git-and-live-refs', 'direct-observation', 'comparison'],
	'funding-historical-ci': ['github-actions-45301470515', 'direct-observation', 'comparison'],
	'funding-charity-gate': ['charity-roadmap', 'direct-observation', 'revision'],
	'funding-compatibility': ['github-pr-52-evidence-scope', 'direct-observation', 'comparison']
} as const satisfies Record<FactId, readonly [string, string, 'none' | 'revision' | 'comparison']>;

const required = {
	'qualification-prerequisite': ['repository', 'adm6d-acceptance', 'adm6d-ci', 'adm6e-gate'],
	'funding-draft-reconciliation': [
		'repository',
		'funding-draft',
		'funding-relationship',
		'funding-historical-ci',
		'funding-charity-gate',
		'funding-compatibility'
	]
} as const satisfies Record<Objective, readonly FactId[]>;

type Pins<K extends FactId> = (typeof policy)[K][2] extends 'none'
	? null
	: (typeof policy)[K][2] extends 'revision'
		? { revision: string }
		: { head: string; base: string };
export type Fact<K extends FactId = FactId> = {
	[P in K]: {
		id: P;
		classification: 'verified-public-fact';
		source: (typeof policy)[P][0];
		evidence: (typeof policy)[P][1];
		observedAt: string;
		pins: Pins<P>;
		value: FactValues[P];
	};
}[K];

export type EvidenceProvenance =
	| 'direct-observation'
	| 'public-implementation-report'
	| 'public-independent-evidence'
	| 'public-owner-acceptance';
// This registry admits no implementation-report or independent-evidence claims in v1.
export type Context = { version: 1; objective: Objective; facts: Fact[] };
export const contextLimits = Object.freeze({
	facts: 8,
	requestBytes: ADVISORY_LIMITS.requestBytes,
	responseBytes: ADVISORY_LIMITS.responseBytes,
	supportingFacts: 4
});

export function requireFact(condition: unknown): asserts condition {
	if (!condition) throw new Error('Required real development evidence is invalid or unavailable');
}

export function isObjective(value: unknown): value is Objective {
	return objectives.some((id) => id === value);
}

export function sha(value: unknown): asserts value is string {
	requireFact(typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value));
}

export function observationTime(value: unknown): number {
	requireFact(
		typeof value === 'string' && /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ$/.test(value)
	);
	const time = Date.parse(value);
	requireFact(Number.isSafeInteger(time) && new Date(time).toISOString() === value);
	return time;
}

function exact(value: unknown, ...keys: string[]): Record<string, unknown> {
	requireFact(value && typeof value === 'object' && !Array.isArray(value));
	const fields = Object.keys(value);
	requireFact(
		fields.length === keys.length && keys.every((key) => Object.hasOwn(value as object, key))
	);
	return value as Record<string, unknown>;
}

function count(value: unknown) {
	requireFact(
		typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
	);
}

function validateFact(input: unknown): Fact {
	const f = exact(
		input,
		'id',
		'classification',
		'source',
		'evidence',
		'observedAt',
		'pins',
		'value'
	);
	requireFact(typeof f.id === 'string' && Object.hasOwn(policy, f.id));
	const id = f.id as FactId;
	const [source, evidence, pinType] = policy[id];
	requireFact(
		f.classification === 'verified-public-fact' && f.source === source && f.evidence === evidence
	);
	observationTime(f.observedAt);
	if (pinType === 'none') requireFact(f.pins === null);
	if (pinType === 'revision') sha(exact(f.pins, 'revision').revision);
	if (pinType === 'comparison') {
		const pins = exact(f.pins, 'head', 'base');
		sha(pins.head);
		sha(pins.base);
	}
	const v = f.value;
	switch (id) {
		case 'repository': {
			const data = exact(v, 'slug', 'visibility');
			requireFact(data.slug === repository && data.visibility === 'PUBLIC');
			break;
		}
		case 'adm6d-acceptance': {
			const data = exact(v, 'issue', 'scope');
			requireFact(data.issue === 94 && data.scope === 'offline-simulation');
			break;
		}
		case 'adm6d-ci': {
			const { status } = exact(v, 'status');
			requireFact(status === 'no-matching-run' || status === 'unverified');
			break;
		}
		case 'adm6e-gate': {
			const data = exact(v, 'section', 'gate');
			requireFact(
				data.section === 'adm-6-qualified-development-advisory' &&
					data.gate === 'separate-live-authorization'
			);
			break;
		}
		case 'engineering-qualification': {
			const data = exact(v, 'issue', 'status');
			requireFact(data.issue === 62 && data.status === 'Planning');
			break;
		}
		case 'funding-draft': {
			const data = exact(v, 'pr', 'state', 'draft', 'reportedBase');
			sha(data.reportedBase);
			requireFact(data.pr === 52 && data.state === 'OPEN' && data.draft === true);
			break;
		}
		case 'funding-relationship': {
			const relation = exact(v, 'mergeBase', 'ahead', 'behind');
			sha(relation.mergeBase);
			count(relation.ahead);
			count(relation.behind);
			const pins = f.pins as Pins<'funding-relationship'>;
			requireFact((relation.ahead === 0) === (relation.mergeBase === pins.head));
			requireFact((relation.behind === 0) === (relation.mergeBase === pins.base));
			break;
		}
		case 'funding-historical-ci': {
			const data = exact(v, 'pr', 'run', 'status');
			requireFact(data.pr === 52 && data.run === 45301470515 && data.status === 'passed');
			break;
		}
		case 'funding-charity-gate': {
			const data = exact(v, 'section', 'gate');
			requireFact(data.section === 'charity-development-sequence' && data.gate === 'ce-6-deferred');
			break;
		}
		case 'funding-compatibility':
			requireFact(exact(v, 'status').status === 'unverified');
	}
	return f as Fact;
}

export function fact<K extends FactId>(
	id: K,
	value: FactValues[K],
	pins: Pins<K>,
	observedAt: string
): Fact<K> {
	const [source, evidence] = policy[id];
	return {
		id,
		value,
		pins,
		observedAt,
		source,
		evidence,
		classification: 'verified-public-fact'
	} as Fact<K>;
}

export function validateContext(input: unknown): Context {
	// Canonical serialization rejects proxies, accessors, non-data prototypes and cycles.
	const json = canonicalJson(input);
	requireFact(Buffer.byteLength(json, 'utf8') <= contextLimits.requestBytes);
	const c = exact(JSON.parse(json), 'version', 'objective', 'facts');
	requireFact(c.version === 1 && isObjective(c.objective));
	const objective = c.objective;
	requireFact(Array.isArray(c.facts) && c.facts.length <= contextLimits.facts);
	const facts = c.facts.map(validateFact);
	const ids = facts.map((f) => f.id);
	const mandatory: readonly FactId[] = required[objective];
	requireFact(new Set(ids).size === ids.length && mandatory.every((id) => ids.includes(id)));
	requireFact(
		ids.every(
			(id) =>
				mandatory.includes(id) ||
				(objective === 'qualification-prerequisite' && id === 'engineering-qualification')
		)
	);
	if (objective === 'qualification-prerequisite') {
		for (const f of facts) {
			if (f.id === 'adm6d-acceptance' || f.id === 'adm6d-ci')
				requireFact(f.pins.revision === acceptedSha);
		}
	} else {
		const relation = facts.find((f) => f.id === 'funding-relationship');
		requireFact(relation);
		for (const f of facts) {
			if (f.id === 'funding-draft' || f.id === 'funding-compatibility') {
				requireFact(f.pins.head === relation.pins.head && f.pins.base === relation.pins.base);
			}
			if (f.id === 'funding-draft')
				requireFact(
					f.value.reportedBase === relation.pins.base ||
						f.value.reportedBase === relation.value.mergeBase
				);
			if (f.id === 'funding-historical-ci')
				requireFact(
					f.pins.head === relation.pins.head &&
						f.pins.base === relation.value.mergeBase &&
						f.pins.base !== relation.pins.base
				);
			if (f.id === 'funding-charity-gate') requireFact(f.pins.revision === relation.pins.base);
		}
	}
	return {
		version: 1,
		objective,
		facts: facts.sort((a, b) => (a.id < b.id ? -1 : a.id === b.id ? 0 : 1))
	};
}
