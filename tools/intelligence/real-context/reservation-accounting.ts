import { randomUUID } from 'node:crypto';
import {
	canonicalJson,
	canonicalSha256
} from '../../../src/lib/server/intelligence/application/operations/canonical.ts';
import { openAccountingStorage, uuidPattern } from './accounting-storage.ts';
import { requireFact } from './contract.ts';
import {
	consumeReservationAdmission,
	discardReservationAdmission,
	syntheticReservation
} from './dispatch-authorization.ts';
import { checkedClock } from './review.ts';

const recordLimit = 128;
const quantityLimit = 1_000_000_000;
const digest = /^[a-f0-9]{64}$/;
const version = 1;
const applicationId = 0x464c4933;
const metadataSql = `CREATE TABLE accounting_metadata (
	id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL, policy TEXT NOT NULL,
	last_time INTEGER NOT NULL CHECK(last_time>=0)
) STRICT`;
const reservationsSql = `CREATE TABLE reservations (
	id TEXT PRIMARY KEY, authorization_id TEXT NOT NULL UNIQUE, review_id TEXT NOT NULL UNIQUE,
	request_digest TEXT NOT NULL, binding_digest TEXT NOT NULL, expires_at INTEGER NOT NULL,
	state TEXT NOT NULL CHECK(state IN ('reserved','claimed','uncertain','settled','released')),
	claim TEXT UNIQUE, units INTEGER NOT NULL CHECK(units BETWEEN 1 AND 1000000000),
	credits INTEGER NOT NULL CHECK(credits BETWEEN 1 AND 1000000000),
	reported_units INTEGER, reported_credits INTEGER, reason TEXT
) STRICT`;
const schema = [
	['accounting_metadata', metadataSql],
	['reservations', reservationsSql]
] as const;
type State = 'reserved' | 'claimed' | 'uncertain' | 'settled' | 'released';
type Binding = { id: string; authorizationId: string };
type Amount = { units: number; credits: number };
type Policy = Amount & { requests: number; outstanding: number };
type Row = {
	id: string;
	authorization_id: string;
	review_id: string;
	request_digest: string;
	binding_digest: string;
	expires_at: number;
	state: State;
	claim: string | null;
	units: number;
	credits: number;
	reported_units: number | null;
	reported_credits: number | null;
	reason: string | null;
};

export const demoPolicy = Object.freeze({ requests: 8, outstanding: 2, units: 40, credits: 80 });
export const offlineAuthority = Object.freeze({
	externalProviderRequests: 0,
	actualProviderCost: '$0.00',
	providerDispatchAuthorized: false,
	engineeringExecutionAuthorized: false
});

function quantity(value: unknown, minimum = 0, maximum = quantityLimit): asserts value is number {
	requireFact(
		typeof value === 'number' &&
			Number.isSafeInteger(value) &&
			!Object.is(value, -0) &&
			value >= minimum &&
			value <= maximum
	);
}

function object(input: unknown, keys: readonly string[]) {
	const data: unknown = JSON.parse(canonicalJson(input));
	requireFact(data !== null && typeof data === 'object' && !Array.isArray(data));
	requireFact(
		Object.keys(data).length === keys.length && keys.every((k) => Object.hasOwn(data, k))
	);
	return data as Record<string, unknown>;
}

function policyFrom(input: unknown): Policy {
	const { units, credits, requests, outstanding } = object(input, [
		'units',
		'credits',
		'requests',
		'outstanding'
	]);
	quantity(units, 1);
	quantity(credits, 1);
	quantity(requests, 1, recordLimit);
	quantity(outstanding, 1, requests);
	return { units, credits, requests, outstanding };
}

function settlement(input: unknown): Amount {
	const { units, credits } = object(input, ['units', 'credits']);
	quantity(units);
	quantity(credits);
	return { units, credits };
}

function validUuid(value: unknown): value is string {
	return typeof value === 'string' && uuidPattern.test(value);
}

function checkedRow(input: unknown): Row {
	const row = input as Row;
	requireFact(validUuid(row.id) && validUuid(row.authorization_id) && validUuid(row.review_id));
	requireFact(digest.test(row.request_digest) && digest.test(row.binding_digest));
	checkedClock(() => row.expires_at);
	requireFact(
		row.units === syntheticReservation.units && row.credits === syntheticReservation.credits
	);
	const reported = row.reported_units !== null || row.reported_credits !== null;
	if (reported) {
		quantity(row.reported_units);
		quantity(row.reported_credits);
	}
	switch (row.state) {
		case 'reserved':
			requireFact(row.claim === null && !reported && row.reason === null);
			break;
		case 'released':
			requireFact(row.claim === null && !reported && row.reason === 'no-claim');
			break;
		case 'claimed':
			requireFact(validUuid(row.claim) && !reported && row.reason === null);
			break;
		case 'settled':
			requireFact(
				validUuid(row.claim) &&
					reported &&
					row.reason === 'synthetic-settlement' &&
					row.reported_units! <= row.units &&
					row.reported_credits! <= row.credits
			);
			break;
		case 'uncertain':
			requireFact(
				validUuid(row.claim) &&
					(reported
						? row.reason === 'over-reservation' &&
							(row.reported_units! > row.units || row.reported_credits! > row.credits)
						: row.reason === 'interrupted' || row.reason === 'invalid-settlement')
			);
			break;
		default:
			throw new Error('Invalid accounting state');
	}
	return row;
}

function totals(rows: Row[], policy: Policy) {
	let outstanding = 0;
	let unresolved = 0;
	const reserved = { units: 0, credits: 0 };
	const uncertain = { units: 0, credits: 0 };
	const settled = { units: 0, credits: 0 };
	for (const r of rows) {
		if (r.state === 'released') continue;
		const target = r.state === 'settled' ? settled : r.state === 'reserved' ? reserved : uncertain;
		if (r.state !== 'settled') outstanding++;
		if (r.state === 'uncertain' || r.state === 'claimed') unresolved++;
		target.units +=
			r.state === 'settled' ? r.reported_units! : Math.max(r.units, r.reported_units ?? 0);
		target.credits +=
			r.state === 'settled' ? r.reported_credits! : Math.max(r.credits, r.reported_credits ?? 0);
	}
	const balance = {
		units: policy.units - reserved.units - uncertain.units - settled.units,
		credits: policy.credits - reserved.credits - uncertain.credits - settled.credits,
		requests: policy.requests - rows.length
	};
	return { reserved, uncertain, settled, balance, outstanding, unresolved };
}

function receipt(row: Row) {
	return Object.freeze({
		id: row.id,
		authorizationId: row.authorization_id,
		requestDigest: row.request_digest,
		bindingDigest: row.binding_digest,
		state: row.state,
		reason: row.reason,
		reservation: { units: row.units, credits: row.credits },
		reported:
			row.reported_units === null
				? null
				: { units: row.reported_units, credits: row.reported_credits },
		...offlineAuthority
	});
}

export function openReservationLedger(
	directory: string,
	inputPolicy: unknown = demoPolicy,
	initialize = false,
	now: () => number = Date.now
) {
	const policy = policyFrom(inputPolicy);
	const canonicalPolicy = canonicalJson(policy);
	const { db, guard, identity, fresh } = openAccountingStorage(directory, initialize);
	let failed = false;
	let closed = false;
	let clock = 0;

	function transaction<T>(action: () => T): T {
		requireFact(!failed && !closed);
		try {
			guard();
			db.exec('BEGIN IMMEDIATE');
			try {
				guard();
				const result = action();
				db.exec('COMMIT');
				return result;
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		} catch (error) {
			// Reopen and inspect after ambiguous persistence failures. No operation is retried here.
			failed = true;
			throw error;
		}
	}

	function validateDatabase() {
		requireFact(
			db.prepare('PRAGMA application_id').get()?.application_id === applicationId &&
				db.prepare('PRAGMA user_version').get()?.user_version === version
		);
		const objects = db
			.prepare(
				'SELECT name,type,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name LIMIT 3'
			)
			.all();
		requireFact(
			objects.length === schema.length &&
				schema.every(
					([name, sql], i) =>
						objects[i].name === name && objects[i].sql === sql && objects[i].type === 'table'
				)
		);
		const rows = db.prepare('SELECT * FROM accounting_metadata LIMIT 2').all();
		requireFact(
			rows.length === 1 &&
				rows[0].id === 1 &&
				rows[0].identity === identity &&
				rows[0].policy === canonicalPolicy
		);
		const time = rows[0].last_time;
		if (time !== 0) checkedClock(() => time as number);
		return time as number;
	}
	function records() {
		const rows = db.prepare('SELECT * FROM reservations ORDER BY id LIMIT ?').all(recordLimit + 1);
		requireFact(rows.length <= recordLimit && rows.length <= policy.requests);
		return rows.map(checkedRow);
	}
	function timestamp(time: number, persisted: number) {
		checkedClock(() => time);
		requireFact(time >= clock && time >= persisted);
		clock = time;
		db.prepare('UPDATE accounting_metadata SET last_time=? WHERE id=1').run(time);
	}
	function get(rows: Row[], ref: Binding) {
		requireFact(ref && validUuid(ref.id) && validUuid(ref.authorizationId));
		const row = rows.find(
			(item) => item.id === ref.id && item.authorization_id === ref.authorizationId
		);
		requireFact(row);
		return row;
	}
	function update(
		row: Row,
		state: State,
		note: string | null,
		claim: string | null,
		amount?: Amount
	) {
		const result = db
			.prepare(
				`UPDATE reservations SET state=?,reason=?,claim=?,reported_units=?,reported_credits=?
			WHERE id=? AND authorization_id=? AND state=? AND claim IS ?`
			)
			.run(
				state,
				note,
				claim,
				amount?.units ?? null,
				amount?.credits ?? null,
				row.id,
				row.authorization_id,
				row.state,
				row.claim
			);
		requireFact(result.changes === 1);
		return receipt({
			...row,
			state,
			reason: note,
			claim,
			reported_units: amount?.units ?? null,
			reported_credits: amount?.credits ?? null
		});
	}

	try {
		transaction(() => {
			if (fresh) {
				requireFact(db.prepare('SELECT count(*) AS total FROM sqlite_schema').get()?.total === 0);
				db.exec(
					`PRAGMA application_id=${applicationId}; PRAGMA user_version=${version}; ${metadataSql}; ${reservationsSql};`
				);
				db.prepare('INSERT INTO accounting_metadata VALUES (1,?,?,0)').run(
					identity,
					canonicalPolicy
				);
			}
			validateDatabase();
			records();
		});
	} catch (error) {
		db.close();
		throw error;
	}

	function claimReservation(ref: Binding) {
		const claim = randomUUID();
		const claimed = transaction(() => {
			const persisted = validateDatabase();
			const row = get(records(), ref);
			const time = checkedClock(now);
			if (row.state !== 'reserved' || time >= row.expires_at) return undefined;
			timestamp(time, persisted);
			return update(row, 'claimed', null, claim);
		});
		if (!claimed) return undefined;
		return Object.freeze({
			receipt: claimed,
			settle(evidence: unknown) {
				return transaction(() => {
					const persisted = validateDatabase();
					const row = get(records(), ref);
					if (row.state !== 'claimed' || row.claim !== claim) return undefined;
					const time = checkedClock(now);
					timestamp(time, persisted);
					let amount: Amount;
					try {
						const result = object(evidence, ['requestDigest', 'units', 'credits']);
						requireFact(result.requestDigest === row.request_digest);
						amount = settlement({ units: result.units, credits: result.credits });
					} catch {
						return update(row, 'uncertain', 'invalid-settlement', claim);
					}
					if (amount.units > row.units || amount.credits > row.credits)
						return update(row, 'uncertain', 'over-reservation', claim, amount);
					return update(row, 'settled', 'synthetic-settlement', claim, amount);
				});
			}
		});
	}

	return Object.freeze({
		close() {
			if (!closed) {
				closed = true;
				db.close();
			}
		},
		inspect() {
			return transaction(() => {
				validateDatabase();
				const rows = records();
				return Object.freeze({
					...totals(rows, policy),
					records: rows.map(receipt),
					...offlineAuthority
				});
			});
		},
		admit(handle: unknown) {
			// SQLite lock is acquired before consuming the ephemeral proof and checking budget.
			// A rollback can lose the proof and never makes it reusable.
			try {
				const admitted = transaction(() => {
					const persisted = validateDatabase();
					const rows = records();
					const { authorization, reservation, time } = consumeReservationAdmission(handle);
					const budget = totals(rows, policy);
					if (
						budget.unresolved ||
						budget.outstanding >= policy.outstanding ||
						budget.balance.requests < 1 ||
						budget.balance.units < reservation.units ||
						budget.balance.credits < reservation.credits ||
						rows.some(
							(r) =>
								r.authorization_id === authorization.authorizationId ||
								r.review_id === authorization.reviewId
						)
					)
						return undefined;
					timestamp(time, persisted);
					const row: Row = {
						id: randomUUID(),
						authorization_id: authorization.authorizationId,
						review_id: authorization.reviewId,
						request_digest: authorization.requestDigest,
						binding_digest: canonicalSha256({ authorization, reservation }),
						expires_at: authorization.expiresAt,
						state: 'reserved',
						claim: null,
						...reservation,
						reported_units: null,
						reported_credits: null,
						reason: null
					};
					db.prepare(
						`INSERT INTO reservations (id,authorization_id,review_id,request_digest,binding_digest,expires_at,state,units,credits)
					VALUES (?,?,?,?,?,?,?,?,?)`
					).run(
						row.id,
						row.authorization_id,
						row.review_id,
						row.request_digest,
						row.binding_digest,
						row.expires_at,
						row.state,
						row.units,
						row.credits
					);
					return {
						ref: Object.freeze({ id: row.id, authorizationId: row.authorization_id }),
						receipt: receipt(row)
					};
				});
				if (admitted)
					return Object.freeze({
						receipt: admitted.receipt,
						claim: () => claimReservation(admitted.ref)
					});
			} finally {
				discardReservationAdmission(handle);
			}
		},
		reconcile(ref: Binding, mode: 'release-unclaimed' | 'record-uncertain') {
			requireFact(mode === 'release-unclaimed' || mode === 'record-uncertain');
			return transaction(() => {
				const persisted = validateDatabase();
				const row = get(records(), ref);
				const time = checkedClock(now);
				if (mode === 'release-unclaimed' && row.state === 'reserved') {
					timestamp(time, persisted);
					return update(row, 'released', 'no-claim', null);
				}
				if (mode === 'record-uncertain' && row.state === 'claimed') {
					timestamp(time, persisted);
					return update(row, 'uncertain', 'interrupted', row.claim);
				}
				return undefined;
			});
		}
	});
}
