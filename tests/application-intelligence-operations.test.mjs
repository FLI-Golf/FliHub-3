import assert from 'node:assert/strict';
import test from 'node:test';

import { applicationOperationIds } from '../src/lib/server/intelligence/application/operations/contracts.ts';

import {
	getApplicationOperation,
	isApplicationOperationId,
	listApplicationOperations,
	operationsForRecommendation
} from '../src/lib/server/intelligence/application/operations/registry.ts';

import { validateApplicationOperationRequest } from '../src/lib/server/intelligence/application/operations/validation.ts';

import { getApplicationCapability } from '../src/lib/server/intelligence/application/capabilities.ts';

const operationId = 'create_synthetic_group_assignments';

const request = () => ({
	operationId,
	fixtureId: 'spring_invitational'
});

test('registers exactly one synthetic operation', () => {
	assert.deepEqual(applicationOperationIds, [operationId]);

	const operations = listApplicationOperations();

	assert.equal(operations.length, 1);
	assert.equal(operations[0].id, operationId);
	assert.equal(operations[0].scope, 'synthetic-only');
	assert.equal(operations[0].approvalRequired, true);
	assert.equal(operations[0].execution, 'not-implemented');
});

test('maps the registered advisory recommendation locally', () => {
	assert.deepEqual(
		operationsForRecommendation('plan_group_assignments').map((operation) => operation.id),
		[operationId]
	);
});

test('preserves existing advisory capability contracts', () => {
	const capability = getApplicationCapability('plan_group_assignments');

	assert.equal(capability.effect, 'recommendation-only');
	assert.equal(capability.execution, 'not-implemented');
});

test('recognizes an exact registered synthetic request', () => {
	assert.deepEqual(validateApplicationOperationRequest(request()), {
		status: 'recognized',
		request: request()
	});
});

test('recognition returns an independent request copy', () => {
	const input = request();
	const result = validateApplicationOperationRequest(input);

	input.fixtureId = 'changed';

	assert.equal(result.request.fixtureId, 'spring_invitational');
});

test('registry definitions cannot be mutated through lookup', () => {
	const operation = getApplicationOperation(operationId);

	operation.approvalRequired = false;
	operation.scope = 'production';
	operation.execution = 'enabled';

	const fresh = getApplicationOperation(operationId);

	assert.equal(fresh.approvalRequired, true);
	assert.equal(fresh.scope, 'synthetic-only');
	assert.equal(fresh.execution, 'not-implemented');
});

test('registry listings return independent definitions', () => {
	const operations = listApplicationOperations();

	operations[0].label = 'changed';
	operations.length = 0;

	assert.equal(listApplicationOperations().length, 1);
	assert.notEqual(listApplicationOperations()[0].label, 'changed');
});

test('recommendation mappings return independent definitions', () => {
	const operations = operationsForRecommendation('plan_group_assignments');

	operations[0].approvalRequired = false;

	assert.equal(operationsForRecommendation('plan_group_assignments')[0].approvalRequired, true);
});

for (const value of [
	'delete_records',
	'execute_sql',
	'run_shell',
	'constructor',
	'__proto__',
	'toString',
	'',
	null,
	42,
	{}
]) {
	test(`rejects unregistered operation: ${String(value)}`, () => {
		assert.equal(isApplicationOperationId(value), false);
		assert.equal(getApplicationOperation(value), null);

		assert.deepEqual(
			validateApplicationOperationRequest({
				...request(),
				operationId: value
			}),
			{
				status: 'rejected',
				reason: 'unknown_operation'
			}
		);
	});
}

for (const recommendation of [
	'review_participant_readiness',
	'review_scoring_requirements',
	'review_event_prerequisites',
	'request_clarification',
	'constructor',
	'unknown',
	null
]) {
	test(`does not map recommendation: ${recommendation}`, () => {
		assert.deepEqual(operationsForRecommendation(recommendation), []);
	});
}

for (const fixtureId of [
	'groups_prepared',
	'participants_missing',
	'real-event-id',
	'production',
	'',
	null,
	42
]) {
	test(`rejects unsupported fixture: ${fixtureId}`, () => {
		assert.deepEqual(
			validateApplicationOperationRequest({
				...request(),
				fixtureId
			}),
			{
				status: 'rejected',
				reason: 'unsupported_fixture'
			}
		);
	});
}

for (const field of [
	'actorId',
	'organizationId',
	'eventId',
	'role',
	'permissions',
	'approved',
	'approval',
	'confidence',
	'parameters',
	'command',
	'sql',
	'code',
	'path',
	'execute'
]) {
	test(`rejects unexpected field: ${field}`, () => {
		assert.deepEqual(
			validateApplicationOperationRequest({
				...request(),
				[field]: true
			}),
			{
				status: 'rejected',
				reason: 'invalid_request'
			}
		);
	});
}

for (const value of [
	null,
	undefined,
	[],
	42,
	'request',
	{},
	{ operationId },
	{ fixtureId: 'spring_invitational' },
	Object.create(request()),
	new Date()
]) {
	test(`rejects malformed request: ${String(value)}`, () => {
		assert.deepEqual(validateApplicationOperationRequest(value), {
			status: 'rejected',
			reason: 'invalid_request'
		});
	});
}

test('rejects accessor fields without invoking getters', () => {
	let invoked = false;

	const input = {
		fixtureId: 'spring_invitational',
		get operationId() {
			invoked = true;
			return operationId;
		}
	};

	assert.equal(validateApplicationOperationRequest(input).status, 'rejected');

	assert.equal(invoked, false);
});

test('rejects symbol-keyed extra fields', () => {
	const input = {
		...request(),
		[Symbol('extra')]: true
	};

	assert.equal(validateApplicationOperationRequest(input).status, 'rejected');
});

test('rejects non-enumerable extra fields', () => {
	const input = request();

	Object.defineProperty(input, 'approved', {
		value: true,
		enumerable: false
	});

	assert.equal(validateApplicationOperationRequest(input).status, 'rejected');
});

test('accepts exact null-prototype data objects', () => {
	const input = Object.assign(Object.create(null), request());

	assert.equal(validateApplicationOperationRequest(input).status, 'recognized');
});

test('fails closed when object inspection throws', () => {
	const input = new Proxy(request(), {
		getPrototypeOf() {
			throw new Error('unexpected inspection failure');
		}
	});

	assert.deepEqual(validateApplicationOperationRequest(input), {
		status: 'rejected',
		reason: 'invalid_request'
	});
});

test('exported operation identifiers are immutable at runtime', () => {
	assert.equal(Object.isFrozen(applicationOperationIds), true);

	assert.throws(() => {
		applicationOperationIds.push('execute_sql');
	}, TypeError);

	assert.deepEqual(applicationOperationIds, ['create_synthetic_group_assignments']);
});

test('exported failure reasons are immutable at runtime', async () => {
	const { applicationOperationFailureReasons } =
		await import('../src/lib/server/intelligence/application/operations/contracts.ts');

	assert.equal(Object.isFrozen(applicationOperationFailureReasons), true);

	assert.throws(() => {
		applicationOperationFailureReasons.push('arbitrary_failure');
	}, TypeError);
});
