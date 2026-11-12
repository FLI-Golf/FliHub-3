import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const hooks = new URL('../pocketbase/pb_hooks/', import.meta.url);
function record(id, values) {
	return {
		id,
		values,
		get: (key) => values[key],
		getString: (key) => String(values[key] ?? ''),
		getBool: (key) => !!values[key],
		set: (key, value) => {
			values[key] = value;
		}
	};
}
function moduleFor(name, extra = {}) {
	const module = { exports: {} };
	vm.runInNewContext(readFileSync(new URL(name, hooks), 'utf8'), {
		module,
		BadRequestError: Error,
		NotFoundError: Error,
		...extra
	});
	return module.exports;
}
function fixture() {
	const rules = moduleFor('fantasy_scoring_rules.js');
	const row = (id, values = {}) => record(id, { organization: 'org', ...values });
	const draft = row('draft', {
		event: 'event',
		league: 'league',
		status: 'complete',
		draftOrder: '["jim","robin"]',
		resolutionRequired: false
	});
	const league = row('league', { season: 'season', name: 'Private league', owner: 'jim' });
	const event = row('event', { season: 'season', status: 'planned', name: 'Golf event' });
	const rounds = [1, 2].map((n) => ({
		round: 'r' + n,
		number: n,
		name: 'Round ' + n,
		par: 3,
		holeCount: 1,
		holes: [{ hole: 'h1', par: 3 }]
	}));
	const snapshot = {
		schemaVersion: 2,
		scoringConvention: 'strokes-minus-par',
		complete: true,
		rounds,
		athletes: []
	};
	const owners = ['jim', 'robin', 'robin', 'jim', 'jim', 'robin', 'robin', 'jim'];
	const tables = {
		users: [row('jim', { name: 'Jim' }), row('robin', { name: 'Robin' })],
		events: [event],
		fantasy_leagues: [league],
		fantasy_drafts: [draft],
		fantasy_members: [
			row('mj', { league: 'league', user: 'jim', status: 'approved' }),
			row('mr', { league: 'league', user: 'robin', status: 'approved' })
		],
		fantasy_picks: [],
		athletes: [],
		substitutions: [],
		event_results: [
			row('result', { event: 'event', status: 'published', currentVersion: 2, publishedVersion: 2 })
		],
		result_versions: [
			row('v2', {
				result: 'result',
				event: 'event',
				version: 2,
				publishedAt: '2026-11-12T18:33:00Z',
				totals: snapshot,
				reason: 'PRIVATE REASON',
				approvedBy: 'PRIVATE AUTHOR'
			})
		]
	};
	for (let i = 1; i <= 8; i++) {
		const id = 'a' + i;
		const gender = [1, 2, 5, 6].includes(i) ? 'male' : 'female';
		tables.athletes.push(row(id, { firstName: 'Athlete', lastName: String(i), gender }));
		tables.fantasy_picks.push(
			row('p' + i, {
				draft: 'draft',
				league: 'league',
				manager: owners[i - 1],
				athlete: id,
				pickNumber: i
			})
		);
		snapshot.athletes.push({
			athlete: id,
			athleteName: 'Athlete ' + i,
			teamName: 'Team',
			total: 6,
			par: 6,
			scoreToPar: 0,
			complete: true,
			roundTotals: { r1: 3, r2: 3 },
			roundPars: { r1: 3, r2: 3 },
			roundToPar: { r1: 0, r2: 0 },
			roundScores: { r1: { h1: 3 }, r2: { h1: 3 } }
		});
	}
	let writes = 0;
	let reads = 0;
	const app = {
		findRecordById: (table, id) => {
			reads++;
			const r = tables[table]?.find((r) => r.id === id);
			if (!r) throw new Error(`Missing ${table} ${id}`);
			return r;
		},
		findRecordsByFilter: (table, filter, _sort, limit, offset, params) => {
			reads++;
			let rows = tables[table] ?? [];
			for (const [key, value] of Object.entries(params ?? {}))
				rows = rows.filter((r) => r.get(key) === value);
			if (filter.includes("status = 'approved'"))
				rows = rows.filter((r) => r.getString('status') === 'approved');
			return rows.slice(offset, offset + limit);
		},
		save: () => {
			writes++;
		},
		runInTransaction: (callback) => callback(app)
	};
	function setScore(id, firstRound) {
		const a = snapshot.athletes.find((a) => a.athlete === id);
		a.roundTotals.r1 = firstRound;
		a.roundScores.r1.h1 = firstRound;
		a.roundToPar.r1 = firstRound - 3;
		a.total = firstRound + 3;
		a.scoreToPar = a.total - 6;
	}
	return {
		tables,
		draft,
		league,
		event,
		snapshot,
		app,
		rules,
		row,
		setScore,
		writes: () => writes,
		reads: () => reads,
		standings: () => rules.buildStandings(app, draft, league, event)
	};
}
test('four athletes sum across all rounds; lowest golf score wins', () => {
	const f = fixture();
	f.setScore('a1', 2);
	f.setScore('a2', 5);
	const out = f.standings();
	assert.equal(out.rows[0].name, 'Jim');
	assert.equal(out.rows[0].score, -1);
	assert.equal(out.rows[0].rank, 1);
	assert.equal(out.rows[1].score, 2);
	assert.equal(out.rows[1].rank, 2);
	assert.equal(out.rows[0].athletes.length, 4);
	assert.equal(out.rows[0].athletes[0].rounds.length, 2);
	assert.equal(out.version, 2);
	assert.equal(f.writes(), 1);
});
test('ties share rank and repeated reads do not write or duplicate points', () => {
	const f = fixture();
	const a = f.standings();
	const b = f.standings();
	assert.equal(a.rows[0].rank, 1);
	assert.equal(a.rows[1].rank, 1);
	assert.equal(a.rows[0].score, 0);
	assert.equal(JSON.stringify(a), JSON.stringify(b));
	assert.equal(f.writes(), 1);
});
test('missing athlete is incomplete and unranked, never zero', () => {
	const f = fixture();
	f.snapshot.athletes = f.snapshot.athletes.filter((a) => a.athlete !== 'a1');
	const row = f.standings().rows.find((r) => r.user === 'jim');
	assert.equal(row.score, null);
	assert.equal(row.rank, null);
	assert.equal(row.scoredAthletes, 3);
});
for (const [name, mutate] of [
	[
		'missing par',
		(a) => {
			delete a.roundPars.r1;
		}
	],
	[
		'missing hole score',
		(a) => {
			delete a.roundScores.r1.h1;
		}
	],
	[
		'invalid stroke',
		(a) => {
			a.roundScores.r1.h1 = 0;
		}
	],
	[
		'inconsistent total',
		(a) => {
			a.total = 100;
		}
	],
	[
		'incorrect relative score',
		(a) => {
			a.scoreToPar = 5;
		}
	],
	[
		'missing round',
		(a) => {
			delete a.roundTotals.r2;
		}
	],
	[
		'incomplete athlete',
		(a) => {
			a.complete = false;
		}
	]
]) {
	test(`${name} stays incomplete`, () => {
		const f = fixture();
		mutate(f.snapshot.athletes[0]);
		assert.equal(f.standings().rows.find((r) => r.user === 'jim').score, null);
	});
}
test('approved unpublished results do not lock rosters or expose scores', () => {
	const f = fixture();
	f.tables.event_results[0].values.publishedVersion = 0;
	const out = f.standings();
	assert.equal(out.state, 'awaiting_results');
	assert.equal(out.rows.length, 0);
	assert.equal(f.writes(), 0);
});
test('legacy snapshot never falls back to current course par', () => {
	const f = fixture();
	delete f.snapshot.schemaVersion;
	assert.equal(f.standings().state, 'legacy_snapshot');
	assert.equal(f.writes(), 0);
});
test('unpublished correction keeps old version; republication replaces the score once', () => {
	const f = fixture();
	f.standings();
	const corrected = structuredClone(f.snapshot);
	corrected.athletes[0].roundScores.r1.h1 = 2;
	corrected.athletes[0].roundTotals.r1 = 2;
	corrected.athletes[0].roundToPar.r1 = -1;
	corrected.athletes[0].total = 5;
	corrected.athletes[0].scoreToPar = -1;
	f.tables.result_versions.push(
		f.row('v3', {
			result: 'result',
			event: 'event',
			version: 3,
			totals: corrected,
			publishedAt: ''
		})
	);
	const result = f.tables.event_results[0];
	result.values.currentVersion = 3;
	result.values.status = 'approved';
	let out = f.standings();
	assert.equal(out.version, 2);
	assert.equal(out.correctionPending, true);
	assert.equal(out.rows[0].score, 0);
	result.values.publishedVersion = 3;
	result.values.status = 'published';
	f.tables.result_versions[1].values.publishedAt = '2026-11-13';
	out = f.standings();
	assert.equal(out.version, 3);
	assert.equal(out.rows[0].score, -1);
	assert.equal(out.correctionPending, false);
	assert.equal(f.writes(), 1);
});
test('roster lock preserves participants, names, picks, and division across later record edits', () => {
	const f = fixture();
	const a = f.standings();
	f.tables.users[0].values.name = 'Changed';
	f.tables.athletes[0].values.gender = 'female';
	f.tables.fantasy_picks[0].values.manager = 'robin';
	const b = f.standings();
	assert.equal(JSON.stringify(a), JSON.stringify(b));
});
for (const [name, mutate] of [
	[
		'unfinished draft',
		(f) => {
			f.draft.values.status = 'active';
		}
	],
	[
		'resolution required',
		(f) => {
			f.draft.values.resolutionRequired = true;
		}
	],
	[
		'missing pick',
		(f) => {
			f.tables.fantasy_picks.pop();
		}
	],
	[
		'duplicate pick number',
		(f) => {
			f.tables.fantasy_picks[1].values.pickNumber = 1;
		}
	],
	[
		'duplicate athlete',
		(f) => {
			f.tables.fantasy_picks[1].values.athlete = 'a1';
		}
	],
	[
		'wrong manager',
		(f) => {
			f.tables.fantasy_picks[0].values.manager = 'robin';
		}
	],
	[
		'wrong league',
		(f) => {
			f.tables.fantasy_picks[0].values.league = 'other';
		}
	],
	[
		'wrong gender balance',
		(f) => {
			f.tables.athletes[0].values.gender = 'female';
		}
	],
	[
		'pending substitute',
		(f) => {
			f.tables.substitutions.push(
				f.row('sub', { event: 'event', athleteOut: 'a1', athleteIn: 'reserve' })
			);
		}
	]
]) {
	test(`${name} blocks scoring without freezing an invalid roster`, () => {
		const f = fixture();
		mutate(f);
		assert.equal(f.standings().state, 'roster_incomplete');
		assert.equal(f.writes(), 0);
	});
}
test('eligible designated substitute supplies the recorded slot score', () => {
	const f = fixture();
	f.tables.athletes.push(
		f.row('reserve', { gender: 'male', firstName: 'Reserve', lastName: 'Athlete' })
	);
	f.tables.substitutions.push(
		f.row('sub', { event: 'event', athleteOut: 'a1', athleteIn: 'reserve' })
	);
	Object.assign(f.tables.fantasy_picks[0].values, {
		substituteAthlete: 'reserve',
		substitution: 'sub',
		substitutedAt: '2026-11-12'
	});
	const replacement = structuredClone(f.snapshot.athletes[0]);
	replacement.athlete = 'reserve';
	replacement.athleteName = 'Reserve Athlete';
	f.snapshot.athletes.push(replacement);
	const slot = f.standings().rows.find((r) => r.user === 'jim').athletes[0];
	assert.equal(slot.name, 'Reserve Athlete');
	assert.equal(slot.originalName, 'Athlete 1');
	assert.equal(slot.score, 0);
});
for (const type of ['active', 'cutoff', 'published', 'saved-lock']) {
	test(`roster mutations blocked by ${type}`, () => {
		const f = fixture();
		f.tables.event_results[0].values.publishedVersion = 0;
		if (type === 'active') f.event.values.status = 'active';
		if (type === 'cutoff') f.event.values.fantasyCutoffAt = '2026-11-12';
		if (type === 'published') f.tables.event_results[0].values.publishedVersion = 2;
		if (type === 'saved-lock') f.draft.values.scoringRosterLockedAt = '2026-11-12';
		assert.throws(() => f.rules.assertRosterMutable(f.app, f.draft), /roster_locked/);
	});
}
test('pre-event unpublished roster remains mutable', () => {
	const f = fixture();
	f.tables.event_results[0].values.publishedVersion = 0;
	assert.doesNotThrow(() => f.rules.assertRosterMutable(f.app, f.draft));
});
function endpoint(f) {
	let route;
	vm.runInNewContext(readFileSync(new URL('flihub_fantasy_scoring.pb.js', hooks), 'utf8'), {
		routerAdd: (_m, _p, fn) => {
			route = fn;
		},
		__hooks: '.',
		require: () => f.rules,
		$apis: { requireAuth: () => null },
		NotFoundError: Error
	});
	return (actor = 'jim', paths = {}) =>
		route({
			app: f.app,
			auth: { id: actor },
			request: {
				pathValue: (key) => ({ org: 'org', league: 'league', draft: 'draft', ...paths })[key]
			},
			response: { header: () => ({ set: () => {} }) },
			json: (_status, value) => value
		});
}
test('ordinary approved fantasy member sees scoring without organization membership', () => {
	const f = fixture();
	assert.equal(endpoint(f)('robin').state, 'published');
});
for (const actor of ['bob', 'outsider']) {
	test(`${actor} cannot read private fantasy standings without a seat`, () => {
		const f = fixture();
		assert.throws(() => endpoint(f)(actor), /not found/);
		assert.equal(f.writes(), 0);
	});
}
for (const status of ['removed', 'invited', 'accepted', 'declined']) {
	test(`${status} member cannot read standings`, () => {
		const f = fixture();
		f.tables.fantasy_members[0].values.status = status;
		assert.throws(() => endpoint(f)(), /not found/);
	});
}
for (const [key, value] of [
	['org', 'foreign'],
	['draft', 'foreign']
]) {
	test(`rejects forged ${key}`, () => {
		const f = fixture();
		assert.throws(() => endpoint(f)('jim', { [key]: value }));
		assert.equal(f.writes(), 0);
	});
}
test('rejects draft rewired to another league or season', () => {
	const f = fixture();
	f.draft.values.league = 'other';
	assert.throws(() => endpoint(f)(), /not found/);
	f.draft.values.league = 'league';
	f.league.values.season = 'other';
	assert.throws(() => endpoint(f)(), /not found/);
});
test('DTO excludes private correction reasons and author identifiers', () => {
	const f = fixture();
	const out = JSON.stringify(endpoint(f)());
	assert.ok(!out.includes('PRIVATE REASON'));
	assert.ok(!out.includes('PRIVATE AUTHOR'));
});
