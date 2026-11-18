import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { shuffled } from '../src/lib/event-setup/shuffle.ts';
const code = readFileSync(
	new URL('../pocketbase/pb_hooks/test_event_group_rules.js', import.meta.url),
	'utf8'
);
const id = (n) => String(n).padStart(15, '0');
class Row {
	constructor(table, values = {}) {
		this.table = table;
		this.values = values;
		this.id = values.id;
	}
	get(key) {
		return this.values[key];
	}
	getString(key) {
		return String(this.values[key] ?? '');
	}
	set(key, value) {
		this.values[key] = value;
	}
}
function fixture() {
	let serial = 100;
	const records = [],
		writes = [];
	const add = (table, values, number = serial++) => {
		const row = new Row(table, { organization: id(1), id: id(number), ...values });
		records.push(row);
		return row;
	};
	add(
		'organizations',
		{ capabilities: JSON.stringify(['events', 'teams', 'athletes', 'leagues-seasons']) },
		1
	);
	add('memberships', { user: id(2), role: 'owner' }, 9);
	add('events', { season: id(5), status: 'planned' }, 3);
	add('leagues', { status: 'active' }, 4);
	add('seasons', { league: id(4), status: 'planned' }, 5);
	add('event_groups', { event: id(3), name: 'Group 1', status: 'active', scorekeeper: id(2) }, 6);
	for (const number of [1, 2])
		add(
			'rounds',
			{
				event: id(3),
				number,
				status: 'active',
				teeSchedule: {
					timeZone: 'America/Los_Angeles',
					intervalMinutes: 10,
					slots: [
						{
							group: id(6),
							startsAt: number === 1 ? '2027-03-13T17:00:00.000Z' : '2027-03-13T20:00:00.000Z'
						}
					]
				}
			},
			number + 6
		);
	for (let n = 0; n < 12; n++) {
		const team = add('teams', { name: `Team ${n}`, status: 'active' });
		const entry = add('season_entries', { season: id(5), team: team.id, status: 'active' });
		if (!n) add('group_teams', { event: id(3), group: id(6), entry: entry.id, status: 'active' });
		for (const gender of ['male', 'female']) {
			const athlete = add('athletes', { gender, status: 'active' });
			add('roster_memberships', { entry: entry.id, athlete: athlete.id, status: 'active' });
			if (!n)
				add('group_athletes', {
					event: id(3),
					group: id(6),
					entry: entry.id,
					athlete: athlete.id,
					status: 'active'
				});
		}
	}
	const matches = (row, filter, params = {}) =>
		Object.entries(params).every(
			([key, value]) => row.getString({ org: 'organization' }[key] ?? key) === value
		) &&
		(!filter.includes('status = "active"') || row.getString('status') === 'active');
	const app = {
		findRecordById(table, key) {
			const row = records.find((item) => item.table === table && item.id === key);
			if (!row) throw Error('missing');
			return row;
		},
		findFirstRecordByFilter(table, filter, params) {
			const row = records.find((item) => item.table === table && matches(item, filter, params));
			if (!row) throw Error('missing');
			return row;
		},
		findRecordsByFilter(table, filter, sort, limit, offset, params) {
			return records
				.filter((item) => item.table === table && matches(item, filter, params))
				.slice(offset, offset + limit);
		},
		findCollectionByNameOrId(table) {
			return table;
		},
		save(row) {
			if (app.failTable === row.table) throw Error('storage failed');
			if (!row.id) {
				row.id = id(serial++);
				records.push(row);
			}
			writes.push(row);
		},
		runInTransaction(callback) {
			const original = [...records],
				snapshots = original.map((row) => structuredClone(row.values));
			try {
				return callback(app);
			} catch (error) {
				records.splice(0, records.length, ...original);
				original.forEach((row, index) => (row.values = snapshots[index]));
				writes.length = 0;
				throw error;
			}
		}
	};
	const context = vm.createContext({ module: { exports: {} }, Record: Row });
	vm.runInContext(code, context);
	const run = (actor = id(2)) =>
		app.runInTransaction(() =>
			context.module.exports.randomizeEventGroups(app, id(3), actor, () => 0)
		);
	const active = (table) =>
		records.filter((row) => row.table === table && row.getString('status') === 'active');
	return { app, records, writes, add, run, active };
}
test('uses all twelve season teams and twenty-four roster athletes without creating identities', () => {
	const f = fixture();
	const result = f.run();
	assert.equal(result.groups, 6);
	assert.equal(result.teams, 12);
	assert.equal(result.athletes, 24);
	assert.equal(result.males, 12);
	assert.equal(result.females, 12);
	assert.equal(f.active('event_groups').length, 6);
	assert.equal(f.active('group_teams').length, 12);
	assert.equal(f.active('group_athletes').length, 24);
	assert.equal(f.records.filter((row) => row.table === 'athletes').length, 24);
	assert.equal(
		f.records.filter(
			(row) => row.table === 'group_athletes' && row.getString('status') === 'archived'
		).length,
		2
	);
	for (const group of f.active('event_groups')) {
		assert.equal(group.getString('scorekeeper'), id(2));
		assert.equal(
			f.active('group_teams').filter((row) => row.getString('group') === group.id).length,
			2
		);
	}
});
test('keeps first tee times/intervals and expands schedules using valid group IDs', () => {
	const f = fixture();
	f.run();
	const rounds = f.active('rounds');
	assert.equal(rounds[0].get('teeSchedule').slots.length, 6);
	assert.equal(rounds[0].get('teeSchedule').slots[5].startsAt, '2027-03-13T17:50:00.000Z');
	assert.equal(rounds[1].get('teeSchedule').slots[0].startsAt, '2027-03-13T20:00:00.000Z');
	for (const slot of rounds[0].get('teeSchedule').slots)
		assert.ok(f.active('event_groups').some((group) => group.id === slot.group));
});
test('repeated shuffles reuse group slots instead of multiplying active groups', () => {
	const f = fixture();
	f.run();
	f.run();
	assert.equal(f.active('event_groups').length, 6);
	assert.equal(f.records.filter((row) => row.table === 'event_groups').length, 6);
	assert.equal(f.active('group_athletes').length, 24);
});
for (const table of ['scorecards', 'scores', 'event_results', 'fantasy_drafts', 'substitutions'])
	test(`locks before changing anything when ${table} exist`, () => {
		const f = fixture();
		f.add(table, { event: id(3), status: 'draft' });
		assert.throws(() => f.run(), /locked/);
		assert.equal(f.writes.length, 0);
	});
for (const role of ['scorekeeper', 'viewer'])
	test(`rejects ${role}`, () => {
		const f = fixture();
		f.records.find((row) => row.table === 'memberships').set('role', role);
		assert.throws(
			() => f.run(),
			(error) => error.status === 403
		);
	});
test('rejects outsiders without revealing event setup', () => {
	const f = fixture();
	assert.throws(
		() => f.run(id(99)),
		(error) => error.status === 404
	);
});
test('rejects missing capabilities', () => {
	const f = fixture();
	f.records[0].set('capabilities', '[]');
	assert.throws(() => f.run(), /Enable/);
	assert.equal(f.writes.length, 0);
});
test('rejects cross-organization athletes', () => {
	const f = fixture();
	f.records.find((row) => row.table === 'athletes').set('organization', id(99));
	assert.throws(() => f.run(), /this organization/);
	assert.equal(f.writes.length, 0);
});
test('rejects missing roster before archiving existing assignments', () => {
	const f = fixture();
	f.records.find((row) => row.table === 'roster_memberships').set('status', 'archived');
	f.records.filter((row) => row.table === 'roster_memberships')[1].set('status', 'archived');
	assert.throws(() => f.run(), /active roster/);
	assert.equal(f.writes.length, 0);
});
test('rejects overlapping expanded round schedules', () => {
	const f = fixture();
	f.active('rounds')[1].get('teeSchedule').slots[0].startsAt = '2027-03-13T17:10:00.000Z';
	assert.throws(() => f.run(), /Space the round starts/);
	assert.equal(f.writes.length, 0);
});
test('transaction rolls back existing assignments and new records on a late failure', () => {
	const f = fixture();
	const before = JSON.stringify(f.records.map((row) => [row.table, row.id, row.values]));
	f.app.failTable = 'group_athletes';
	assert.throws(() => f.run(), /storage failed/);
	assert.equal(JSON.stringify(f.records.map((row) => [row.table, row.id, row.values])), before);
});
test('wizard shuffle returns a new permutation without mutating the selected team list', () => {
	const input = ['a', 'b', 'c', 'd'];
	const output = shuffled(input, () => 0);
	assert.deepEqual([...output].sort(), input);
	assert.notDeepEqual(output, input);
	assert.deepEqual(input, ['a', 'b', 'c', 'd']);
});
test('production/demo gate rejects before loading grouping code', () => {
	let handler,
		loaded = false;
	vm.runInNewContext(
		readFileSync(
			new URL('../pocketbase/pb_hooks/flihub_test_event_groups.pb.js', import.meta.url),
			'utf8'
		),
		{
			routerAdd: (_method, _path, callback) => (handler = callback),
			$os: { getenv: () => '' },
			$apis: { requireAuth: () => ({}) },
			ForbiddenError: Error,
			require: () => (loaded = true)
		}
	);
	assert.throws(() => handler({}), /disabled/);
	assert.equal(loaded, false);
});
test('admin can build groups before any workflow starts', () => {
	const f = fixture();
	f.records.find((row) => row.table === 'memberships').set('role', 'admin');
	assert.equal(f.run().groups, 6);
});
test('archived events cannot be used for test regrouping', () => {
	const f = fixture();
	f.records.find((row) => row.table === 'events').set('status', 'archived');
	assert.throws(() => f.run(), /planned/);
	assert.equal(f.writes.length, 0);
});
test('a failed schedule save restores all prior setup records', () => {
	const f = fixture();
	const before = JSON.stringify(f.records.map((row) => [row.table, row.id, row.values]));
	f.app.failTable = 'rounds';
	assert.throws(() => f.run(), /storage failed/);
	assert.equal(JSON.stringify(f.records.map((row) => [row.table, row.id, row.values])), before);
});
test('unrostered reserve identities do not enlarge the event pool', () => {
	const f = fixture();
	f.add('athletes', { gender: 'male', status: 'active' });
	assert.equal(f.run().athletes, 24);
});
