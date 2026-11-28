import { createInterface } from 'node:readline/promises';
import { createCollector } from '../intelligence/real-context/collector.ts';
import { isObjective } from '../intelligence/real-context/contract.ts';
import { prepareRealContextReview } from '../intelligence/real-context/review.ts';

const objective = process.argv[2];
const includeQualification = process.argv[3] === '--include-engineering-qualification';
if (
	!isObjective(objective) ||
	process.argv.length > 4 ||
	(process.argv.length === 4 &&
		(!includeQualification || objective !== 'qualification-prerequisite'))
) {
	console.error(
		'Usage: node tools/development/real-advisory-preview.mjs qualification-prerequisite [--include-engineering-qualification] | funding-draft-reconciliation'
	);
	process.exitCode = 2;
} else if (!process.stdin.isTTY) {
	console.error('Real development review requires an interactive terminal.');
	process.exitCode = 2;
} else {
	const io = createInterface({ input: process.stdin, output: process.stdout });
	const abort = new AbortController();
	io.on('SIGINT', () => abort.abort());
	io.on('close', () => abort.abort());
	let review;
	try {
		console.log('Offline disclosure preview. Only bounded Git and GitHub reads are performed.');
		review = await prepareRealContextReview(createCollector(), objective, includeQualification);
		console.log(`Context SHA-256: ${review.contextDigest}`);
		console.log(`Review SHA-256: ${review.reviewDigest}`);
		console.log(`Exact canonical UTF-8 review candidate (${review.bytes} bytes):`);
		console.log(review.canonicalPayload);
		const answer = await io.question(
			'Type APPROVE followed by the review SHA-256, or press Enter to cancel: ',
			{ signal: abort.signal }
		);
		if (!answer || abort.signal.aborted) console.log('Local review cancelled.');
		else {
			const confirmed = await review.confirm(answer);
			console.log(
				confirmed && !abort.signal.aborted
					? 'Exact review confirmed locally. No dispatch or engineering authorization issued.'
					: 'Review rejected or invalidated. Prepare a new review to retry.'
			);
		}
	} catch {
		if (!abort.signal.aborted) {
			console.error(
				'Real context unavailable. Use manual assignment preparation or evidence review.'
			);
			process.exitCode = 1;
		}
	} finally {
		review?.cancel();
		io.close();
	}
}
