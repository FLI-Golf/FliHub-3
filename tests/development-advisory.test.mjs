import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	ABSTENTION_REASONS,
	ADVISORY_LIMITS,
	ADVISORY_VERSION,
	EVIDENCE_PROVENANCE,
	EVIDENCE_RECOMMENDATIONS,
	PLANNING_RECOMMENDATIONS,
	ROADMAP_OBJECTIVES,
	UNAVAILABLE_REASONS
} from '../tools/intelligence/development-advisory/contracts.ts';

import {
	validateAdvisoryRequest,
	validateAdvisoryOutcome
} from '../tools/intelligence/development-advisory/validation.ts';

function planning() {
	return {
		version: ADVISORY_VERSION,
		kind: 'planning',
		context: {
			objective: {
				kind: 'custom',
				summary: 'Prepare a bounded development assignment'
			},
			repositoryFacts: [
				{ kind: 'starting-checkpoint', value: 'a'.repeat(40) },
				{ kind: 'current-checkpoint', value: 'b'.repeat(40) },
				{ kind: 'working-tree', value: 'clean' },
				{ kind: 'tracking-relationship', value: 'synchronized' }
			],
			documentationReferences: [{ id: 'intelligence-roadmap', section: 'ADM-6B' }]
		},
		requestedRecommendation: 'next-planning-step'
	};
}

function evidence() {
	return {
		...planning(),
		kind: 'evidence-assessment',
		requestedRecommendation: 'next-evidence-review-step',
		evidenceSummaries: [
			{
				provenance: 'worker-reported-unverified',
				summary: 'Worker reports that verification passed'
			},
			{
				provenance: 'independent-observation-summary',
				summary: 'Reviewer observed the local checkpoint'
			},
			{
				provenance: 'operator-selected-summary',
				summary: 'Operator requests additional review'
			}
		]
	};
}

function recommendation(kind = 'planning') {
	return {
		version: ADVISORY_VERSION,
		kind,
		status: 'recommendation',
		recommendation: kind === 'planning' ? PLANNING_RECOMMENDATIONS[0] : EVIDENCE_RECOMMENDATIONS[0],
		confidence: 0.9
	};
}

function acceptRequest(input) {
	const result = validateAdvisoryRequest(input);
	assert.equal(result.ok, true);
	assert.equal(JSON.stringify(result.value), JSON.stringify(input));
	return result.value;
}

function rejectRequest(input) {
	assert.deepEqual(validateAdvisoryRequest(input), {
		ok: false,
		reason: 'invalid-request'
	});
}

function acceptOutcome(input, kind = input.kind) {
	const result = validateAdvisoryOutcome(input, kind);
	assert.equal(result.ok, true);
	assert.equal(JSON.stringify(result.value), JSON.stringify(input));
	return result.value;
}

function rejectOutcome(input, kind = 'planning') {
	assert.deepEqual(validateAdvisoryOutcome(input, kind), {
		ok: false,
		reason: 'invalid-response'
	});
}

test('accepts selected planning context', () => {
	acceptRequest(planning());
});

test('accepts contextual evidence assessment', () => {
	acceptRequest(evidence());
});

test('accepts every registered roadmap objective', () => {
	for (const id of ROADMAP_OBJECTIVES) {
		const request = planning();
		request.context.objective = { kind: 'roadmap', id };
		acceptRequest(request);
	}
});

test('accepts empty optional context collections', () => {
	const request = evidence();
	request.context.repositoryFacts = [];
	request.context.documentationReferences = [];
	request.evidenceSummaries = [];
	acceptRequest(request);
});

test('preserves all supplied evidence provenance classifications', () => {
	const request = evidence();
	const result = acceptRequest(request);

	assert.deepEqual(
		result.evidenceSummaries.map((item) => item.provenance).sort(),
		[...EVIDENCE_PROVENANCE].sort()
	);

	assert.equal(result.evidenceSummaries[0].provenance, 'worker-reported-unverified');
});

test('validated data is detached from original objects', () => {
	const request = evidence();
	const result = acceptRequest(request);

	assert.notEqual(result, request);
	assert.notEqual(result.context, request.context);
	assert.notEqual(result.evidenceSummaries, request.evidenceSummaries);
	assert.equal(Object.getPrototypeOf(result), null);

	request.context.objective.summary = 'Changed after validation';
	request.evidenceSummaries[0].provenance = 'operator-selected-summary';

	assert.equal(result.context.objective.summary, 'Prepare a bounded development assignment');

	assert.equal(result.evidenceSummaries[0].provenance, 'worker-reported-unverified');
});

test('accepts ordinary null-prototype records', () => {
	const request = Object.assign(Object.create(null), planning());
	acceptRequest(request);
});

test('rejects unsupported request versions', () => {
	for (const version of [0, 2, '1', null, undefined]) {
		rejectRequest({ ...planning(), version });
	}
});

test('rejects unsupported advisory kinds and purposes', () => {
	rejectRequest({ ...planning(), kind: 'execute' });

	rejectRequest({
		...planning(),
		requestedRecommendation: 'next-evidence-review-step'
	});

	rejectRequest({
		...evidence(),
		requestedRecommendation: 'next-planning-step'
	});
});

test('rejects missing required request fields', () => {
	for (const key of Object.keys(planning())) {
		const request = planning();
		delete request[key];
		rejectRequest(request);
	}

	const request = evidence();
	delete request.evidenceSummaries;
	rejectRequest(request);
});

test('rejects undeclared request fields and authority assertions', () => {
	for (const key of [
		'approved',
		'authorization',
		'execute',
		'command',
		'provider',
		'budget',
		'acceptance',
		'disclosureApproved',
		'rawCompletionReport',
		'sourceCode',
		'commandOutput',
		'privateData'
	]) {
		rejectRequest({ ...planning(), [key]: 'synthetic-value' });
	}
});

test('rejects unknown nested context fields', () => {
	const request = planning();
	request.context.rawRepositoryText = 'Synthetic repository text';
	rejectRequest(request);
});

test('rejects evidence summaries on planning requests', () => {
	rejectRequest({ ...planning(), evidenceSummaries: [] });
});

test('rejects unsupported roadmap objectives', () => {
	const request = planning();
	request.context.objective = {
		kind: 'roadmap',
		id: 'unsupported-objective'
	};
	rejectRequest(request);
});

test('rejects invalid objective text', () => {
	for (const summary of ['', ' ', ' padded ', null, 42, {}, []]) {
		const request = planning();
		request.context.objective.summary = summary;
		rejectRequest(request);
	}
});

test('enforces objective UTF-8 byte boundaries', () => {
	for (const summary of [
		'a'.repeat(ADVISORY_LIMITS.objectiveBytes),
		'é'.repeat(ADVISORY_LIMITS.objectiveBytes / 2)
	]) {
		const request = planning();
		request.context.objective.summary = summary;
		acceptRequest(request);

		request.context.objective.summary += 'a';
		rejectRequest(request);
	}
});

test('rejects control characters and invalid Unicode surrogates', () => {
	for (const character of [
		'\n',
		'\r',
		'\t',
		'\u0000',
		'\u007f',
		'\u2028',
		'\u2029',
		'\u202e',
		'\ud800'
	]) {
		const request = planning();
		request.context.objective.summary = `Before${character}After`;
		rejectRequest(request);
	}
});

test('rejects recognizable synthetic credential signatures', () => {
	const signatures = [
		'-----BEGIN PRIVATE KEY-----',
		'ghp_' + 'a'.repeat(30),
		'github_pat_' + 'b'.repeat(30),
		'sk-' + 'c'.repeat(30),
		'AKIA' + 'A'.repeat(16),
		'API_KEY=synthetic-example',
		'password: synthetic-example',
		'Bearer ' + 'd'.repeat(20)
	];

	for (const signature of signatures) {
		const request = planning();
		request.context.objective.summary = signature;
		rejectRequest(request);

		const assessment = evidence();
		assessment.evidenceSummaries[0].summary = signature;
		rejectRequest(assessment);

		const documentation = planning();
		documentation.context.documentationReferences[0].section = signature;
		rejectRequest(documentation);
	}
});

test('rejects unsupported repository facts and invalid values', () => {
	for (const fact of [
		{ kind: 'source-code', value: 'synthetic' },
		{ kind: 'starting-checkpoint', value: 'abc' },
		{ kind: 'current-checkpoint', value: 'G'.repeat(40) },
		{ kind: 'working-tree', value: 'verified' },
		{ kind: 'tracking-relationship', value: 'approved' },
		{ kind: 'working-tree', value: 'clean', verified: true }
	]) {
		const request = planning();
		request.context.repositoryFacts = [fact];
		rejectRequest(request);
	}
});

test('rejects duplicate repository fact kinds', () => {
	const request = planning();
	request.context.repositoryFacts.push({
		kind: 'working-tree',
		value: 'modified'
	});
	rejectRequest(request);
});

test('rejects unsupported documentation references', () => {
	for (const reference of [
		{ id: 'arbitrary-file', section: 'Overview' },
		{ id: '../../private-file', section: 'Overview' },
		{ id: 'intelligence-roadmap', section: '' },
		{
			id: 'intelligence-roadmap',
			section: 'Overview',
			content: 'Synthetic document text'
		}
	]) {
		const request = planning();
		request.context.documentationReferences = [reference];
		rejectRequest(request);
	}
});

test('enforces documentation and evidence summary byte boundaries', () => {
	const request = evidence();
	const summary = 'é'.repeat(ADVISORY_LIMITS.summaryBytes / 2);

	request.context.documentationReferences[0].section = summary;
	request.evidenceSummaries[0].summary = summary;
	acceptRequest(request);

	request.evidenceSummaries[0].summary += 'a';
	rejectRequest(request);

	request.evidenceSummaries[0].summary = summary;
	request.context.documentationReferences[0].section += 'a';
	rejectRequest(request);
});

test('rejects duplicate documentation and evidence entries', () => {
	const request = planning();
	request.context.documentationReferences.push(request.context.documentationReferences[0]);
	rejectRequest(request);

	const assessment = evidence();
	assessment.evidenceSummaries.push(assessment.evidenceSummaries[0]);
	rejectRequest(assessment);
});

test('rejects unsupported provenance and attestation fields', () => {
	const request = evidence();
	request.evidenceSummaries[0].provenance = 'verified';
	rejectRequest(request);

	const assessment = evidence();
	assessment.evidenceSummaries[0].verified = true;
	rejectRequest(assessment);
});

test('enforces documentation collection limits', () => {
	const request = planning();

	request.context.documentationReferences = Array.from(
		{ length: ADVISORY_LIMITS.documentationReferences },
		(_, index) => ({
			id: 'intelligence-roadmap',
			section: `Section ${index}`
		})
	);

	acceptRequest(request);

	request.context.documentationReferences.push({
		id: 'intelligence-roadmap',
		section: 'Excess section'
	});

	rejectRequest(request);
});

test('enforces evidence collection limits', () => {
	const request = evidence();

	request.evidenceSummaries = Array.from(
		{ length: ADVISORY_LIMITS.evidenceSummaries },
		(_, index) => ({
			provenance: 'worker-reported-unverified',
			summary: `Summary ${index}`
		})
	);

	acceptRequest(request);

	request.evidenceSummaries.push({
		provenance: 'worker-reported-unverified',
		summary: 'Excess summary'
	});

	rejectRequest(request);
});

test('rejects excessive repository fact collections', () => {
	const request = planning();

	request.context.repositoryFacts = Array.from(
		{ length: ADVISORY_LIMITS.repositoryFacts + 1 },
		() => ({ kind: 'working-tree', value: 'clean' })
	);

	rejectRequest(request);
});

test('rejects oversized aggregate request payloads', () => {
	const request = evidence();

	request.context.objective.summary = '"'.repeat(1200);

	request.context.documentationReferences = Array.from({ length: 8 }, (_, index) => ({
		id: 'intelligence-roadmap',
		section: `${index}${'"'.repeat(511)}`
	}));

	request.evidenceSummaries = Array.from({ length: 8 }, (_, index) => ({
		provenance: 'worker-reported-unverified',
		summary: `${index}${'"'.repeat(511)}`
	}));

	assert.ok(Buffer.byteLength(JSON.stringify(request)) > ADVISORY_LIMITS.requestBytes);

	rejectRequest(request);
});

test('rejects malformed top-level inputs', () => {
	for (const value of [
		null,
		undefined,
		true,
		42,
		'request',
		[],
		new Date(),
		new Map(),
		new Set(),
		() => planning()
	]) {
		rejectRequest(value);
	}
});

test('rejects custom prototypes', () => {
	const request = Object.assign(Object.create({ inherited: true }), planning());
	rejectRequest(request);

	const nested = planning();
	Object.setPrototypeOf(nested.context, { inherited: true });
	rejectRequest(nested);
});

test('rejects accessors without invoking them', () => {
	let calls = 0;
	const request = planning();

	Object.defineProperty(request.context.objective, 'summary', {
		enumerable: true,
		get() {
			calls++;
			throw new Error('Getter must not execute');
		}
	});

	rejectRequest(request);
	assert.equal(calls, 0);
});

test('rejects array accessors without invoking them', () => {
	let calls = 0;
	const request = planning();

	Object.defineProperty(request.context.repositoryFacts, '0', {
		enumerable: true,
		get() {
			calls++;
			throw new Error('Array getter must not execute');
		}
	});

	rejectRequest(request);
	assert.equal(calls, 0);
});

test('rejects proxies without invoking traps', () => {
	let calls = 0;

	const trap = () => {
		calls++;
		throw new Error('Proxy trap must not execute');
	};

	const handler = {
		get: trap,
		getPrototypeOf: trap,
		ownKeys: trap,
		getOwnPropertyDescriptor: trap
	};

	rejectRequest(new Proxy(planning(), handler));

	const request = planning();
	request.context = new Proxy(request.context, handler);
	rejectRequest(request);

	const arrayRequest = planning();
	arrayRequest.context.repositoryFacts = new Proxy([], handler);
	rejectRequest(arrayRequest);

	rejectOutcome(new Proxy(recommendation(), handler));

	assert.equal(calls, 0);
});

test('rejects revoked proxies', () => {
	const { proxy, revoke } = Proxy.revocable(planning(), {});
	revoke();
	rejectRequest(proxy);
});

test('rejects symbol and non-enumerable properties', () => {
	const request = planning();
	request[Symbol('hidden')] = true;
	rejectRequest(request);

	const hidden = planning();
	Object.defineProperty(hidden.context, 'hidden', {
		value: true,
		enumerable: false
	});
	rejectRequest(hidden);
});

test('rejects malformed and sparse arrays', () => {
	const sparse = planning();
	sparse.context.repositoryFacts = new Array(2);
	rejectRequest(sparse);

	const extended = planning();
	extended.context.repositoryFacts.extra = true;
	rejectRequest(extended);

	const symbolic = planning();
	symbolic.context.repositoryFacts[Symbol('extra')] = true;
	rejectRequest(symbolic);

	const subclassed = planning();
	subclassed.context.repositoryFacts = new (class extends Array {})();
	rejectRequest(subclassed);

	const hidden = planning();
	Object.defineProperty(hidden.context.repositoryFacts, '0', {
		enumerable: false
	});
	rejectRequest(hidden);
});

test('rejects prototype pollution keys', () => {
	for (const key of ['__proto__', 'constructor', 'prototype']) {
		const request = planning();

		Object.defineProperty(request.context, key, {
			value: { polluted: true },
			enumerable: true
		});

		rejectRequest(request);
	}

	assert.equal(Object.prototype.polluted, undefined);
});

test('rejects custom serializers without invoking them', () => {
	let calls = 0;
	const request = planning();

	request.toJSON = () => {
		calls++;
		return planning();
	};

	rejectRequest(request);
	assert.equal(calls, 0);
});

test('rejects cycles and excessive nesting', () => {
	const cyclic = planning();
	cyclic.context.objective.summary = cyclic;
	rejectRequest(cyclic);

	let nested = {};
	for (let index = 0; index < 20; index++) {
		nested = { child: nested };
	}

	const request = planning();
	request.context.objective.summary = nested;
	rejectRequest(request);
});

test('accepts every registered planning recommendation', () => {
	for (const value of PLANNING_RECOMMENDATIONS) {
		acceptOutcome({ ...recommendation(), recommendation: value });
	}
});

test('accepts every registered evidence recommendation', () => {
	for (const value of EVIDENCE_RECOMMENDATIONS) {
		acceptOutcome({
			...recommendation('evidence-assessment'),
			recommendation: value
		});
	}
});

test('accepts confidence boundaries and nullable confidence', () => {
	for (const confidence of [0, 0.5, 1, null]) {
		acceptOutcome({ ...recommendation(), confidence });
	}
});

test('rejects invalid confidence values', () => {
	for (const confidence of [
		-0,
		-0.01,
		1.01,
		NaN,
		Infinity,
		-Infinity,
		'0.9',
		undefined,
		true,
		{},
		[]
	]) {
		rejectOutcome({ ...recommendation(), confidence });
	}

	const outcome = recommendation();
	delete outcome.confidence;
	rejectOutcome(outcome);
});

test('accepts all registered abstention reasons for both kinds', () => {
	for (const kind of ['planning', 'evidence-assessment']) {
		for (const reason of ABSTENTION_REASONS) {
			acceptOutcome({
				version: ADVISORY_VERSION,
				kind,
				status: 'abstention',
				reason
			});
		}
	}
});

test('accepts all registered unavailable reasons for both kinds', () => {
	for (const kind of ['planning', 'evidence-assessment']) {
		for (const reason of UNAVAILABLE_REASONS) {
			acceptOutcome({
				version: ADVISORY_VERSION,
				kind,
				status: 'unavailable',
				reason
			});
		}
	}
});

test('rejects mismatched recommendation kinds', () => {
	rejectOutcome({
		...recommendation(),
		recommendation: EVIDENCE_RECOMMENDATIONS[0]
	});

	rejectOutcome(
		{
			...recommendation('evidence-assessment'),
			recommendation: PLANNING_RECOMMENDATIONS[0]
		},
		'evidence-assessment'
	);

	rejectOutcome(recommendation(), 'evidence-assessment');
	rejectOutcome(recommendation(), 'execute');
});

test('rejects unregistered and executable recommendations', () => {
	for (const value of [
		'execute-command',
		'approve-assignment',
		'expand-scope',
		'accept-completion',
		'authorize-disclosure',
		'dispatch-provider',
		'git push origin main'
	]) {
		rejectOutcome({ ...recommendation(), recommendation: value });
	}
});

test('rejects extra response fields and unauthorized instructions', () => {
	for (const key of [
		'command',
		'arguments',
		'instructions',
		'authorization',
		'verified',
		'acceptance',
		'approved',
		'execute',
		'provider',
		'cost'
	]) {
		rejectOutcome({ ...recommendation(), [key]: 'synthetic-value' });
	}
});

test('rejects invalid outcome versions, statuses and reasons', () => {
	rejectOutcome({ ...recommendation(), version: 2 });
	rejectOutcome({ ...recommendation(), status: 'accepted' });

	for (const status of ['abstention', 'unavailable']) {
		rejectOutcome({
			version: ADVISORY_VERSION,
			kind: 'planning',
			status,
			reason: 'arbitrary-reason'
		});
	}
});

test('rejects mixed outcome variants', () => {
	for (const status of ['abstention', 'unavailable']) {
		rejectOutcome({
			...recommendation(),
			status,
			reason: 'explicit'
		});
	}
});

test('rejects oversized response payloads', () => {
	const outcome = {
		...recommendation(),
		recommendation: '"'.repeat(1200),
		confidence: '"'.repeat(1200)
	};

	assert.ok(Buffer.byteLength(JSON.stringify(outcome)) > ADVISORY_LIMITS.responseBytes);

	rejectOutcome(outcome);
});

test('invalid results do not echo supplied sensitive text', () => {
	const syntheticSecret = 'API_KEY=synthetic-example';
	const request = planning();
	request.context.objective.summary = syntheticSecret;

	const result = validateAdvisoryRequest(request);

	assert.equal(result.ok, false);
	assert.equal(JSON.stringify(result).includes(syntheticSecret), false);
});

test('registered constants and limits cannot be mutated', () => {
	for (const value of [
		ADVISORY_LIMITS,
		ROADMAP_OBJECTIVES,
		EVIDENCE_PROVENANCE,
		PLANNING_RECOMMENDATIONS,
		EVIDENCE_RECOMMENDATIONS,
		ABSTENTION_REASONS,
		UNAVAILABLE_REASONS
	]) {
		assert.equal(Object.isFrozen(value), true);
	}
});
