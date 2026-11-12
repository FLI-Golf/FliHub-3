import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const root = new URL('../pocketbase/pb_hooks/', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const module = { exports: {} };
vm.runInNewContext(read('fantasy_discovery_rules.js'), { module });
const rules = module.exports;
function record(id, values) {
 return { id, getString: (key) => String(values[key] ?? ''), getBool: (key) => Boolean(values[key]), get: (key) => values[key], set: (key, value) => { values[key] = value; }, values };
}
function fixture() {
 const org = record('org', { publicPublished: true, publicSlug: 'my-club', capabilities: '["fantasy"]', name: 'Club' });
 const sports = record('sports', { organization: 'org', status: 'active', name: 'FLI Golf' });
 const season = record('season', { organization: 'org', league: 'sports', status: 'planned', fantasyEnabled: true, name: 'Stage 1' });
 const rows = { organizations: org, leagues: sports, seasons: season };
 const saved = [];
 const app = {
  findRecordById: (table, id) => { const row = rows[table]; if (!row || row.id !== id) throw new Error('missing'); return row; },
  findRecordsByFilter: (table) => table === 'seasons' ? [season] : [],
  findFirstRecordByFilter: () => { throw new Error('no staff membership'); },
  findCollectionByNameOrId: (name) => ({ name }),
  save: (row) => { row.id ||= `new${saved.length}`; saved.push(row); },
  runInTransaction: (callback) => callback(app)
 };
 return { org, sports, season, rows, app, saved };
}
const routes = new Map();
vm.runInNewContext(read('flihub_fantasy.pb.js'), {
 routerAdd: (method, path, handler) => routes.set(`${method} ${path}`, handler),
 $os: { getenv: () => '' }, $apis: { requireAuth: () => null }, __hooks: '.', require: (path) => path.includes('discovery') ? rules : {},
 BadRequestError: Error,
 Record: function(collection) { return Object.assign(record('', {}), { table: collection.name }); }
});
const create = routes.get('POST /api/flihub/fantasy/leagues');
function event(f, body) { return { app: f.app, auth: { id: 'jim' }, requestInfo: () => ({ body }), json: (status, data) => ({ status, data }) }; }

test('published open season is eligible', () => { const f = fixture(); assert.equal(rules.eligible(f.app, 'season').org.id, 'org'); });
for (const [table, key, value] of [
 ['org', 'publicPublished', false], ['org', 'publicSlug', ''], ['org', 'capabilities', '[]'],
 ['org', 'capabilities', 'invalid'], ['season', 'fantasyEnabled', false], ['season', 'status', 'archived'],
 ['season', 'status', 'completed'], ['sports', 'status', 'archived'], ['sports', 'organization', 'other']
]) {
 test(`rejects ${table}.${key}=${value}`, () => { const f = fixture(); f[table].values[key] = value; assert.throws(() => rules.eligible(f.app, 'season')); });
}
test('fan creation saves season and commissioner seat without staff membership', () => {
 const f = fixture();
 assert.equal(create(event(f, { organization: 'org', season: 'season', name: 'Jim League' })).status, 200);
 assert.equal(f.saved.length, 2);
 assert.equal(f.saved[0].table, 'fantasy_leagues');
 assert.equal(f.saved[0].values.season, 'season');
 assert.equal(f.saved[0].values.owner, 'jim');
 assert.equal(f.saved[1].table, 'fantasy_members');
 assert.equal(f.saved[1].values.status, 'approved');
});
test('fan cannot bypass eligibility by omitting season', () => { const f = fixture(); assert.throws(() => create(event(f, { organization: 'org', name: 'Jim League' }))); assert.equal(f.saved.length, 0); });
test('closing season rejects stale create requests', () => { const f = fixture(); f.season.values.fantasyEnabled = false; assert.throws(() => create(event(f, { organization: 'org', season: 'season', name: 'Jim League' }))); assert.equal(f.saved.length, 0); });
test('cross organization season is rejected', () => {
 const f = fixture();
 const other = record('other', { capabilities: '["fantasy"]' });
 const original = f.app.findRecordById;
 f.app.findRecordById = (table, id) => id === 'other' ? other : original(table, id);
 assert.throws(() => create(event(f, { organization: 'other', season: 'season', name: 'Jim League' })));
 assert.equal(f.saved.length, 0);
});

test('directory exposes only the season and sports league whitelist', () => {
 const directory = new Map();
 vm.runInNewContext(read('flihub_fantasy_discovery.pb.js'), {
  routerAdd: (method, path, handler) => directory.set(path, handler),
  require: () => rules, __hooks: '.', $apis: { requireAuth: () => null }
 });
 const f = fixture();
 const result = directory.get('/api/flihub/fantasy/available-seasons')(event(f, {}));
 assert.equal(result.status, 200);
 assert.equal(result.data.seasons[0].sportsLeagueName, 'FLI Golf');
 assert.deepEqual(Object.keys(result.data.seasons[0]).sort(), ['id', 'name', 'startsOn', 'endsOn', 'sportsLeague', 'sportsLeagueName', 'organizationSlug', 'organization', 'organizationName'].sort());
 f.org.values.publicPublished = false;
 assert.equal(directory.get('/api/flihub/fantasy/available-seasons')(event(f, {})).data.seasons.length, 0);
});
test('draft endpoint rejects another season even within the same organization', () => {
 const f = fixture();
 f.rows.fantasy_leagues = record('fantasy', { organization: 'org', owner: 'jim', season: 'season' });
 f.rows.events = record('event', { organization: 'org', season: 'another-season' });
 const e = event(f, { event: 'event', pickSeconds: 30 });
 e.request = { pathValue: () => 'fantasy' };
 assert.equal(routes.get('POST /api/flihub/fantasy/leagues/{id}/drafts')(e).status, 400);
});
