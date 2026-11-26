import assert from 'node:assert/strict';
import test from 'node:test';

import {
	canonicalJson,
	canonicalSha256
} from '../src/lib/server/intelligence/application/operations/canonical.ts';

import {
	createSyntheticOperationState,
	syntheticActorIds
} from '../src/lib/server/intelligence/application/operations/fixtures.ts';

import {
	prepareSyntheticExecutionPlan,
	validateSyntheticExecutionPlan
} from '../src/lib/server/intelligence/application/operations/execution-plan.ts';

const fixture = () => createSyntheticOperationState('spring_invitational');

const request = () => ({
	operationId: 'create_synthetic_group_assignments',
	fixtureId: 'spring_invitational'
});

function prepare(state = fixture(), actor = syntheticActorIds.owner) {
	const result = prepareSyntheticExecutionPlan(state, actor, request());

	assert.equal(result.status, 'prepared');

	return result.plan;
}

function validate(state, plan, actor = syntheticActorIds.owner) {
	return validateSyntheticExecutionPlan(state, actor, plan);
}

test('canonical object key ordering is stable', () => {
	assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');

	assert.equal(canonicalSha256({ b: 2, a: 1 }), canonicalSha256({ a: 1, b: 2 }));
});

test('canonical array ordering is preserved', () => {
	assert.notEqual(canonicalSha256([1, 2]), canonicalSha256([2, 1]));
});

test('SHA-256 matches a known reference digest', () => {
	assert.equal(
		canonicalSha256({}),
		'44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
	);
});

test('canonical serialization rejects unsupported values', () => {
	const cycle = {};
	cycle.self = cycle;

	const sparseArray = [1, 2, 3];
	delete sparseArray[1];

	for (const value of [
		undefined,
		NaN,
		Infinity,
		-0,
		1.5,
		1n,
		Symbol('invalid'),
		() => {},
		new Date(),
		new Map(),
		new Set(),
		cycle,
		sparseArray,
		{ value: undefined },
		{ [Symbol('extra')]: true }
	]) {
		assert.throws(() => canonicalJson(value));
	}
});

test('canonical serialization rejects accessors without invoking them', () => {
	let invoked = false;

	const input = {
		get value() {
			invoked = true;
			return 1;
		}
	};

	assert.throws(() => canonicalJson(input));
	assert.equal(invoked, false);
});

test('canonical serialization rejects hidden properties', () => {
	const input = {};

	Object.defineProperty(input, 'hidden', {
		value: true,
		enumerable: false
	});

	assert.throws(() => canonicalJson(input));
});

test('canonical serialization rejects oversized strings', () => {
	assert.throws(() => canonicalJson('x'.repeat(20000)));
});

test('canonical serialization rejects excessive nesting', () => {
	let value = {};

	for (let index = 0; index < 40; index++) {
		value = { value };
	}

	assert.throws(() => canonicalJson(value));
});

test('prepares an exact synthetic execution plan', () => {
	const state = fixture();
	const before = structuredClone(state);
	const plan = prepare(state);

	assert.equal(plan.body.kind, 'synthetic-execution-plan');

	assert.equal(plan.body.version, 1);
	assert.equal(plan.body.scope, 'synthetic-only');
	assert.equal(plan.body.approvalRequired, true);

	assert.equal(plan.body.stateDigest, canonicalSha256(state));

	assert.equal(plan.digest, canonicalSha256(plan.body));

	assert.match(plan.digest, /^[a-f0-9]{64}$/);

	assert.equal(plan.body.proposal.groups.length, 6);

	assert.equal(plan.body.proposal.execution, 'requires-approval');

	assert.deepEqual(state, before);
});

test('identical state and actor produce identical plans', () => {
	assert.deepEqual(prepare(), prepare());
});

test('plan and nested assignments are immutable', () => {
	const plan = prepare();

	for (const value of [
		plan,
		plan.body,
		plan.body.proposal,
		plan.body.proposal.summary,
		plan.body.proposal.groups,
		plan.body.proposal.groups[0],
		plan.body.proposal.groups[0].entries,
		plan.body.proposal.groups[0].entries[0],
		plan.body.proposal.groups[0].entries[0].athleteIds
	]) {
		assert.equal(Object.isFrozen(value), true);
	}

	assert.throws(() => {
		plan.body.proposal.groups.length = 0;
	}, TypeError);

	assert.throws(() => {
		plan.body.proposal.groups[0].entries[0].athleteIds[0] = 'synthetic-invented';
	}, TypeError);
});

test('validates the exact reviewed plan', () => {
	const state = fixture();
	const plan = prepare(state);

	const result = validate(state, structuredClone(plan));

	assert.equal(result.status, 'valid');
	assert.deepEqual(result.plan, plan);
	assert.notEqual(result.plan, plan);
	assert.equal(Object.isFrozen(result.plan), true);
});

test('actor identity is bound to the plan digest', () => {
	const state = fixture();

	const owner = prepare(state, syntheticActorIds.owner);

	const admin = prepare(state, syntheticActorIds.admin);

	assert.notEqual(owner.digest, admin.digest);

	assert.deepEqual(validate(state, owner, syntheticActorIds.admin), {
		status: 'rejected',
		reason: 'invalid_plan'
	});
});

test('rejects unauthorized plan preparation', () => {
	const result = prepareSyntheticExecutionPlan(fixture(), syntheticActorIds.viewer, request());

	assert.deepEqual(result, {
		status: 'rejected',
		reason: 'unauthorized_actor'
	});
});

test('rejects a changed state revision', () => {
	const state = fixture();
	const plan = prepare(state);

	state.revision++;

	assert.deepEqual(validate(state, plan), {
		status: 'rejected',
		reason: 'stale_state'
	});
});

test('rejects state changes without a revision increment', () => {
	const state = fixture();
	const plan = prepare(state);

	state.teams[0].name = 'Changed team';

	assert.equal(state.revision, 0);

	assert.deepEqual(validate(state, plan), {
		status: 'rejected',
		reason: 'stale_state'
	});
});

test('rejects a plan after actor permissions change', () => {
	const state = fixture();
	const plan = prepare(state);

	state.actors[0].role = 'viewer';

	assert.equal(validate(state, plan).status, 'rejected');
});

test('rejects a modified plan digest', () => {
	const state = fixture();
	const plan = structuredClone(prepare(state));

	plan.digest = '0'.repeat(64);

	assert.deepEqual(validate(state, plan), {
		status: 'rejected',
		reason: 'invalid_plan'
	});
});

const modifications = [
	[
		'group assignment',
		(plan) => {
			plan.body.proposal.groups[0].entries[0].athleteIds[0] = 'synthetic-invented';
		}
	],
	[
		'operation identifier',
		(plan) => {
			plan.body.proposal.operationId = 'execute_sql';
		}
	],
	[
		'approval requirement',
		(plan) => {
			plan.body.approvalRequired = false;
		}
	],
	[
		'organization',
		(plan) => {
			plan.body.proposal.organizationId = 'synthetic-org-outside';
		}
	],
	[
		'event',
		(plan) => {
			plan.body.proposal.eventId = 'synthetic-event-other';
		}
	],
	[
		'execution authority',
		(plan) => {
			plan.body.proposal.execution = 'enabled';
		}
	],
	[
		'plan version',
		(plan) => {
			plan.body.version = 2;
		}
	],
	[
		'scope',
		(plan) => {
			plan.body.scope = 'production';
		}
	]
];

for (const [name, modify] of modifications) {
	test(`rejects modified ${name}`, () => {
		const state = fixture();
		const plan = structuredClone(prepare(state));

		modify(plan);

		assert.equal(validate(state, plan).status, 'rejected');
	});

	test(`rejects rehashed ${name}`, () => {
		const state = fixture();
		const plan = structuredClone(prepare(state));

		modify(plan);

		plan.digest = canonicalSha256(plan.body);

		assert.equal(validate(state, plan).status, 'rejected');
	});
}

test('rejects caller-supplied approval metadata', () => {
	const state = fixture();
	const plan = structuredClone(prepare(state));

	plan.approved = true;

	assert.deepEqual(validate(state, plan), {
		status: 'rejected',
		reason: 'invalid_plan'
	});
});

test('rejects malformed plan inputs', () => {
	for (const input of [null, undefined, {}, [], 'plan', 42, { body: {}, digest: 'invalid' }]) {
		assert.equal(validate(fixture(), input).status, 'rejected');
	}
});

test('validation does not modify state or candidate', () => {
	const state = fixture();
	const plan = structuredClone(prepare(state));

	const stateBefore = structuredClone(state);
	const planBefore = structuredClone(plan);

	assert.equal(validate(state, plan).status, 'valid');

	assert.deepEqual(state, stateBefore);
	assert.deepEqual(plan, planBefore);
});
