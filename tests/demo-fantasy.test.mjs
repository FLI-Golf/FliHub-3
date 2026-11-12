import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

function record(table, id, values = {}) {
 return { table, id, values, getString: (key) => String(values[key] ?? ''), get: (key) => values[key],
  set: (key, value) => { values[key] = value; }, setPassword: (value) => { values.password = value; } };
}
function fixture(options = {}) {
 let handler;
 const saved = [];
 const ownerSeat = record('fantasy_members', 'owner-seat', { user: 'jim', status: 'approved' });
 const seats = options.seats ?? [ownerSeat];
 const users = options.users ?? [];
 const league = record('fantasy_leagues', 'league', { owner: 'jim', participantLimit: options.limit ?? 6 });
 const app = {
  findRecordById: () => league,
  findCollectionByNameOrId: (name) => name,
  findRecordsByFilter: (table, _filter, _sort, _limit, _offset, params) => {
   if (table === 'fantasy_drafts') return options.drafts ?? [];
   if (table === 'fantasy_members') return seats;
   if (table === 'users') return users.filter((user) => user.values.email === params.email);
   throw new Error(`Unexpected table ${table}`);
  },
  save: (row) => { row.id = `new-${saved.length}`; saved.push(row); },
  runInTransaction: (callback) => {
   const length = saved.length;
   try { callback(app); } catch (err) { saved.splice(length); throw err; }
  }
 };
 vm.runInNewContext(readFileSync(new URL('../pocketbase/pb_hooks/flihub_demo_fantasy.pb.js', import.meta.url), 'utf8'), {
  routerAdd: (_method, _path, callback) => { handler = callback; },
  $apis: { requireAuth: () => null },
  $os: { getenv: (name) => name === 'FLIHUB_DEMO_FANTASY' ? (options.flag ?? '1') : (options.codespace ?? 'test') },
  ForbiddenError: Error, BadRequestError: Error,
  Record: function(table) { return record(table, ''); }
 });
 const event = { app, auth: { id: options.actor ?? 'jim' }, request: { pathValue: () => 'league' },
  requestInfo: () => ({ body: { password: options.password ?? 'demo-password-1234' } }),
  json: (status, data) => ({ status, data }) };
 return { call: () => handler(event), saved, seats, users };
}

test('fills five places with verified approved accounts and no staff records', () => {
 const f = fixture(); const response = f.call();
 assert.equal(response.data.count, 5);
 assert.equal(f.saved.length, 10);
 assert.equal(f.saved.filter((row) => row.table === 'users').length, 5);
 for (const row of f.saved.filter((row) => row.table === 'users')) {
  assert.equal(row.values.verified, true);
  assert.equal(row.values.password, 'demo-password-1234');
  assert.match(row.values.email, /^fantasy-demo-league-[1-5]@example.com$/);
 }
 assert.equal(f.saved.some((row) => row.table === 'memberships' || row.table === 'invitations'), false);
 assert.equal(JSON.stringify(response).includes('demo-password-1234'), false);
});
for (const options of [{ flag: '0' }, { codespace: '' }, { actor: 'other' }, { password: 'short' }, { drafts: [{}] }, { limit: 13 }, { seats: [record('fantasy_members', 'pending', { status: 'invited' })] }]) {
 test(`rejects unsafe setup ${JSON.stringify(options)}`, () => {
  const f = fixture(options); assert.throws(f.call); assert.equal(f.saved.length, 0);
 });
}
test('preserves existing participant and fills only remaining places', () => {
 const f = fixture({ seats: [record('fantasy_members', 'one', { status: 'approved' }), record('fantasy_members', 'two', { status: 'approved' })], limit: 3 });
 assert.equal(f.call().data.count, 1);
});
test('full league rerun is a no-op', () => {
 const f = fixture({ limit: 2, seats: [record('fantasy_members', 'one', { status: 'approved' }), record('fantasy_members', 'two', { status: 'approved' })] });
 assert.equal(f.call().data.count, 0); assert.equal(f.saved.length, 0);
});
test('existing unrelated account is never taken over', () => {
 const existing = record('users', 'existing', { email: 'fantasy-demo-league-1@example.com', password: 'unchanged' });
 const f = fixture({ users: [existing] });
 assert.throws(f.call); assert.equal(f.saved.length, 0); assert.equal(existing.values.password, 'unchanged');
});
test('a later address conflict rolls back all new records', () => {
 const f = fixture({ users: [record('users', 'existing', { email: 'fantasy-demo-league-3@example.com' })] });
 assert.throws(f.call); assert.equal(f.saved.length, 0);
});
