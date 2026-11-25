/**
 * CE-3B: Shared participant identity and private companion security.
 *
 * All security assertions use ordinary authenticated API clients.
 * Fixtures run exclusively against the disposable integration database.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
	acceptInvitation,
	createInvitation,
	newClient,
	registerVerifiedUser,
	superuserClient,
	uniqueEmail,
	PB_URL
} from './helpers.mjs';

assert.equal(
	PB_URL,
	'http://127.0.0.1:8099',
	'Participant security tests require the disposable integration instance.'
);

async function user(label) {
	return registerVerifiedUser(uniqueEmail(`ce3-${label}`), label);
}

async function organization(owner, label, capabilities = ['athletes']) {
	return owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: {
			name: `CE3 Security ${label}`,
			template: 'custom',
			capabilities
		}
	});
}

async function invite(owner, org, member, role) {
	const invitation = await createInvitation(owner, org.id, member.authStore.record.email, role);
	await acceptInvitation(member, invitation.token);
}

function athlete(pb, org, overrides = {}) {
	return pb.collection('athletes').create({
		organization: org.id,
		firstName: 'Test',
		lastName: 'Participant',
		status: 'active',
		...overrides
	});
}

function companion(pb, org, person, overrides = {}) {
	return pb.collection('athlete_private').create({
		organization: org.id,
		athlete: person.id,
		email: 'participant@example.com',
		phone: '555-0100',
		eligibilityNotes: 'Fictional private test note',
		...overrides
	});
}

function denied(error) {
	return [400, 401, 403, 404].includes(error?.status);
}

function hidden(error) {
	return [401, 403, 404].includes(error?.status);
}

async function twoOrganizations() {
	const ownerA = await user('owner-a');
	const ownerB = await user('owner-b');
	const orgA = await organization(ownerA, 'A');
	const orgB = await organization(ownerB, 'B');

	return { ownerA, ownerB, orgA, orgB };
}

test('CE-3B: same-organization companion creation and editing work', async () => {
	const owner = await user('positive');
	const org = await organization(owner, 'Positive');
	const person = await athlete(owner, org);
	const privateRow = await companion(owner, org, person);

	assert.equal(privateRow.organization, org.id);
	assert.equal(privateRow.athlete, person.id);

	await owner.collection('athlete_private').update(privateRow.id, {
		phone: '555-0199'
	});

	const saved = await owner.collection('athlete_private').getOne(privateRow.id);

	assert.equal(saved.phone, '555-0199');
	assert.equal(saved.athlete, person.id);
});

test('CE-3B: cross-organization companion creation is rejected', async () => {
	const { ownerA, ownerB, orgA, orgB } = await twoOrganizations();
	const foreignPerson = await athlete(ownerB, orgB);

	await assert.rejects(
		companion(ownerA, orgA, foreignPerson),
		denied,
		'An owner must not attach private data to another organization’s athlete.'
	);

	const rows = await ownerA.collection('athlete_private').getFullList({
		filter: `organization = "${orgA.id}"`
	});

	assert.equal(rows.length, 0);
});

test('CE-3B: private companion athlete relationship is immutable', async () => {
	const owner = await user('immutable-athlete');
	const org = await organization(owner, 'Immutable Athlete');
	const first = await athlete(owner, org, { firstName: 'First' });
	const second = await athlete(owner, org, { firstName: 'Second' });
	const privateRow = await companion(owner, org, first);

	await assert.rejects(
		owner.collection('athlete_private').update(privateRow.id, {
			athlete: second.id
		}),
		denied,
		'Private contact data must not be reassigned to another identity.'
	);

	const saved = await owner.collection('athlete_private').getOne(privateRow.id);

	assert.equal(saved.athlete, first.id);
});

test('CE-3B: cross-organization companion reassignment is rejected', async () => {
	const { ownerA, ownerB, orgA, orgB } = await twoOrganizations();
	const personA = await athlete(ownerA, orgA);
	const personB = await athlete(ownerB, orgB);
	const privateRow = await companion(ownerA, orgA, personA);

	await assert.rejects(
		ownerA.collection('athlete_private').update(privateRow.id, {
			athlete: personB.id
		}),
		denied
	);

	const saved = await ownerA.collection('athlete_private').getOne(privateRow.id);

	assert.equal(saved.organization, orgA.id);
	assert.equal(saved.athlete, personA.id);
});

test('CE-3B: duplicate private companions are rejected', async () => {
	const owner = await user('duplicate');
	const org = await organization(owner, 'Duplicate');
	const person = await athlete(owner, org);

	await companion(owner, org, person);

	await assert.rejects(
		companion(owner, org, person, {
			email: 'duplicate@example.com'
		}),
		denied
	);

	const rows = await owner.collection('athlete_private').getFullList({
		filter: `athlete = "${person.id}"`
	});

	assert.equal(rows.length, 1);
});

test('CE-3B: mixed membership roles do not grant foreign write access', async (t) => {
	const { ownerA, ownerB, orgA, orgB } = await twoOrganizations();
	const mixed = await user('mixed-writes');

	await invite(ownerA, orgA, mixed, 'admin');
	await invite(ownerB, orgB, mixed, 'viewer');

	const personA = await athlete(mixed, orgA);
	const personB = await athlete(ownerB, orgB);
	const privateB = await companion(ownerB, orgB, personB);
	const unpairedB = await athlete(ownerB, orgB);

	await companion(mixed, orgA, personA);

	assert.equal((await mixed.collection('athletes').getOne(personB.id)).id, personB.id);

	await t.test('foreign identity creation denied', async () => {
		await assert.rejects(athlete(mixed, orgB), denied);
	});

	await t.test('foreign identity editing denied', async () => {
		await assert.rejects(
			mixed.collection('athletes').update(personB.id, {
				firstName: 'Unauthorized'
			}),
			denied
		);
	});

	await t.test('foreign private creation denied', async () => {
		await assert.rejects(companion(mixed, orgB, unpairedB), denied);
	});

	await t.test('foreign private editing denied', async () => {
		await assert.rejects(
			mixed.collection('athlete_private').update(privateB.id, {
				phone: '555-9999'
			}),
			denied
		);
	});
});

test('CE-3B: mixed membership roles do not expose foreign private data', async (t) => {
	const { ownerA, ownerB, orgA, orgB } = await twoOrganizations();
	const mixed = await user('mixed-reads');

	await invite(ownerA, orgA, mixed, 'admin');
	await invite(ownerB, orgB, mixed, 'viewer');

	const personA = await athlete(ownerA, orgA);
	const personB = await athlete(ownerB, orgB);
	const privateA = await companion(ownerA, orgA, personA);
	const privateB = await companion(ownerB, orgB, personB, {
		email: 'restricted@example.com'
	});

	assert.equal((await mixed.collection('athlete_private').getOne(privateA.id)).id, privateA.id);

	await t.test('foreign private list is empty', async () => {
		const rows = await mixed.collection('athlete_private').getFullList({
			filter: `organization = "${orgB.id}"`
		});

		assert.equal(rows.length, 0);
	});

	await t.test('foreign private detail is hidden', async () => {
		await assert.rejects(mixed.collection('athlete_private').getOne(privateB.id), hidden);
	});

	await t.test('reverse relation expansion does not expose private data', async () => {
		const record = await mixed.collection('athletes').getOne(personB.id, {
			expand: 'athlete_private_via_athlete'
		});

		assert.ok(!JSON.stringify(record).includes('restricted@example.com'));
	});
});

test('CE-3B: anonymous clients cannot access participant identities or contacts', async () => {
	const owner = await user('anonymous');
	const org = await organization(owner, 'Anonymous');
	const person = await athlete(owner, org);
	const privateRow = await companion(owner, org, person);
	const anonymous = newClient();

	for (const [collection, record] of [
		['athletes', person],
		['athlete_private', privateRow]
	]) {
		const rows = await anonymous.collection(collection).getFullList({
			filter: `organization = "${org.id}"`
		});

		assert.equal(rows.length, 0);

		await assert.rejects(anonymous.collection(collection).getOne(record.id), hidden);
	}
});

test('CE-3B: disabling athletes preserves reads but blocks writes', async (t) => {
	const owner = await user('disabled');
	const org = await organization(owner, 'Disabled');
	const person = await athlete(owner, org);
	const unpaired = await athlete(owner, org);
	const privateRow = await companion(owner, org, person);

	await owner.send(`/api/flihub/organizations/${org.id}/configure`, {
		method: 'POST',
		body: { capabilities: [] }
	});

	assert.equal((await owner.collection('athletes').getOne(person.id)).id, person.id);

	assert.equal((await owner.collection('athlete_private').getOne(privateRow.id)).id, privateRow.id);

	await t.test('identity creation blocked', async () => {
		await assert.rejects(athlete(owner, org), denied);
	});

	await t.test('identity editing blocked', async () => {
		await assert.rejects(
			owner.collection('athletes').update(person.id, {
				firstName: 'Changed'
			}),
			denied
		);
	});

	await t.test('private creation blocked', async () => {
		await assert.rejects(companion(owner, org, unpaired), denied);
	});

	await t.test('private editing blocked', async () => {
		await assert.rejects(
			owner.collection('athlete_private').update(privateRow.id, {
				phone: '555-9999'
			}),
			denied
		);
	});
});

test('CE-3B: charity participants cannot be marked for public publication', async (t) => {
	const owner = await user('charity-publication');

	const org = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: {
			name: 'CE3 Charity Publication Fixture',
			guidedSetup: {
				version: 1,
				activity: 'charity-run-walk',
				format: 'single',
				competitors: 'individual',
				result: 'participation'
			}
		}
	});

	const before = await owner.collection('organizations').getOne(org.id);

	assert.equal(before.profile, 'charity-run-walk');

	// Fixture setup only: simulate the future CE-3 capability state.
	// All participant operations below use the ordinary owner client.
	// This must never run against persistent development data.
	const superuser = await superuserClient();

	await superuser.collection('organizations').update(org.id, {
		capabilities: ['athletes']
	});

	const person = await athlete(owner, org);

	assert.equal(person.publicPublished, false);

	await t.test('publication on creation rejected', async () => {
		await assert.rejects(athlete(owner, org, { publicPublished: true }), denied);
	});

	await t.test('publication on update rejected', async () => {
		await assert.rejects(
			owner.collection('athletes').update(person.id, {
				publicPublished: true
			}),
			denied
		);

		const saved = await owner.collection('athletes').getOne(person.id);

		assert.equal(saved.publicPublished, false);
	});
});
