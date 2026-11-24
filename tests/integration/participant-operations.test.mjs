import assert from 'node:assert/strict';
import test from 'node:test';

import {
	PB_URL,
	acceptInvitation,
	createInvitation,
	newClient,
	registerVerifiedUser,
	superuserClient,
	uniqueEmail
} from './helpers.mjs';

// These tests must run against the disposable integration server.
assert.equal(PB_URL, 'http://127.0.0.1:8099');

const charitySetup = {
	version: 1,
	activity: 'charity-run-walk',
	format: 'single',
	competitors: 'individual',
	result: 'participation'
};

async function user(label) {
	return registerVerifiedUser(uniqueEmail(label), label);
}

async function organization(owner, label, capabilities = ['athletes']) {
	return owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: {
			name: label,
			template: 'custom',
			capabilities
		}
	});
}

async function fixture(label) {
	const owner = await user(`${label}-owner`);
	const org = await organization(owner, `${label} Organization`);

	return { owner, org };
}

async function invite(owner, orgId, member, role) {
	const invitation = await createInvitation(owner, orgId, member.authStore.record.email, role);

	await acceptInvitation(member, invitation.token);
}

function operate(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/participants`, {
		method: 'POST',
		body
	});
}

function identity(overrides = {}) {
	return {
		firstName: 'Emma',
		lastName: 'Wilson',
		displayName: '',
		...overrides
	};
}

function contact(overrides = {}) {
	return {
		email: 'emma@example.com',
		phone: '555-0100',
		eligibilityNotes: 'Fictional integration fixture',
		...overrides
	};
}

function create(pb, orgId, overrides = {}) {
	return operate(pb, orgId, {
		operation: 'create',
		identity: identity(),
		contact: contact(),
		...overrides
	});
}

function update(pb, orgId, athleteId, overrides = {}) {
	return operate(pb, orgId, {
		operation: 'update',
		athleteId,
		identity: identity(),
		...overrides
	});
}

async function identities(pb, orgId) {
	return pb.collection('athletes').getFullList({
		filter: pb.filter('organization = {:org}', { org: orgId })
	});
}

async function companions(pb, orgId) {
	return pb.collection('athlete_private').getFullList({
		filter: pb.filter('organization = {:org}', { org: orgId })
	});
}

async function companionFor(pb, athleteId) {
	return pb
		.collection('athlete_private')
		.getFirstListItem(pb.filter('athlete = {:athlete}', { athlete: athleteId }));
}

function denied(error) {
	return [400, 401, 403, 404].includes(error?.status);
}

function invalid(error) {
	return error?.status === 400;
}

test('CE-3B operations: create identity and private companion together', async () => {
	const { owner, org } = await fixture('atomic-create');

	const result = await create(owner, org.id);

	assert.match(result.id, /^[a-z0-9]{15}$/);
	assert.equal(result.operation, 'create');
	assert.deepEqual(Object.keys(result).sort(), ['id', 'operation']);

	const athlete = await owner.collection('athletes').getOne(result.id);
	const companion = await companionFor(owner, result.id);

	assert.equal(athlete.organization, org.id);
	assert.equal(athlete.firstName, 'Emma');
	assert.equal(athlete.lastName, 'Wilson');
	assert.equal(athlete.status, 'active');
	assert.equal(athlete.publicPublished, false);

	assert.equal(companion.organization, org.id);
	assert.equal(companion.athlete, result.id);
	assert.equal(companion.email, 'emma@example.com');
	assert.equal(companion.phone, '555-0100');

	assert.equal((await identities(owner, org.id)).length, 1);
	assert.equal((await companions(owner, org.id)).length, 1);
});

test('CE-3B operations: create without private information', async () => {
	const { owner, org } = await fixture('identity-only');

	const result = await operate(owner, org.id, {
		operation: 'create',
		identity: identity()
	});

	assert.ok(result.id);
	assert.equal((await identities(owner, org.id)).length, 1);
	assert.equal((await companions(owner, org.id)).length, 0);
});

test('CE-3B operations: invalid contact rolls back identity creation', async () => {
	const { owner, org } = await fixture('create-rollback');

	await assert.rejects(
		create(owner, org.id, {
			contact: contact({ phone: 'x'.repeat(41) })
		}),
		invalid
	);

	assert.equal(
		(await identities(owner, org.id)).length,
		0,
		'Identity must not survive a failed contact operation.'
	);

	assert.equal((await companions(owner, org.id)).length, 0);

	// Positive control: valid input must still work.
	await create(owner, org.id);

	assert.equal((await identities(owner, org.id)).length, 1);
	assert.equal((await companions(owner, org.id)).length, 1);
});

test('CE-3B operations: invalid contact rolls back identity editing', async () => {
	const { owner, org } = await fixture('update-rollback');

	const created = await create(owner, org.id);

	await assert.rejects(
		update(owner, org.id, created.id, {
			identity: identity({ firstName: 'Changed' }),
			contact: contact({ email: 'invalid-email' })
		}),
		invalid
	);

	const athlete = await owner.collection('athletes').getOne(created.id);
	const companion = await companionFor(owner, created.id);

	assert.equal(
		athlete.firstName,
		'Emma',
		'Identity edits must roll back when private validation fails.'
	);

	assert.equal(companion.email, 'emma@example.com');
	assert.equal(companion.phone, '555-0100');
	assert.equal((await companions(owner, org.id)).length, 1);
});

test('CE-3B operations: edit identity and contact together', async () => {
	const { owner, org } = await fixture('atomic-update');

	const created = await create(owner, org.id);

	const result = await update(owner, org.id, created.id, {
		identity: identity({ firstName: 'Emily' }),
		contact: contact({
			email: 'emily@example.com',
			phone: '555-0200'
		})
	});

	assert.equal(result.id, created.id);
	assert.equal(result.operation, 'update');
	assert.deepEqual(Object.keys(result).sort(), ['id', 'operation']);

	const athlete = await owner.collection('athletes').getOne(created.id);
	const companion = await companionFor(owner, created.id);

	assert.equal(athlete.firstName, 'Emily');
	assert.equal(companion.email, 'emily@example.com');
	assert.equal(companion.phone, '555-0200');
	assert.equal((await companions(owner, org.id)).length, 1);
});

test('CE-3B operations: omitted private fields are preserved and explicit blanks clear', async () => {
	const { owner, org } = await fixture('contact-preservation');

	const created = await create(owner, org.id);

	await update(owner, org.id, created.id, {
		identity: identity({ firstName: 'Emily' })
	});

	let companion = await companionFor(owner, created.id);

	assert.equal(companion.email, 'emma@example.com');
	assert.equal(companion.phone, '555-0100');

	await update(owner, org.id, created.id, {
		contact: { phone: '' }
	});

	companion = await companionFor(owner, created.id);

	assert.equal(companion.email, 'emma@example.com');
	assert.equal(companion.phone, '');
	assert.equal(companion.eligibilityNotes, 'Fictional integration fixture');
});

test('CE-3B operations: editing can create a missing private companion', async () => {
	const { owner, org } = await fixture('missing-companion');

	const created = await operate(owner, org.id, {
		operation: 'create',
		identity: identity()
	});

	assert.equal((await companions(owner, org.id)).length, 0);

	await update(owner, org.id, created.id, {
		contact: contact()
	});

	const companion = await companionFor(owner, created.id);

	assert.equal(companion.organization, org.id);
	assert.equal(companion.athlete, created.id);
	assert.equal(companion.email, 'emma@example.com');
	assert.equal((await companions(owner, org.id)).length, 1);
});

test('CE-3B operations: cross-organization identity updates are rejected', async () => {
	const { owner, org } = await fixture('scope-a');

	// The same owner legitimately manages both organizations.
	const foreignOrg = await organization(owner, 'Scope B Organization');
	const foreign = await create(owner, foreignOrg.id);

	await assert.rejects(
		update(owner, org.id, foreign.id, {
			identity: identity({ firstName: 'Unauthorized change' }),
			contact: contact({ phone: '555-9999' })
		}),
		(error) => error?.status === 404
	);

	const athlete = await owner.collection('athletes').getOne(foreign.id);
	const companion = await companionFor(owner, foreign.id);

	assert.equal(athlete.firstName, 'Emma');
	assert.equal(athlete.organization, foreignOrg.id);
	assert.equal(companion.phone, '555-0100');
	assert.equal((await identities(owner, org.id)).length, 0);
});

test('CE-3B operations: Owner and Admin can write; other roles cannot', async (t) => {
	const { owner, org } = await fixture('operation-roles');

	const admin = await user('operation-admin');
	const viewer = await user('operation-viewer');
	const scorekeeper = await user('operation-scorekeeper');
	const outsider = await user('operation-outsider');

	await invite(owner, org.id, admin, 'admin');
	await invite(owner, org.id, viewer, 'viewer');
	await invite(owner, org.id, scorekeeper, 'scorekeeper');

	const created = await create(owner, org.id);

	await t.test('Admin can create and edit', async () => {
		const result = await create(admin, org.id, {
			identity: identity({ firstName: 'James' })
		});

		await update(admin, org.id, result.id, {
			identity: identity({ firstName: 'James Updated' })
		});

		const athlete = await owner.collection('athletes').getOne(result.id);

		assert.equal(athlete.firstName, 'James Updated');
	});

	for (const [role, client] of [
		['Viewer', viewer],
		['Scorekeeper', scorekeeper],
		['Outsider', outsider],
		['Anonymous', newClient()]
	]) {
		await t.test(`${role} cannot create or edit`, async () => {
			await assert.rejects(create(client, org.id), denied);

			await assert.rejects(
				update(client, org.id, created.id, {
					identity: identity({ firstName: 'Unauthorized change' })
				}),
				denied
			);
		});
	}

	const athlete = await owner.collection('athletes').getOne(created.id);

	assert.equal(athlete.firstName, 'Emma');
	assert.equal((await identities(owner, org.id)).length, 2);
});

test('CE-3B operations: disabled capability blocks transactional writes', async () => {
	const { owner, org } = await fixture('disabled-operations');

	const created = await create(owner, org.id);

	await owner.send(`/api/flihub/organizations/${org.id}/configure`, {
		method: 'POST',
		body: { capabilities: [] }
	});

	await assert.rejects(create(owner, org.id), (error) => error?.status === 403);

	await assert.rejects(
		update(owner, org.id, created.id, {
			identity: identity({ firstName: 'Blocked' })
		}),
		(error) => error?.status === 403
	);

	const athlete = await owner.collection('athletes').getOne(created.id);

	assert.equal(athlete.firstName, 'Emma');
	assert.equal((await identities(owner, org.id)).length, 1);
});

test('CE-3B operations: unexpected fields cannot override protected relationships', async (t) => {
	const { owner, org } = await fixture('protected-fields');

	const attempts = [
		{
			label: 'organization override',
			body: { identity: identity({ organization: org.id }) }
		},
		{
			label: 'publication override',
			body: { identity: identity({ publicPublished: true }) }
		},
		{
			label: 'status override',
			body: { identity: identity({ status: 'archived' }) }
		},
		{
			label: 'private athlete override',
			body: { contact: contact({ athlete: '123456789012345' }) }
		},
		{
			label: 'private organization override',
			body: { contact: contact({ organization: org.id }) }
		},
		{
			label: 'client-assigned identity identifier',
			body: { athleteId: '123456789012345' }
		}
	];

	for (const attempt of attempts) {
		await t.test(attempt.label, async () => {
			await assert.rejects(create(owner, org.id, attempt.body), invalid);
		});
	}

	assert.equal((await identities(owner, org.id)).length, 0);
	assert.equal((await companions(owner, org.id)).length, 0);
});

test('CE-3B operations: existing disc golf demographic fields remain supported', async () => {
	const { owner, org } = await fixture('legacy-demographics');

	const created = await create(owner, org.id, {
		identity: identity({
			gender: 'female',
			nationality: 'USA'
		})
	});

	await update(owner, org.id, created.id, {
		identity: identity({ firstName: 'Emily' })
	});

	const athlete = await owner.collection('athletes').getOne(created.id);

	assert.equal(athlete.firstName, 'Emily');
	assert.equal(athlete.gender, 'female');
	assert.equal(athlete.nationality, 'USA');
});

test('CE-3B operations: charity participants remain noncompetitive and nonpublic', async (t) => {
	const owner = await user('charity-operations-owner');

	const org = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: {
			name: 'Charity Operations Fixture',
			guidedSetup: charitySetup
		}
	});

	const persisted = await owner.collection('organizations').getOne(org.id);

	assert.equal(persisted.profile, 'charity-run-walk');

	// Fixture-only activation in the disposable database.
	const superuser = await superuserClient();

	await superuser.collection('organizations').update(org.id, {
		capabilities: ['athletes']
	});

	const created = await create(owner, org.id);

	await t.test('Demographic fields are rejected', async () => {
		await assert.rejects(
			create(owner, org.id, {
				identity: identity({ gender: 'female' })
			}),
			invalid
		);

		await assert.rejects(
			update(owner, org.id, created.id, {
				identity: identity({ nationality: 'USA' })
			}),
			invalid
		);
	});

	await t.test('Publication fields are rejected', async () => {
		await assert.rejects(
			update(owner, org.id, created.id, {
				identity: identity({ publicPublished: true })
			}),
			invalid
		);
	});

	const athlete = await owner.collection('athletes').getOne(created.id);

	assert.equal(athlete.publicPublished, false);
	assert.equal(athlete.gender, 'unspecified');
	assert.equal(athlete.status, 'active');
	assert.equal((await identities(owner, org.id)).length, 1);
	assert.equal((await companions(owner, org.id)).length, 1);
});

function lifecycle(pb, orgId, athleteId, operation) {
	return operate(pb, orgId, {
		operation,
		athleteId
	});
}

test('CE-3B lifecycle: archive and restore preserve identity and private records', async () => {
	const { owner, org } = await fixture('lifecycle-preservation');

	const created = await create(owner, org.id);
	const original = await owner.collection('athletes').getOne(created.id);
	const originalPrivate = await companionFor(owner, created.id);

	const archived = await lifecycle(owner, org.id, created.id, 'archive');

	assert.deepEqual(archived, {
		id: created.id,
		operation: 'archive',
		status: 'archived'
	});

	let athlete = await owner.collection('athletes').getOne(created.id);
	let companion = await companionFor(owner, created.id);

	assert.equal(athlete.status, 'archived');
	assert.equal(athlete.firstName, original.firstName);
	assert.equal(athlete.lastName, original.lastName);
	assert.equal(athlete.organization, original.organization);
	assert.deepEqual(companion, originalPrivate);

	const restored = await lifecycle(owner, org.id, created.id, 'restore');

	assert.deepEqual(restored, {
		id: created.id,
		operation: 'restore',
		status: 'active'
	});

	athlete = await owner.collection('athletes').getOne(created.id);
	companion = await companionFor(owner, created.id);

	assert.equal(athlete.status, 'active');
	assert.equal(athlete.id, original.id);
	assert.equal(athlete.organization, original.organization);
	assert.equal(athlete.firstName, original.firstName);
	assert.equal(athlete.lastName, original.lastName);
	assert.deepEqual(companion, originalPrivate);

	assert.equal((await identities(owner, org.id)).length, 1);
	assert.equal((await companions(owner, org.id)).length, 1);
});

test('CE-3B lifecycle: repeated archive and restore are idempotent', async () => {
	const { owner, org } = await fixture('lifecycle-idempotent');

	const created = await create(owner, org.id);

	const firstArchive = await lifecycle(owner, org.id, created.id, 'archive');
	const archivedRecord = await owner.collection('athletes').getOne(created.id);

	await new Promise((resolve) => setTimeout(resolve, 30));

	const secondArchive = await lifecycle(owner, org.id, created.id, 'archive');
	const repeatedArchive = await owner.collection('athletes').getOne(created.id);

	assert.deepEqual(firstArchive, secondArchive);
	assert.deepEqual(archivedRecord, repeatedArchive);

	const firstRestore = await lifecycle(owner, org.id, created.id, 'restore');
	const restoredRecord = await owner.collection('athletes').getOne(created.id);

	await new Promise((resolve) => setTimeout(resolve, 30));

	const secondRestore = await lifecycle(owner, org.id, created.id, 'restore');
	const repeatedRestore = await owner.collection('athletes').getOne(created.id);

	assert.deepEqual(firstRestore, secondRestore);
	assert.deepEqual(restoredRecord, repeatedRestore);

	assert.equal(repeatedRestore.status, 'active');
	assert.equal((await identities(owner, org.id)).length, 1);
	assert.equal((await companions(owner, org.id)).length, 1);
});

test('CE-3B lifecycle: foreign organization identities cannot be archived or restored', async () => {
	const { owner, org } = await fixture('lifecycle-scope-a');

	const foreignOrg = await organization(owner, 'Lifecycle Scope B');
	const foreign = await create(owner, foreignOrg.id);

	await assert.rejects(
		lifecycle(owner, org.id, foreign.id, 'archive'),
		(error) => error?.status === 404
	);

	let athlete = await owner.collection('athletes').getOne(foreign.id);

	assert.equal(athlete.status, 'active');

	await lifecycle(owner, foreignOrg.id, foreign.id, 'archive');

	await assert.rejects(
		lifecycle(owner, org.id, foreign.id, 'restore'),
		(error) => error?.status === 404
	);

	athlete = await owner.collection('athletes').getOne(foreign.id);

	assert.equal(athlete.status, 'archived');
	assert.equal(athlete.organization, foreignOrg.id);

	const companion = await companionFor(owner, foreign.id);

	assert.equal(companion.organization, foreignOrg.id);
	assert.equal(companion.athlete, foreign.id);
});

test('CE-3B lifecycle: Owner and Admin can manage status; other roles cannot', async (t) => {
	const { owner, org } = await fixture('lifecycle-roles');

	const admin = await user('lifecycle-admin');
	const viewer = await user('lifecycle-viewer');
	const scorekeeper = await user('lifecycle-scorekeeper');
	const outsider = await user('lifecycle-outsider');

	await invite(owner, org.id, admin, 'admin');
	await invite(owner, org.id, viewer, 'viewer');
	await invite(owner, org.id, scorekeeper, 'scorekeeper');

	const created = await create(owner, org.id);

	await t.test('Admin can archive and restore', async () => {
		await lifecycle(admin, org.id, created.id, 'archive');

		let athlete = await owner.collection('athletes').getOne(created.id);

		assert.equal(athlete.status, 'archived');

		await lifecycle(admin, org.id, created.id, 'restore');

		athlete = await owner.collection('athletes').getOne(created.id);

		assert.equal(athlete.status, 'active');
	});

	for (const [role, client] of [
		['Viewer', viewer],
		['Scorekeeper', scorekeeper],
		['Outsider', outsider],
		['Anonymous', newClient()]
	]) {
		await t.test(`${role} cannot archive or restore`, async () => {
			await lifecycle(owner, org.id, created.id, 'restore');

			await assert.rejects(lifecycle(client, org.id, created.id, 'archive'), denied);

			let athlete = await owner.collection('athletes').getOne(created.id);

			assert.equal(athlete.status, 'active');

			await lifecycle(owner, org.id, created.id, 'archive');

			await assert.rejects(lifecycle(client, org.id, created.id, 'restore'), denied);

			athlete = await owner.collection('athletes').getOne(created.id);

			assert.equal(athlete.status, 'archived');
		});
	}

	await lifecycle(owner, org.id, created.id, 'restore');

	assert.equal((await identities(owner, org.id)).length, 1);
	assert.equal((await companions(owner, org.id)).length, 1);
});

test('CE-3B lifecycle: disabled capability prevents archive and restore', async () => {
	const { owner, org } = await fixture('lifecycle-disabled');

	const active = await create(owner, org.id);
	const archived = await create(owner, org.id, {
		identity: identity({ firstName: 'James' })
	});

	await lifecycle(owner, org.id, archived.id, 'archive');

	await owner.send(`/api/flihub/organizations/${org.id}/configure`, {
		method: 'POST',
		body: { capabilities: [] }
	});

	await assert.rejects(
		lifecycle(owner, org.id, active.id, 'archive'),
		(error) => error?.status === 403
	);

	await assert.rejects(
		lifecycle(owner, org.id, archived.id, 'restore'),
		(error) => error?.status === 403
	);

	const activeRecord = await owner.collection('athletes').getOne(active.id);
	const archivedRecord = await owner.collection('athletes').getOne(archived.id);

	assert.equal(activeRecord.status, 'active');
	assert.equal(archivedRecord.status, 'archived');
	assert.equal((await identities(owner, org.id)).length, 2);
	assert.equal((await companions(owner, org.id)).length, 2);
});

test('CE-3B lifecycle: unexpected fields and invalid identifiers are rejected', async (t) => {
	const { owner, org } = await fixture('lifecycle-invalid');

	const created = await create(owner, org.id);
	const original = await owner.collection('athletes').getOne(created.id);
	const originalPrivate = await companionFor(owner, created.id);

	const attempts = [
		{
			label: 'invalid identifier',
			body: { athleteId: 'invalid' }
		},
		{
			label: 'identity override',
			body: { identity: { firstName: 'Changed' } }
		},
		{
			label: 'private contact override',
			body: { contact: { phone: '555-9999' } }
		},
		{
			label: 'organization override',
			body: { organization: org.id }
		},
		{
			label: 'publication override',
			body: { publicPublished: true }
		},
		{
			label: 'status override',
			body: { status: 'active' }
		}
	];

	for (const attempt of attempts) {
		await t.test(attempt.label, async () => {
			await assert.rejects(
				operate(owner, org.id, {
					operation: 'archive',
					athleteId: created.id,
					...attempt.body
				}),
				invalid
			);
		});
	}

	const athlete = await owner.collection('athletes').getOne(created.id);
	const companion = await companionFor(owner, created.id);

	assert.deepEqual(athlete, original);
	assert.deepEqual(companion, originalPrivate);
});

test('CE-3B lifecycle: charity participants can archive and restore without publication', async () => {
	const owner = await user('charity-lifecycle-owner');

	const org = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: {
			name: 'Charity Lifecycle Fixture',
			guidedSetup: charitySetup
		}
	});

	const persisted = await owner.collection('organizations').getOne(org.id);

	assert.equal(persisted.profile, 'charity-run-walk');

	// Fixture-only activation in the disposable database.
	const superuser = await superuserClient();

	await superuser.collection('organizations').update(org.id, {
		capabilities: ['athletes']
	});

	const created = await create(owner, org.id);
	const originalPrivate = await companionFor(owner, created.id);

	await lifecycle(owner, org.id, created.id, 'archive');

	let athlete = await owner.collection('athletes').getOne(created.id);

	assert.equal(athlete.status, 'archived');
	assert.equal(athlete.publicPublished, false);

	await lifecycle(owner, org.id, created.id, 'restore');

	athlete = await owner.collection('athletes').getOne(created.id);

	assert.equal(athlete.status, 'active');
	assert.equal(athlete.publicPublished, false);
	assert.equal(athlete.organization, org.id);

	assert.deepEqual(await companionFor(owner, created.id), originalPrivate);
});
