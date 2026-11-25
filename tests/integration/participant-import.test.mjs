import assert from 'node:assert/strict';
import test from 'node:test';

import {
	PB_URL,
	newClient,
	registerVerifiedUser,
	superuserClient,
	uniqueEmail
} from './helpers.mjs';

assert.equal(
	PB_URL,
	'http://127.0.0.1:8099',
	'Participant import tests require disposable PocketBase.'
);

const charitySetup = {
	version: 1,
	activity: 'charity-run-walk',
	format: 'single',
	competitors: 'individual',
	result: 'participation'
};

async function fixture(label, charity = false) {
	const owner = await registerVerifiedUser(
		uniqueEmail(`participant-import-${label}`),
		'Import Test Owner'
	);

	const org = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: charity
			? {
					name: `Charity Import ${label}`,
					guidedSetup: charitySetup
				}
			: {
					name: `Participant Import ${label}`,
					template: 'custom',
					capabilities: ['athletes']
				}
	});

	if (charity) {
		const admin = await superuserClient();

		const persisted = await admin.collection('organizations').getOne(org.id);

		assert.equal(persisted.profile, 'charity-run-walk');

		// Fixture-only activation. Production activation
		// remains deferred until CE-3 verification.
		await admin.collection('organizations').update(org.id, {
			capabilities: ['athletes']
		});
	}

	return { owner, org };
}

function operate(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/participants`, {
		method: 'POST',
		body
	});
}

function preview(pb, orgId, csv) {
	return operate(pb, orgId, {
		operation: 'previewImport',
		csv
	});
}

function importBatch(pb, orgId, csv, review, confirmedWarnings = []) {
	return operate(pb, orgId, {
		operation: 'import',
		csv,
		fingerprint: review.fingerprint,
		confirmedWarnings
	});
}

function warningKeys(review) {
	return review.warnings.map((warning) => warning.key);
}

function identities(pb, orgId) {
	return pb.collection('athletes').getFullList({
		filter: pb.filter('organization = {:org}', {
			org: orgId
		}),
		sort: 'id'
	});
}

function companions(pb, orgId) {
	return pb.collection('athlete_private').getFullList({
		filter: pb.filter('organization = {:org}', {
			org: orgId
		}),
		sort: 'id'
	});
}

async function snapshot(pb, orgId) {
	return {
		identities: await identities(pb, orgId),
		companions: await companions(pb, orgId)
	};
}

async function rejected(promise, code) {
	await assert.rejects(promise, (error) => {
		assert.equal(error.status, 400);

		if (code) {
			assert.ok(JSON.stringify(error.response).includes(code), `Expected import error: ${code}`);
		}

		return true;
	});
}

test('participant import: preview validates without saving', async () => {
	const { owner, org } = await fixture('preview');

	const csv = ['Emma,Wilson,female,USA,emma@example.com', 'James,Smith,male,USA'].join('\n');

	const before = await snapshot(owner, org.id);

	const result = await preview(owner, org.id, csv);

	assert.equal(result.operation, 'previewImport');
	assert.equal(result.rowCount, 2);
	assert.deepEqual(result.warnings, []);
	assert.match(result.fingerprint, /^[a-fA-F0-9]{64}$/);

	assert.deepEqual(await snapshot(owner, org.id), before);
});

test('participant import: saves complete legacy CSV batch', async () => {
	const { owner, org } = await fixture('legacy');

	const csv = [
		'Emma,Wilson,female,USA,emma@example.com',
		'James,Smith,male,Canada',
		'Robin,Taylor'
	].join('\n');

	const review = await preview(owner, org.id, csv);

	const result = await importBatch(owner, org.id, csv, review);

	assert.equal(result.operation, 'import');
	assert.equal(result.importedCount, 3);
	assert.equal(result.participants.length, 3);

	assert.deepEqual(
		result.participants.map((participant) => participant.row),
		[1, 2, 3]
	);

	const records = await identities(owner, org.id);
	const privateRecords = await companions(owner, org.id);

	assert.equal(records.length, 3);
	assert.equal(privateRecords.length, 1);

	const emma = records.find((record) => record.firstName === 'Emma');

	const robin = records.find((record) => record.firstName === 'Robin');

	assert.equal(emma.gender, 'female');
	assert.equal(emma.nationality, 'USA');
	assert.equal(robin.gender, 'unspecified');

	assert.equal(privateRecords[0].athlete, emma.id);
	assert.equal(privateRecords[0].organization, org.id);
	assert.equal(privateRecords[0].email, 'emma@example.com');

	for (const record of records) {
		assert.equal(record.organization, org.id);
		assert.equal(record.status, 'active');
		assert.equal(record.publicPublished, false);
	}

	assert.equal(JSON.stringify(result).includes('emma@example.com'), false);
});

test('participant import: saves charity identities and private contacts', async () => {
	const { owner, org } = await fixture('charity', true);

	const csv = [
		'Emma,Wilson,Em,emma@example.com,555-0100',
		'James,Smith,,,555-0200',
		'Robin,Taylor'
	].join('\n');

	const review = await preview(owner, org.id, csv);

	assert.equal(review.rowCount, 3);
	assert.deepEqual(review.warnings, []);

	const result = await importBatch(owner, org.id, csv, review);

	assert.equal(result.importedCount, 3);

	const records = await identities(owner, org.id);
	const privateRecords = await companions(owner, org.id);

	assert.equal(records.length, 3);
	assert.equal(privateRecords.length, 2);

	const emma = records.find((record) => record.firstName === 'Emma');

	const james = records.find((record) => record.firstName === 'James');

	assert.equal(emma.displayName, 'Em');

	const emmaPrivate = privateRecords.find((record) => record.athlete === emma.id);

	const jamesPrivate = privateRecords.find((record) => record.athlete === james.id);

	assert.equal(emmaPrivate.email, 'emma@example.com');
	assert.equal(emmaPrivate.phone, '555-0100');
	assert.equal(jamesPrivate.phone, '555-0200');

	for (const record of records) {
		assert.equal(record.gender, 'unspecified');
		assert.equal(record.nationality, '');
		assert.equal(record.publicPublished, false);
		assert.equal(record.status, 'active');
	}
});

test('participant import: invalid later row prevents all writes', async () => {
	const { owner, org } = await fixture('invalid-row');

	const csv = [
		'Emma,Wilson,female,USA,emma@example.com',
		'James,Smith,male,USA,invalid-email'
	].join('\n');

	const before = await snapshot(owner, org.id);

	await rejected(preview(owner, org.id, csv), 'Row 2');

	await rejected(
		operate(owner, org.id, {
			operation: 'import',
			csv,
			fingerprint: 'invalid',
			confirmedWarnings: []
		}),
		'Row 2'
	);

	assert.deepEqual(await snapshot(owner, org.id), before);
});

test('participant import: rejects missing review fingerprint', async () => {
	const { owner, org } = await fixture('missing-review');

	await rejected(
		operate(owner, org.id, {
			operation: 'import',
			csv: 'Emma,Wilson',
			confirmedWarnings: []
		}),
		'import_review_stale'
	);

	assert.equal((await identities(owner, org.id)).length, 0);
	assert.equal((await companions(owner, org.id)).length, 0);
});

test('participant import: rejects unresolved batch duplicates', async () => {
	const { owner, org } = await fixture('batch-duplicate');

	const csv = 'Emma,Wilson\nEMMA,WILSON';

	const review = await preview(owner, org.id, csv);

	assert.equal(review.warnings.length, 1);

	assert.equal(review.warnings[0].type, 'batch');
	assert.equal(review.warnings[0].row, 2);
	assert.equal(review.warnings[0].matchingRow, 1);

	assert.deepEqual(review.warnings[0].fields, ['name']);

	await rejected(importBatch(owner, org.id, csv, review), 'import_duplicates_unresolved');

	assert.equal((await identities(owner, org.id)).length, 0);

	const result = await importBatch(owner, org.id, csv, review, warningKeys(review));

	assert.equal(result.importedCount, 2);

	const records = await identities(owner, org.id);

	assert.equal(records.length, 2);
	assert.notEqual(records[0].id, records[1].id);
});

test('participant import: existing archived matches require confirmation', async () => {
	const { owner, org } = await fixture('archived');

	const original = await operate(owner, org.id, {
		operation: 'create',
		identity: {
			firstName: 'Emma',
			lastName: 'Wilson'
		},
		contact: {
			email: 'emma@example.com'
		}
	});

	await operate(owner, org.id, {
		operation: 'archive',
		athleteId: original.id
	});

	const csv = 'Emma,Wilson,,,emma@example.com';

	const before = await snapshot(owner, org.id);

	const review = await preview(owner, org.id, csv);

	assert.equal(review.warnings.length, 1);

	const warning = review.warnings[0];

	assert.equal(warning.type, 'existing');
	assert.equal(warning.participantId, original.id);
	assert.equal(warning.status, 'archived');
	assert.deepEqual(warning.fields, ['name', 'email']);

	assert.equal(JSON.stringify(review).includes('emma@example.com'), false);

	await rejected(importBatch(owner, org.id, csv, review), 'import_duplicates_unresolved');

	assert.deepEqual(await snapshot(owner, org.id), before);

	const result = await importBatch(owner, org.id, csv, review, warningKeys(review));

	assert.equal(result.importedCount, 1);

	const archived = await owner.collection('athletes').getOne(original.id);

	assert.equal(archived.status, 'archived');
	assert.equal((await identities(owner, org.id)).length, 2);
	assert.equal((await companions(owner, org.id)).length, 2);
});

test('participant import: changed CSV requires another preview', async () => {
	const { owner, org } = await fixture('changed-csv');

	const original = 'Emma,Wilson';
	const changed = 'James,Smith';

	const review = await preview(owner, org.id, original);

	await rejected(importBatch(owner, org.id, changed, review), 'import_review_stale');

	assert.equal((await identities(owner, org.id)).length, 0);
});

test('participant import: new duplicate invalidates earlier review', async () => {
	const { owner, org } = await fixture('new-match');

	const csv = 'Emma,Wilson';

	const review = await preview(owner, org.id, csv);

	assert.deepEqual(review.warnings, []);

	await operate(owner, org.id, {
		operation: 'create',
		identity: {
			firstName: 'Emma',
			lastName: 'Wilson'
		}
	});

	const before = await snapshot(owner, org.id);

	await rejected(importBatch(owner, org.id, csv, review), 'import_review_stale');

	assert.deepEqual(await snapshot(owner, org.id), before);
});

test('participant import: replay requires a new review', async () => {
	const { owner, org } = await fixture('replay');

	const csv = 'Emma,Wilson';

	const review = await preview(owner, org.id, csv);

	await importBatch(owner, org.id, csv, review);

	const before = await snapshot(owner, org.id);

	await rejected(importBatch(owner, org.id, csv, review), 'import_review_stale');

	assert.deepEqual(await snapshot(owner, org.id), before);
});

async function importTestUser(label) {
	return registerVerifiedUser(uniqueEmail(`import-security-${label}`), `Import Security ${label}`);
}

async function inviteImportMember(owner, orgId, member, role) {
	const { createInvitation, acceptInvitation } = await import('./helpers.mjs');

	const invitation = await createInvitation(owner, orgId, member.authStore.record.email, role);

	await acceptInvitation(member, invitation.token);
}

async function accessDenied(promise) {
	await assert.rejects(promise, (error) => {
		assert.ok(
			[401, 403, 404].includes(error.status),
			`Unexpected authorization status: ${error.status}`
		);

		return true;
	});
}

async function assertImportDenied(pb, orgId, csv, review) {
	await accessDenied(preview(pb, orgId, csv));

	await accessDenied(importBatch(pb, orgId, csv, review, warningKeys(review)));
}

test('participant import security: organization Admin can preview and import', async () => {
	const { owner, org } = await fixture('admin-access');

	const admin = await importTestUser('admin');

	await inviteImportMember(owner, org.id, admin, 'admin');

	const csv = 'Emma,Wilson';

	const review = await preview(admin, org.id, csv);

	assert.equal(review.rowCount, 1);

	const result = await importBatch(admin, org.id, csv, review);

	assert.equal(result.importedCount, 1);
	assert.equal((await identities(owner, org.id)).length, 1);
});

test('participant import security: Viewer and Scorekeeper cannot preview or import', async (t) => {
	const { owner, org } = await fixture('restricted-roles');

	const csv = 'Emma,Wilson';

	const review = await preview(owner, org.id, csv);

	const before = await snapshot(owner, org.id);

	for (const role of ['viewer', 'scorekeeper']) {
		await t.test(`${role} is denied`, async () => {
			const member = await importTestUser(role);

			await inviteImportMember(owner, org.id, member, role);

			await assertImportDenied(member, org.id, csv, review);

			assert.deepEqual(await snapshot(owner, org.id), before);
		});
	}
});

test('participant import security: nonmember cannot preview or import', async () => {
	const { owner, org } = await fixture('nonmember');

	const outsider = await importTestUser('outsider');

	const csv = 'Emma,Wilson';

	const review = await preview(owner, org.id, csv);

	const before = await snapshot(owner, org.id);

	await assertImportDenied(outsider, org.id, csv, review);

	assert.deepEqual(await snapshot(owner, org.id), before);
});

test('participant import security: anonymous caller cannot preview or import', async () => {
	const { owner, org } = await fixture('anonymous');

	const anonymous = newClient();

	const csv = 'Emma,Wilson';

	const review = await preview(owner, org.id, csv);

	const before = await snapshot(owner, org.id);

	await assertImportDenied(anonymous, org.id, csv, review);

	assert.deepEqual(await snapshot(owner, org.id), before);
});

test('participant import security: Admin in another organization cannot bypass Viewer role', async () => {
	const first = await fixture('mixed-role-a');
	const second = await fixture('mixed-role-b');

	const member = await importTestUser('mixed-role');

	await inviteImportMember(first.owner, first.org.id, member, 'admin');

	await inviteImportMember(second.owner, second.org.id, member, 'viewer');

	const csv = 'Emma,Wilson';

	const allowed = await preview(member, first.org.id, csv);

	assert.equal(allowed.rowCount, 1);

	const restricted = await preview(second.owner, second.org.id, csv);

	const before = await snapshot(second.owner, second.org.id);

	await assertImportDenied(member, second.org.id, csv, restricted);

	assert.deepEqual(await snapshot(second.owner, second.org.id), before);
});

test('participant import security: disabled capability blocks preview and import', async () => {
	const { owner, org } = await fixture('disabled-capability');

	const csv = 'Emma,Wilson';

	const review = await preview(owner, org.id, csv);

	const superuser = await superuserClient();

	const before = await snapshot(superuser, org.id);

	await superuser.collection('organizations').update(org.id, {
		capabilities: []
	});

	await assertImportDenied(owner, org.id, csv, review);

	assert.deepEqual(await snapshot(superuser, org.id), before);
});

test('participant import security: duplicate review excludes other organizations', async () => {
	const first = await fixture('isolation-a');
	const second = await fixture('isolation-b');

	const csv = 'Emma,Wilson,,,emma@example.com';

	const initial = await preview(first.owner, first.org.id, csv);

	await importBatch(first.owner, first.org.id, csv, initial);

	const before = await snapshot(first.owner, first.org.id);

	const review = await preview(second.owner, second.org.id, csv);

	assert.deepEqual(review.warnings, []);

	const result = await importBatch(second.owner, second.org.id, csv, review);

	assert.equal(result.importedCount, 1);

	assert.equal((await identities(second.owner, second.org.id)).length, 1);

	assert.deepEqual(await snapshot(first.owner, first.org.id), before);
});

test('participant import security: fingerprint cannot be reused across organizations', async () => {
	const { owner, org } = await fixture('fingerprint-org-a');

	const second = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: {
			name: 'Fingerprint Organization B',
			template: 'custom',
			capabilities: ['athletes']
		}
	});

	const csv = 'Emma,Wilson';

	const review = await preview(owner, org.id, csv);

	const before = await snapshot(owner, second.id);

	await rejected(importBatch(owner, second.id, csv, review), 'import_review_stale');

	assert.deepEqual(await snapshot(owner, second.id), before);
});

test('participant import security: fingerprint cannot be reused by another authorized user', async () => {
	const { owner, org } = await fixture('fingerprint-user');

	const admin = await importTestUser('fingerprint-admin');

	await inviteImportMember(owner, org.id, admin, 'admin');

	const csv = 'Emma,Wilson';

	const ownerReview = await preview(owner, org.id, csv);

	const before = await snapshot(owner, org.id);

	await rejected(importBatch(admin, org.id, csv, ownerReview), 'import_review_stale');

	assert.deepEqual(await snapshot(owner, org.id), before);

	const adminReview = await preview(admin, org.id, csv);

	const result = await importBatch(admin, org.id, csv, adminReview);

	assert.equal(result.importedCount, 1);
});

test('participant import security: unexpected privileged request fields are rejected', async () => {
	const { owner, org } = await fixture('privileged-fields');

	const csv = 'Emma,Wilson';

	const review = await preview(owner, org.id, csv);

	const before = await snapshot(owner, org.id);

	for (const field of [
		'organization',
		'athleteId',
		'publicPublished',
		'status',
		'ignoreDuplicates'
	]) {
		await rejected(
			operate(owner, org.id, {
				operation: 'previewImport',
				csv,
				[field]: true
			})
		);

		await rejected(
			operate(owner, org.id, {
				operation: 'import',
				csv,
				fingerprint: review.fingerprint,
				confirmedWarnings: [],
				[field]: true
			})
		);
	}

	assert.deepEqual(await snapshot(owner, org.id), before);
});

function numberedParticipantCsv(count) {
	return Array.from({ length: count }, (_, index) => {
		const number = String(index + 1).padStart(3, '0');

		return `Participant${number},Boundary,,,participant${number}@example.com`;
	}).join('\n');
}

test('participant import boundaries: accepts exactly 200 participants', async () => {
	const { owner, org } = await fixture('maximum-batch');

	const csv = numberedParticipantCsv(200);

	const review = await preview(owner, org.id, csv);

	assert.equal(review.rowCount, 200);
	assert.deepEqual(review.warnings, []);

	const result = await importBatch(owner, org.id, csv, review);

	assert.equal(result.importedCount, 200);
	assert.equal(result.participants.length, 200);

	const records = await identities(owner, org.id);
	const privateRecords = await companions(owner, org.id);

	assert.equal(records.length, 200);
	assert.equal(privateRecords.length, 200);

	assert.equal(new Set(result.participants.map((record) => record.id)).size, 200);

	assert.deepEqual(
		result.participants.map((record) => record.row),
		Array.from({ length: 200 }, (_, index) => index + 1)
	);

	const identityIds = new Set(records.map((record) => record.id));

	for (const record of privateRecords) {
		assert.equal(record.organization, org.id);
		assert.ok(identityIds.has(record.athlete));
	}
});

test('participant import boundaries: rejects 201 participants without writes', async () => {
	const { owner, org } = await fixture('oversized-batch');

	const csv = numberedParticipantCsv(201);

	const before = await snapshot(owner, org.id);

	await rejected(preview(owner, org.id, csv));

	await rejected(
		operate(owner, org.id, {
			operation: 'import',
			csv,
			fingerprint: 'invalid',
			confirmedWarnings: []
		})
	);

	assert.deepEqual(await snapshot(owner, org.id), before);
});

test('participant import boundaries: duplicate detection includes later database pages', async () => {
	const { owner, org } = await fixture('pagination');

	const csv = numberedParticipantCsv(200);

	const review = await preview(owner, org.id, csv);

	await importBatch(owner, org.id, csv, review);

	await operate(owner, org.id, {
		operation: 'create',
		identity: {
			firstName: 'Additional',
			lastName: 'Participant'
		},
		contact: {
			email: 'additional@example.com'
		}
	});

	const records = await identities(owner, org.id);
	const privateRecords = await companions(owner, org.id);

	assert.equal(records.length, 201);
	assert.equal(privateRecords.length, 201);

	// Select the record that actually falls beyond the first
	// page in the endpoint's ID-based ordering.
	const last = records[200];

	const identityCsv = `${last.firstName},${last.lastName}`;

	const identityReview = await preview(owner, org.id, identityCsv);

	assert.equal(identityReview.warnings.length, 1);
	assert.equal(identityReview.warnings[0].participantId, last.id);
	assert.deepEqual(identityReview.warnings[0].fields, ['name']);

	// Independently verify pagination of private companions.
	const lastPrivate = privateRecords[200];

	const contactCsv = `Unrelated,Identity,,,${lastPrivate.email}`;

	const contactReview = await preview(owner, org.id, contactCsv);

	assert.equal(contactReview.warnings.length, 1);
	assert.equal(contactReview.warnings[0].participantId, lastPrivate.athlete);

	assert.deepEqual(contactReview.warnings[0].fields, ['email']);

	assert.equal(JSON.stringify(contactReview).includes(lastPrivate.email), false);

	assert.equal((await identities(owner, org.id)).length, 201);
	assert.equal((await companions(owner, org.id)).length, 201);
});

test('participant import boundaries: excessive duplicate warnings fail closed', async () => {
	const { owner, org } = await fixture('warning-limit');

	// 64 identical rows produce 2,016 pairwise warnings.
	const csv = Array.from({ length: 64 }, () => 'Emma,Wilson').join('\n');

	const before = await snapshot(owner, org.id);

	await rejected(preview(owner, org.id, csv));

	await rejected(
		operate(owner, org.id, {
			operation: 'import',
			csv,
			fingerprint: 'invalid',
			confirmedWarnings: []
		})
	);

	assert.deepEqual(await snapshot(owner, org.id), before);
});

test('participant import boundaries: rejects invalid confirmation collections', async () => {
	const { owner, org } = await fixture('invalid-confirmations');

	const csv = 'Emma,Wilson\nEMMA,WILSON';

	const review = await preview(owner, org.id, csv);

	assert.equal(review.warnings.length, 1);

	const [key] = warningKeys(review);

	const before = await snapshot(owner, org.id);

	for (const confirmations of [
		null,
		true,
		'confirm-all',
		{},
		['unknown-warning'],
		[key, key],
		[key, 'unknown-warning']
	]) {
		await rejected(
			importBatch(owner, org.id, csv, review, confirmations),
			'import_confirmation_invalid'
		);

		assert.deepEqual(await snapshot(owner, org.id), before);
	}

	const result = await importBatch(owner, org.id, csv, review, [key]);

	assert.equal(result.importedCount, 2);
});

test('participant import boundaries: partial confirmation cannot save a batch', async () => {
	const { owner, org } = await fixture('partial-confirmation');

	const csv = 'Emma,Wilson\nEMMA,WILSON\nemma,wilson';

	const review = await preview(owner, org.id, csv);

	assert.equal(review.warnings.length, 3);

	const keys = warningKeys(review);

	const before = await snapshot(owner, org.id);

	await rejected(
		importBatch(owner, org.id, csv, review, keys.slice(0, 2)),
		'import_duplicates_unresolved'
	);

	assert.deepEqual(await snapshot(owner, org.id), before);

	const result = await importBatch(owner, org.id, csv, review, keys);

	assert.equal(result.importedCount, 3);
});

test('participant import concurrency: simultaneous requests cannot reuse the same review', async () => {
	const { owner, org } = await fixture('concurrent-import');

	const csv = ['Emma,Wilson,,,emma@example.com', 'James,Smith,,,james@example.com'].join('\n');

	const review = await preview(owner, org.id, csv);

	assert.deepEqual(review.warnings, []);

	// Disable SDK cancellation so both requests reach PocketBase.
	owner.autoCancellation(false);

	let results;

	try {
		results = await Promise.allSettled([
			importBatch(owner, org.id, csv, review),
			importBatch(owner, org.id, csv, review)
		]);
	} finally {
		owner.autoCancellation(true);
	}

	const successful = results.filter((result) => result.status === 'fulfilled');

	const failed = results.filter((result) => result.status === 'rejected');

	assert.equal(successful.length, 1);
	assert.equal(failed.length, 1);

	assert.equal(successful[0].value.importedCount, 2);

	assert.equal(failed[0].reason.status, 400);

	assert.equal(failed[0].reason.response.code, 'import_review_stale');

	const records = await identities(owner, org.id);
	const privateRecords = await companions(owner, org.id);

	assert.equal(records.length, 2);
	assert.equal(privateRecords.length, 2);

	assert.deepEqual(records.map((record) => record.firstName).sort(), ['Emma', 'James']);

	const identityIds = new Set(records.map((record) => record.id));

	for (const record of privateRecords) {
		assert.equal(record.organization, org.id);
		assert.ok(identityIds.has(record.athlete));
	}
});

const rollbackFailureEmail = 'participant-rollback-failure@example.com';

async function expectDatabaseWriteFailure(promise) {
	await assert.rejects(promise, (error) => {
		assert.ok(
			[400, 500].includes(error.status),
			`Unexpected database failure status: ${error.status}`
		);

		return true;
	});
}

test('participant import rollback: private database failure rolls back identity creation', async () => {
	const { owner, org } = await fixture('database-create-rollback');

	const before = await snapshot(owner, org.id);

	await expectDatabaseWriteFailure(
		operate(owner, org.id, {
			operation: 'create',
			identity: {
				firstName: 'Emma',
				lastName: 'Wilson'
			},
			contact: {
				email: rollbackFailureEmail
			}
		})
	);

	assert.deepEqual(await snapshot(owner, org.id), before);

	const result = await operate(owner, org.id, {
		operation: 'create',
		identity: {
			firstName: 'Emma',
			lastName: 'Wilson'
		},
		contact: {
			email: 'emma-recovered@example.com'
		}
	});

	const after = await snapshot(owner, org.id);

	assert.equal(after.identities.length, before.identities.length + 1);
	assert.equal(after.companions.length, before.companions.length + 1);

	assert.ok(after.identities.some((record) => record.id === result.id));

	assert.ok(
		after.companions.some(
			(record) => record.athlete === result.id && record.email === 'emma-recovered@example.com'
		)
	);
});

test('participant import rollback: later private database failure rolls back the entire batch', async () => {
	const { owner, org } = await fixture('database-batch-rollback');

	const csv = [
		'Emma,Wilson,,,emma@example.com',
		`James,Smith,,,${rollbackFailureEmail}`,
		'Robin,Jones,,,robin@example.com'
	].join('\n');

	const before = await snapshot(owner, org.id);

	// Successful preview proves the CSV passes input validation.
	const review = await preview(owner, org.id, csv);

	assert.equal(review.rowCount, 3);
	assert.deepEqual(review.warnings, []);

	await expectDatabaseWriteFailure(importBatch(owner, org.id, csv, review));

	// Neither earlier successful writes nor the failing
	// participant's identity may survive the transaction.
	assert.deepEqual(await snapshot(owner, org.id), before);

	const correctedCsv = csv.replace(rollbackFailureEmail, 'james@example.com');

	const correctedReview = await preview(owner, org.id, correctedCsv);

	const result = await importBatch(owner, org.id, correctedCsv, correctedReview);

	assert.equal(result.importedCount, 3);

	const after = await snapshot(owner, org.id);

	assert.equal(after.identities.length, before.identities.length + 3);
	assert.equal(after.companions.length, before.companions.length + 3);

	const identityIds = new Set(after.identities.map((record) => record.id));

	for (const record of after.companions) {
		assert.equal(record.organization, org.id);
		assert.ok(identityIds.has(record.athlete));
		assert.notEqual(record.email, rollbackFailureEmail);
	}
});

test('participant import rollback: charity database failure preserves existing records', async () => {
	const { owner, org } = await fixture('charity-database-rollback', true);

	await operate(owner, org.id, {
		operation: 'create',
		identity: {
			firstName: 'Existing',
			lastName: 'Participant',
			displayName: 'Existing Demo'
		},
		contact: {
			email: 'existing@example.com',
			phone: '555-0100',
			eligibilityNotes: 'Existing private fixture'
		}
	});

	const before = await snapshot(owner, org.id);

	assert.equal(before.identities.length, 1);
	assert.equal(before.companions.length, 1);

	const csv = [
		'Emma,Wilson,Em,emma@example.com,555-0101',
		`James,Smith,Jim,${rollbackFailureEmail},555-0102`,
		'Robin,Jones,Rob,robin@example.com,555-0103'
	].join('\n');

	const review = await preview(owner, org.id, csv);

	assert.equal(review.rowCount, 3);
	assert.deepEqual(review.warnings, []);

	await expectDatabaseWriteFailure(importBatch(owner, org.id, csv, review));

	assert.deepEqual(await snapshot(owner, org.id), before);

	const correctedCsv = csv.replace(rollbackFailureEmail, 'james@example.com');

	const correctedReview = await preview(owner, org.id, correctedCsv);

	const result = await importBatch(owner, org.id, correctedCsv, correctedReview);

	assert.equal(result.importedCount, 3);

	const after = await snapshot(owner, org.id);

	assert.equal(after.identities.length, 4);
	assert.equal(after.companions.length, 4);

	assert.deepEqual(
		after.identities.find((record) => record.id === before.identities[0].id),
		before.identities[0]
	);

	assert.deepEqual(
		after.companions.find((record) => record.id === before.companions[0].id),
		before.companions[0]
	);

	for (const record of after.identities) {
		assert.equal(record.publicPublished, false);
	}
});
