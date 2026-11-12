import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const hooks = new URL('../pocketbase/pb_hooks/', import.meta.url);
function record(id, values = {}) {
	return {
		id,
		values,
		get: (key) => values[key],
		getString: (key) => String(values[key] ?? ''),
		set: (key, value) => {
			values[key] = value;
		}
	};
}
function fixture(holeCount = 9) {
	const org = 'org';
	const row = (id, values) => record(id, { organization: org, ...values });
	const tables = {
		events: [row('event', { season: 'season' })],
		organizations: [row(org, { capabilities: '["scoring-results"]' })],
		courses: [row('course')],
		rounds: [
			row('r1', {
				event: 'event',
				status: 'active',
				course: 'course',
				number: 1
			}),
			row('r2', {
				event: 'event',
				status: 'active',
				course: 'course',
				number: 2
			})
		],
		event_groups: [row('group', { event: 'event', status: 'active' })],
		course_holes: Array.from({ length: holeCount }, (_, i) =>
			row('h' + (i + 1), {
				course: 'course',
				status: 'active',
				number: i + 1,
				name: 'Hole ' + (i + 1),
				par: 3
			})
		),
		athletes: [row('athlete', { firstName: 'Test', lastName: 'Athlete' })],
		season_entries: [row('entry', { season: 'season', team: 'team' })],
		teams: [row('team', { name: 'Team' })],
		group_athletes: [
			row('assignment', {
				event: 'event',
				group: 'group',
				status: 'active',
				entry: 'entry',
				athlete: 'athlete'
			})
		],
		scorecards: ['r1', 'r2'].map((round) =>
			row('card-' + round, {
				event: 'event',
				group: 'group',
				round,
				status: 'submitted'
			})
		),
		scores: ['r1', 'r2'].flatMap((round) =>
			Array.from({ length: holeCount }, (_, i) =>
				row(round + '-score-' + i, {
					event: 'event',
					group: 'group',
					round,
					scorecard: 'card-' + round,
					entry: 'entry',
					athlete: 'athlete',
					hole: 'h' + (i + 1),
					strokes: 3
				})
			)
		)
	};
	const queries = [];
	const app = {
		findRecordById: (table, id) => {
			const r = tables[table]?.find((v) => v.id === id);
			if (!r) throw new Error(`Missing ${table} ${id}`);
			return r;
		},
		findRecordsByFilter: (table, filter, sort, limit, offset, params) => {
			queries.push({ table, limit, offset });
			let rows = tables[table] ?? [];
			for (const [key, value] of Object.entries(params))
				rows = rows.filter((r) => r.getString(key) === value);
			if (filter.includes("status = 'active'"))
				rows = rows.filter((r) => r.getString('status') === 'active');
			assert.equal(sort, 'id');
			return rows
				.slice()
				.sort((a, b) => a.id.localeCompare(b.id))
				.slice(offset, offset + limit);
		}
	};
	const module = { exports: {} };
	vm.runInNewContext(readFileSync(new URL('result_snapshot_rules.js', hooks), 'utf8'), {
		module,
		BadRequestError: Error
	});
	return {
		tables,
		app,
		queries,
		compute: () => module.exports.computeEventTotals(app, 'event'),
		rules: module.exports,
		row
	};
}

for (const holes of [9, 18]) {
	test(`${holes}-hole passes snapshot all required pars and scores`, () => {
		const f = fixture(holes);
		const out = f.compute();
		const a = out.athletes[0];
		assert.equal(out.schemaVersion, 2);
		assert.equal(out.scoringConvention, 'strokes-minus-par');
		assert.equal(a.total, holes * 6);
		assert.equal(a.par, holes * 6);
		assert.equal(a.scoreToPar, 0);
		assert.equal(a.roundPars.r1, holes * 3);
		assert.equal(out.rounds[0].holes.length, holes);
		assert.equal(Object.keys(a.roundScores.r1).length, holes);
		assert.equal(out.teams[0].total, a.total);
	});
}
test('under and over par retain the golf sign', () => {
	const f = fixture();
	f.tables.scores[0].values.strokes = 2;
	assert.equal(f.compute().athletes[0].scoreToPar, -1);
	f.tables.scores[0].values.strokes = 5;
	assert.equal(f.compute().athletes[0].scoreToPar, 2);
});
test('saved snapshot remains stable after course and stroke edits', () => {
	const f = fixture();
	const saved = f.compute();
	f.tables.course_holes[0].values.par = 5;
	f.tables.scores[0].values.strokes = 7;
	assert.equal(saved.rounds[0].holes[0].par, 3);
	assert.equal(saved.athletes[0].roundScores.r1.h1, 3);
	assert.equal(saved.athletes[0].scoreToPar, 0);
});
const invalid = [
	['missing score', (f) => f.tables.scores.pop()],
	[
		'no scores',
		(f) => {
			f.tables.scores = [];
		}
	],
	[
		'unsubmitted card',
		(f) => {
			f.tables.scorecards[0].values.status = 'draft';
		}
	],
	['missing card', (f) => f.tables.scorecards.pop()],
	[
		'duplicate card',
		(f) => f.tables.scorecards.push(f.row('duplicate-card', { ...f.tables.scorecards[0].values }))
	],
	[
		'no rounds',
		(f) => {
			f.tables.rounds = [];
		}
	],
	[
		'no groups',
		(f) => {
			f.tables.event_groups = [];
		}
	],
	[
		'courseless round',
		(f) => {
			f.tables.rounds[0].values.course = '';
		}
	],
	[
		'no holes',
		(f) => {
			f.tables.course_holes = [];
		}
	],
	[
		'empty group',
		(f) => {
			f.tables.group_athletes = [];
		}
	],
	[
		'duplicate athlete',
		(f) =>
			f.tables.group_athletes.push(
				f.row('duplicate-assignment', { ...f.tables.group_athletes[0].values })
			)
	],
	[
		'duplicate cell',
		(f) => f.tables.scores.push(f.row('duplicate-score', { ...f.tables.scores[0].values }))
	],
	[
		'wrong scorecard',
		(f) => {
			f.tables.scores[0].values.scorecard = 'card-r2';
		}
	],
	[
		'wrong entry',
		(f) => {
			f.tables.scores[0].values.entry = 'other';
		}
	],
	[
		'wrong athlete',
		(f) => {
			f.tables.scores[0].values.athlete = 'other';
		}
	],
	[
		'wrong hole',
		(f) => {
			f.tables.scores[0].values.hole = 'other';
		}
	],
	[
		'foreign score',
		(f) => {
			f.tables.scores[0].values.organization = 'other';
		}
	],
	[
		'foreign course',
		(f) => {
			f.tables.courses[0].values.organization = 'other';
		}
	],
	[
		'foreign athlete',
		(f) => {
			f.tables.athletes[0].values.organization = 'other';
		}
	],
	[
		'wrong season',
		(f) => {
			f.tables.season_entries[0].values.season = 'other';
		}
	],
	[
		'duplicate hole numbers',
		(f) => {
			f.tables.course_holes[1].values.number = 1;
		}
	]
];
for (const [label, mutate] of invalid) {
	test(`blocks ${label}`, () => {
		const f = fixture();
		mutate(f);
		assert.throws(f.compute, /approval_blocked/);
	});
}
for (const value of [0, -1, 1.5, null, '', '3', NaN, Infinity]) {
	test(`rejects invalid strokes ${String(value)}`, () => {
		const f = fixture();
		f.tables.scores[0].values.strokes = value;
		assert.throws(f.compute, /positive integer/);
	});
	test(`rejects invalid par ${String(value)}`, () => {
		const f = fixture();
		f.tables.course_holes[0].values.par = value;
		assert.throws(f.compute, /positive integer/);
	});
}
test('paginates scores beyond one page without dropping cells', () => {
	const f = fixture(251);
	const out = f.compute();
	assert.equal(out.athletes[0].total, 1506);
	assert.ok(f.queries.some((q) => q.table === 'scores' && q.offset === 500));
});
test('does not include retired round scores', () => {
	const f = fixture();
	f.tables.scores.push(
		f.row('old', {
			...f.tables.scores[0].values,
			round: 'retired',
			strokes: 99
		})
	);
	assert.equal(f.compute().athletes[0].total, 54);
});

for (const correction of [false, true]) {
	test(`${correction ? 'correction reapproval' : 'initial approval'} uses the validated shared snapshot`, () => {
		const f = fixture();
		let createHandler;
		let updateHandler;
		const saved = [];
		const app = {
			...f.app,
			findCollectionByNameOrId: (name) => name,
			save: (r) => saved.push(r)
		};
		function FakeRecord(collection) {
			Object.assign(this, record(collection));
		}
		vm.runInNewContext(readFileSync(new URL('flihub_results.pb.js', hooks), 'utf8'), {
			onRecordCreateRequest: (fn) => {
				createHandler = fn;
			},
			onRecordUpdateRequest: (fn) => {
				updateHandler = fn;
			},
			__hooks: '.',
			require: () => f.rules,
			Record: FakeRecord,
			BadRequestError: Error
		});
		const result = f.row('result', {
			event: 'event',
			status: correction ? 'approved' : '',
			currentVersion: 99,
			publishedVersion: 99
		});
		result.original = () =>
			f.row('result', {
				event: 'event',
				status: 'correcting',
				currentVersion: 1,
				publishedVersion: 1,
				pendingReason: 'Correction'
			});
		(correction ? updateHandler : createHandler)({
			app,
			record: result,
			auth: { id: 'bob' },
			next: () => {},
			requestInfo: () => ({ body: {} })
		});
		const version = saved.find((r) => r.id === 'result_versions');
		assert.equal(version.values.totals.schemaVersion, 2);
		assert.equal(version.values.totals.athletes[0].par, 54);
		assert.equal(version.values.version, correction ? 2 : 1);
		assert.equal(result.values.publishedVersion, correction ? 1 : 0);
	});
	test(`${correction ? 'correction' : 'initial approval'} rejects missing cells before saving`, () => {
		const f = fixture();
		f.tables.scores.pop();
		let handler;
		let writes = 0;
		vm.runInNewContext(readFileSync(new URL('flihub_results.pb.js', hooks), 'utf8'), {
			onRecordCreateRequest: (fn) => {
				if (!correction) handler = fn;
			},
			onRecordUpdateRequest: (fn) => {
				if (correction) handler = fn;
			},
			__hooks: '.',
			require: () => f.rules,
			BadRequestError: Error
		});
		const r = f.row('result', { event: 'event', status: 'approved' });
		r.original = () =>
			f.row('result', {
				event: 'event',
				status: 'correcting',
				currentVersion: 1,
				publishedVersion: 1
			});
		assert.throws(
			() =>
				handler({
					app: f.app,
					record: r,
					auth: { id: 'bob' },
					next: () => {
						writes++;
					}
				}),
			/Missing required/
		);
		assert.equal(writes, 0);
	});
}

test('missing-card error preserves the completeness count', () => {
	const f = fixture();
	f.tables.scorecards = [];
	assert.throws(f.compute, /2 of 2 scorecards are not submitted/);
});

test('draft and absent cards both count as incomplete', () => {
	const f = fixture();
	f.tables.scorecards[0].values.status = 'draft';
	assert.throws(f.compute, /1 of 2 scorecards are not submitted/);
	f.tables.scorecards.pop();
	assert.throws(f.compute, /2 of 2 scorecards are not submitted/);
});
