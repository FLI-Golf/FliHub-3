import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rulesModule = { exports: {} };
vm.runInNewContext(read('../pocketbase/pb_hooks/league_season_setup_rules.js'), {
	module: rulesModule
});
const { validateLeagueSeasonSetup } = rulesModule.exports;
const body = {
	mode: 'new',
	leagueName: 'Coastal League',
	seasonName: 'Spring 2027',
	startsOn: '2027-03-01',
	endsOn: '2027-05-31',
	purseAmount: ''
};
test('valid setup keeps calendar dates and blank purse semantics', () => {
	const parsed = validateLeagueSeasonSetup(body);
	assert.equal(parsed.ok, true);
	assert.equal(parsed.value.startsOn, '2027-03-01');
	assert.equal(parsed.value.purseAmountCents, 0);
	assert.equal(parsed.value.purseCurrency, '');
});
for (const invalid of [
	{ mode: '' },
	{ leagueName: '' },
	{ seasonName: '' },
	{ seasonName: 'x'.repeat(121) },
	{ startsOn: '2027-02-30' },
	{ endsOn: '2026-05-31' },
	{ purseAmount: '-1' },
	{ purseAmount: '1,000' },
	{ purseAmount: '1.001' },
	{ purseAmount: '90071992547410.00' },
	{ purseAmount: {} },
	{ mode: 'existing', leagueId: 'forged' }
]) {
	test(`rejects invalid setup ${JSON.stringify(invalid)}`, () =>
		assert.equal(validateLeagueSeasonSetup({ ...body, ...invalid }).ok, false));
}
test('money parsing uses exact integer cents and distinguishes zero from blank', () => {
	assert.equal(
		validateLeagueSeasonSetup({ ...body, purseAmount: '10.01' }).value.purseAmountCents,
		1001
	);
	assert.equal(validateLeagueSeasonSetup({ ...body, purseAmount: '0' }).value.purseCurrency, 'USD');
});

function endpoint(options = {}) {
	let handler;
	let serial = 0;
	let rows = [];
	const calls = [];
	class Record {
		constructor(table) {
			this.table = table;
			this.values = {};
			this.id = 'record' + String(++serial).padStart(9, '0');
		}
		set(key, value) {
			this.values[key] = value;
		}
		getString(key) {
			return String(this.values[key] ?? '');
		}
	}
	class HttpError extends Error {}
	const app = {
		findFirstRecordByFilter: (_table, _filter, params) => {
			calls.push(params);
			if (options.outsider) throw new Error('no membership');
			return { getString: () => options.role ?? 'owner' };
		},
		findRecordById: (table) =>
			table === 'organizations'
				? { get: () => JSON.stringify(options.disabled ? [] : ['leagues-seasons']) }
				: {
						id: 'existing1234567',
						getString: (key) =>
							({
								organization: options.foreign ? 'foreign12345678' : 'organization123',
								status: options.archived ? 'archived' : 'active',
								name: 'Existing'
							})[key]
					},
		findCollectionByNameOrId: (name) => name,
		save: (record) => {
			if (options.failSeason && record.table === 'seasons') throw new Error('season save failed');
			rows.push(record);
		},
		runInTransaction: (callback) => {
			const before = [...rows];
			try {
				callback(app);
			} catch (err) {
				rows = before;
				throw err;
			}
		}
	};
	vm.runInNewContext(read('../pocketbase/pb_hooks/flihub_league_season_setup.pb.js'), {
		routerAdd: (_method, _path, callback) => {
			handler = callback;
		},
		$apis: { requireAuth: () => true },
		__hooks: '/hooks',
		require: () => rulesModule.exports,
		Record,
		NotFoundError: HttpError,
		ForbiddenError: HttpError,
		BadRequestError: HttpError
	});
	return {
		rows: () => rows,
		calls,
		invoke: (input = body) =>
			handler({
				app,
				auth: { id: 'owner' },
				request: { pathValue: () => 'organization123' },
				requestInfo: () => ({ body: input }),
				json: (status, data) => ({ status, data })
			})
	};
}
test('new league and season are saved with derived organization, status, and no fantasy enrollment', () => {
	const fixture = endpoint();
	assert.equal(fixture.invoke().status, 200);
	const [league, season] = fixture.rows();
	assert.equal(league.table, 'leagues');
	assert.equal(season.table, 'seasons');
	assert.equal(season.values.league, league.id);
	assert.equal(season.values.organization, 'organization123');
	assert.equal(season.values.status, 'planned');
	assert.equal(season.values.fantasyEnabled, false);
	assert.equal(season.values.startsOn, '2027-03-01 00:00:00.000Z');
});
test('second-save failure propagates and transaction leaves no orphan league', () => {
	const fixture = endpoint({ failSeason: true });
	assert.throws(() => fixture.invoke(), /season save failed/);
	assert.equal(fixture.rows().length, 0);
});
for (const options of [
	{ role: 'viewer' },
	{ role: 'scorekeeper' },
	{ outsider: true },
	{ disabled: true }
]) {
	test(`unauthorized or disabled setup does not write ${JSON.stringify(options)}`, () => {
		const fixture = endpoint(options);
		assert.throws(() => fixture.invoke());
		assert.equal(fixture.rows().length, 0);
	});
}
for (const options of [{ foreign: true }, { archived: true }]) {
	test(`existing league must be active and same-organization ${JSON.stringify(options)}`, () => {
		const fixture = endpoint(options);
		assert.throws(() => fixture.invoke({ ...body, mode: 'existing', leagueId: 'existing1234567' }));
		assert.equal(fixture.rows().length, 0);
	});
}
test('existing-league flow creates only a season', () => {
	const fixture = endpoint({ role: 'admin' });
	assert.equal(
		fixture.invoke({ ...body, mode: 'existing', leagueId: 'existing1234567' }).status,
		200
	);
	assert.equal(fixture.rows().length, 1);
	assert.equal(fixture.rows()[0].table, 'seasons');
});
