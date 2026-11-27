import { createInterface } from 'node:readline/promises';
import { auditStore } from './audit.ts';
import { decideFixture, fixtures, type Fixture } from './guardrail.ts';

const name = process.argv[2] as Fixture;
if (!Object.hasOwn(fixtures, name)) {
	console.error('Usage: node tools/intelligence/demo.ts read|test|dependency|secret|restricted');
	process.exitCode = 2;
} else {
	const proposal = JSON.stringify(['demo', name, fixtures[name]]);
	const { deterministic, decision, recommendation } = await decideFixture(name);
	const audit = auditStore(process.env.FLIHUB_GUARDRAIL_AUDIT_DIR);
	try {
		const id = audit.record(decision, proposal);
		console.log(
			JSON.stringify(
				{
					category: name,
					deterministic: deterministic.verdict,
					recommendation,
					final: decision.verdict,
					humanApprovalRequired: decision.verdict === 'review',
					executionPrevented: decision.verdict !== 'allow',
					executionAttempted: false,
					decisionId: id
				},
				null,
				2
			)
		);
		if (decision.verdict === 'review' && process.stdin.isTTY) {
			const input = createInterface({ input: process.stdin, output: process.stdout });
			try {
				const answer = await input.question(
					'Approve this inert demo proposal? [approve/reject/cancel] ',
					{
						signal: AbortSignal.timeout(120_000)
					}
				);
				if (
					(answer === 'approve' || answer === 'reject') &&
					audit.human(id, proposal, undefined, answer)
				) {
					if (answer === 'approve') {
						console.log(
							audit.consume(id, proposal)
								? 'Approval consumed for simulation.'
								: 'Approval unavailable.'
						);
					} else console.log('Rejection recorded.');
				} else audit.cancel(id, proposal);
			} catch {
				audit.cancel(id, proposal);
			} finally {
				input.close();
			}
		} else if (decision.verdict === 'review') audit.cancel(id, proposal);
	} finally {
		audit.close();
	}
}
