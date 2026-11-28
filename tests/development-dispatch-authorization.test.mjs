import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { canonicalJson } from '../src/lib/server/intelligence/application/operations/canonical.ts';
import { ownerAccountId, createCollector } from '../tools/intelligence/real-context/collector.ts';
import { acceptedSha, fact } from '../tools/intelligence/real-context/contract.ts';
import { prepareDispatchSession } from '../tools/intelligence/real-context/dispatch-authorization.ts';
import {
	qualifyCollection,
	trustedMetadata,
	verifyGitHubOperator
} from '../tools/intelligence/real-context/qualified-collection.ts';

const objective = 'qualification-prerequisite';
const funding = 'funding-draft-reconciliation';
const epoch = Date.parse('2026-11-28T12:00:00Z');
const head = 'a'.repeat(40);
const main = 'b'.repeat(40);
const base = 'c'.repeat(40);
const repository = 'FLI-Golf/FliHub-3';

function fixture(options = {}) {
	let time = epoch;
	const now = () => time;
	const collect = async (id) => {
		if (options.fail) throw new Error('unavailable');
		if (options.pause) await options.pause;
		const observed = new Date(time).toISOString();
		const current = options.head ?? head;
		const repo = fact(
			'repository',
			{ slug: repository, visibility: options.visibility ?? 'PUBLIC' },
			null,
			observed
		);
		const facts =
			id === objective
				? [
						repo,
						fact(
							'adm6d-acceptance',
							{ issue: 94, scope: 'offline-simulation' },
							{ revision: acceptedSha },
							observed
						),
						fact(
							'adm6d-ci',
							{ status: options.ci ?? 'no-matching-run' },
							{ revision: acceptedSha },
							observed
						),
						fact(
							'adm6e-gate',
							{
								section: 'adm-6-qualified-development-advisory',
								gate: options.gate ?? 'separate-live-authorization'
							},
							{ head: current, base: main },
							observed
						)
					]
				: [
						repo,
						fact(
							'funding-draft',
							{ pr: 52, state: options.state ?? 'OPEN', draft: true, reportedBase: base },
							{ head: current, base: main },
							observed
						),
						fact(
							'funding-relationship',
							{ mergeBase: base, ahead: 3, behind: 51 },
							{ head: current, base: main },
							observed
						),
						fact(
							'funding-historical-ci',
							{ pr: 52, run: 45301470515, status: 'passed' },
							{ head: current, base },
							observed
						),
						fact(
							'funding-charity-gate',
							{ section: 'charity-development-sequence', gate: 'ce-6-deferred' },
							{ revision: main },
							observed
						),
						fact(
							'funding-compatibility',
							{ status: 'unverified' },
							{ head: current, base: main },
							observed
						)
					];
		return {
			operator: options.operator ?? ownerAccountId,
			context: { version: 1, objective: id, facts }
		};
	};
	return {
		collect,
		now,
		advance: (delta) => {
			time += delta;
		},
		set: (value) => {
			time = value;
		}
	};
}
const prepare = (f, id = objective) => prepareDispatchSession(f.collect, id, false, f.now);
const confirm = (session) => session.confirm('APPROVE ' + session.disclosureDigest);
const authorize = (session) => session.authorize('AUTHORIZE SIMULATION ' + session.bindingDigest);
async function granted(f, id = objective) {
	const session = await prepare(f, id);
	assert.equal(await confirm(session), true);
	const token = authorize(session);
	assert.ok(token);
	return { session, token };
}
const redeem = (s, t, request = s.request, who = ownerAccountId) => s.redeem(t, request, who);

test('exact fixture request and disclosure occupy separate digests, with issue and redemption for both objectives', async () => {
	for (const id of [objective, funding]) {
		const f = fixture();
		const { session, token } = await granted(f, id);
		const auth = JSON.parse(token);
		assert.equal(auth.objective, id);
		assert.equal(auth.repository, repository);
		assert.equal(auth.operator, ownerAccountId);
		assert.notEqual(auth.reviewId, auth.authorizationId);
		assert.equal(auth.issuedAt, epoch);
		assert.equal(auth.expiresAt, epoch + 30_000);
		assert.equal(
			auth.disclosureDigest,
			createHash('sha256').update(session.disclosure).digest('hex')
		);
		assert.equal(auth.requestDigest, createHash('sha256').update(session.request).digest('hex'));
		assert.notEqual(auth.disclosureDigest, auth.requestDigest);
		assert.equal(JSON.parse(session.disclosure).proposedDestination, 'typesafe-jev-api');
		assert.equal(JSON.parse(session.request).transport.destination, 'in-process-redemption');
		assert.equal(auth.limits.billableUsageAuthorized, false);
		assert.equal(session.state(), 'issued');
		const receipt = await redeem(session, token);
		assert.deepEqual(receipt, {
			state: 'redeemed',
			authorizationId: auth.authorizationId,
			requestDigest: session.requestDigest,
			reservation: 'unavailable',
			externalRequests: 0,
			providerDispatchAuthorized: false,
			engineeringExecutionAuthorized: false
		});
		assert.equal(session.state(), 'redeemed');
		assert.equal(await redeem(session, token), undefined);
	}
});

test('review confirmation and wrong or missing separate authorization cannot redeem', async () => {
	const session = await prepare(fixture());
	assert.equal(authorize(session), undefined);
	assert.equal(await confirm(session), true);
	assert.equal(session.authorize('APPROVE ' + session.disclosureDigest), undefined);
	assert.equal(await redeem(session, undefined), undefined);
	assert.equal(session.state(), undefined);
});

test('altered grant fields, unknown fields, operator, bytes and changed transport invalidate without replay', async () => {
	const changes = [
		(g) => {
			g.version = 2;
		},
		(g) => {
			g.unknown = true;
		},
		(g) => {
			g.repository = 'another/repo';
		},
		(g) => {
			g.objective = funding;
		},
		(g) => {
			g.operator = 1;
		},
		(g) => {
			g.requestDigest = 'f'.repeat(64);
		},
		(g) => {
			g.disclosureDigest = 'a'.repeat(64);
		},
		(g) => {
			g.contextDigest = 'bad';
		},
		(g) => {
			g.transport.destination = 'external';
		},
		(g) => {
			g.transport.configuration = 'network';
		},
		(g) => {
			g.transport.protocol = 'other';
		},
		(g) => {
			g.limits.maximumRequests = 2;
		},
		(g) => {
			g.pinsDigest = 'bad';
		}
	];
	for (const change of changes) {
		const { session, token } = await granted(fixture());
		const forged = JSON.parse(token);
		change(forged);
		assert.equal(await redeem(session, canonicalJson(forged)), undefined);
		assert.equal(session.state(), 'invalidated');
		assert.equal(await redeem(session, token), undefined);
	}
	for (const [make, who] of [
		[(s) => s.request + ' ', ownerAccountId],
		[(s) => s.request, 1]
	]) {
		const { session, token } = await granted(fixture());
		assert.equal(await redeem(session, token, make(session), who), undefined);
		assert.equal(session.state(), 'invalidated');
	}
});

test('local records cannot transfer to another review, objective or new process-local session', async () => {
	const first = await granted(fixture());
	for (const id of [objective, funding]) {
		const other = await granted(fixture(), id);
		assert.notEqual(
			JSON.parse(first.token).authorizationId,
			JSON.parse(other.token).authorizationId
		);
		assert.equal(await redeem(other.session, first.token), undefined);
		assert.equal(other.session.state(), 'invalidated');
	}
	const restarted = await prepare(fixture());
	assert.equal(await redeem(restarted, first.token), undefined);
});

test('expired review, expired grant and regressing or invalid clock fail closed', async () => {
	const pending = fixture();
	const review = await prepare(pending);
	pending.advance(60_000);
	assert.equal(await confirm(review), false);
	assert.equal(authorize(review), undefined);
	const fresh = fixture();
	const { session, token } = await granted(fresh);
	fresh.advance(30_000);
	assert.equal(await redeem(session, token), undefined);
	assert.equal(session.state(), 'expired');
	for (const time of [epoch - 1, NaN]) {
		const f = fixture();
		const grant = await granted(f);
		f.set(time);
		assert.equal(await redeem(grant.session, grant.token), undefined);
		assert.equal(grant.session.state(), 'invalidated');
	}
});

test('visibility, branch, evidence, roadmap, PR state or trusted identity change invalidates admission', async () => {
	for (const [id, change] of [
		[objective, { visibility: 'PRIVATE' }],
		[objective, { head: 'd'.repeat(40) }],
		[objective, { ci: 'unverified' }],
		[objective, { gate: 'released' }],
		[objective, { operator: 1 }],
		[funding, { state: 'CLOSED' }],
		[funding, { fail: true }]
	]) {
		const flags = {};
		const f = fixture(flags);
		const { session, token } = await granted(f, id);
		Object.assign(flags, change);
		assert.equal(await redeem(session, token), undefined);
		assert.equal(session.state(), 'invalidated');
		assert.equal(await redeem(session, token), undefined);
	}
});

test('concurrent redemption consumes at most once and cancellation defeats in-flight revalidation', async () => {
	for (const doCancel of [false, true]) {
		const flags = {};
		const { session, token } = await granted(fixture(flags));
		let resume;
		flags.pause = new Promise((resolve) => {
			resume = resolve;
		});
		const pending = redeem(session, token);
		assert.equal(await redeem(session, token), undefined);
		if (doCancel) session.cancel();
		resume();
		assert.equal((await pending)?.state, doCancel ? undefined : 'redeemed');
		assert.equal(session.state(), doCancel ? 'cancelled' : 'redeemed');
	}
	const { session, token } = await granted(fixture());
	session.cancel();
	assert.equal(await redeem(session, token), undefined);
});

test('GitHub actor and acceptance author require the registered stable account identifier', async () => {
	await assert.rejects(
		verifyGitHubOperator(async () =>
			JSON.stringify({ id: 9, type: 'User', login: 'HalftimeHarry' })
		)
	);
	await assert.rejects(
		verifyGitHubOperator(async () => JSON.stringify({ id: ownerAccountId, type: 'Bot' }))
	);
	assert.equal(
		await verifyGitHubOperator(async () =>
			JSON.stringify({ id: ownerAccountId, type: 'User', login: 'changed' })
		),
		ownerAccountId
	);
	await assert.rejects(
		createCollector(
			async ({ program, args }) => {
				if (program === 'git') return args[2] === 'merge-base' ? args[4] : 'commit';
				if (args[1] === 'graphql') return repoData();
				return JSON.stringify({
					author_id: 9,
					author_type: 'User',
					verified: true,
					issue_url: 'https://api.github.com/repos/FLI-Golf/FliHub-3/issues/94'
				});
			},
			() => epoch
		)(objective),
		/unavailable/
	);
});

function repoData(visibility = 'PUBLIC') {
	return JSON.stringify({
		data: {
			repository: {
				visibility,
				nameWithOwner: repository,
				defaultBranchRef: { name: 'main' },
				main: { target: { oid: main } },
				feature: { target: { oid: head } }
			}
		}
	});
}

test('qualified collection checks remote ancestry, authenticated roadmap blob and a closing ref read', async () => {
	const roadmap =
		'#### ADM-6 — Qualified Development Advisory\n**ADM-6E — Separately authorized live Jev qualification.** Requires a new explicit owner authorization\n';
	const blob = createHash('sha1')
		.update(`blob ${Buffer.byteLength(roadmap)}\0`)
		.update(roadmap)
		.digest('hex');
	for (const fault of ['none', 'refs', 'blob', 'ancestry', 'operator']) {
		let refs = 0;
		let users = 0;
		const read = async ({ program, args }) => {
			if (program === 'git') {
				if (args[2] === 'merge-base') return args[4];
				if (args[2] === 'show') return roadmap;
				return 'commit';
			}
			const path = args[1];
			if (path === 'user')
				return JSON.stringify({
					id: ++users === 2 && fault === 'operator' ? 9 : ownerAccountId,
					type: 'User'
				});
			if (path === 'graphql')
				return repoData(++refs === 2 && fault === 'refs' ? 'PRIVATE' : 'PUBLIC');
			if (path.includes('/compare/'))
				return JSON.stringify({
					mergeBase: fault === 'ancestry' ? base : path.split('/').at(-1).split('...')[0]
				});
			if (path.includes('/contents/'))
				return JSON.stringify({ type: 'file', sha: fault === 'blob' ? base : blob });
			if (path.includes('7241436818'))
				return JSON.stringify({
					author_id: ownerAccountId,
					author_type: 'User',
					verified: true,
					issue_url: 'https://api.github.com/repos/FLI-Golf/FliHub-3/issues/94'
				});
			if (path.includes('runs?head_sha')) return JSON.stringify({ total_count: 0, heads: [] });
			throw new Error('unexpected call');
		};
		const result = qualifyCollection(read, () => epoch)(objective, false);
		if (fault === 'none') {
			assert.equal((await result).context.facts.length, 4);
			assert.equal(refs, 2);
			assert.equal(users, 2);
		} else await assert.rejects(result);
	}
});

test('metadata trust rejects writable, symlink and unregistered executable or configuration ownership', () => {
	const regular = { uid: 0, mode: 0o755, isFile: () => true, isDirectory: () => false };
	assert.equal(trustedMetadata(regular, [0, 65534], 'file'), true);
	assert.equal(trustedMetadata({ ...regular, uid: 1000 }, [0, 65534], 'file'), false);
	assert.equal(trustedMetadata({ ...regular, mode: 0o775 }, [0, 65534], 'file'), false);
	assert.equal(trustedMetadata({ ...regular, isFile: () => false }, [0, 65534], 'file'), false);
	assert.equal(trustedMetadata(regular, [1000], 'file'), false);
});

test('transitive preview imports are closed over approved local modules and narrow built-ins', () => {
	const root = new URL('../', import.meta.url);
	const prefix = 'tools/intelligence/real-context/';
	const allowed = new Set([
		'tools/development/dispatch-authorization-preview.mjs',
		...['dispatch-authorization', 'qualified-collection', 'collector', 'contract', 'review'].map(
			(name) => prefix + name + '.ts'
		),
		'tools/intelligence/development-advisory/contracts.ts',
		'src/lib/server/intelligence/application/operations/canonical.ts'
	]);
	const builtins = new Set([
		'node:readline/promises',
		'node:crypto',
		'node:child_process',
		'node:fs/promises',
		'node:os',
		'node:path',
		'node:url',
		'node:util'
	]);
	const seen = new Set();
	function visit(path) {
		if (seen.has(path)) return;
		assert.ok(allowed.has(path), path);
		seen.add(path);
		const url = new URL(path, root);
		const source = ts.createSourceFile(
			path,
			readFileSync(url, 'utf8'),
			ts.ScriptTarget.Latest,
			true
		);
		function walk(node) {
			if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
				const spec = node.moduleSpecifier.text;
				if (spec.startsWith('node:')) assert.ok(builtins.has(spec), spec);
				else visit(fileURLToPath(new URL(spec, url)).slice(fileURLToPath(root).length));
			}
			if (ts.isCallExpression(node))
				assert.ok(
					node.expression.kind !== ts.SyntaxKind.ImportKeyword &&
						node.expression.getText(source) !== 'require'
				);
			ts.forEachChild(node, walk);
		}
		walk(source);
	}
	visit('tools/development/dispatch-authorization-preview.mjs');
	assert.deepEqual(seen, allowed);
});
