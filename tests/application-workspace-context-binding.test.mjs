import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceAssessment } from '../src/lib/server/intelligence/workspace/assessment.ts';

import { createWorkspaceAdvisory } from '../src/lib/server/intelligence/workspace/advisory.ts';

import {
	createWorkspaceSessions,
	workspaceLimits
} from '../src/lib/server/intelligence/workspace/sessions.ts';

const owner = 'aaaaaaaaaaaaaaa';
const other = 'bbbbbbbbbbbbbbb';

const args = ['registered', 'prepare_tournament', 'spring_invitational', 'synthetic-actor-owner'];

const allow = () => true;

function setup(customAdvisory) {
	let time = 1000;

	const sessions = createWorkspaceSessions(() => time);
	const coordinator = createWorkspaceAssessment(
		sessions,
		customAdvisory ?? createWorkspaceAdvisory()
	);

	const { id } = sessions.start(owner);

	return {
		sessions,
		coordinator,
		id,
		read: () => sessions.readCurrentRecommendation(owner, id),
		assess: (...input) => coordinator.assess(owner, id, ...input, allow),
		advance: (ms) => {
			time += ms;
		}
	};
}

test('published recommendation retains minimal immutable context', async () => {
	const env = setup();

	assert.equal(env.read(), null);

	const response = await env.assess(...args);

	assert.equal(response.status, 'completed');

	const context = env.read();

	assert.deepEqual(context, {
		objectiveId: 'prepare_tournament',
		fixtureId: 'spring_invitational',
		actorId: 'synthetic-actor-owner',
		capability: 'plan_group_assignments',
		sequence: 1,
		generation: context.generation
	});

	assert.match(context.generation, /^[a-f0-9]{64}$/);

	assert.equal(Object.isFrozen(context), true);

	assert.throws(() => {
		context.capability = 'delete_all_events';
	}, TypeError);

	assert.equal(env.sessions.readCurrentRecommendation(other, env.id), null);

	const summary = env.coordinator.readSummary(owner, env.id);

	assert.deepEqual(Object.keys(summary.history[0]).sort(), [
		'completedAt',
		'outcome',
		'sequence',
		'startedAt'
	]);

	assert.equal(JSON.stringify(response).includes('plan_group_assignments'), false);
});

test('new admitted assessment immediately invalidates old context', async () => {
	const advisory = createWorkspaceAdvisory();

	let release;
	let delayed = false;

	const gate = new Promise((resolve) => {
		release = resolve;
	});

	const env = setup({
		async assess(...input) {
			if (delayed) await gate;
			return advisory.assess(...input);
		}
	});

	await env.assess(...args);

	assert.ok(env.read());

	delayed = true;

	const pending = env.assess(...args);

	assert.equal(env.read(), null);

	release();

	assert.equal((await pending).status, 'completed');
	assert.equal(env.read().sequence, 2);
});

test('unsupported objective discards previous recommendation', async () => {
	const env = setup();

	await env.assess(...args);

	assert.ok(env.read());

	const result = await env.assess('natural', 'Delete all events', args[2], args[3]);

	assert.equal(result.result.status, 'rejected');
	assert.equal(env.read(), null);
});

test('clarification cannot supply actionable context', async () => {
	const env = setup();

	await env.assess(...args);

	assert.ok(env.read());

	const result = await env.assess(args[0], args[1], 'information_missing', args[3]);

	assert.equal(result.result.decision, 'clarification');
	assert.equal(env.read(), null);

	const summary = env.coordinator.readSummary(owner, env.id);

	assert.equal(summary.history.at(-1).outcome, 'clarification');
});

test('publication denial cannot retain recommendation context', async () => {
	const env = setup();

	await env.assess(...args);

	const response = await env.coordinator.assess(owner, env.id, ...args, () => false);

	assert.equal(response.status, 'discarded');
	assert.equal(env.read(), null);
});

test('unavailable assessment cannot retain recommendation context', async () => {
	const advisory = createWorkspaceAdvisory();

	let fail = false;

	const env = setup({
		async assess(...input) {
			if (fail) throw new Error('PRIVATE_ERROR');
			return advisory.assess(...input);
		}
	});

	await env.assess(...args);

	assert.ok(env.read());

	fail = true;

	await env.assess(...args);

	assert.equal(env.read(), null);
});

test('inconsistent recommendation identifiers cannot supply context', async () => {
	const advisory = createWorkspaceAdvisory();

	const env = setup({
		async assess(...input) {
			const result = await advisory.assess(...input);

			result.advisory.plan.nextStep.capability = 'review_scoring_requirements';

			return result;
		}
	});

	await env.assess(...args);

	assert.equal(env.read(), null);
});

test('session closure removes recommendation context', async () => {
	const env = setup();

	await env.assess(...args);

	assert.ok(env.read());

	env.sessions.close(owner, env.id);

	assert.equal(env.read(), null);
});

test('owner revocation removes recommendation context', async () => {
	const env = setup();

	await env.assess(...args);

	env.sessions.revokeOwner(owner);

	assert.equal(env.read(), null);
});

test('session expiration removes recommendation context', async () => {
	const env = setup();

	await env.assess(...args);

	env.advance(workspaceLimits.idleMs);

	assert.equal(env.read(), null);
});

test('recommendation context is isolated between sessions', async () => {
	const env = setup();

	const second = env.sessions.start(owner);

	await env.assess(...args);

	assert.ok(env.read());

	assert.equal(env.sessions.readCurrentRecommendation(owner, second.id), null);
});
