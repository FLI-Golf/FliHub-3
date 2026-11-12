import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

function fixture(options = {}) {
 let clock = 2000000; let handler; let writes = 0;
 const values = { status: options.status ?? 'active', league: 'league', pickSeconds: 30, deadline: new Date(clock + (options.remaining ?? 12345)).toISOString(), currentPick: 7, pausedRemainingMs: options.savedRemaining ?? 12345 };
 const draft = { getString: (key) => String(values[key] ?? ''), get: (key) => values[key], set: (key, value) => { values[key] = value; } };
 const app = {
  findRecordById: (table) => table === 'fantasy_drafts' ? draft : { getString: () => 'jim' },
  save: () => { writes++; }, runInTransaction: (callback) => callback(app)
 };
 class FakeDate extends Date { static now() { return clock; } }
 vm.runInNewContext(readFileSync(new URL('../pocketbase/pb_hooks/flihub_fantasy_pause.pb.js', import.meta.url), 'utf8'), {
  routerAdd: (_method, _path, callback) => { handler = callback; },
  $apis: { requireAuth: () => null }, __hooks: '.', require: () => ({ assertBeforeCutoff: () => { if (options.cutoff) throw new Error('cutoff reached'); } }),
  ForbiddenError: Error, BadRequestError: Error, Date: FakeDate
 });
 return { values, writes: () => writes, advance: (ms) => { clock += ms; }, call: (operation = 'pause', actor = 'jim') => handler({ app, auth: { id: actor }, request: { pathValue: () => 'draft' }, requestInfo: () => ({ body: { operation } }), json: (status, data) => ({ status, data }) }) };
}
test('pause and resume preserve remaining milliseconds and current pick', () => {
 const f = fixture(); assert.equal(f.call().data.status, 'paused');
 assert.equal(f.values.pausedRemainingMs, 12345); assert.equal(f.values.deadline, '');
 f.advance(60000);
 assert.equal(f.call('resume').data.status, 'active');
 assert.equal(Date.parse(f.values.deadline), 2060000 + 12345);
 assert.equal(f.values.currentPick, 7); assert.equal(f.values.pausedRemainingMs, 0);
});
test('non-commissioner cannot pause', () => { const f = fixture(); assert.throws(() => f.call('pause', 'other')); assert.equal(f.writes(), 0); });
test('non-commissioner cannot resume', () => { const f = fixture({ status: 'paused' }); assert.throws(() => f.call('resume', 'other')); assert.equal(f.writes(), 0); });
for (const status of ['ready', 'complete', 'paused']) {
 test(`cannot pause a ${status} draft`, () => { const f = fixture({ status }); assert.throws(() => f.call()); assert.equal(f.writes(), 0); });
}
test('expired pick cannot be paused to avoid timeout', () => { const f = fixture({ remaining: 0 }); assert.throws(() => f.call()); assert.equal(f.writes(), 0); });
test('cannot resume an active draft and grant extra time', () => { const f = fixture(); assert.throws(() => f.call('resume')); assert.equal(f.writes(), 0); });
test('invalid paused time cannot be resumed', () => { const f = fixture({ status: 'paused', savedRemaining: -1 }); assert.throws(() => f.call('resume')); assert.equal(f.writes(), 0); });
test('cutoff remains enforced on resume', () => { const f = fixture({ status: 'paused', cutoff: true }); assert.throws(() => f.call('resume')); assert.equal(f.writes(), 0); });
test('invalid transition is rejected', () => { const f = fixture(); assert.throws(() => f.call('restart')); assert.equal(f.writes(), 0); });

test('an in-flight timeout tick cannot create picks while paused', () => {
 const routes = new Map(); let writes = 0;
 const draft = { getString: (key) => key === 'status' ? 'paused' : 'league' };
 const app = { findRecordById: () => draft, runInTransaction: (callback) => callback(app), save: () => { writes++; } };
 vm.runInNewContext(readFileSync(new URL('../pocketbase/pb_hooks/flihub_fantasy.pb.js', import.meta.url), 'utf8'), {
  routerAdd: (_method, path, callback) => routes.set(path, callback), $apis: { requireAuth: () => null }, __hooks: '.',
  require: () => ({ memberOf: () => ({ getString: () => 'approved' }), assertBeforeCutoff: () => {}, performPick: () => { writes++; } })
 });
 const response = routes.get('/api/flihub/fantasy/drafts/{id}/tick')({ app, auth: { id: 'jim' }, request: { pathValue: () => 'draft' }, json: (status, data) => ({ status, data }) });
 assert.equal(response.data.acted, false); assert.equal(writes, 0);
});
