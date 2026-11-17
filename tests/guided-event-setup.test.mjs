import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(
	new URL('../pocketbase/pb_hooks/guided_event_setup_rules.js', import.meta.url),
	'utf8'
);
const id = (n) => String(n).padStart(15, '0');
const CAPS = [
	'events',
	'athletes',
	'teams',
	'leagues-seasons',
	'venues-courses',
	'scoring-results'
];
class FakeRecord {
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
	const records = [],
		writes = [];
	const add = (table, n, values) => {
		const row = new FakeRecord(table, {
			id: id(n),
			organization: id(1),
			...values
		});
		records.push(row);
		return row;
	};
	add('organizations', 1, { capabilities: JSON.stringify(CAPS) });
	add('memberships', 2, { user: id(3), role: 'owner' });
	add('leagues', 4, { status: 'active' });
	add('seasons', 5, {
		league: id(4),
		status: 'planned',
		startsOn: '2027-03-01',
		endsOn: '2027-05-31'
	});
	add('teams', 6, { status: 'active' });
	add('season_entries', 7, { team: id(6), season: id(5), status: 'active' });
	add('athletes', 8, { status: 'active' });
	add('roster_memberships', 9, {
		entry: id(7),
		athlete: id(8),
		status: 'active'
	});
	add('courses', 10, { status: 'active' });
	for (const n of [11, 12]) {
		add('course_holes', n, { course: id(10), status: 'active' });
		add('hole_positions', n + 10, {
			hole: id(n),
			label: 'Red',
			status: 'active'
		});
		add('hole_positions', n + 20, {
			hole: id(n),
			label: 'Blue',
			status: 'active'
		});
	}
	const matches = (row, filter, params = {}) => {
		if (
			!Object.entries(params).every(
				([key, value]) =>
					row
						.getString({ org: 'organization', user: 'user', start: 'startsAt' }[key] ?? key)
						.replace('T', ' ') === String(value).replace('T', ' ')
			)
		)
			return false;
		return !filter.includes('status = "active"') || row.getString('status') === 'active';
	};
	const app = {
		findRecordById(table, key) {
			const row = records.find((r) => r.table === table && r.id === key);
			if (!row) throw Error('missing');
			return row;
		},
		findFirstRecordByFilter(table, filter, params) {
			const row = records.find((r) => r.table === table && matches(r, filter, params));
			if (!row) throw Error('missing');
			return row;
		},
		findRecordsByFilter(table, filter, sort, limit, offset, params) {
			return records
				.filter((r) => r.table === table && matches(r, filter, params))
				.slice(offset, offset + limit);
		},
		findCollectionByNameOrId(table) {
			return table;
		},
		save(row) {
			if (app.failTable === row.table) throw Error('simulated storage failure');
			if (!row.id) row.id = id(100 + writes.length);
			writes.push(row);
			if (!records.includes(row)) records.push(row);
		},
		runInTransaction(callback) {
			const recordCount = records.length,
				writeCount = writes.length;
			try {
				return callback(app);
			} catch (error) {
				records.length = recordCount;
				writes.length = writeCount;
				throw error;
			}
		}
	};
	const context = vm.createContext({
		module: { exports: {} },
		Record: FakeRecord,
		__hooks: '.',
		require: () =>
			JSON.parse(
				readFileSync(new URL('../pocketbase/pb_hooks/tee_time_zones.json', import.meta.url), 'utf8')
			)
	});
	vm.runInContext(source, context);
	const input = {
		version: 1,
		name: 'Coastal Spring Open',
		season: id(5),
		date: '2027-04-10',
		rounds: ['Red', 'Blue'].map((position) => ({
			name: position,
			course: id(10),
			position,
			holeIds: [id(11), id(12)]
		})),
		groups: [
			{
				name: 'Group 1',
				scorekeeper: id(3),
				entries: [{ entry: id(7), athletes: [id(8)] }]
			}
		]
	};
	const create = (actor = id(3)) =>
		app.runInTransaction(() => context.module.exports.createGuidedEvent(app, id(1), actor, input));
	return {
		app,
		records,
		writes,
		input,
		create,
		parse: context.module.exports.parseGuidedEvent,
		add
	};
}
function rejectsWithoutWrites(f, expression) {
	assert.throws(() => f.create(), expression);
	assert.equal(f.writes.length, 0);
}

test('creates only planned event setup; accepts a two-hole course and one athlete per team', () => {
	const f = fixture();
	f.add('scorecards', 70, { event: id(71), status: 'submitted' });
	const result = f.create();
	assert.equal(result.rounds, 2);
	assert.equal(result.groups, 1);
	assert.deepEqual(
		f.writes.map((row) => row.table),
		['events', 'rounds', 'rounds', 'event_groups', 'group_teams', 'group_athletes']
	);
	assert.equal(f.writes[0].getString('status'), 'planned');
	assert.equal(f.writes[1].getString('positionLabel'), 'Red');
	assert.equal(f.writes[2].getString('positionLabel'), 'Blue');
	assert.equal(f.writes.at(-1).getString('athlete'), id(8));
	assert.equal(f.app.findRecordById('scorecards', id(70)).getString('status'), 'submitted');
});
for (const role of ['viewer', 'scorekeeper'])
	test(`rejects ${role} creators`, () => {
		const f = fixture();
		f.records.find((r) => r.table === 'memberships').set('role', role);
		assert.throws(
			() => f.create(),
			(error) => error.status === 403
		);
		assert.equal(f.writes.length, 0);
	});
test('outsider sees no organization', () => {
	const f = fixture();
	assert.throws(
		() => f.create(id(99)),
		(error) => error.status === 404
	);
});
test('admin can create', () => {
	const f = fixture();
	f.records.find((r) => r.table === 'memberships').set('role', 'admin');
	assert.ok(f.create().eventId);
});
for (const cap of CAPS)
	test(`rejects missing ${cap} capability`, () => {
		const f = fixture();
		f.records[0].set('capabilities', JSON.stringify(CAPS.filter((item) => item !== cap)));
		rejectsWithoutWrites(f, /Enable/);
	});
for (const [table, field, value, message] of [
	['seasons', 'status', 'completed', /planned or active/],
	['seasons', 'organization', id(99), /this organization/],
	['leagues', 'status', 'archived', /league must be active/],
	['courses', 'organization', id(99), /this organization/],
	['courses', 'status', 'archived', /active course/],
	['season_entries', 'season', id(99), /selected season/],
	['season_entries', 'status', 'archived', /active team entries/],
	['teams', 'status', 'archived', /team is archived/],
	['athletes', 'status', 'archived', /athlete is inactive/]
])
	test(`rejects changed ${table}.${field}`, () => {
		const f = fixture();
		f.records.find((r) => r.table === table).set(field, value);
		rejectsWithoutWrites(f, message);
	});
test('rejects date outside season', () => {
	const f = fixture();
	f.input.date = '2028-04-10';
	rejectsWithoutWrites(f, /season dates/);
});
test('rejects incomplete position coverage', () => {
	const f = fixture();
	f.records.find((r) => r.table === 'hole_positions').set('status', 'archived');
	rejectsWithoutWrites(f, /every active course hole/);
});
test('rejects changed course holes', () => {
	const f = fixture();
	f.add('course_holes', 51, { course: id(10), status: 'active' });
	rejectsWithoutWrites(f, /Course holes changed/);
});
test('rejects stale roster instead of silently adding an unreviewed athlete', () => {
	const f = fixture();
	f.add('athletes', 52, { status: 'active' });
	f.add('roster_memberships', 53, {
		entry: id(7),
		athlete: id(52),
		status: 'active'
	});
	rejectsWithoutWrites(f, /roster changed/);
});
test('rejects reserves and arbitrary athlete IDs', () => {
	const f = fixture();
	f.input.groups[0].entries[0].athletes = [id(99)];
	rejectsWithoutWrites(f, /roster changed/);
});
test('rejects a Viewer as group scorekeeper', () => {
	const f = fixture();
	f.add('memberships', 55, { user: id(56), role: 'viewer' });
	f.input.groups[0].scorekeeper = id(56);
	rejectsWithoutWrites(f, /Viewer/);
});
test('rejects repeated event submission', () => {
	const f = fixture();
	f.create();
	const n = f.writes.length;
	assert.throws(() => f.create(), /already exists/);
	assert.equal(f.writes.length, n);
});
test('transaction rolls back all records after a late save failure', () => {
	const f = fixture();
	const n = f.records.length;
	f.app.failTable = 'group_athletes';
	rejectsWithoutWrites(f, /storage failure/);
	assert.equal(f.records.length, n);
});
for (const [label, edit] of [
	['invalid date', (v) => (v.date = '2027-02-30')],
	['wrong version', (v) => (v.version = 2)],
	['empty rounds', (v) => (v.rounds = [])],
	['invalid course ID type', (v) => (v.rounds[0].course = 123)],
	['duplicate holes', (v) => v.rounds[0].holeIds.push(v.rounds[0].holeIds[0])],
	['duplicate team entries', (v) => v.groups[0].entries.push(v.groups[0].entries[0])],
	['duplicate athletes', (v) => v.groups[0].entries[0].athletes.push(id(8))],
	['empty group', (v) => (v.groups[0].entries = [])],
	['missing scorekeeper', (v) => (v.groups[0].scorekeeper = '')],
	[
		'duplicate group names',
		(v) =>
			v.groups.push({
				...v.groups[0],
				entries: [{ entry: id(88), athletes: [id(89)] }]
			})
	]
])
	test(`parser rejects ${label}`, () => {
		const f = fixture();
		edit(f.input);
		assert.throws(() => f.parse(f.input));
	});

test('rejects inconsistent duplicate current roster rows', () => {
	const f = fixture();
	f.add('roster_memberships', 80, {
		entry: id(7),
		athlete: id(8),
		status: 'active'
	});
	f.input.groups[0].entries[0].athletes.push(id(81));
	rejectsWithoutWrites(f, /roster changed/);
});

test('HTTP wrapper preserves validation status when transaction rethrows a wrapped exception', () => {
	let handler;
	const context = vm.createContext({
		routerAdd: (_method, _path, callback) => {
			handler = callback;
		},
		$apis: { requireAuth: () => ({}) },
		__hooks: '.',
		require: () => ({
			createGuidedEvent: () => {
				throw Object.assign(new Error('Denied'), {
					guidedSetupError: true,
					status: 403
				});
			}
		})
	});
	vm.runInContext(
		readFileSync(
			new URL('../pocketbase/pb_hooks/flihub_guided_event_setup.pb.js', import.meta.url),
			'utf8'
		),
		context
	);
	const response = handler({
		request: { pathValue: () => id(1) },
		auth: { id: id(3) },
		requestInfo: () => ({ body: {} }),
		app: {
			runInTransaction: (callback) => {
				try {
					callback({});
				} catch {
					throw new Error('wrapped Go exception');
				}
			}
		},
		json: (status, body) => ({ status, body })
	});
	assert.equal(response.status, 403);
	assert.equal(response.body.message, 'Denied');
});

test('optional venue details are trimmed and saved with the event', () => {
	const f = fixture();
	f.input.venueName = '  Coastal Community Park  ';
	f.input.venueAddress = '  123 Example Lane, San Diego CA  ';
	f.create();
	assert.equal(f.writes[0].getString('venueName'), 'Coastal Community Park');
	assert.equal(f.writes[0].getString('venueAddress'), '123 Example Lane, San Diego CA');
});
test('older wizard requests without venue details still work', () => {
	const f = fixture();
	f.create();
	assert.equal(f.writes[0].getString('venueName'), '');
	assert.equal(f.writes[0].getString('venueAddress'), '');
});
for (const [field, invalid] of [
	['venueName', 'x'.repeat(121)],
	['venueAddress', 'x'.repeat(501)],
	['venueName', {}],
	['venueAddress', null]
])
	test(`rejects invalid ${field} without writes: ${typeof invalid}`, () => {
		const f = fixture();
		f.input[field] = invalid;
		rejectsWithoutWrites(f, /must be text/);
	});
test('venue migration adds optional bounded fields, preserves rules and blocks destructive rollback', () => {
	let up,
		down,
		saved = 0;
	const fields = [];
	const collection = {
		updateRule: 'unchanged owner/admin rule',
		fields: {
			add: (field) => fields.push(field),
			removeByName: (name) =>
				fields.splice(
					fields.findIndex((field) => field.name === name),
					1
				)
		}
	};
	const app = {
		findCollectionByNameOrId: () => collection,
		save: () => saved++,
		findRecordsByFilter: () => []
	};
	vm.runInNewContext(
		readFileSync(
			new URL('../pocketbase/pb_migrations/1794931200_event_venue_details.js', import.meta.url),
			'utf8'
		),
		{
			migrate: (forward, reverse) => {
				up = forward;
				down = reverse;
			},
			TextField: class {
				constructor(value) {
					Object.assign(this, value);
				}
			}
		}
	);
	up(app);
	assert.deepEqual(
		fields.map((field) => [field.name, field.max, Boolean(field.required)]),
		[
			['venueName', 120, false],
			['venueAddress', 500, false]
		]
	);
	assert.equal(collection.updateRule, 'unchanged owner/admin rule');
	app.findRecordsByFilter = () => [{}];
	assert.throws(() => down(app), /rollback is blocked/);
	assert.equal(fields.length, 2);
	app.findRecordsByFilter = () => [];
	down(app);
	assert.equal(fields.length, 0);
	assert.equal(saved, 2);
});

test('multi-day event saves the first day and the complete selected last day', () => {
	const f = fixture();
	f.input.multiDay = true;
	f.input.endDate = '2027-04-12';
	f.create();
	assert.equal(f.writes[0].getString('startsAt'), '2027-04-10T00:00:00.000Z');
	assert.equal(f.writes[0].getString('endsAt'), '2027-04-12T23:59:59.999Z');
});
test('single-day mode ignores an unfinished hidden end date', () => {
	const f = fixture();
	f.input.multiDay = false;
	f.input.endDate = '2028-99-99';
	f.create();
	assert.equal(f.writes[0].getString('endsAt'), '');
});
test('older single-day requests omit both new inputs and keep no end date', () => {
	const f = fixture();
	f.create();
	assert.equal(f.writes[0].getString('endsAt'), '');
});
for (const [label, values, message] of [
	['missing end', { multiDay: true }, /valid end date/],
	['same day', { multiDay: true, endDate: '2027-04-10' }, /after the start/],
	['earlier end', { multiDay: true, endDate: '2027-04-09' }, /after the start/],
	['impossible date', { multiDay: true, endDate: '2027-04-31' }, /valid end date/],
	['outside season', { multiDay: true, endDate: '2027-06-01' }, /end date must fall within/],
	['nonboolean flag', { multiDay: 'true', endDate: '2027-04-12' }, /boolean/]
])
	test(`multi-day validation rejects ${label} without saving`, () => {
		const f = fixture();
		Object.assign(f.input, values);
		rejectsWithoutWrites(f, message);
	});
test('multi-day event may end on the last day of the season', () => {
	const f = fixture();
	f.input.multiDay = true;
	f.input.endDate = '2027-05-31';
	f.create();
	assert.equal(f.writes[0].getString('endsAt'), '2027-05-31T23:59:59.999Z');
});

test('tee schedules use the saved group IDs and configured interval on every round', () => {
	const f = fixture();
	f.add('teams', 91, { status: 'active' });
	f.add('season_entries', 92, { team: id(91), season: id(5), status: 'active' });
	f.add('athletes', 93, { status: 'active' });
	f.add('roster_memberships', 94, { entry: id(92), athlete: id(93), status: 'active' });
	f.input.groups.push({
		name: 'Group 2',
		scorekeeper: id(3),
		entries: [{ entry: id(92), athletes: [id(93)] }]
	});
	f.input.teeTimeZone = 'America/Los_Angeles';
	f.input.teeIntervalMinutes = 10;
	f.input.rounds[0].teeStartsAt = '2027-04-10T16:00:00.000Z';
	f.input.rounds[1].teeStartsAt = '2027-04-10T19:00:00.000Z';
	f.create();
	const rounds = f.records.filter((row) => row.table === 'rounds');
	const groups = f.records.filter((row) => row.table === 'event_groups');
	assert.equal(rounds.length, 2);
	assert.equal(rounds[0].get('teeSchedule').timeZone, 'America/Los_Angeles');
	assert.equal(rounds[0].get('teeSchedule').slots[0].group, groups[0].id);
	assert.equal(rounds[0].get('teeSchedule').slots[1].group, groups[1].id);
	assert.equal(rounds[0].get('teeSchedule').slots[1].startsAt, '2027-04-10T16:10:00.000Z');
	assert.equal(rounds[1].get('teeSchedule').slots[1].startsAt, '2027-04-10T19:10:00.000Z');
});
for (const [label, change] of [
	['invalid timezone', (v) => (v.teeTimeZone = 'Invalid/Nowhere')],
	['invalid interval', (v) => (v.teeIntervalMinutes = 0)],
	['missing first time', (v) => delete v.rounds[0].teeStartsAt],
	['reversed rounds', (v) => (v.rounds[1].teeStartsAt = v.rounds[0].teeStartsAt)]
])
	test(`tee setup rejects ${label} without writes`, () => {
		const f = fixture();
		f.input.teeTimeZone = 'UTC';
		f.input.rounds[0].teeStartsAt = '2027-04-10T09:00:00.000Z';
		f.input.rounds[1].teeStartsAt = '2027-04-10T12:00:00.000Z';
		change(f.input);
		assert.throws(() => f.create());
		assert.equal(f.writes.length, 0);
	});

test('a late tee schedule save failure rolls back the entire new event setup', () => {
	const f = fixture();
	f.input.teeTimeZone = 'UTC';
	f.input.rounds[0].teeStartsAt = '2027-04-10T09:00:00.000Z';
	f.input.rounds[1].teeStartsAt = '2027-04-10T12:00:00.000Z';
	const originalSave = f.app.save.bind(f.app);
	f.app.save = (row) => {
		if (row.get('teeSchedule')) throw Error('schedule save failed');
		return originalSave(row);
	};
	rejectsWithoutWrites(f, /schedule save failed/);
	assert.equal(
		f.records.some((row) => row.table === 'events'),
		false
	);
});
