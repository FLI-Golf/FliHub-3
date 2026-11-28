import { createInterface } from 'node:readline/promises';
import { createAdvisorySimulation } from '../intelligence/development-advisory/simulation.ts';

const kind = process.argv[2] ?? 'planning';
if (process.argv.length > 3 || (kind !== 'planning' && kind !== 'evidence-assessment')) {
	console.error(
		'Usage: node tools/development/advisory-preview.mjs [planning|evidence-assessment]'
	);
	process.exitCode = 2;
} else if (!process.stdin.isTTY) {
	console.error('The offline advisory preview requires an interactive terminal.');
	process.exitCode = 2;
} else {
	const harness = createAdvisorySimulation(true);
	const io = createInterface({ input: process.stdin, output: process.stdout });
	const abort = new AbortController();
	io.on('SIGINT', () => abort.abort());
	io.on('close', () => abort.abort());
	try {
		const preview = harness.prepare(kind, 'recommendation', {
			maxRequests: 1,
			maxInputTokens: 50,
			maxCostUsdMicros: 10,
			timeoutMs: 1000
		});
		if (preview.status === 'review') {
			console.log(preview.notice);
			console.log(preview.review.reviewText);
			const { sessionId, reviewId, reviewDigest } = preview.review;
			const confirmation = await io.question(
				'Type APPROVE followed by the exact review SHA-256, or press Enter to cancel: ',
				{ signal: abort.signal }
			);
			if (confirmation) {
				const approval = harness.approve(sessionId, reviewId, confirmation);
				if (approval.ok) {
					const result = await harness.run(
						sessionId,
						reviewId,
						reviewDigest,
						approval.value.approvalId
					);
					console.log(JSON.stringify(result, null, 2));
				} else console.log('Exact review approval rejected.');
			}
		}
	} catch (error) {
		if (!abort.signal.aborted) throw error;
	} finally {
		harness.cancel();
		io.close();
		console.log(
			'Manual assignment preparation and evidence review remain available in jev:develop.'
		);
	}
}
