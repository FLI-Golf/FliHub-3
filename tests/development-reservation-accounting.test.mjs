import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import {
	chmodSync,
	copyFileSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
	demoPolicy,
	offlineAuthority,
	openReservationLedger
} from '../tools/intelligence/real-context/reservation-accounting.ts';
import { authorizeFixture, oneReservation } from './fixtures/reservation-accounting.mjs';

function scratch(t) {
	const root = mkdtempSync('/tmp/flihub-accounting-test-');
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return join(root, 'ledger');
}
function ledgerFor(t, policy = demoPolicy) {
	const dir = scratch(t);
	const ledger = openReservationLedger(dir, policy, true);
	t.after(() => ledger.close());
	return { dir, ledger };
}
async function reserve(ledger) {
	const auth = await authorizeFixture();
	return ledger.admit(await auth.redeem());
}
const finish = (claim, units, credits) =>
	claim.settle({ requestDigest: claim.receipt.requestDigest, units, credits });

test('exact admission retains every authorization binding through a digest and settles synthetic usage', async (t) => {
	const { ledger, dir } = ledgerFor(t);
	const auth = await authorizeFixture();
	const handle = await auth.redeem();
	const reservation = ledger.admit(handle);
	const budget = ledger.inspect();
	assert.equal(reservation.receipt.authorizationId, JSON.parse(auth.grant).authorizationId);
	assert.equal(reservation.receipt.requestDigest, auth.session.requestDigest);
	assert.equal(reservation.receipt.bindingDigest.length, 64);
	const raw = readFileSync(join(dir, 'reservations.sqlite'));
	assert.equal(raw.includes(auth.session.request), false);
	assert.deepEqual(budget.balance, { units: 30, credits: 60, requests: 7 });
	const claim = reservation.claim();
	assert.equal(claim.receipt.state, 'claimed');
	assert.equal(reservation.claim(), undefined);
	assert.deepEqual(ledger.inspect().uncertain, { units: 10, credits: 20 });
	assert.equal(finish(claim, 4, 7).state, 'settled');
	assert.equal(finish(claim, 4, 7), undefined);
	assert.equal(finish(claim, 9, 19), undefined);
	assert.deepEqual(ledger.inspect().settled, { units: 4, credits: 7 });
	assert.deepEqual(ledger.inspect().balance, { units: 36, credits: 73, requests: 7 });
	for (const [key, value] of Object.entries(offlineAuthority))
		assert.equal(ledger.inspect()[key], value);
	assert.throws(() => ledger.admit(handle));
});

test('missing, fake, expired, wrong-mode and modified exact grants cannot reserve', async (t) => {
	for (const input of [undefined, {}, '{"authorization":"forged"}']) {
		const { ledger } = ledgerFor(t);
		assert.throws(() => ledger.admit(input));
	}
	const { ledger } = ledgerFor(t);
	const e2 = await authorizeFixture(Date.now, 'simulation');
	assert.equal(await e2.redeem(), undefined);
	const tampered = await authorizeFixture();
	assert.equal(await tampered.redeem(tampered.grant + ' '), undefined);
	const badRequest = await authorizeFixture();
	assert.equal(
		await badRequest.redeem(badRequest.grant, badRequest.session.request + ' '),
		undefined
	);
	let now = Date.now();
	const expiring = await authorizeFixture(() => now);
	const handle = await expiring.redeem();
	now += 30_000;
	assert.throws(() => ledger.admit(handle));
	const expired = await authorizeFixture(() => now);
	now += 30_000;
	assert.equal(await expired.redeem(), undefined);
});

test('exact budget boundary, outstanding limits, ordinal request limits and non-dispatch proof', async (t) => {
	const { ledger } = ledgerFor(t, { requests: 2, outstanding: 2, units: 20, credits: 40 });
	const a = await reserve(ledger);
	const b = await reserve(ledger);
	assert.deepEqual(ledger.inspect().balance, { units: 0, credits: 0, requests: 0 });
	assert.equal(await reserve(ledger), undefined);
	assert.equal(ledger.reconcile(a.receipt, 'release-unclaimed').state, 'released');
	assert.equal(a.claim(), undefined);
	assert.equal(ledger.reconcile(a.receipt, 'release-unclaimed'), undefined);
	assert.equal(ledger.reconcile(b.receipt, 'record-uncertain'), undefined);
	assert.equal(await reserve(ledger), undefined);
	assert.deepEqual(ledger.inspect().balance, { units: 10, credits: 20, requests: 0 });
	const limited = ledgerFor(t, { ...demoPolicy, outstanding: 1 }).ledger;
	assert.ok(await reserve(limited));
	assert.equal(await reserve(limited), undefined);
});

test('invalid and overflowing units are rejected and overage is retained above reserved liability', async (t) => {
	for (const units of [-1, 0, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
		assert.throws(() => openReservationLedger(scratch(t), { ...demoPolicy, units }, true));
	}
	for (const bad of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
		const { ledger } = ledgerFor(t);
		const claim = (await reserve(ledger)).claim();
		assert.equal(finish(claim, bad, 0).reason, 'invalid-settlement');
		assert.deepEqual(ledger.inspect().uncertain, { units: 10, credits: 20 });
		assert.equal(await reserve(ledger), undefined);
	}
	const { ledger } = ledgerFor(t);
	const claim = (await reserve(ledger)).claim();
	assert.equal(finish(claim, 13, 37).reason, 'over-reservation');
	assert.deepEqual(ledger.inspect().uncertain, { units: 13, credits: 37 });
	assert.equal(ledger.reconcile(claim.receipt, 'release-unclaimed'), undefined);
	assert.equal(finish(claim, 1, 1), undefined);
	assert.equal(await reserve(ledger), undefined);
});

test('only matching in-process claim evidence settles, and explicit interruption retains liability', async (t) => {
	const { ledger } = ledgerFor(t);
	const claim = (await reserve(ledger)).claim();
	assert.equal(ledger.reconcile(claim.receipt, 'release-unclaimed'), undefined);
	assert.equal(ledger.reconcile(claim.receipt, 'record-uncertain').state, 'uncertain');
	assert.equal(finish(claim, 1, 1), undefined);
	assert.equal(ledger.reconcile(claim.receipt, 'record-uncertain'), undefined);
	assert.deepEqual(ledger.inspect().uncertain, { units: 10, credits: 20 });
	const other = ledgerFor(t).ledger;
	const otherClaim = (await reserve(other)).claim();
	assert.equal(
		otherClaim.settle({ requestDigest: 'a'.repeat(64), units: 4, credits: 7 }).reason,
		'invalid-settlement'
	);
});

test('separate durable uniqueness constraints reject duplicate reservation or authorization identities', async (t) => {
	const { ledger, dir } = ledgerFor(t);
	const first = await reserve(ledger);
	const db = new DatabaseSync(join(dir, 'reservations.sqlite'));
	try {
		const sql =
			'INSERT INTO reservations (id,authorization_id,review_id,request_digest,binding_digest,expires_at,state,units,credits) SELECT ?,?,review_id,request_digest,binding_digest,expires_at,state,units,credits FROM reservations WHERE id=?';
		assert.throws(() => db.prepare(sql).run(first.receipt.id, 'c', first.receipt.id), /UNIQUE/);
		assert.throws(
			() => db.prepare(sql).run('b', first.receipt.authorizationId, first.receipt.id),
			/UNIQUE/
		);
	} finally {
		db.close();
	}
	assert.equal(ledger.inspect().records.length, 1);
});

test('persistence fail-closed for missing, corrupt, incompatible, replaced and partial initialization', async (t) => {
	const empty = scratch(t);
	assert.throws(() => openReservationLedger(empty));
	mkdirSync(empty, { mode: 0o700 });
	writeFileSync(join(empty, 'identity'), '4c1c5051-8ad9-440c-a386-486ad39bcb32', { mode: 0o600 });
	assert.throws(() => openReservationLedger(empty, undefined, true));
	const { dir, ledger } = ledgerFor(t);
	const grant = await authorizeFixture();
	const handle = await grant.redeem();
	renameSync(join(dir, 'reservations.sqlite'), join(dir, 'saved'));
	copyFileSync(join(dir, 'saved'), join(dir, 'reservations.sqlite'));
	assert.throws(() => ledger.admit(handle));
	const replacement = openReservationLedger(dir);
	t.after(() => replacement.close());
	assert.throws(() => replacement.admit(handle));
	const original = ledgerFor(t);
	original.ledger.close();
	const db = new DatabaseSync(join(original.dir, 'reservations.sqlite'));
	db.exec('PRAGMA user_version=99');
	db.close();
	assert.throws(() => openReservationLedger(original.dir));
	const corrupt = ledgerFor(t);
	corrupt.ledger.close();
	writeFileSync(join(corrupt.dir, 'reservations.sqlite'), 'corrupt');
	assert.throws(() => openReservationLedger(corrupt.dir));
});

test('unsafe paths, links, sidecars and permissions are rejected', (t) => {
	assert.throws(() => openReservationLedger('relative'));
	const group = scratch(t);
	mkdirSync(group, { mode: 0o755 });
	assert.throws(() => openReservationLedger(group, undefined, true));
	const linked = scratch(t);
	const target = ledgerFor(t);
	target.ledger.close();
	symlinkSync(target.dir, linked);
	assert.throws(() => openReservationLedger(linked));
	const file = join(target.dir, 'reservations.sqlite');
	chmodSync(file, 0o644);
	assert.throws(() => openReservationLedger(target.dir));
	chmodSync(file, 0o600);
	linkSync(file, join(target.dir, 'alias'));
	assert.throws(() => openReservationLedger(target.dir));
	rmSync(join(target.dir, 'alias'));
	symlinkSync(file, file + '-journal');
	assert.throws(() => openReservationLedger(target.dir));
});

const restricted = process.permission && !process.permission.has('child');
async function worker(t, dir, mode) {
	const file = fileURLToPath(new URL('./fixtures/reservation-accounting.mjs', import.meta.url));
	const child = fork(file, [dir, mode], {
		env: { PATH: process.env.PATH },
		stdio: ['ignore', 'ignore', 'ignore', 'ipc']
	});
	t.after(() => {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
	});
	assert.equal((await once(child, 'message'))[0], 'ready');
	return child;
}

test(
	'independent processes admit exactly one reservation under shared exact limits',
	{ skip: restricted, timeout: 15000 },
	async (t) => {
		const dir = scratch(t);
		openReservationLedger(dir, oneReservation, true).close();
		const children = await Promise.all(Array.from({ length: 3 }, () => worker(t, dir, 'race')));
		const results = await Promise.all(
			children.map(async (child) => {
				const result = once(child, 'message');
				const exit = once(child, 'exit');
				child.send('start');
				const [value] = await result;
				assert.deepEqual(await exit, [0, null]);
				return value;
			})
		);
		assert.equal(results.filter((x) => x !== 'denied').length, 1);
		const ledger = openReservationLedger(dir, oneReservation);
		t.after(() => ledger.close());
		assert.equal(ledger.inspect().records.length, 1);
		assert.deepEqual(ledger.inspect().balance, { units: 0, credits: 0, requests: 3 });
	}
);

for (const mode of ['reserved', 'claimed', 'rollback']) {
	test(
		`SIGKILL after ${mode} preserves durable state without replay or automatic release`,
		{ skip: restricted, timeout: 15000 },
		async (t) => {
			const dir = scratch(t);
			openReservationLedger(dir, oneReservation, true).close();
			const child = await worker(t, dir, mode);
			const received = once(child, 'message');
			child.send('start');
			const [receipt] = await received;
			const exit = once(child, 'exit');
			child.kill('SIGKILL');
			assert.deepEqual(await exit, [null, 'SIGKILL']);
			const ledger = openReservationLedger(dir, oneReservation);
			t.after(() => ledger.close());
			const record = ledger.inspect().records[0];
			assert.equal(record.id, receipt.id);
			assert.equal(record.state, mode === 'claimed' ? 'claimed' : 'reserved');
			assert.equal(await reserve(ledger), undefined);
			if (mode === 'claimed') {
				assert.equal(ledger.reconcile(record, 'release-unclaimed'), undefined);
				assert.equal(ledger.reconcile(record, 'record-uncertain').state, 'uncertain');
				ledger.close();
				const reopened = openReservationLedger(dir, oneReservation);
				t.after(() => reopened.close());
				assert.deepEqual(reopened.inspect().uncertain, { units: 10, credits: 20 });
			} else {
				assert.equal(ledger.reconcile(record, 'release-unclaimed').state, 'released');
				assert.ok(await reserve(ledger));
			}
		}
	);
}

test('transitive accounting terminal dependencies exclude provider, workers, and production stores', () => {
	const root = new URL('../', import.meta.url);
	const expected = new Set([
		'tools/development/reservation-accounting-preview.mjs',
		...[
			'reservation-accounting',
			'accounting-storage',
			'dispatch-authorization',
			'qualified-collection',
			'collector',
			'contract',
			'review'
		].map((n) => `tools/intelligence/real-context/${n}.ts`),
		'tools/intelligence/development-advisory/contracts.ts',
		'src/lib/server/intelligence/application/operations/canonical.ts'
	]);
	const builtin = new Set([
		'node:sqlite',
		'node:fs',
		'node:fs/promises',
		'node:path',
		'node:os',
		'node:readline/promises',
		'node:child_process',
		'node:crypto',
		'node:url',
		'node:util'
	]);
	const visited = new Set();
	function visit(path) {
		if (visited.has(path)) return;
		assert.ok(expected.has(path), path);
		visited.add(path);
		const url = new URL(path, root);
		const file = ts.createSourceFile(path, readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true);
		function walk(node) {
			if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
				const spec = node.moduleSpecifier.text;
				if (spec.startsWith('node:')) assert.ok(builtin.has(spec), spec);
				else visit(fileURLToPath(new URL(spec, url)).slice(fileURLToPath(root).length));
			}
			if (ts.isCallExpression(node))
				assert.ok(
					node.expression.kind !== ts.SyntaxKind.ImportKeyword &&
						node.expression.getText(file) !== 'require'
				);
			ts.forEachChild(node, walk);
		}
		walk(file);
	}
	visit('tools/development/reservation-accounting-preview.mjs');
	assert.deepEqual(visited, expected);
});
