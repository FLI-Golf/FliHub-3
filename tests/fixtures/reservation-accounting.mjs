import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { ownerAccountId } from '../../tools/intelligence/real-context/collector.ts';
import { acceptedSha, fact, repository } from '../../tools/intelligence/real-context/contract.ts';
import { prepareDispatchSession } from '../../tools/intelligence/real-context/dispatch-authorization.ts';
import { openReservationLedger } from '../../tools/intelligence/real-context/reservation-accounting.ts';

export const oneReservation = Object.freeze({
	requests: 4,
	outstanding: 2,
	units: 10,
	credits: 20
});
export async function authorizeFixture(now = Date.now, mode = 'accounting') {
	const objective = 'qualification-prerequisite';
	const session = await prepareDispatchSession(
		async () => {
			const observedAt = new Date(now()).toISOString();
			return {
				operator: ownerAccountId,
				context: {
					version: 1,
					objective,
					facts: [
						fact('repository', { slug: repository, visibility: 'PUBLIC' }, null, observedAt),
						fact(
							'adm6d-acceptance',
							{ issue: 94, scope: 'offline-simulation' },
							{ revision: acceptedSha },
							observedAt
						),
						fact('adm6d-ci', { status: 'no-matching-run' }, { revision: acceptedSha }, observedAt),
						fact(
							'adm6e-gate',
							{
								section: 'adm-6-qualified-development-advisory',
								gate: 'separate-live-authorization'
							},
							{ head: 'a'.repeat(40), base: 'b'.repeat(40) },
							observedAt
						)
					]
				}
			};
		},
		objective,
		false,
		now
	);
	if (!(await session.confirm('APPROVE ' + session.disclosureDigest)))
		throw new Error('Fixture confirmation failed');
	const grant =
		mode === 'accounting'
			? session.authorizeAccounting('AUTHORIZE ACCOUNTING ' + session.accountingDigest)
			: session.authorize('AUTHORIZE SIMULATION ' + session.bindingDigest);
	return {
		session,
		grant,
		redeem: (candidate = grant, request = session.request) =>
			session.redeemForReservation(candidate, request, ownerAccountId)
	};
}

if (process.send) {
	const [directory, mode] = process.argv.slice(2);
	const ledger = openReservationLedger(directory, oneReservation);
	process.send('ready');
	await once(process, 'message');
	const { redeem } = await authorizeFixture();
	const reserved = ledger.admit(await redeem());
	if (mode === 'race') {
		process.send(reserved?.receipt ?? 'denied');
		ledger.close();
		process.disconnect();
	} else {
		if (!reserved) throw new Error('Fixture admission denied');
		if (mode === 'claimed') {
			process.send(reserved.claim().receipt);
		} else if (mode === 'rollback') {
			ledger.close();
			const db = new DatabaseSync(join(directory, 'reservations.sqlite'));
			db.exec('BEGIN IMMEDIATE');
			db.prepare("UPDATE reservations SET state='released', reason='no-claim' WHERE id=?").run(
				reserved.receipt.id
			);
			process.send(reserved.receipt);
		} else {
			process.send(reserved.receipt);
		}
		setInterval(() => {}, 1000);
	}
}
