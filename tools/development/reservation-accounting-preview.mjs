import { userInfo } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ownerAccountId } from '../intelligence/real-context/collector.ts';
import { isObjective } from '../intelligence/real-context/contract.ts';
import { prepareDispatchSession } from '../intelligence/real-context/dispatch-authorization.ts';
import { collectQualified } from '../intelligence/real-context/qualified-collection.ts';
import {
	demoPolicy,
	offlineAuthority,
	openReservationLedger
} from '../intelligence/real-context/reservation-accounting.ts';

const [, , command, ...args] = process.argv;
const directory = join(userInfo().homedir, '.flihub-advisory-synthetic-accounting-v1');
const print = (value) => console.log(JSON.stringify(value, null, 2));
let ledger;
let io;
let session;
try {
	if ((command === 'init' || command === 'inspect') && args.length === 0) {
		ledger = openReservationLedger(directory, demoPolicy, command === 'init');
		print(ledger.inspect());
	} else if (
		command === 'reconcile' &&
		args.length === 3 &&
		(args[0] === 'release-unclaimed' || args[0] === 'record-uncertain')
	) {
		ledger = openReservationLedger(directory);
		const result = ledger.reconcile({ id: args[1], authorizationId: args[2] }, args[0]);
		print(result ?? { status: 'no-safe-transition', ...offlineAuthority });
	} else if (
		command === 'run' &&
		args.length === 1 &&
		isObjective(args[0]) &&
		process.stdin.isTTY
	) {
		ledger = openReservationLedger(directory);
		io = createInterface({ input: process.stdin, output: process.stdout });
		const abort = new AbortController();
		const cancel = () => {
			abort.abort();
			session?.cancel();
		};
		io.on('SIGINT', cancel);
		io.on('close', cancel);
		const question = (prompt) => io.question(prompt, { signal: abort.signal });
		console.log('Offline synthetic accounting only. Qualified GitHub reads may occur.');
		try {
			session = await prepareDispatchSession(collectQualified, args[0]);
			if (!abort.signal.aborted) {
				console.log(`Exact disclosure SHA-256: ${session.disclosureDigest}\n${session.disclosure}`);
				console.log(`Exact fixture request SHA-256: ${session.requestDigest}\n${session.request}`);
				const review = await question(
					'Type APPROVE followed by the disclosure digest, or Enter to cancel: '
				);
				if (review && (await session.confirm(review))) {
					console.log('Local review confirmed. No dispatch authority issued.');
					console.log(session.accountingBinding);
					const answer = await question(
						`Separately type AUTHORIZE ACCOUNTING ${session.accountingDigest}, or Enter to cancel: `
					);
					const grant = session.authorizeAccounting(answer);
					if (grant && !abort.signal.aborted) {
						const handle = await session.redeemForReservation(
							grant,
							session.request,
							ownerAccountId
						);
						const reserved = handle && !abort.signal.aborted ? ledger.admit(handle) : undefined;
						if (reserved) {
							print(reserved.receipt);
							const step = await question(
								'Type CLAIM for synthetic settlement, HOLD to leave reserved, or Enter to release unclaimed: '
							);
							if (step === 'CLAIM' && !abort.signal.aborted) {
								const claim = reserved.claim();
								if (claim) {
									print(claim.receipt);
									const action = await question(
										'Type SETTLE to record synthetic usage, or Enter to record uncertainty: '
									);
									print(
										action === 'SETTLE'
											? claim.settle({
													requestDigest: claim.receipt.requestDigest,
													units: 4,
													credits: 7
												})
											: ledger.reconcile(claim.receipt, 'record-uncertain')
									);
								} else
									console.log(
										'Claim unavailable. Inspect or release the unclaimed reservation explicitly.'
									);
							} else if (step !== 'HOLD')
								print(ledger.reconcile(reserved.receipt, 'release-unclaimed'));
						} else console.log('Reservation unavailable or denied. Use manual review.');
					} else console.log('No accounting authorization issued.');
				} else console.log(review ? 'Review rejected.' : 'Local review cancelled.');
			}
		} catch (error) {
			if (!abort.signal.aborted) throw error;
			console.log('Interrupted. Inspect the ledger before taking any further action.');
		}
	} else {
		console.error(
			'Usage: node tools/development/reservation-accounting-preview.mjs init | inspect | reconcile <release-unclaimed|record-uncertain> <reservation-id> <authorization-id> | run <qualification-prerequisite|funding-draft-reconciliation>'
		);
		process.exitCode = 2;
	}
} catch {
	console.error('Accounting unavailable. Use manual assignment preparation or evidence review.');
	process.exitCode = 1;
} finally {
	session?.cancel();
	io?.close();
	ledger?.close();
	print(offlineAuthority);
}
