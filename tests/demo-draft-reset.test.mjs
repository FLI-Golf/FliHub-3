import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
function record(id, values) { return { id, values, getString: (key) => String(values[key] ?? ''), set: (key, value) => { values[key] = value; } }; }
function fixture(options = {}) {
 let handler;
 const draft = record('draft', { league: 'league', status: options.status ?? 'complete', pausedRemainingMs: 12345, currentPick: 24, deadline: 'old', startedAt: 'old', completedAt: 'old', resolutionRequired: true, draftOrder: '["jim","demo"]', rankings: '["athlete"]', pickSeconds: 7, event: 'event' });
 const before = { ...draft.values };
 const deleted = []; const saved = [];
 const app = {
  findRecordById: (table) => {
   if (table === 'fantasy_drafts') return draft;
   if (table === 'fantasy_leagues') return record('league', { owner: 'jim' });
   if (table === 'users') return record('demo', { email: options.email ?? 'fantasy-demo-league-1@example.com' });
   throw new Error(`Unexpected table ${table}`);
  },
  findRecordsByFilter: (table, filter, _sort, _limit, _offset, params) => {
   if (table === 'fantasy_members') return [record('seat1', { user: 'jim', status: 'approved' }), record('seat2', { user: 'demo', status: 'approved' })];
   if (table === 'fantasy_picks') { assert.equal(filter, 'draft = {:draft}'); assert.equal(params.draft, 'draft'); return [record('pick1', {}), record('pick2', {})]; }
   throw new Error(`Unexpected table ${table}`);
  },
  delete: (row) => { deleted.push(row.id); },
  save: (row) => { if (options.failSave) throw new Error('save failed'); saved.push(row.id); },
  runInTransaction: (callback) => { try { callback(app); } catch (err) { deleted.splice(0); Object.assign(draft.values, before); throw err; } }
 };
 vm.runInNewContext(readFileSync(new URL('../pocketbase/pb_hooks/flihub_demo_draft_reset.pb.js', import.meta.url), 'utf8'), {
  routerAdd: (_method, _path, callback) => { handler = callback; },
  $apis: { requireAuth: () => null }, ForbiddenError: Error, BadRequestError: Error,
  $os: { getenv: (key) => key === 'FLIHUB_DEMO_FANTASY' ? (options.flag ?? '1') : (options.codespace ?? 'test') }
 });
 return { draft, deleted, saved, call: () => handler({ app, auth: { id: options.actor ?? 'jim' }, request: { pathValue: () => 'draft' }, requestInfo: () => ({ body: { confirm: options.confirm ?? 'RESET', pickSeconds: options.seconds ?? 30 } }), json: (status, data) => ({ status, data }) }) };
}
test('resets only draft picks, preserving event, participants, order, and ranking', () => {
 const f = fixture(); const response = f.call();
 assert.equal(response.data.cleared, 2); assert.deepEqual(f.deleted, ['pick1', 'pick2']);
 assert.equal(f.draft.values.status, 'ready'); assert.equal(f.draft.values.currentPick, 0);
 for (const field of ['deadline', 'startedAt', 'completedAt']) assert.equal(f.draft.values[field], '');
 assert.equal(f.draft.values.resolutionRequired, false); assert.equal(f.draft.values.pickSeconds, 30);
 assert.equal(f.draft.values.draftOrder, '["jim","demo"]'); assert.equal(f.draft.values.rankings, '["athlete"]'); assert.equal(f.draft.values.event, 'event');
 assert.deepEqual(f.saved, ['draft']);
});
for (const options of [{ flag: '0' }, { codespace: '' }, { actor: 'other' }, { confirm: '' }, { seconds: 3 }, { status: 'ready' }, { email: 'real@example.com' }, { email: 'fantasy-demo-other-1@example.com' }]) {
 test(`rejects reset ${JSON.stringify(options)}`, () => { const f = fixture(options); assert.throws(f.call); assert.equal(f.deleted.length, 0); assert.equal(f.saved.length, 0); });
}
test('reset and pick deletion share a transaction', () => {
 const f = fixture({ failSave: true }); assert.throws(f.call); assert.equal(f.deleted.length, 0); assert.equal(f.draft.values.status, 'complete');
});

for (const status of ['active', 'paused', 'complete']) {
 test(`reset clears ${status} draft and paused timer`, () => {
  const f = fixture({ status });
  f.call();
  assert.equal(f.draft.values.status, 'ready');
  assert.equal(f.draft.values.currentPick, 0);
  assert.equal(f.draft.values.deadline, '');
  assert.equal(f.draft.values.pausedRemainingMs, 0);
  assert.deepEqual(f.deleted, ['pick1', 'pick2']);
  assert.equal(f.draft.values.draftOrder, '["jim","demo"]');
  assert.equal(f.draft.values.rankings, '["athlete"]');
 });
 for (const options of [{ actor: 'other' }, { email: 'real@example.com' }, { confirm: '' }]) {
  test(`rejects unsafe ${status} reset ${JSON.stringify(options)}`, () => {
   const f = fixture({ ...options, status });
   assert.throws(f.call);
   assert.equal(f.deleted.length, 0);
   assert.equal(f.saved.length, 0);
  });
 }
}
