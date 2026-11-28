import { createInterface } from 'node:readline/promises';
import { ownerAccountId } from '../intelligence/real-context/collector.ts';
import { isObjective } from '../intelligence/real-context/contract.ts';
import { prepareDispatchSession } from '../intelligence/real-context/dispatch-authorization.ts';
import { collectQualified } from '../intelligence/real-context/qualified-collection.ts';

const objective = process.argv[2];
const optional = process.argv[3] === '--include-engineering-qualification';
if (
	!isObjective(objective) ||
	process.argv.length > 4 ||
	(process.argv.length === 4 && (!optional || objective !== 'qualification-prerequisite')) ||
	!process.stdin.isTTY
) {
	console.error(
		'Usage in an interactive terminal: node tools/development/dispatch-authorization-preview.mjs qualification-prerequisite [--include-engineering-qualification] | funding-draft-reconciliation'
	);
	process.exitCode = 2;
} else {
	const io = createInterface({ input: process.stdin, output: process.stdout });
	const abort = new AbortController();
	let session;
	const cancel = () => {
		abort.abort();
		session?.cancel();
	};
	io.on('SIGINT', cancel);
	io.on('close', cancel);
	try {
		console.log(
			'Offline simulation. Qualified GitHub reads only. No external provider request is possible.'
		);
		session = await prepareDispatchSession(collectQualified, objective, optional);
		if (!abort.signal.aborted) {
			console.log(`Exact disclosure SHA-256: ${session.disclosureDigest}\n${session.disclosure}`);
			console.log(`Exact fixture request SHA-256: ${session.requestDigest}\n${session.request}`);
			const review = await io.question(
				'Type APPROVE followed by the disclosure digest, or Enter to cancel: ',
				{ signal: abort.signal }
			);
			if (review && (await session.confirm(review))) {
				console.log('Review confirmed locally. It grants no dispatch authority.');
				console.log(session.authorizationPreview);
				const authorize = await io.question(
					`Separately type AUTHORIZE SIMULATION ${session.bindingDigest}, or Enter to cancel: `,
					{ signal: abort.signal }
				);
				const grant = session.authorize(authorize);
				if (grant && !abort.signal.aborted) {
					const result = await session.redeem(grant, session.request, ownerAccountId);
					if (result) console.log(JSON.stringify(result));
					else console.log('Authorization invalidated. No external request occurred.');
				} else console.log('No simulation authorization issued.');
			} else console.log(review ? 'Review rejected.' : 'Local review cancelled.');
		}
	} catch {
		if (!abort.signal.aborted) {
			console.error('Qualified evidence unavailable. No external request occurred.');
			process.exitCode = 1;
		}
	} finally {
		cancel();
		io.close();
		console.log('Manual assignment preparation and evidence review remain available.');
	}
}
