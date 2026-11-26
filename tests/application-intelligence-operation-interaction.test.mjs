import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { createOfflineOperationWorkflow } from '../tools/application/operation-workflow.mjs';

import { reviewSyntheticOperation } from '../tools/application/operation-interaction.mjs';

import { syntheticActorIds } from '../src/lib/server/intelligence/application/operations/fixtures.ts';

async function scenario() {
	const workflow = createOfflineOperationWorkflow();

	const result = await workflow.prepare(
		'prepare_tournament',
		'spring_invitational',
		syntheticActorIds.owner
	);

	assert.equal(result.status, 'review_required');

	return result;
}

function assertUnchanged(result) {
	assert.equal(result.session.getState().revision, 0);
	assert.equal(result.session.getState().groups.length, 0);
	assert.equal(result.session.getApproval(), null);
	assert.equal(result.session.getAuditHistory().length, 0);
}

test('exact plan is displayed before confirmation', async () => {
	const result = await scenario();
	const output = [];

	const outcome = await reviewSyntheticOperation(result, {
		write: (message) => output.push(message),
		question: async () => {
			const text = output.join('\n');

			assert.ok(text.includes(result.plan.digest));
			assert.ok(text.includes(result.review.reviewId));
			assert.ok(text.includes(JSON.stringify(result.plan, null, 2)));

			for (const group of result.plan.body.proposal.groups) {
				assert.ok(text.includes(group.id));

				for (const entry of group.entries) {
					assert.ok(text.includes(entry.entryId));

					for (const id of entry.athleteIds) {
						assert.ok(text.includes(id));
					}
				}
			}

			assert.equal(result.session.getApproval(), null);
			assert.equal(result.session.getState().revision, 0);
			assert.equal(result.session.getState().groups.length, 0);

			return 'APPROVE';
		}
	});

	assert.equal(outcome.status, 'published');
	assert.equal(result.session.getStatus(), 'consumed');
	assert.equal(result.session.getState().revision, 1);
	assert.equal(result.session.getState().groups.length, 6);
	assert.equal(result.session.getApproval(), null);
	assert.equal(result.session.getAuditHistory().length, 1);
});

for (const answer of ['CANCEL', '', 'yes', 'approve', ' APPROVE', 'APPROVE ', 'APPROVE ALL']) {
	test(`non-exact confirmation cancels: ${JSON.stringify(answer)}`, async () => {
		const result = await scenario();

		const outcome = await reviewSyntheticOperation(result, {
			write: () => {},
			question: async () => answer
		});

		assert.equal(outcome.status, 'cancelled');
		assert.equal(result.session.getStatus(), 'cancelled');
		assertUnchanged(result);
	});
}

test('aborted review never requests confirmation', async () => {
	const result = await scenario();
	const controller = new AbortController();

	controller.abort();

	let prompted = false;

	const outcome = await reviewSyntheticOperation(result, {
		write: () => {},
		question: async () => {
			prompted = true;
			return 'APPROVE';
		},
		signal: controller.signal
	});

	assert.equal(outcome.status, 'cancelled');
	assert.equal(prompted, false);
	assertUnchanged(result);
});

test('abort during confirmation prevents approval', async () => {
	const result = await scenario();
	const controller = new AbortController();

	const outcome = await reviewSyntheticOperation(result, {
		write: () => {},
		question: async () => {
			controller.abort();
			return 'APPROVE';
		},
		signal: controller.signal
	});

	assert.equal(outcome.status, 'cancelled');
	assertUnchanged(result);
});

test('input failure cancels the protected review', async () => {
	const result = await scenario();

	const outcome = await reviewSyntheticOperation(result, {
		write: () => {},
		question: async () => {
			throw new Error('private diagnostic');
		}
	});

	assert.deepEqual(outcome, {
		status: 'rejected',
		reason: 'interaction_failed'
	});

	assert.equal(result.session.getStatus(), 'cancelled');
	assertUnchanged(result);
});

test('display failure prevents confirmation', async () => {
	const result = await scenario();
	let prompted = false;

	const outcome = await reviewSyntheticOperation(result, {
		write: () => {
			throw new Error('display failure');
		},
		question: async () => {
			prompted = true;
			return 'APPROVE';
		}
	});

	assert.equal(outcome.status, 'rejected');
	assert.equal(prompted, false);
	assertUnchanged(result);
});

test('replaced review cannot use previous confirmation', async () => {
	const result = await scenario();

	const outcome = await reviewSyntheticOperation(result, {
		write: () => {},
		question: async () => {
			const replacement = result.session.prepare({
				operationId: 'create_synthetic_group_assignments',
				fixtureId: 'spring_invitational'
			});

			assert.equal(replacement.status, 'prepared');

			return 'APPROVE';
		}
	});

	assert.equal(outcome.status, 'rejected');
	assertUnchanged(result);
});

test('advisory-only response cannot enter operation review', async () => {
	const outcome = await reviewSyntheticOperation(
		{ status: 'advisory_only' },
		{
			write: () => assert.fail('Unexpected display'),
			question: async () => assert.fail('Unexpected prompt')
		}
	);

	assert.deepEqual(outcome, {
		status: 'rejected',
		reason: 'review_required'
	});
});

test('noninteractive terminal invocation is rejected', () => {
	const result = spawnSync(process.execPath, ['tools/application/operation-console.mjs'], {
		input: '1\n1\n1\nAPPROVE\n',
		encoding: 'utf8',
		timeout: 10000
	});

	assert.equal(result.status, 1);
	assert.ok(result.stderr.includes('interactive terminal'));
	assert.ok(!result.stdout.includes('EXACT PLAN APPROVED'));
});

test('terminal rejects command-line arguments', () => {
	const result = spawnSync(
		process.execPath,
		['tools/application/operation-console.mjs', '--live'],
		{
			encoding: 'utf8',
			timeout: 10000
		}
	);

	assert.equal(result.status, 1);
	assert.ok(result.stderr.includes('accepts no arguments'));
});
