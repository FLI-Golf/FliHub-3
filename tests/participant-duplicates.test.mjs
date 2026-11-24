import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
	new URL('../pocketbase/pb_hooks/participant_duplicates.js', import.meta.url),
	'utf8'
);

const context = {
	module: { exports: {} }
};

runInNewContext(source, context);

const { normalizeName, normalizeEmail, normalizePhone, findParticipantDuplicates } =
	context.module.exports;

function incoming(row, firstName, lastName, contact = {}) {
	return {
		row,
		identity: { firstName, lastName },
		contact
	};
}

function stored(id, firstName, lastName, contact = {}, status = 'active') {
	return {
		id,
		status,
		identity: { firstName, lastName },
		contact
	};
}

function detect(rows, existing = []) {
	return JSON.parse(JSON.stringify(findParticipantDuplicates(rows, existing)));
}

test('participant duplicates: normalizes name case and whitespace', () => {
	assert.equal(normalizeName('  EMMA   Jane  '), 'emma jane');
});

test('participant duplicates: preserves meaningful name accents', () => {
	assert.equal(normalizeName(' José '), 'josé');
	assert.notEqual(normalizeName('José'), normalizeName('Jose'));
});

test('participant duplicates: normalizes email case and whitespace', () => {
	assert.equal(normalizeEmail('  Emma@EXAMPLE.COM  '), 'emma@example.com');
});

test('participant duplicates: normalizes phone formatting', () => {
	assert.equal(normalizePhone('+1 (555) 123-4567'), '15551234567');
});

test('participant duplicates: does not infer phone country codes', () => {
	assert.notEqual(normalizePhone('+1 555-123-4567'), normalizePhone('555-123-4567'));
});

test('participant duplicates: normalizes missing values to empty strings', () => {
	for (const value of [undefined, null, '']) {
		assert.equal(normalizeName(value), '');
		assert.equal(normalizeEmail(value), '');
		assert.equal(normalizePhone(value), '');
	}
});

test('participant duplicates: accepts distinct participants', () => {
	assert.deepEqual(detect([incoming(1, 'Emma', 'Wilson'), incoming(2, 'James', 'Smith')]), []);
});

test('participant duplicates: detects matching names within batch', () => {
	assert.deepEqual(detect([incoming(1, 'Emma', 'Wilson'), incoming(3, ' EMMA ', 'WILSON')]), [
		{
			row: 3,
			type: 'batch',
			matchingRow: 1,
			fields: ['name']
		}
	]);
});

test('participant duplicates: detects shared email across different names', () => {
	assert.deepEqual(
		detect([
			incoming(1, 'Emma', 'Wilson', {
				email: 'family@example.com'
			}),
			incoming(2, 'James', 'Wilson', {
				email: 'FAMILY@example.com'
			})
		]),
		[
			{
				row: 2,
				type: 'batch',
				matchingRow: 1,
				fields: ['email']
			}
		]
	);
});

test('participant duplicates: detects shared phone across different names', () => {
	assert.deepEqual(
		detect([
			incoming(1, 'Emma', 'Wilson', {
				phone: '(555) 123-4567'
			}),
			incoming(2, 'James', 'Wilson', {
				phone: '5551234567'
			})
		]),
		[
			{
				row: 2,
				type: 'batch',
				matchingRow: 1,
				fields: ['phone']
			}
		]
	);
});

test('participant duplicates: reports all matching field categories', () => {
	const contact = {
		email: 'emma@example.com',
		phone: '555-123-4567'
	};

	assert.deepEqual(
		detect([incoming(1, 'Emma', 'Wilson', contact), incoming(2, 'Emma', 'Wilson', contact)]),
		[
			{
				row: 2,
				type: 'batch',
				matchingRow: 1,
				fields: ['name', 'email', 'phone']
			}
		]
	);
});

test('participant duplicates: ignores empty contact values', () => {
	assert.deepEqual(
		detect([
			incoming(1, 'Emma', 'Wilson', {
				email: '',
				phone: ''
			}),
			incoming(2, 'James', 'Smith', {
				email: ' ',
				phone: '---'
			})
		]),
		[]
	);
});

test('participant duplicates: requires both names for a name match', () => {
	assert.deepEqual(detect([incoming(1, 'Emma', ''), incoming(2, 'Emma', '')]), []);
});

test('participant duplicates: does not confuse name boundaries', () => {
	assert.deepEqual(
		detect([incoming(1, 'Ann Marie', 'Smith'), incoming(2, 'Ann', 'Marie Smith')]),
		[]
	);
});

test('participant duplicates: detects existing active participant', () => {
	assert.deepEqual(
		detect([incoming(4, 'Emma', 'Wilson')], [stored('existing-one', 'Emma', 'Wilson')]),
		[
			{
				row: 4,
				type: 'existing',
				participantId: 'existing-one',
				status: 'active',
				fields: ['name']
			}
		]
	);
});

test('participant duplicates: detects existing archived participant', () => {
	assert.deepEqual(
		detect(
			[incoming(4, 'Emma', 'Wilson')],
			[stored('archived-one', 'Emma', 'Wilson', {}, 'archived')]
		),
		[
			{
				row: 4,
				type: 'existing',
				participantId: 'archived-one',
				status: 'archived',
				fields: ['name']
			}
		]
	);
});

test('participant duplicates: detects existing contact matches', () => {
	assert.deepEqual(
		detect(
			[
				incoming(1, 'Emma', 'Wilson', {
					email: 'shared@example.com',
					phone: '555-123-4567'
				})
			],
			[
				stored('existing-one', 'James', 'Smith', {
					email: 'SHARED@example.com',
					phone: '5551234567'
				})
			]
		),
		[
			{
				row: 1,
				type: 'existing',
				participantId: 'existing-one',
				status: 'active',
				fields: ['email', 'phone']
			}
		]
	);
});

test('participant duplicates: reports multiple existing matches', () => {
	const warnings = detect(
		[incoming(1, 'Emma', 'Wilson')],
		[
			stored('existing-one', 'Emma', 'Wilson'),
			stored('existing-two', 'Emma', 'Wilson', {}, 'archived')
		]
	);

	assert.equal(warnings.length, 2);

	assert.deepEqual(
		warnings.map((warning) => warning.participantId),
		['existing-one', 'existing-two']
	);
});

test('participant duplicates: reports batch and existing matches together', () => {
	const warnings = detect(
		[incoming(1, 'Emma', 'Wilson'), incoming(5, 'Emma', 'Wilson')],
		[stored('existing-one', 'Emma', 'Wilson')]
	);

	assert.equal(warnings.length, 3);

	assert.deepEqual(
		warnings.map((warning) => [warning.row, warning.type]),
		[
			[1, 'existing'],
			[5, 'batch'],
			[5, 'existing']
		]
	);
});

test('participant duplicates: reports every matching batch pair once', () => {
	const warnings = detect([
		incoming(1, 'Emma', 'Wilson'),
		incoming(2, 'Emma', 'Wilson'),
		incoming(3, 'Emma', 'Wilson')
	]);

	assert.deepEqual(
		warnings.map((warning) => [warning.row, warning.matchingRow]),
		[
			[2, 1],
			[3, 1],
			[3, 2]
		]
	);
});

test('participant duplicates: does not expose private values in warnings', () => {
	const contact = {
		email: 'private@example.com',
		phone: '555-987-6543',
		eligibilityNotes: 'Confidential notes'
	};

	const warnings = detect(
		[incoming(1, 'Emma', 'Wilson', contact)],
		[stored('existing-one', 'Emma', 'Wilson', contact)]
	);

	const serialized = JSON.stringify(warnings);

	for (const value of [
		'private@example.com',
		'555-987-6543',
		'5559876543',
		'Confidential notes',
		'Emma',
		'Wilson'
	]) {
		assert.equal(serialized.includes(value), false);
	}

	assert.deepEqual(warnings[0].fields, ['name', 'email', 'phone']);
});

test('participant duplicates: does not mutate input records', () => {
	const rows = [
		incoming(1, ' EMMA ', 'Wilson', {
			email: 'EMMA@example.com'
		})
	];

	const existing = [stored('existing-one', 'Emma', 'Wilson')];

	const before = JSON.stringify({ rows, existing });

	detect(rows, existing);

	assert.equal(JSON.stringify({ rows, existing }), before);
});

test('participant duplicates: handles empty arrays', () => {
	assert.deepEqual(detect([], []), []);
});

test('participant duplicates: rejects invalid input containers', () => {
	for (const value of [null, undefined, {}, 'invalid']) {
		assert.throws(
			() => findParticipantDuplicates(value, []),
			/Invalid participant duplicate detection input/
		);

		assert.throws(
			() => findParticipantDuplicates([], value),
			/Invalid participant duplicate detection input/
		);
	}
});

test('participant duplicates: supports a full 200-row batch', () => {
	const rows = Array.from({ length: 200 }, (_, i) =>
		incoming(i + 1, `Participant${i + 1}`, 'Example')
	);

	assert.deepEqual(detect(rows), []);

	rows[199] = incoming(200, 'Participant1', 'Example');

	assert.deepEqual(detect(rows), [
		{
			row: 200,
			type: 'batch',
			matchingRow: 1,
			fields: ['name']
		}
	]);
});

function warningLimitRows(count) {
	return Array.from({ length: count }, (_, index) => ({
		row: index + 1,
		identity: {
			firstName: 'Emma',
			lastName: 'Wilson'
		}
	}));
}

function warningLimitExisting(count) {
	return Array.from({ length: count }, (_, index) => ({
		id: `existing-${index + 1}`,
		status: index % 2 === 0 ? 'active' : 'archived',
		identity: {
			firstName: 'Emma',
			lastName: 'Wilson'
		}
	}));
}

test('participant duplicate limits: accepts exactly 2000 existing warnings', () => {
	const warnings = findParticipantDuplicates(warningLimitRows(1), warningLimitExisting(2000));

	assert.equal(warnings.length, 2000);

	assert.equal(new Set(warnings.map((warning) => warning.participantId)).size, 2000);
});

test('participant duplicate limits: rejects 2001 existing warnings', () => {
	assert.throws(
		() => findParticipantDuplicates(warningLimitRows(1), warningLimitExisting(2001)),
		/Too many duplicate warnings/
	);
});

test('participant duplicate limits: rejects excessive batch warnings', () => {
	// 64 identical rows produce 2016 matching pairs.
	assert.throws(
		() => findParticipantDuplicates(warningLimitRows(64), []),
		/Too many duplicate warnings/
	);
});

test('participant duplicate limits: combines batch and existing warnings', () => {
	// Three incoming rows produce three batch warnings.
	// 665 existing matches add 1995 warnings.
	const warnings = findParticipantDuplicates(warningLimitRows(3), warningLimitExisting(665));

	assert.equal(warnings.length, 1998);

	assert.equal(warnings.filter((warning) => warning.type === 'batch').length, 3);

	assert.equal(warnings.filter((warning) => warning.type === 'existing').length, 1995);

	// One additional existing match produces 2001 total warnings.
	assert.throws(
		() => findParticipantDuplicates(warningLimitRows(3), warningLimitExisting(666)),
		/Too many duplicate warnings/
	);
});

test('participant duplicate limits: large unmatched populations remain valid', () => {
	const existing = warningLimitExisting(3000).map((participant, index) => ({
		...participant,
		identity: {
			firstName: `Unrelated${index}`,
			lastName: 'Participant'
		}
	}));

	const warnings = findParticipantDuplicates(warningLimitRows(1), existing);

	assert.equal(warnings.length, 0);
});
