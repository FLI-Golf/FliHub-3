import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/routes/(app)/account/+page.server.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
const signal = (status, value) => { throw Object.assign(new Error(value), { status, value }); };
new Function('require', 'exports', code)((name) => {
    if (name === '@sveltejs/kit') return { error: signal, redirect: signal };
    if (name === '$lib/server/auth') return { listMyMemberships: async (pb) => pb.memberships };
    throw new Error(`Unexpected import ${name}`);
}, exports);

function context(query = '', memberships = [], seats = []) {
    const pb = {
        memberships,
        filter: (expression, values) => { assert.equal(values.user, 'jim'); return expression; },
        collection: (name) => {
            assert.equal(name, 'fantasy_members');
            return { getFullList: async (options) => { assert.equal(options.expand, 'league'); return seats; } };
        }
    };
    return { locals: { user: { id: 'jim' }, pb }, url: new URL(`https://example.test/account${query}`) };
}

test('new account gets activity selection without database writes', async () => {
    assert.equal((await exports.load(context())).activity, null);
});
for (const role of ['owner', 'admin', 'scorekeeper']) {
    test(`${role} retains existing dashboard`, async () => {
        await assert.rejects(exports.load(context('', [{ role }])), { status: 303, value: '/organizations' });
    });
}
test('existing members can explicitly open activities', async () => {
    assert.equal((await exports.load(context('?choose=1', [{ role: 'owner' }]))).activity, null);
});
test('invalid activity is rejected', async () => {
    await assert.rejects(exports.load(context('?activity=unexpected')), { status: 400 });
});
test('fantasy lists own actionable seats and excludes removed seats', async () => {
    const seat = (id, status) => ({ status, expand: { league: { id, name: id, organization: 'org' } } });
    const result = await exports.load(context('?activity=fantasy', [], [seat('one', 'approved'), seat('two', 'invited'), seat('three', 'removed'), seat('four', 'declined')]));
    assert.deepEqual(result.leagues.map((league) => league.id), ['one', 'two']);
});
