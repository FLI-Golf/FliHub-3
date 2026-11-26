import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalSha256 } from '../src/lib/server/intelligence/application/operations/canonical.ts';

import { syntheticActorIds } from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import { createSyntheticApprovalSession } from '../src/lib/server/intelligence/application/operations/approval.ts';

import { verifySyntheticOperationCandidate } from '../src/lib/server/intelligence/application/operations/verification.ts';

function scenario(actor = syntheticActorIds.owner) {
	const created = createSyntheticApprovalSession('spring_invitational', actor);

	assert.equal(created.status, 'created');

	const session = created.session;
	const original = session.getState();

	const prepared = session.prepare({
		operationId: 'create_synthetic_group_assignments',
		fixtureId: 'spring_invitational'
	});

	assert.equal(prepared.status, 'prepared');

	const approved = session.approve({
		...session.getReview(),
		action: 'approve-exact-plan',
		planDigest: prepared.plan.digest
	});

	assert.equal(approved.status, 'approved');

	const executed = session.executeApprovedOperation(approved.receipt);

	assert.equal(executed.status, 'candidate_prepared');

	return {
		session,
		original,
		plan: prepared.plan,
		candidate: executed.candidate
	};
}

function verify(context) {
	return verifySyntheticOperationCandidate(context.original, context.plan, context.candidate);
}

for (const role of ['owner', 'admin']) {
	test(`independently verifies ${role} candidate`, () => {
		const context = scenario(syntheticActorIds[role]);

		const before = structuredClone({
			original: context.original,
			plan: context.plan,
			candidate: context.candidate
		});

		const result = verify(context);

		assert.deepEqual(result, {
			status: 'verified',
			operationId: 'create_synthetic_group_assignments',
			planDigest: context.plan.digest,
			originalStateDigest: canonicalSha256(context.original),
			candidateStateDigest: canonicalSha256(context.candidate),
			revisionBefore: 0,
			revisionAfter: 1,
			groupsCreated: 6,
			teamsAssigned: 12,
			athletesAssigned: 24,
			publication: 'not-permitted'
		});

		assert.equal(Object.isFrozen(result), true);

		assert.deepEqual(context.original, before.original);

		assert.deepEqual(context.plan, before.plan);

		assert.deepEqual(context.candidate, before.candidate);

		assert.deepEqual(context.session.getState(), before.original);
	});
}

const corruptions = [
	['missing group', (candidate) => candidate.groups.pop()],
	[
		'duplicate group ID',
		(candidate) => {
			candidate.groups[1].id = candidate.groups[0].id;
		}
	],
	[
		'duplicate group name',
		(candidate) => {
			candidate.groups[1].name = candidate.groups[0].name;
		}
	],
	[
		'cross-organization group',
		(candidate) => {
			candidate.groups[0].organizationId = 'synthetic-org-outside';
		}
	],
	[
		'wrong event',
		(candidate) => {
			candidate.groups[0].eventId = 'synthetic-event-other';
		}
	],
	[
		'duplicate team assignment',
		(candidate) => {
			candidate.groups[1].entries[0] = structuredClone(candidate.groups[0].entries[0]);
		}
	],
	[
		'duplicate athlete assignment',
		(candidate) => {
			candidate.groups[0].entries[0].athleteIds[1] = candidate.groups[0].entries[0].athleteIds[0];
		}
	],
	[
		'invented athlete',
		(candidate) => {
			candidate.groups[0].entries[0].athleteIds[0] = 'synthetic-invented';
		}
	],
	[
		'split team roster',
		(candidate) => {
			const first = candidate.groups[0].entries[0].athleteIds;

			const second = candidate.groups[0].entries[1].athleteIds;

			[first[0], second[0]] = [second[0], first[0]];
		}
	],
	[
		'valid but unapproved team rearrangement',
		(candidate) => {
			const first = candidate.groups[0].entries;
			const second = candidate.groups[1].entries;

			[first[0], second[0]] = [second[0], first[0]];
		}
	],
	[
		'unapproved group rename',
		(candidate) => {
			candidate.groups[0].name = 'Changed Group';
		}
	],
	[
		'incorrect revision',
		(candidate) => {
			candidate.revision = 2;
		}
	],
	[
		'unrelated team mutation',
		(candidate) => {
			candidate.teams[0].name = 'Changed Team';
		}
	],
	[
		'unrelated athlete mutation',
		(candidate) => {
			candidate.athletes[0].status = 'inactive';
		}
	],
	[
		'event activation',
		(candidate) => {
			candidate.event.status = 'active';
		}
	],
	[
		'scoring configuration',
		(candidate) => {
			candidate.event.scoringConfigured = true;
		}
	],
	[
		'workflow lock mutation',
		(candidate) => {
			candidate.event.workflowLocks.scores = true;
		}
	],
	[
		'unexpected state property',
		(candidate) => {
			candidate.approved = true;
		}
	],
	[
		'production scope',
		(candidate) => {
			candidate.source = 'production';
		}
	]
];

for (const [name, corrupt] of corruptions) {
	test(`rejects ${name}`, () => {
		const context = scenario();

		const before = structuredClone(context.original);

		corrupt(context.candidate);

		const result = verify(context);

		assert.equal(result.status, 'rejected');

		assert.equal(Object.hasOwn(result, 'candidate'), false);

		assert.deepEqual(context.session.getState(), before);
	});
}

test('rejects structurally valid unapproved assignments', () => {
	const context = scenario();

	const first = context.candidate.groups[0].entries;
	const second = context.candidate.groups[1].entries;

	[first[0], second[0]] = [second[0], first[0]];

	assert.deepEqual(verify(context), {
		status: 'rejected',
		reason: 'assignment_mismatch'
	});
});

test('rejects changed original state', () => {
	const context = scenario();

	context.original.event.name = 'Changed Event';

	assert.deepEqual(verify(context), {
		status: 'rejected',
		reason: 'original_state_mismatch'
	});
});

test('rejects invalid plan digest', () => {
	const context = scenario();

	context.plan = structuredClone(context.plan);
	context.plan.digest = '0'.repeat(64);

	assert.deepEqual(verify(context), {
		status: 'rejected',
		reason: 'invalid_plan'
	});
});

test('rejects rehashed incorrect plan summary', () => {
	const context = scenario();

	context.plan = structuredClone(context.plan);

	context.plan.body.proposal.summary.athletesAssigned = 23;

	context.plan.digest = canonicalSha256(context.plan.body);

	assert.deepEqual(verify(context), {
		status: 'rejected',
		reason: 'invalid_plan'
	});
});

test('rejects malformed candidate input', () => {
	const context = scenario();

	for (const candidate of [null, undefined, {}, [], true, 'candidate']) {
		assert.equal(
			verifySyntheticOperationCandidate(context.original, context.plan, candidate).status,
			'rejected'
		);
	}
});

test('rejects candidate accessor without invoking it', () => {
	const context = scenario();

	let invoked = false;

	const candidate = {
		...context.candidate,
		get groups() {
			invoked = true;
			return context.candidate.groups;
		}
	};

	assert.equal(
		verifySyntheticOperationCandidate(context.original, context.plan, candidate).status,
		'rejected'
	);

	assert.equal(invoked, false);
});

test('rejects proxy candidate without invoking traps', () => {
	const context = scenario();

	let calls = 0;

	const candidate = new Proxy(context.candidate, {
		ownKeys(target) {
			calls++;
			return Reflect.ownKeys(target);
		}
	});

	assert.equal(
		verifySyntheticOperationCandidate(context.original, context.plan, candidate).status,
		'rejected'
	);

	assert.equal(calls, 0);
});

test('verification does not publish state', () => {
	const context = scenario();

	assert.equal(verify(context).status, 'verified');

	assert.equal(context.session.getState().groups.length, 0);

	assert.equal(context.session.getState().revision, 0);

	assert.equal(context.session.getStatus(), 'consumed');

	assert.equal(Object.hasOwn(context.session, 'publish'), false);
});
