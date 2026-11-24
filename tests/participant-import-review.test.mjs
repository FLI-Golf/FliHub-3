import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
	new URL('../pocketbase/pb_hooks/participant_duplicates.js', import.meta.url),
	'utf8'
);

const runtime = {
	module: { exports: {} }
};

runInNewContext(source, runtime);

const { buildImportReview, validateImportConfirmation } = runtime.module.exports;

const context = {
	organizationId: 'organization-a',
	userId: 'owner-a',
	profile: 'charity-run-walk'
};

const csv = 'Emma,Wilson\nJames,Smith';

const rows = [
	{
		row: 1,
		identity: {
			firstName: 'Emma',
			lastName: 'Wilson'
		}
	},
	{
		row: 2,
		identity: {
			firstName: 'James',
			lastName: 'Smith'
		}
	}
];

const existing = [
	{
		id: 'existing-emma',
		status: 'active',
		identity: {
			firstName: 'Emma',
			lastName: 'Wilson'
		}
	},
	{
		id: 'existing-james',
		status: 'archived',
		identity: {
			firstName: 'James',
			lastName: 'Smith'
		}
	}
];

function hash(value) {
	return createHash('sha256').update(value).digest('hex');
}

function review(options = {}) {
	return JSON.parse(
		JSON.stringify(
			buildImportReview(
				options.context ?? context,
				options.csv ?? csv,
				options.rows ?? rows,
				options.existing ?? existing,
				hash
			)
		)
	);
}

function keys(result) {
	return result.warnings.map((warning) => warning.key);
}

test('import review: returns row count and warnings', () => {
	const result = review();

	assert.equal(result.rowCount, 2);
	assert.equal(result.warnings.length, 2);
	assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test('import review: unchanged inputs produce identical review', () => {
	assert.deepEqual(review(), review());
});

test('import review: existing record ordering does not change fingerprint', () => {
	assert.deepEqual(review(), review({ existing: [...existing].reverse() }));
});

test('import review: changed CSV invalidates fingerprint', () => {
	assert.notEqual(review().fingerprint, review({ csv: csv + '\n' }).fingerprint);
});

test('import review: changed organization invalidates fingerprint', () => {
	assert.notEqual(
		review().fingerprint,
		review({
			context: {
				...context,
				organizationId: 'organization-b'
			}
		}).fingerprint
	);
});

test('import review: changed user invalidates fingerprint', () => {
	assert.notEqual(
		review().fingerprint,
		review({
			context: {
				...context,
				userId: 'owner-b'
			}
		}).fingerprint
	);
});

test('import review: changed profile invalidates fingerprint', () => {
	assert.notEqual(
		review().fingerprint,
		review({
			context: {
				...context,
				profile: ''
			}
		}).fingerprint
	);
});

test('import review: new duplicate invalidates fingerprint', () => {
	assert.notEqual(
		review().fingerprint,
		review({
			existing: [
				...existing,
				{
					...existing[0],
					id: 'another-emma'
				}
			]
		}).fingerprint
	);
});

test('import review: removed duplicate invalidates fingerprint', () => {
	assert.notEqual(
		review().fingerprint,
		review({
			existing: existing.slice(0, 1)
		}).fingerprint
	);
});

test('import review: changed archive status invalidates fingerprint', () => {
	assert.notEqual(
		review().fingerprint,
		review({
			existing: [
				{
					...existing[0],
					status: 'archived'
				},
				existing[1]
			]
		}).fingerprint
	);
});

test('import review: changed matching fields invalidate fingerprint', () => {
	const changedRows = [
		{
			...rows[0],
			contact: {
				email: 'emma@example.com'
			}
		},
		rows[1]
	];

	const changedExisting = [
		{
			...existing[0],
			contact: {
				email: 'emma@example.com'
			}
		},
		existing[1]
	];

	assert.notEqual(
		review().fingerprint,
		review({
			rows: changedRows,
			existing: changedExisting
		}).fingerprint
	);
});

test('import review: unrelated existing participant does not invalidate review', () => {
	assert.deepEqual(
		review(),
		review({
			existing: [
				...existing,
				{
					id: 'unrelated',
					status: 'active',
					identity: {
						firstName: 'Robin',
						lastName: 'Taylor'
					}
				}
			]
		})
	);
});

test('import review: warning keys are unique', () => {
	const result = review();

	assert.equal(new Set(keys(result)).size, result.warnings.length);
});

test('import review: response excludes private contact values', () => {
	const contact = {
		email: 'private@example.com',
		phone: '555-987-6543',
		eligibilityNotes: 'Confidential information'
	};

	const result = review({
		csv: 'Emma,Wilson,,private@example.com,555-987-6543',
		rows: [{ ...rows[0], contact }],
		existing: [{ ...existing[0], contact }]
	});

	const serialized = JSON.stringify(result);

	for (const value of [
		'private@example.com',
		'555-987-6543',
		'5559876543',
		'Confidential information',
		'Emma',
		'Wilson'
	]) {
		assert.equal(serialized.includes(value), false);
	}

	assert.deepEqual(result.warnings[0].fields, ['name', 'email', 'phone']);
});

test('import confirmation: accepts reviewed batch without duplicates', () => {
	const result = review({ existing: [] });

	assert.equal(result.warnings.length, 0);

	assert.equal(validateImportConfirmation(result, result.fingerprint, []), true);
});

test('import confirmation: accepts every warning explicitly confirmed', () => {
	const result = review();

	assert.equal(validateImportConfirmation(result, result.fingerprint, keys(result)), true);
});

test('import confirmation: acknowledgment ordering is irrelevant', () => {
	const result = review();

	assert.equal(
		validateImportConfirmation(result, result.fingerprint, keys(result).reverse()),
		true
	);
});

test('import confirmation: rejects missing fingerprint', () => {
	const result = review();

	for (const fingerprint of [undefined, null, '', 123]) {
		assert.throws(
			() => validateImportConfirmation(result, fingerprint, keys(result)),
			/import_review_stale/
		);
	}
});

test('import confirmation: rejects stale fingerprint', () => {
	const previous = review();

	const current = review({
		csv: csv + '\n'
	});

	assert.throws(
		() => validateImportConfirmation(current, previous.fingerprint, keys(previous)),
		/import_review_stale/
	);
});

test('import confirmation: rejects missing acknowledgments', () => {
	const result = review();

	assert.throws(
		() => validateImportConfirmation(result, result.fingerprint, []),
		/import_duplicates_unresolved/
	);
});

test('import confirmation: rejects partial acknowledgments', () => {
	const result = review();

	assert.throws(
		() => validateImportConfirmation(result, result.fingerprint, keys(result).slice(0, 1)),
		/import_duplicates_unresolved/
	);
});

test('import confirmation: rejects repeated acknowledgments', () => {
	const result = review();
	const confirmed = keys(result);

	assert.throws(
		() => validateImportConfirmation(result, result.fingerprint, [...confirmed, confirmed[0]]),
		/import_confirmation_invalid/
	);
});

test('import confirmation: rejects unknown warning keys', () => {
	const result = review();

	assert.throws(
		() =>
			validateImportConfirmation(result, result.fingerprint, [
				...keys(result),
				'fabricated-warning'
			]),
		/import_confirmation_invalid/
	);
});

test('import confirmation: rejects blanket confirmation values', () => {
	const result = review();

	for (const value of [
		true,
		false,
		null,
		undefined,
		'all',
		{ ignoreDuplicates: true },
		[true],
		['all']
	]) {
		assert.throws(
			() => validateImportConfirmation(result, result.fingerprint, value),
			/import_confirmation_invalid/
		);
	}
});

test('import confirmation: rejects replay after matching records are added', () => {
	const previous = review({ existing: [] });
	const current = review();

	assert.throws(
		() => validateImportConfirmation(current, previous.fingerprint, []),
		/import_review_stale/
	);
});
