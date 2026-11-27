import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createWorkspaceAssessment,
	projectWorkspaceAdvisory
} from '../src/lib/server/intelligence/workspace/assessment.ts';

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
	const advisory = createWorkspaceAdvisory();
	const session = sessions.start(owner);

	assert.ok(session);

	const coordinator = createWorkspaceAssessment(sessions, customAdvisory ?? advisory);

	return {
		sessions,
		advisory,
		coordinator,
		id: session.id,
		advance(ms) {
			time += ms;
		}
	};
}

function deferred() {
	let resolve;

	const promise = new Promise((done) => {
		resolve = done;
	});

	return { promise, resolve };
}

test('owned session receives a projected offline recommendation', async () => {
	const { coordinator, id } = setup();

	const response = await coordinator.assess(owner, id, ...args, allow);

	assert.equal(response.status, 'completed');

	const result = response.result;

	assert.equal(result.status, 'advised');
	assert.equal(result.source, 'mock');
	assert.equal(result.effect, 'recommendation-only');
	assert.equal(result.execution, 'disabled');
	assert.equal(result.decision, 'recommended');
	assert.equal(result.scenario, 'Spring Invitational');
	assert.equal(result.actor, 'Organization owner');
	assert.equal(result.context.participantCount, 24);
	assert.equal(result.context.groupCount, 0);
	assert.ok(result.nextStep);
	assert.ok(result.explanation);
});

test('public result contains only explicitly selected fields', async () => {
	const { coordinator, id } = setup();

	const response = await coordinator.assess(owner, id, ...args, allow);

	assert.deepEqual(Object.keys(response.result).sort(), [
		'actor',
		'context',
		'decision',
		'effect',
		'execution',
		'explanation',
		'manualFallback',
		'nextStep',
		'objective',
		'prerequisiteReviewSuggested',
		'readiness',
		'scenario',
		'source',
		'status'
	]);

	const serialized = JSON.stringify(response);

	for (const forbidden of [
		id,
		owner,
		'synthetic-actor-owner',
		'spring_invitational',
		'prepare_tournament',
		'"answers"',
		'"confidence"',
		'"approval"',
		'"ticket"',
		'"requestId"'
	]) {
		assert.equal(serialized.includes(forbidden), false, forbidden);
	}
});

test('projection excludes additional internal provider fields', async () => {
	const advisory = createWorkspaceAdvisory();
	const internal = await advisory.assess(...args);

	assert.equal(internal.status, 'advised');

	const marker = 'PRIVATE_INTERNAL_MARKER';

	internal.privateValue = marker;
	internal.advisory.privateValue = marker;
	internal.advisory.plan.privateValue = marker;
	internal.advisory.plan.facts.privateValue = marker;
	internal.advisory.explanation.privateValue = marker;

	const result = projectWorkspaceAdvisory(internal);

	assert.equal(result.status, 'advised');
	assert.equal(JSON.stringify(result).includes(marker), false);
});

test('projection rejects non-mock advisory sources', async () => {
	const advisory = createWorkspaceAdvisory();
	const internal = await advisory.assess(...args);

	assert.equal(internal.status, 'advised');

	internal.advisory.source = 'jev';

	assert.equal(projectWorkspaceAdvisory(internal).status, 'unavailable');
});

test('projection rejects execution-enabled plans', async () => {
	const advisory = createWorkspaceAdvisory();
	const internal = await advisory.assess(...args);

	assert.equal(internal.status, 'advised');

	internal.advisory.plan.execution = 'enabled';

	assert.equal(projectWorkspaceAdvisory(internal).status, 'unavailable');
});

test('unknown failure details are not exposed', () => {
	const result = projectWorkspaceAdvisory({
		status: 'unavailable',
		reason: 'PRIVATE_PROVIDER_ERROR'
	});

	assert.equal(result.status, 'unavailable');
	assert.equal(JSON.stringify(result).includes('PRIVATE_PROVIDER_ERROR'), false);
});

test('missing session prevents advisory dispatch', async () => {
	const { coordinator, advisory } = setup();

	const result = await coordinator.assess(owner, undefined, ...args, allow);

	assert.deepEqual(result, { status: 'missing_session' });
	assert.equal(advisory.getUsage().assessmentAttempts, 0);
});

test('foreign session prevents advisory dispatch', async () => {
	const { coordinator, advisory, id } = setup();

	const result = await coordinator.assess(other, id, ...args, allow);

	assert.deepEqual(result, { status: 'missing_session' });
	assert.equal(advisory.getUsage().assessmentAttempts, 0);
});

test('concurrent assessment is rejected while first remains active', async () => {
	const gate = deferred();
	const advisory = createWorkspaceAdvisory();

	const { coordinator, id } = setup({
		async assess(...input) {
			await gate.promise;
			return advisory.assess(...input);
		}
	});

	const pending = coordinator.assess(owner, id, ...args, allow);

	const second = await coordinator.assess(owner, id, ...args, allow);

	assert.deepEqual(second, { status: 'busy' });

	gate.resolve();

	assert.equal((await pending).status, 'completed');
	assert.equal(advisory.getUsage().assessmentAttempts, 1);
});

test('session closure discards an in-flight result', async () => {
	const gate = deferred();
	const advisory = createWorkspaceAdvisory();

	const { coordinator, sessions, id } = setup({
		async assess(...input) {
			await gate.promise;
			return advisory.assess(...input);
		}
	});

	const pending = coordinator.assess(owner, id, ...args, allow);

	sessions.close(owner, id);

	gate.resolve();

	assert.deepEqual(await pending, { status: 'discarded' });
	assert.equal(coordinator.readSummary(owner, id), null);
});

test('owner revocation discards an in-flight result', async () => {
	const gate = deferred();
	const advisory = createWorkspaceAdvisory();

	const { coordinator, sessions, id } = setup({
		async assess(...input) {
			await gate.promise;
			return advisory.assess(...input);
		}
	});

	const pending = coordinator.assess(owner, id, ...args, allow);

	sessions.revokeOwner(owner);

	gate.resolve();

	assert.deepEqual(await pending, { status: 'discarded' });
	assert.equal(coordinator.readSummary(owner, id), null);
});

test('session expiration discards an in-flight result', async () => {
	const gate = deferred();
	const advisory = createWorkspaceAdvisory();

	const { coordinator, id, advance } = setup({
		async assess(...input) {
			await gate.promise;
			return advisory.assess(...input);
		}
	});

	const pending = coordinator.assess(owner, id, ...args, allow);

	advance(workspaceLimits.idleMs);

	gate.resolve();

	assert.deepEqual(await pending, { status: 'discarded' });
	assert.equal(coordinator.readSummary(owner, id), null);
});

test('publication denial discards advice and releases admission', async () => {
	const { coordinator, id } = setup();

	const denied = await coordinator.assess(owner, id, ...args, () => false);

	assert.deepEqual(denied, { status: 'discarded' });

	const summary = coordinator.readSummary(owner, id);

	assert.equal(summary.history.length, 1);
	assert.equal(summary.history[0].outcome, 'unavailable');

	const next = await coordinator.assess(owner, id, ...args, allow);

	assert.equal(next.status, 'completed');
});

test('publication authorization exceptions fail closed', async () => {
	const { coordinator, id } = setup();

	const result = await coordinator.assess(owner, id, ...args, () => {
		throw new Error('PRIVATE_AUTHORIZATION_ERROR');
	});

	assert.deepEqual(result, { status: 'discarded' });

	assert.equal(coordinator.readSummary(owner, id).history[0].outcome, 'unavailable');
});

test('revocation during asynchronous publication check discards result', async () => {
	const entered = deferred();
	const gate = deferred();

	const { coordinator, sessions, id } = setup();

	const pending = coordinator.assess(owner, id, ...args, async () => {
		entered.resolve();
		await gate.promise;
		return true;
	});

	await entered.promise;

	sessions.revokeOwner(owner);

	gate.resolve();

	assert.deepEqual(await pending, { status: 'discarded' });
});

test('advisory exceptions produce sanitized unavailable results', async () => {
	const { coordinator, id } = setup({
		async assess() {
			throw new Error('PRIVATE_ADVISORY_ERROR');
		}
	});

	const result = await coordinator.assess(owner, id, ...args, allow);

	assert.equal(result.status, 'completed');
	assert.equal(result.result.status, 'unavailable');
	assert.equal(JSON.stringify(result).includes('PRIVATE_ADVISORY_ERROR'), false);

	assert.equal(coordinator.readSummary(owner, id).history[0].outcome, 'unavailable');
});

test('missing context remains unknown rather than zero', async () => {
	const { coordinator, id } = setup();

	const response = await coordinator.assess(
		owner,
		id,
		'registered',
		'prepare_tournament',
		'information_missing',
		'synthetic-actor-owner',
		allow
	);

	assert.equal(response.status, 'completed');
	assert.equal(response.result.status, 'advised');
	assert.equal(response.result.decision, 'clarification');
	assert.equal(response.result.context.participantCount, null);
	assert.equal(response.result.readiness, null);
});

test('raw objective text is absent from results and history', async () => {
	const { coordinator, id } = setup();

	const raw = 'PRIVATE OBJECTIVE TEXT';

	const result = await coordinator.assess(
		owner,
		id,
		'natural',
		raw,
		'spring_invitational',
		'synthetic-actor-owner',
		allow
	);

	assert.equal(result.status, 'completed');
	assert.equal(result.result.status, 'rejected');

	const summary = coordinator.readSummary(owner, id);

	assert.equal(JSON.stringify(result).includes(raw), false);
	assert.equal(JSON.stringify(summary).includes(raw), false);
	assert.equal(summary.history[0].outcome, 'rejected');
});

test('session summaries isolate history and usage', async () => {
	const { coordinator, sessions, id } = setup();

	const second = sessions.start(owner);
	const unrelated = sessions.start(other);

	await coordinator.assess(owner, id, ...args, allow);

	const summary = coordinator.readSummary(owner, id);

	assert.equal(summary.usage.completedAssessments, 1);
	assert.equal(summary.usage.retainedAssessments, 1);
	assert.equal(summary.usage.paidProviderRequests, 0);
	assert.equal(summary.usage.paidProviderCost, 0);

	assert.equal(coordinator.readSummary(owner, second.id).usage.completedAssessments, 0);

	assert.equal(coordinator.readSummary(other, unrelated.id).usage.completedAssessments, 0);

	assert.equal(coordinator.readSummary(other, id), null);
});

test('session rate limit prevents additional advisory dispatch', async () => {
	const { coordinator, advisory, id } = setup();

	for (let i = 0; i < workspaceLimits.maxAssessmentsPerUserPerWindow; i++) {
		const result = await coordinator.assess(owner, id, ...args, allow);

		assert.equal(result.status, 'completed');
	}

	const overflow = await coordinator.assess(owner, id, ...args, allow);

	assert.deepEqual(overflow, { status: 'rate_limited' });

	assert.equal(
		advisory.getUsage().assessmentAttempts,
		workspaceLimits.maxAssessmentsPerUserPerWindow
	);
});

test('coordinator exposes no approval or execution capability', () => {
	const { coordinator } = setup();

	assert.deepEqual(Object.keys(coordinator).sort(), ['assess', 'readSummary']);

	assert.equal(Object.isFrozen(coordinator), true);
});
