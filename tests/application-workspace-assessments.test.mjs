import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createWorkspaceSessions,
	workspaceLimits
} from '../src/lib/server/intelligence/workspace/sessions.ts';

const owner = 'aaaaaaaaaaaaaaa';
const other = 'bbbbbbbbbbbbbbb';

function setup() {
	let time = 1000;
	const store = createWorkspaceSessions(() => time);
	const session = store.start(owner);

	assert.ok(session);

	return {
		store,
		id: session.id,
		advance(ms) {
			time += ms;
		}
	};
}

function admit(store, id, user = owner) {
	const result = store.beginAssessment(user, id);
	assert.equal(result.status, 'admitted');
	return result;
}

test('assessment requires an existing owned session', () => {
	const { store, id } = setup();

	assert.equal(store.beginAssessment(owner, undefined).status, 'missing_session');

	assert.equal(store.beginAssessment(other, id).status, 'missing_session');

	assert.equal(store.beginAssessment(owner, 'invalid').status, 'missing_session');
});

test('assessment admission does not expose session identifiers', () => {
	const { store, id } = setup();
	const assessment = admit(store, id);

	assert.deepEqual(Object.keys(assessment).sort(), ['finish', 'status']);

	assert.equal(JSON.stringify(assessment).includes(id), false);
	assert.equal(assessment.finish('advised'), true);
});

test('only one assessment can be active per session', () => {
	const { store, id } = setup();
	const first = admit(store, id);

	assert.equal(store.beginAssessment(owner, id).status, 'busy');
	assert.equal(first.finish('advised'), true);

	const second = admit(store, id);
	assert.equal(second.finish('advised'), true);
});

test('assessment completion is single-use', () => {
	const { store, id } = setup();
	const first = admit(store, id);

	assert.equal(first.finish('advised'), true);
	assert.equal(first.finish('advised'), false);

	const second = admit(store, id);

	assert.equal(first.finish('rejected'), false);
	assert.equal(store.beginAssessment(owner, id).status, 'busy');
	assert.equal(second.finish('advised'), true);

	assert.equal(store.readAssessmentHistory(owner, id).length, 2);
});

test('history is isolated by owner and session', () => {
	const { store, id } = setup();
	const second = store.start(owner);
	const unrelated = store.start(other);

	admit(store, id).finish('advised');

	assert.equal(store.readAssessmentHistory(other, id), null);
	assert.deepEqual(store.readAssessmentHistory(owner, second.id), []);
	assert.deepEqual(store.readAssessmentHistory(other, unrelated.id), []);
	assert.equal(store.readAssessmentHistory(owner, id).length, 1);
});

test('history returns detached safe records', () => {
	const { store, id } = setup();

	admit(store, id).finish('advised');

	const history = store.readAssessmentHistory(owner, id);

	assert.deepEqual(Object.keys(history[0]).sort(), [
		'completedAt',
		'outcome',
		'sequence',
		'startedAt'
	]);

	history[0].outcome = 'rejected';
	history.push({});

	const fresh = store.readAssessmentHistory(owner, id);

	assert.equal(fresh.length, 1);
	assert.equal(fresh[0].outcome, 'advised');
	assert.equal(JSON.stringify(fresh).includes(id), false);
	assert.equal(JSON.stringify(fresh).includes(owner), false);
});

test('supported assessment outcomes are retained safely', () => {
	const { store, id } = setup();

	const outcomes = ['advised', 'clarification', 'rejected', 'unavailable'];

	for (const outcome of outcomes) {
		assert.equal(admit(store, id).finish(outcome), true);
	}

	assert.deepEqual(
		store.readAssessmentHistory(owner, id).map((record) => record.outcome),
		outcomes
	);
});

test('unexpected completion values are sanitized', () => {
	const { store, id } = setup();

	admit(store, id).finish('private unexpected value');

	assert.equal(store.readAssessmentHistory(owner, id)[0].outcome, 'unavailable');
});

test('per-user assessment limit applies across sessions', () => {
	const { store, id, advance } = setup();
	const second = store.start(owner);

	for (let i = 0; i < workspaceLimits.maxAssessmentsPerUserPerWindow; i++) {
		admit(store, i % 2 ? id : second.id).finish('advised');
	}

	assert.equal(store.beginAssessment(owner, id).status, 'rate_limited');
	assert.equal(store.beginAssessment(owner, second.id).status, 'rate_limited');

	const unrelated = store.start(other);

	assert.equal(admit(store, unrelated.id, other).finish('advised'), true);

	advance(workspaceLimits.admissionWindowMs);

	assert.equal(admit(store, id).finish('advised'), true);
});

test('closing and reopening cannot bypass assessment limits', () => {
	const { store, id } = setup();

	for (let i = 0; i < workspaceLimits.maxAssessmentsPerUserPerWindow; i++) {
		admit(store, id).finish('advised');
	}

	assert.equal(store.close(owner, id), true);

	const replacement = store.start(owner);

	assert.equal(store.beginAssessment(owner, replacement.id).status, 'rate_limited');
});

test('owner revocation does not reset assessment limits', () => {
	const { store, id } = setup();

	for (let i = 0; i < workspaceLimits.maxAssessmentsPerUserPerWindow; i++) {
		admit(store, id).finish('unavailable');
	}

	store.revokeOwner(owner);

	const replacement = store.start(owner);

	assert.equal(store.beginAssessment(owner, replacement.id).status, 'rate_limited');
});

test('global assessment limit survives session closure', () => {
	const { store, id, advance } = setup();

	const existing = store.start(other);

	assert.ok(existing);

	// Keep one older session available to test the global ceiling.
	advance(workspaceLimits.admissionWindowMs);

	store.close(owner, id);

	for (let i = 0; i < workspaceLimits.maxStartsPerWindow; i++) {
		const user = `synthetic-user-${i}`;
		const session = store.start(user);

		assert.ok(session);

		for (let j = 0; j < workspaceLimits.maxAssessmentsPerUserPerWindow; j++) {
			admit(store, session.id, user).finish('advised');
		}

		store.close(user, session.id);
	}

	assert.equal(store.beginAssessment(other, existing.id).status, 'rate_limited');

	advance(workspaceLimits.admissionWindowMs);

	assert.equal(admit(store, existing.id, other).finish('advised'), true);
});

test('closed sessions cannot publish pending results', () => {
	const { store, id } = setup();
	const pending = admit(store, id);

	store.close(owner, id);

	const replacement = store.start(owner);

	assert.equal(pending.finish('advised'), false);
	assert.equal(store.readAssessmentHistory(owner, id), null);
	assert.deepEqual(store.readAssessmentHistory(owner, replacement.id), []);
});

test('revoked sessions cannot publish pending results', () => {
	const { store, id } = setup();
	const pending = admit(store, id);

	store.revokeOwner(owner);

	assert.equal(pending.finish('advised'), false);
	assert.equal(store.readAssessmentHistory(owner, id), null);
});

test('allowlist revocation invalidates pending assessments', () => {
	const { store, id } = setup();
	const pending = admit(store, id);

	store.revokeExcept(new Set([other]));

	assert.equal(pending.finish('advised'), false);
});

test('idle-expired sessions cannot publish pending results', () => {
	const { store, id, advance } = setup();
	const pending = admit(store, id);

	advance(workspaceLimits.idleMs);

	assert.equal(pending.finish('advised'), false);
	assert.equal(store.readAssessmentHistory(owner, id), null);
});

test('absolute expiration cannot be extended by assessment activity', () => {
	const { store, id, advance } = setup();

	for (let i = 0; i < 5; i++) {
		advance(10 * 60 * 1000);
		admit(store, id).finish('advised');
	}

	const pending = admit(store, id);

	advance(10 * 60 * 1000);

	assert.equal(pending.finish('advised'), false);
	assert.equal(store.read(owner, id), null);
});

test('history reads do not extend idle expiration', () => {
	const { store, id, advance } = setup();

	admit(store, id).finish('advised');

	advance(workspaceLimits.idleMs - 1);

	assert.ok(store.readAssessmentHistory(owner, id));

	advance(1);

	assert.equal(store.readAssessmentHistory(owner, id), null);
});

test('assessment history retains only the latest 50 records', () => {
	const { store, id, advance } = setup();

	for (let i = 0; i < 65; i++) {
		if (i > 0 && i % workspaceLimits.maxAssessmentsPerUserPerWindow === 0) {
			advance(workspaceLimits.admissionWindowMs);
		}

		admit(store, id).finish('advised');
	}

	const history = store.readAssessmentHistory(owner, id);

	assert.equal(history.length, workspaceLimits.maxAssessmentHistory);
	assert.equal(history[0].sequence, 16);
	assert.equal(history.at(-1).sequence, 65);
});

test('assessment activity renews idle but not absolute expiration', () => {
	const { store, id, advance } = setup();
	const before = store.read(owner, id);

	advance(1000);

	admit(store, id).finish('advised');

	const after = store.read(owner, id);

	assert.equal(after.absoluteExpiresAt, before.absoluteExpiresAt);
	assert.equal(after.idleExpiresAt, before.idleExpiresAt + 1000);
});

test('process restart discards history and session access', () => {
	const { store, id } = setup();

	admit(store, id).finish('advised');

	const restarted = createWorkspaceSessions();

	assert.equal(restarted.readAssessmentHistory(owner, id), null);
	assert.equal(restarted.beginAssessment(owner, id).status, 'missing_session');
});
