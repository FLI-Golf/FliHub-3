import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
	new URL('../src/lib/server/fill-event-demo-scores.ts', import.meta.url),
	'utf8'
);
const compiled = ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const { fillEventDemoScores, submitEventDemoScorecards } = await import(
	`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const org = 'organization001',
	event = 'event0000000001',
	user = 'owner0000000001';
function fixture() {
	const rows = {
		memberships: [{ id: 'm1', organization: org, user, role: 'owner' }],
		organizations: [{ id: org, capabilities: ['scoring-results'] }],
		events: [{ id: event, organization: org, status: 'planned' }],
		event_results: [],
		rounds: [
			{ id: 'r1', number: 1, course: 'c1' },
			{ id: 'r2', number: 2, course: 'c1' }
		],
		event_groups: [{ id: 'g1' }, { id: 'g2' }],
		group_athletes: [
			{ group: 'g1', athlete: 'a1' },
			{ group: 'g1', athlete: 'a2' },
			{ group: 'g2', athlete: 'a3' },
			{ group: 'g2', athlete: 'a4' }
		],
		course_holes: [
			{ id: 'h1', course: 'c1' },
			{ id: 'h2', course: 'c1' }
		],
		scorecards: [],
		scores: []
	};
	const writes = [];
	const pb = {
		collection(name) {
			return {
				async getFullList() {
					return [...rows[name]];
				},
				async getOne(id) {
					const row = rows[name].find((x) => x.id === id);
					if (!row) throw new Error('not found');
					return row;
				},
				async update(id, value) {
					if (pb.failSubmit && writes.filter(([op]) => op === 'submit').length >= pb.failSubmit)
						throw new Error('submission failed');
					const row = rows[name].find((item) => item.id === id);
					assert.equal(name, 'scorecards');
					assert.deepEqual(value, { status: 'submitted' });
					Object.assign(row, value);
					writes.push(['submit', { ...row }]);
					return row;
				},
				async create(value) {
					if (pb.stop && name === 'scores' && rows.scores.length >= pb.stop)
						throw new Error('write failed');
					const row = { ...value, id: `new${writes.length}` };
					if (name === 'scorecards') row.status = 'draft';
					if (name === 'scores') {
						const card = rows.scorecards.find((c) => c.id === row.scorecard);
						row.round = card.round;
						row.group = card.group;
					}
					rows[name].push(row);
					writes.push([name, row]);
					return row;
				}
			};
		}
	};
	return { rows, writes, pb };
}
test('fills all groups and rounds; rerun preserves every score', async () => {
	const f = fixture();
	assert.deepEqual(await fillEventDemoScores(f.pb, org, event, user, () => 0.5), {
		added: 16,
		touched: 4,
		skipped: 0
	});
	assert.equal(f.rows.scores.length, 16);
	assert.ok(f.rows.scores.every((s) => s.strokes === 4));
	const saved = structuredClone(f.rows.scores);
	assert.deepEqual(await fillEventDemoScores(f.pb, org, event, user), {
		added: 0,
		touched: 0,
		skipped: 0
	});
	assert.deepEqual(f.rows.scores, saved);
	assert.ok(f.rows.scorecards.every((c) => c.status === 'draft'));
	assert.ok(f.writes.every(([name]) => ['scorecards', 'scores'].includes(name)));
});
test('preserves existing strokes and skips submitted cards', async () => {
	const f = fixture();
	f.rows.scorecards.push(
		{ id: 'draft', round: 'r1', group: 'g1', status: 'draft' },
		{ id: 'locked', round: 'r2', group: 'g2', status: 'submitted' }
	);
	f.rows.scores.push({
		id: 'saved',
		round: 'r1',
		group: 'g1',
		athlete: 'a1',
		hole: 'h1',
		strokes: 9
	});
	const r = await fillEventDemoScores(f.pb, org, event, user);
	assert.equal(r.added, 11);
	assert.equal(r.skipped, 1);
	assert.equal(f.rows.scores[0].strokes, 9);
	assert.ok(!f.writes.some(([name, row]) => name === 'scores' && row.scorecard === 'locked'));
});
test('role, membership and cross-organization guards precede all writes', async () => {
	for (const scenario of ['viewer', 'scorekeeper', 'outsider', 'cross-org']) {
		const f = fixture();
		if (scenario === 'outsider') f.rows.memberships = [];
		else if (scenario === 'cross-org') f.rows.events[0].organization = 'anotherorg00001';
		else f.rows.memberships[0].role = scenario;
		await assert.rejects(fillEventDemoScores(f.pb, org, event, user));
		assert.equal(f.writes.length, 0);
	}
	const f = fixture();
	f.rows.memberships[0].role = 'admin';
	assert.equal((await fillEventDemoScores(f.pb, org, event, user)).added, 16);
});
test('official results, disabled scoring and incomplete setup block before writes', async () => {
	for (const scenario of [
		'published',
		'approved',
		'correcting',
		'disabled',
		'no-holes',
		'empty-group'
	]) {
		const f = fixture();
		if (['published', 'approved', 'correcting'].includes(scenario))
			f.rows.event_results.push({ status: scenario });
		else if (scenario === 'disabled') f.rows.organizations[0].capabilities = [];
		else if (scenario === 'no-holes') f.rows.course_holes = [];
		else f.rows.group_athletes = f.rows.group_athletes.filter((a) => a.group !== 'g2');
		await assert.rejects(fillEventDemoScores(f.pb, org, event, user));
		assert.equal(f.writes.length, 0);
	}
});
test('reports partial saves clearly when a normal API write fails', async () => {
	const f = fixture();
	f.pb.stop = 2;
	await assert.rejects(
		fillEventDemoScores(f.pb, org, event, user),
		/Stopped after saving 2 test scores/
	);
	assert.equal(f.rows.scores.length, 2);
	assert.ok(f.rows.scorecards.every((c) => c.status === 'draft'));
});

test('submits complete cards in round order; retry skips submitted cards and preserves scores', async () => {
	const f = fixture();
	await fillEventDemoScores(f.pb, org, event, user);
	const saved = structuredClone(f.rows.scores);
	f.rows.rounds.reverse();
	assert.deepEqual(await submitEventDemoScorecards(f.pb, org, event, user), {
		submitted: 4,
		skipped: 0
	});
	assert.deepEqual(
		f.writes.filter(([op]) => op === 'submit').map(([, card]) => card.round),
		['r1', 'r1', 'r2', 'r2']
	);
	assert.deepEqual(f.rows.scores, saved);
	assert.deepEqual(await submitEventDemoScorecards(f.pb, org, event, user), {
		submitted: 0,
		skipped: 4
	});
});
test('preflight blocks the entire submission when the last card has missing or invalid scores', async () => {
	for (const scenario of ['missing-score', 'invalid-score', 'missing-card']) {
		const f = fixture();
		await fillEventDemoScores(f.pb, org, event, user);
		if (scenario === 'missing-score') f.rows.scores.pop();
		else if (scenario === 'invalid-score') f.rows.scores.at(-1).strokes = 0;
		else f.rows.scorecards.pop();
		await assert.rejects(
			submitEventDemoScorecards(f.pb, org, event, user),
			/Nothing was submitted/
		);
		assert.equal(f.writes.filter(([op]) => op === 'submit').length, 0);
	}
});
test('submission rejects nonmanagers, wrong organization, disabled scoring and official results', async () => {
	for (const scenario of ['viewer', 'scorekeeper', 'outsider', 'wrong-org', 'disabled', 'result']) {
		const f = fixture();
		await fillEventDemoScores(f.pb, org, event, user);
		if (scenario === 'outsider') f.rows.memberships = [];
		else if (scenario === 'wrong-org') f.rows.events[0].organization = 'anotherorg00001';
		else if (scenario === 'disabled') f.rows.organizations[0].capabilities = [];
		else if (scenario === 'result') f.rows.event_results.push({ status: 'published' });
		else f.rows.memberships[0].role = scenario;
		await assert.rejects(submitEventDemoScorecards(f.pb, org, event, user));
		assert.equal(f.writes.filter(([op]) => op === 'submit').length, 0);
	}
});
test('partial submission failures are explicit and retry skips cards already submitted', async () => {
	const f = fixture();
	await fillEventDemoScores(f.pb, org, event, user);
	f.pb.failSubmit = 2;
	await assert.rejects(
		submitEventDemoScorecards(f.pb, org, event, user),
		/Stopped after submitting 2 scorecards/
	);
	f.pb.failSubmit = 0;
	assert.deepEqual(await submitEventDemoScorecards(f.pb, org, event, user), {
		submitted: 2,
		skipped: 2
	});
});
