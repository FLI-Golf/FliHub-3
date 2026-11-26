import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createWorkspaceSessions,
	workspaceLimits
} from '../src/lib/server/intelligence/workspace/sessions.ts';

import { createWorkspaceAssessment } from '../src/lib/server/intelligence/workspace/assessment.ts';

const owner = 'aaaaaaaaaaaaaaa';
const other = 'bbbbbbbbbbbbbbb';

function setup() {
	let time = 1000;

	const sessions = createWorkspaceSessions(() => time);
	const assessment = createWorkspaceAssessment(sessions);
	const { id } = sessions.start(owner);

	return {
		sessions,
		id,

		assess: (
			fixture = 'spring_invitational',
			actor = 'synthetic-actor-owner',
			objective = 'prepare_tournament',
			mode = 'registered'
		) => assessment.assess(owner, id, mode, objective, fixture, actor, () => true),

		prepare: (generation = sessions.readCurrentRecommendation(owner, id)?.generation) =>
			sessions.prepareReview(owner, id, generation),

		read: () => sessions.readReview(owner, id),

		availability: () => sessions.readReviewAvailability(owner, id),

		cancel: (reviewId) => sessions.cancelReview(owner, id, reviewId),

		advance: (ms) => {
			time += ms;
		}
	};
}

test('review requires a current assessment recommendation', () => {
	const env = setup();

	assert.equal(env.read(), null);
	assert.equal(env.availability(), null);
	assert.equal(env.prepare().status, 'stale_context');
});

test('registered recommendation prepares exact synthetic review', async () => {
	const env = setup();

	await env.assess();

	assert.equal(env.availability().sequence, 1);

	const result = env.prepare();

	assert.equal(result.status, 'prepared');
	assert.equal(result.review.summary.groupsAfter, 6);
	assert.equal(result.review.summary.teamsAssigned, 12);
	assert.equal(result.review.summary.athletesAssigned, 24);
	assert.equal(result.review.boundaries.approvalGranted, false);
	assert.equal(result.review.boundaries.execution, 'disabled');

	assert.deepEqual(env.read(), result.review);
	assert.equal(env.availability(), null);
});

test('repeated preparation retrieves the same immutable review', async () => {
	const env = setup();

	await env.assess();

	const first = env.prepare();
	const second = env.prepare();

	assert.equal(first.status, 'prepared');
	assert.equal(second.status, 'prepared');

	assert.equal(first.review.reviewId, second.review.reviewId);
	assert.equal(first.review.planDigest, second.review.planDigest);
	assert.deepEqual(first.review, second.review);
});

test('stale and malformed assessment generations are rejected', async () => {
	const env = setup();

	await env.assess();

	for (const generation of [0, 2, '1', null, {}, NaN, 1.5, 'a'.repeat(64)]) {
		assert.equal(env.prepare(generation).status, 'stale_context');
	}

	assert.equal(env.read(), null);
	assert.equal(env.prepare().status, 'prepared');
});

test('new admitted assessment immediately invalidates review', async () => {
	const env = setup();

	await env.assess();

	const first = env.prepare();

	assert.equal(first.status, 'prepared');

	const oldGeneration = env.sessions.readCurrentRecommendation(owner, env.id).generation;

	const pending = env.assess();

	assert.equal(env.read(), null);
	assert.equal(env.prepare().status, 'busy');

	await pending;

	assert.equal(env.prepare(oldGeneration).status, 'stale_context');

	const second = env.prepare();

	assert.equal(second.status, 'prepared');
	assert.notEqual(first.review.reviewId, second.review.reviewId);
});

test('cancellation is bound to the current review identity', async () => {
	const env = setup();

	await env.assess();

	const first = env.prepare();

	assert.equal(env.cancel('incorrect').status, 'stale_review');
	assert.ok(env.read());

	assert.equal(env.cancel(first.review.reviewId).status, 'cancelled');

	assert.equal(env.read(), null);
	assert.equal(env.availability(), null);
	assert.equal(env.prepare().status, 'review_consumed');

	await env.assess();

	const second = env.prepare();

	assert.equal(second.status, 'prepared');

	assert.equal(env.cancel(first.review.reviewId).status, 'stale_review');

	assert.equal(env.read().reviewId, second.review.reviewId);
});

test('another authenticated owner cannot access review', async () => {
	const env = setup();

	await env.assess();

	const result = env.prepare();

	assert.equal(env.sessions.readReview(other, env.id), null);

	assert.equal(env.sessions.readReviewAvailability(other, env.id), null);

	assert.equal(env.sessions.prepareReview(other, env.id, 1).status, 'missing_session');

	assert.equal(
		env.sessions.cancelReview(other, env.id, result.review.reviewId).status,
		'missing_session'
	);

	assert.ok(env.read());
});

test('separate sessions cannot access another session review', async () => {
	const env = setup();

	const second = env.sessions.start(owner);

	await env.assess();
	env.prepare();

	assert.equal(env.sessions.readReview(owner, second.id), null);

	assert.equal(env.sessions.prepareReview(owner, second.id, 1).status, 'stale_context');
});

test('clarification invalidates an existing review', async () => {
	const env = setup();

	await env.assess();
	env.prepare();

	await env.assess('information_missing');

	assert.equal(env.read(), null);
	assert.equal(env.availability(), null);
	assert.equal(env.prepare().status, 'stale_context');
});

test('unsupported objective invalidates an existing review', async () => {
	const env = setup();

	await env.assess();
	env.prepare();

	await env.assess('spring_invitational', 'synthetic-actor-owner', 'Delete all events', 'natural');

	assert.equal(env.read(), null);
	assert.equal(env.prepare().status, 'stale_context');
});

test('non-operation recommendations cannot prepare a review', async () => {
	const env = setup();

	await env.assess('participants_missing');

	assert.equal(env.availability(), null);

	assert.ok(['no_operation', 'stale_context'].includes(env.prepare().status));

	assert.equal(env.read(), null);
});

test('unauthorized simulated operator cannot obtain a review', async () => {
	const env = setup();

	await env.assess('spring_invitational', 'synthetic-actor-viewer');

	assert.notEqual(env.prepare().status, 'prepared');
	assert.equal(env.read(), null);
});

for (const [name, invalidate] of [
	['closure', (env) => env.sessions.close(owner, env.id)],
	['owner revocation', (env) => env.sessions.revokeOwner(owner)],
	['allowlist removal', (env) => env.sessions.revokeExcept(new Set([other]))],
	['idle expiration', (env) => env.advance(workspaceLimits.idleMs)],
	['absolute expiration', (env) => env.advance(workspaceLimits.absoluteMs)]
]) {
	test(`${name} removes active review and context`, async () => {
		const env = setup();

		await env.assess();

		assert.equal(env.prepare().status, 'prepared');

		invalidate(env);

		assert.equal(env.read(), null);
		assert.equal(env.availability(), null);
		assert.equal(env.prepare().status, 'missing_session');
	});
}

test('review retrieval does not extend session lifetime', async () => {
	const env = setup();

	await env.assess();
	env.prepare();

	const before = env.sessions.read(owner, env.id);

	env.advance(1000);

	assert.ok(env.read());
	assert.equal(env.prepare().status, 'prepared');

	assert.deepEqual(env.sessions.read(owner, env.id), before);
});

test('generation rejects stale requests across concurrent and replacement sessions', async () => {
	const env = setup();
	const coordinator = createWorkspaceAssessment(env.sessions);

	await env.assess();

	const first = env.availability();

	assert.equal(first.sequence, 1);
	assert.match(first.generation, /^[a-f0-9]{64}$/);
	assert.notEqual(first.generation, env.id);

	const second = env.sessions.start(owner);

	async function assessSession(id) {
		const result = await coordinator.assess(
			owner,
			id,
			'registered',
			'prepare_tournament',
			'spring_invitational',
			'synthetic-actor-owner',
			() => true
		);

		assert.equal(result.status, 'completed');

		return env.sessions.readReviewAvailability(owner, id);
	}

	const secondContext = await assessSession(second.id);

	assert.equal(secondContext.sequence, 1);
	assert.notEqual(secondContext.generation, first.generation);

	assert.equal(
		env.sessions.prepareReview(owner, second.id, first.generation).status,
		'stale_context'
	);

	assert.equal(env.sessions.readReview(owner, second.id), null);

	assert.equal(
		env.sessions.prepareReview(owner, second.id, secondContext.generation).status,
		'prepared'
	);

	assert.equal(env.sessions.close(owner, env.id), true);

	const replacement = env.sessions.start(owner);
	const replacementContext = await assessSession(replacement.id);

	assert.equal(replacementContext.sequence, 1);
	assert.notEqual(replacementContext.generation, first.generation);
	assert.notEqual(replacementContext.generation, secondContext.generation);

	for (const stale of [first.generation, secondContext.generation]) {
		assert.equal(env.sessions.prepareReview(owner, replacement.id, stale).status, 'stale_context');
	}

	assert.equal(env.sessions.readReview(owner, replacement.id), null);

	const prepared = env.sessions.prepareReview(owner, replacement.id, replacementContext.generation);

	assert.equal(prepared.status, 'prepared');
	assert.equal(prepared.review.boundaries.approvalGranted, false);
	assert.equal(prepared.review.boundaries.execution, 'disabled');

	const repeated = env.sessions.prepareReview(owner, replacement.id, replacementContext.generation);

	assert.equal(repeated.review.reviewId, prepared.review.reviewId);
});

async function executionSetup() {
	const env = setup();
	await env.assess();
	const { review } = env.prepare();
	return {
		...env,
		confirmation: {
			confirmation: 'approve-and-execute',
			generation: env.sessions.readCurrentRecommendation(owner, env.id).generation,
			reviewId: review.reviewId,
			planDigest: review.planDigest
		}
	};
}

test('execution admission binds all confirmation fields, owner and session', async () => {
	const { sessions, id, confirmation } = await executionSetup();
	const second = sessions.start(owner);
	assert.equal(sessions.readExecution(owner, id), null);
	assert.equal(sessions.readExecutionEvidence(owner, id), null);
	for (const field of Object.keys(confirmation)) {
		assert.equal(
			sessions.executeReview(owner, id, { ...confirmation, [field]: '' }).status,
			'stale_confirmation'
		);
	}
	assert.equal(sessions.executeReview(other, id, confirmation).status, 'missing_session');
	assert.equal(sessions.executeReview(owner, second.id, confirmation).status, 'stale_confirmation');
	const exact = sessions.readReview(owner, id);
	assert.equal(sessions.executeReview(owner, id, confirmation).status, 'completed');
	const { publication, audit } = sessions.readExecutionEvidence(owner, id);
	assert.deepEqual(
		publication.groups,
		exact.groups.map(({ name, teams }) => ({
			name,
			teams: teams.map((team) => ({
				name: team.name,
				athletes: team.athletes.map(({ name }) => name)
			}))
		}))
	);
	assert.equal(publication.groups.length, 6);
	assert.ok(Object.isFrozen(publication.groups[0].teams[0].athletes));
	assert.deepEqual(audit, {
		sequence: 1,
		outcome: 'published',
		verification: 'passed',
		revisionBefore: 0,
		revisionAfter: 1,
		stateChanged: true
	});
	assert.equal(sessions.readExecutionEvidence(other, id), null);
	assert.equal(sessions.readExecutionEvidence(owner, second.id), null);
	assert.doesNotMatch(
		JSON.stringify({ publication, audit }),
		/sessionId|reviewId|receipt|planDigest|athleteIds|rosters/
	);
	const lifecycle = sessions.readLifecycle(owner, id)[1];
	assert.equal(lifecycle.objective, 'Prepare a tournament');
	assert.ok(lifecycle.recommendation);
	assert.ok(lifecycle.reviewPreparedAt <= lifecycle.executionAdmittedAt);
	const outcome = sessions.readExecution(owner, id);
	assert.deepEqual(outcome, {
		status: 'published',
		revisionBefore: 0,
		revisionAfter: 1,
		groupsCreated: 6,
		teamsAssigned: 12,
		athletesAssigned: 24,
		verification: 'passed',
		persistentMutation: false,
		paidProviderRequests: 0,
		paidProviderCost: 0
	});
	assert.ok(Object.isFrozen(outcome));
	assert.deepEqual(sessions.readExecution(owner, id), outcome);
	assert.equal(sessions.readExecution(other, id), null);
	assert.equal(sessions.executeReview(owner, id, confirmation).status, 'concluded');
	assert.equal(sessions.beginAssessment(owner, id).status, 'concluded');
	assert.equal(sessions.prepareReview(owner, id, confirmation.generation).status, 'concluded');
	assert.equal(sessions.cancelReview(owner, id, confirmation.reviewId).status, 'concluded');
	assert.deepEqual(sessions.readExecution(owner, id), outcome);
	assert.equal(sessions.close(owner, id), true);
	assert.equal(sessions.readExecution(owner, id), null);
});

for (const boundary of ['candidate', 'verification']) {
	test(`admitted ${boundary} failure is sanitized and terminal`, async (t) => {
		const { sessions, id, confirmation } = await executionSetup();
		const clone = globalThis.structuredClone;
		const mock = t.mock.method(globalThis, 'structuredClone', (value, options) => {
			if (boundary === 'candidate') throw new Error('private test evidence');
			const copy = clone(value, options);
			if (copy?.source === 'synthetic') copy.teams[0].name = 'Changed by test';
			return copy;
		});
		try {
			assert.equal(sessions.executeReview(owner, id, confirmation).status, 'completed');
		} finally {
			mock.mock.restore();
		}
		const outcome = sessions.readExecution(owner, id);
		assert.deepEqual(outcome, { status: 'failed' });
		const evidence = sessions.readExecutionEvidence(owner, id);
		assert.equal(evidence.publication, null);
		assert.equal(evidence.audit.outcome, 'rejected');
		assert.equal(
			evidence.audit.verification,
			boundary === 'verification' ? 'failed' : 'not-performed'
		);
		assert.equal(evidence.audit.revisionAfter, 0);
		assert.equal(evidence.audit.stateChanged, false);
		assert.ok(Object.isFrozen(outcome));
		assert.equal(sessions.executeReview(owner, id, confirmation).status, 'concluded');
		assert.equal(sessions.beginAssessment(owner, id).status, 'concluded');
	});
}

for (const end of ['expire', 'revoke']) {
	test(`${end} discards retained terminal outcomes and prevents execution`, async () => {
		const { sessions, id, confirmation, advance } = await executionSetup();
		assert.equal(sessions.executeReview(owner, id, confirmation).status, 'completed');
		if (end === 'expire') advance(workspaceLimits.idleMs);
		else sessions.revokeOwner(owner);
		assert.equal(sessions.readExecution(owner, id), null);
		assert.equal(sessions.executeReview(owner, id, confirmation).status, 'missing_session');
	});
}

test('assessment and cancellation invalidate execution when admitted first', async () => {
	const { sessions, id, confirmation, cancel } = await executionSetup();
	assert.equal(cancel(confirmation.reviewId).status, 'cancelled');
	const lifecycle = sessions.readLifecycle(owner, id)[1];
	assert.ok(lifecycle.reviewPreparedAt <= lifecycle.reviewCancelledAt);
	assert.equal(lifecycle.executionAdmittedAt, undefined);
	assert.equal(sessions.executeReview(owner, id, confirmation).status, 'stale_confirmation');
	const assessment = sessions.beginAssessment(owner, id);
	assert.equal(assessment.status, 'admitted');
	assert.equal(sessions.executeReview(owner, id, confirmation).status, 'busy');
	assert.equal(sessions.readExecution(owner, id), null);
});

test('a failed outcome projection cannot change a published scenario', async (t) => {
	const { sessions, id, confirmation } = await executionSetup();
	assert.equal(sessions.executeReview(owner, id, confirmation).status, 'completed');
	const freeze = t.mock.method(Object, 'freeze', () => {
		throw new Error('Presentation failed');
	});
	try {
		assert.throws(() => sessions.readExecution(owner, id), /Presentation failed/);
	} finally {
		freeze.mock.restore();
	}
	assert.equal(sessions.executeReview(owner, id, confirmation).status, 'concluded');
	assert.equal(sessions.readExecution(owner, id).status, 'published');
});

test('publication details require the committed state, even when a review is retained', async (t) => {
	const { sessions, id, confirmation } = await executionSetup();
	assert.equal(sessions.executeReview(owner, id, confirmation).status, 'completed');
	const clone = globalThis.structuredClone;
	const mock = t.mock.method(globalThis, 'structuredClone', (value) => {
		const copy = clone(value);
		if (copy?.source === 'synthetic') copy.groups[0].name = 'Unverified assignment';
		return copy;
	});
	try {
		assert.equal(sessions.readExecutionEvidence(owner, id).publication, null);
		assert.equal(sessions.readExecution(owner, id).status, 'published');
	} finally {
		mock.mock.restore();
	}
	assert.equal(sessions.readExecutionEvidence(owner, id).publication.groups.length, 6);
});
