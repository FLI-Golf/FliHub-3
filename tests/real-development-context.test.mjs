import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { acceptedSha, validateContext } from '../tools/intelligence/real-context/contract.ts';
import { createCollector, processOptions } from '../tools/intelligence/real-context/collector.ts';
import {
	contextLifetimeMs,
	prepareRealContextReview
} from '../tools/intelligence/real-context/review.ts';

const A = 'qualification-prerequisite';
const B = 'funding-draft-reconciliation';
const head = 'a'.repeat(40);
const main = 'b'.repeat(40);
const base = 'c'.repeat(40);
const day = Date.parse('2026-11-28T00:00:00.000Z');

function fixture(options = {}) {
	let timestamp = day;
	const reads = [];
	const read = async ({ program, args }) => {
		reads.push({ program, args });
		const target = args[1];
		const currentHead = options.head ?? head;
		const currentMain = options.main ?? main;
		if (options.error) throw new Error('private subprocess output');
		if (options.oversized) return 'é'.repeat(200_000);
		if (program === 'git') {
			const [op, flag, revision] = args.slice(2);
			if (op === 'cat-file') return options.badObject ? 'blob' : 'commit';
			if (op === 'merge-base')
				return revision === acceptedSha ? acceptedSha : options.funding ? base : currentMain;
			if (op === 'rev-list') return options.counts ?? '51\t3';
			if (op === 'show') {
				if (options.roadmap) return options.roadmap;
				return options.funding
					? '| Donations and pledges | Deferred | Deferred to CE-6 |\nCharity development is frozen after CE-3C'
					: '#### ADM-6 — Qualified Development Advisory\n**ADM-6E — Separately authorized live Jev qualification.** Requires a new explicit owner authorization';
			}
			throw new Error(`unexpected git command ${op} ${flag}`);
		}
		if (target === 'graphql') {
			if (options.malformed) return '{';
			const visibility = options.visibility ?? 'PUBLIC';
			return JSON.stringify({
				data: {
					repository: {
						nameWithOwner: 'FLI-Golf/FliHub-3',
						visibility,
						defaultBranchRef: { name: 'main' },
						main: { target: { oid: currentMain } },
						feature: { target: { oid: currentHead } },
						pr: {
							number: options.pr ?? 52,
							state: 'OPEN',
							isDraft: options.draft ?? true,
							baseRefName: 'main',
							baseRefOid: options.reportedBase ?? base,
							headRefName: 'feature/funding-phase-2',
							headRefOid: currentHead,
							headRepository: { nameWithOwner: 'FLI-Golf/FliHub-3' }
						},
						qualification: {
							number: options.issue ?? 62,
							state: 'OPEN',
							projectItems: {
								pageInfo: { hasNextPage: false },
								nodes: [{ project: { number: 21, public: true }, status: { name: '📋 Planning' } }]
							}
						}
					}
				}
			});
		}
		if (target.endsWith('/7241436818'))
			return JSON.stringify({
				issue_url:
					options.acceptanceIssue ?? 'https://api.github.com/repos/FLI-Golf/FliHub-3/issues/94',
				author_id: options.author ?? 20407445,
				author_type: 'User',
				verified: options.accepted ?? true
			});
		if (target.includes('runs?head_sha')) {
			const total_count = options.runs ?? 0;
			return JSON.stringify({ total_count, heads: total_count ? [acceptedSha] : [] });
		}
		if (target.endsWith('/45301470515'))
			return JSON.stringify({
				id: 45301470515,
				event: 'pull_request',
				head_sha: currentHead,
				conclusion: options.conclusion ?? 'success',
				records: [{ number: 52, head: currentHead, base: options.runBase ?? base }]
			});
		throw new Error('unexpected GitHub operation');
	};
	const now = () => (options.clockFailure ? NaN : timestamp++);
	return {
		reads,
		now,
		collect: createCollector(read, now),
		advance: (ms) => {
			timestamp += ms;
		}
	};
}
const approve = (r) => `APPROVE ${r.reviewDigest}`;
const value = (c, id) => c.facts.find((f) => f.id === id).value;

test('both objectives produce closed public facts, pinned evidence and deterministic minimization', async () => {
	const a = fixture();
	const qualification = await a.collect(A);
	assert.equal(qualification.facts.length, 4);
	assert.deepEqual(value(qualification, 'adm6d-ci'), { status: 'no-matching-run' });
	assert.equal(
		qualification.facts.find((f) => f.id === 'adm6d-acceptance').evidence,
		'public-owner-acceptance'
	);
	assert.doesNotMatch(a.reads[0].args.at(-1), /issue\(number:62\)/);
	const optional = await a.collect(A, true);
	assert.equal(optional.facts.length, 5);
	assert.deepEqual(value(optional, 'engineering-qualification'), { issue: 62, status: 'Planning' });
	const b = fixture({ funding: true });
	const funding = await b.collect(B);
	assert.equal(funding.facts.length, 6);
	assert.deepEqual(value(funding, 'funding-relationship'), {
		mergeBase: base,
		ahead: 3,
		behind: 51
	});
	assert.deepEqual(value(funding, 'funding-compatibility'), { status: 'unverified' });
	assert.equal(funding.facts.find((f) => f.id === 'funding-historical-ci').pins.base, base);
	assert.ok(funding.facts.every((f) => f.observedAt.endsWith('Z')));
	assert.doesNotMatch(JSON.stringify(funding), /Charity development is frozen/);
});

test('unverified hosted evidence stays unverified even if an exact-SHA workflow exists', async () => {
	assert.deepEqual(value(await fixture({ runs: 1 }).collect(A), 'adm6d-ci'), {
		status: 'unverified'
	});
});

test('exact validation rejects invalid schema, fact provenance, relationships and excess bytes', async () => {
	const original = await fixture({ funding: true }).collect(B);
	for (const mutate of [
		(c) => {
			c.version = 2;
		},
		(c) => {
			c.objective = 'invented';
		},
		(c) => {
			c.extra = 'untracked';
		},
		(c) => {
			c.facts[0].source = 'unregistered';
		},
		(c) => {
			c.facts[0].id = 'unknown';
		},
		(c) => {
			c.facts[0].evidence = 'public-independent-evidence';
		},
		(c) => {
			c.facts[0].observedAt = '2026-02-31T00:00:00.000Z';
		},
		(c) => {
			c.facts.push(c.facts[0]);
		},
		(c) => {
			c.facts.push(...c.facts);
		},
		(c) => {
			c.facts.find((f) => f.id === 'funding-relationship').pins.head = 'bad';
		},
		(c) => {
			c.facts.find((f) => f.id === 'funding-relationship').value.ahead = 0;
		},
		(c) => {
			c.facts.find((f) => f.id === 'funding-relationship').value.behind = 1000001;
		},
		(c) => {
			c.facts.find((f) => f.id === 'funding-draft').value.raw = 'é'.repeat(9000);
		},
		(c) => {
			c.facts.find((f) => f.id === 'funding-historical-ci').pins.base = main;
		},
		(c) => {
			c.facts[0].value.raw = 'source';
		}
	]) {
		const changed = structuredClone(original);
		mutate(changed);
		assert.throws(() => validateContext(changed));
	}
	assert.deepEqual(
		validateContext({ ...original, facts: [...original.facts].reverse() }),
		original
	);
});

test('repository, identity, history, roadmap, limits and read failures fail closed without raw output', async () => {
	for (const [options, objective, optional] of [
		[{ visibility: 'PRIVATE' }, A],
		[{ malformed: true }, A],
		[{ error: true }, A],
		[{ oversized: true }, A],
		[{ badObject: true }, A],
		[{ accepted: false }, A],
		[{ acceptanceIssue: 'different' }, A],
		[{ issue: 12 }, A, true],
		[{ funding: true, pr: 53 }, B],
		[{ funding: true, draft: false }, B],
		[{ funding: true, counts: 'garbage' }, B],
		[{ funding: true, runBase: main }, B],
		[{ funding: true, conclusion: 'failure' }, B],
		[{ roadmap: 'missing' }, A],
		[{ clockFailure: true }, A]
	]) {
		await assert.rejects(
			fixture(options).collect(objective, optional),
			(e) => e.message === 'Real development context unavailable; use manual review'
		);
	}
	const invalid = fixture();
	await assert.rejects(invalid.collect('unregistered'));
	assert.equal(invalid.reads.length, 0);
	const privateRepo = fixture({ visibility: 'PRIVATE' });
	await assert.rejects(privateRepo.collect(A));
	assert.equal(privateRepo.reads.length, 1);
});

test('exact UTF-8 digest, offline-only preview, one-use confirmation and refresh', async () => {
	const f = fixture();
	const r = await prepareRealContextReview(f.collect, A, false, f.now);
	const envelope = JSON.parse(r.canonicalPayload);
	assert.equal(r.bytes, Buffer.byteLength(r.canonicalPayload, 'utf8'));
	assert.equal(
		r.reviewDigest,
		createHash('sha256').update(r.canonicalPayload, 'utf8').digest('hex')
	);
	assert.equal(envelope.contextDigest, r.contextDigest);
	assert.equal(envelope.dispatchAuthorized, false);
	assert.equal(envelope.executionAuthorized, false);
	assert.equal(envelope.limits.responseBytes, 4096);
	assert.equal(envelope.limits.supportingFacts, 4);
	assert.equal('dispatch' in r, false);
	assert.deepEqual(await Promise.all([r.confirm(approve(r)), r.confirm(approve(r))]), [
		true,
		false
	]);
});

test('a changed branch, roadmap, PR, check evidence or clock invalidates the review', async () => {
	for (const [objective, patch] of [
		[A, { head: 'd'.repeat(40) }],
		[A, { main: 'd'.repeat(40) }],
		[A, { runs: 1 }],
		[A, { roadmap: 'scope changed' }],
		[A, { clockFailure: true }],
		[B, { draft: false }],
		[B, { reportedBase: main }],
		[B, { runBase: main }],
		[B, { roadmap: 'gate changed' }]
	]) {
		const options = { funding: objective === B };
		const f = fixture(options);
		const r = await prepareRealContextReview(f.collect, objective, false, f.now);
		Object.assign(options, patch);
		assert.equal(await r.confirm(approve(r)), false);
	}
	for (const delta of [contextLifetimeMs, -1000]) {
		const f = fixture();
		const r = await prepareRealContextReview(f.collect, A, false, f.now);
		f.advance(delta);
		assert.equal(await r.confirm(approve(r)), false);
	}
	const f = fixture();
	const r = await prepareRealContextReview(f.collect, A, false, f.now);
	r.cancel();
	assert.equal(await r.confirm(approve(r)), false);
});

test('stale observations are refused and bad confirmation never refreshes', async () => {
	const f = fixture();
	const saved = await f.collect(A);
	await assert.rejects(prepareRealContextReview(async () => saved, A, false, f.now));
	const r = await prepareRealContextReview(f.collect, A, false, f.now);
	const reads = f.reads.length;
	assert.equal(await r.confirm('APPROVE bad'), false);
	assert.equal(f.reads.length, reads);
	assert.equal(await r.confirm(approve(r)), false);
});

test('subprocess options bound time and output and omit credentials and configuration injection', () => {
	const opts = processOptions({
		HOME: '/fixture',
		PATH: '/path',
		GITHUB_TOKEN: 'secret',
		GH_TOKEN: 'secret',
		TYPESAFE_API_KEY: 'secret',
		GIT_CONFIG_COUNT: '1',
		NODE_OPTIONS: '--require attacker'
	});
	assert.equal(opts.timeout, 5000);
	assert.equal(opts.maxBuffer, 192 * 1024);
	assert.equal(opts.env.HOME, '/fixture');
	assert.doesNotMatch(JSON.stringify(opts), /secret|attacker|TOKEN|TYPESAFE|GIT_CONFIG_COUNT/);
});

test('collector and review use only registered command paths, never a provider adapter', async (t) => {
	const deny = t.mock.method(globalThis, 'fetch', () => {
		throw new Error('unexpected network transport');
	});
	for (const objective of [A, B]) {
		const f = fixture({ funding: objective === B });
		const r = await prepareRealContextReview(f.collect, objective, false, f.now);
		assert.equal(await r.confirm(approve(r)), true);
		for (const { program, args } of f.reads) {
			if (program === 'gh') {
				assert.equal(args[0], 'api');
				assert.match(args[1], /^(graphql|repos\/FLI-Golf\/FliHub-3\/)/);
			} else {
				assert.ok(['show', 'cat-file', 'merge-base', 'rev-list'].includes(args[2]));
			}
		}
	}
	assert.equal(deny.mock.callCount(), 0);
	const roots = ['collector.ts', 'contract.ts', 'review.ts'];
	for (const file of roots) {
		const source = readFileSync(
			new URL(`../tools/intelligence/real-context/${file}`, import.meta.url),
			'utf8'
		);
		assert.doesNotMatch(source, /from ['"].*(?:provider|jev-transport|experiment|worker)/);
	}
});
