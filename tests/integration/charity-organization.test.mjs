/**
 * CE-2: Charity organization creation, profile persistence,
 * configuration security and legacy compatibility.
 *
 * Runs against the disposable PocketBase integration instance.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
	acceptInvitation,
	createInvitation,
	expectHookError,
	registerUser,
	registerVerifiedUser,
	uniqueEmail
} from './helpers.mjs';

const charitySetup = {
	version: 1,
	activity: 'charity-run-walk',
	format: 'single',
	competitors: 'individual',
	result: 'participation'
};

const discGolfSetup = {
	version: 1,
	activity: 'disc-golf',
	format: 'league',
	competitors: 'team',
	result: 'strokes'
};

const defaultDistances = [{ key: '5k', label: '5K', distance: 5, unit: 'km' }];

function listOf(value) {
	if (Array.isArray(value)) return value;
	if (typeof value === 'string' && value.trim()) return JSON.parse(value);
	return [];
}

function createOrganization(pb, body) {
	return pb.send('/api/flihub/organizations', {
		method: 'POST',
		body
	});
}

function configure(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/configure`, {
		method: 'POST',
		body
	});
}

function getOrg(pb, orgId) {
	return pb.collection('organizations').getOne(orgId);
}

async function createCharity(owner) {
	return createOrganization(owner, {
		name: 'Community Steps Foundation',
		guidedSetup: charitySetup
	});
}

async function verifiedUser(prefix, name) {
	return registerVerifiedUser(uniqueEmail(prefix), name);
}

async function inviteMember(owner, orgId, role) {
	const email = uniqueEmail(`charity-${role}`);
	const member = await registerVerifiedUser(email, role);
	const invitation = await createInvitation(owner, orgId, email, role);
	await acceptInvitation(member, invitation.token);
	return member;
}

function configurationSnapshot(record) {
	return {
		id: record.id,
		name: record.name,
		template: record.template,
		profile: record.profile,
		onboarded: record.onboarded,
		capabilities: listOf(record.capabilities),
		raceDistances: listOf(record.race_distances)
	};
}

function assertCharityConfiguration(record) {
	assert.equal(record.template, 'race-event');
	assert.equal(record.profile, 'charity-run-walk');
	assert.equal(record.onboarded, true);
	assert.deepEqual(listOf(record.capabilities), []);
	assert.deepEqual(listOf(record.race_distances), defaultDistances);
}

test('CE-2: charity guided creation persists its profile and defaults', async () => {
	const owner = await verifiedUser('charity-create', 'Owner');
	const org = await createCharity(owner);

	const record = await getOrg(owner, org.id);

	assert.equal(record.name, 'Community Steps Foundation');
	assertCharityConfiguration(record);

	const memberships = await owner.collection('memberships').getFullList({
		filter: `organization = "${org.id}"`
	});

	assert.equal(memberships.length, 1);
	assert.equal(memberships[0].role, 'owner');
	assert.equal(memberships[0].user, owner.authStore.record.id);

	await owner.collection('users').authRefresh();

	assertCharityConfiguration(await getOrg(owner, org.id));
});

test('CE-2: unverified users cannot create charity organizations', async () => {
	const user = await registerUser(uniqueEmail('charity-unverified'), 'Unverified');

	await assert.rejects(createCharity(user), (err) => err.status === 403);

	assert.equal((await user.collection('organizations').getFullList()).length, 0);
});

test('CE-2: forged creation profiles and overrides are rejected', async () => {
	const owner = await verifiedUser('charity-forged', 'Owner');

	for (const extra of [
		{ profile: 'charity-run-walk' },
		{ profile: '' },
		{ template: 'league' },
		{ capabilities: ['athletes'] },
		{ raceDistances: [] }
	]) {
		await assert.rejects(
			createOrganization(owner, {
				name: 'Forged Charity',
				guidedSetup: charitySetup,
				...extra
			}),
			(err) => err.status === 400
		);
	}

	await expectHookError(
		createOrganization(owner, {
			name: 'Forged Legacy',
			profile: 'charity-run-walk'
		}),
		400,
		'invalid_profile'
	);

	assert.equal((await owner.collection('organizations').getFullList()).length, 0);
});

test('CE-2: owner and admin can make permitted configuration changes', async () => {
	const owner = await verifiedUser('charity-settings', 'Owner');
	const org = await createCharity(owner);
	const admin = await inviteMember(owner, org.id, 'admin');

	await configure(owner, org.id, {
		name: 'Community Steps Foundation Updated'
	});

	let record = await getOrg(owner, org.id);

	assert.equal(record.name, 'Community Steps Foundation Updated');
	assertCharityConfiguration(record);

	await configure(admin, org.id, {
		name: 'Community Steps Charity',
		capabilities: []
	});

	record = await getOrg(owner, org.id);

	assert.equal(record.name, 'Community Steps Charity');
	assertCharityConfiguration(record);
});

test('CE-2: owner and admin cannot bypass charity profile restrictions', async () => {
	const owner = await verifiedUser('charity-protect', 'Owner');
	const org = await createCharity(owner);
	const admin = await inviteMember(owner, org.id, 'admin');

	const before = configurationSnapshot(await getOrg(owner, org.id));

	for (const actor of [owner, admin]) {
		for (const profile of ['', 'charity-run-walk', 'disc-golf']) {
			await expectHookError(configure(actor, org.id, { profile }), 400, 'invalid_profile');
		}

		for (const capabilities of [
			['athletes'],
			['events'],
			['venues-courses'],
			['sponsorships'],
			['reimbursements'],
			['events', 'scoring-results', 'standings', 'fantasy']
		]) {
			await expectHookError(
				configure(actor, org.id, { capabilities }),
				400,
				'incompatible_profile_config'
			);
		}

		await assert.rejects(
			configure(actor, org.id, {
				template: 'league',
				raceDistances: []
			}),
			(err) => err.status === 400
		);

		await assert.rejects(
			actor.collection('organizations').update(org.id, {
				profile: '',
				template: 'league',
				capabilities: ['athletes']
			}),
			(err) => err.status === 403 || err.status === 404
		);

		assert.deepEqual(configurationSnapshot(await getOrg(owner, org.id)), before);
	}
});

test('CE-2: viewer, scorekeeper and outsider cannot configure charity organizations', async () => {
	const owner = await verifiedUser('charity-roles', 'Owner');
	const org = await createCharity(owner);

	const viewer = await inviteMember(owner, org.id, 'viewer');
	const scorekeeper = await inviteMember(owner, org.id, 'scorekeeper');
	const outsider = await verifiedUser('charity-outsider', 'Outsider');

	const before = configurationSnapshot(await getOrg(owner, org.id));

	for (const actor of [viewer, scorekeeper, outsider]) {
		await expectHookError(
			configure(actor, org.id, { name: 'Unauthorized Change' }),
			403,
			'forbidden_role'
		);
	}

	await assert.rejects(getOrg(outsider, org.id), (err) => err.status === 404);

	assert.deepEqual(configurationSnapshot(await getOrg(owner, org.id)), before);
});

test('CE-2: ordinary users cannot create charity profiles through direct record writes', async () => {
	const owner = await verifiedUser('charity-direct', 'Owner');

	await assert.rejects(
		owner.collection('organizations').create({
			name: 'Direct Charity',
			template: 'race-event',
			profile: 'charity-run-walk',
			capabilities: [],
			onboarded: true,
			race_distances: defaultDistances
		}),
		(err) => err.status === 403 || err.status === 404
	);

	assert.equal((await owner.collection('organizations').getFullList()).length, 0);
});

test('CE-2: existing disc golf and legacy organizations remain compatible', async () => {
	const owner = await verifiedUser('charity-regression', 'Owner');

	const discGolf = await createOrganization(owner, {
		name: 'Disc Golf Regression',
		guidedSetup: discGolfSetup
	});

	let record = await getOrg(owner, discGolf.id);

	assert.equal(record.profile, '');
	assert.equal(record.template, 'league');

	assert.deepEqual(listOf(record.capabilities), [
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'events',
		'scoring-results',
		'standings'
	]);

	await configure(owner, discGolf.id, {
		capabilities: ['athletes', 'teams']
	});

	record = await getOrg(owner, discGolf.id);

	assert.equal(record.profile, '');
	assert.deepEqual(listOf(record.capabilities), ['athletes', 'teams']);

	const legacy = await createOrganization(owner, {
		name: 'Legacy Regression'
	});

	record = await getOrg(owner, legacy.id);

	assert.equal(record.profile, '');
	assert.equal(record.template, '');
	assert.equal(record.onboarded, false);
});

function publicPage(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/public-page`, {
		method: 'POST',
		body
	});
}

function publicPreview(pb, orgId) {
	return pb.send(`/api/flihub/organizations/${orgId}/public-preview`, {
		method: 'GET'
	});
}

function standings(pb, orgId) {
	return pb.send(`/api/flihub/organizations/${orgId}/standings`, {
		method: 'GET'
	});
}

function publicationSnapshot(record) {
	return {
		publicSlug: record.publicSlug,
		publicPublished: record.publicPublished,
		tagline: record.tagline,
		logoUrl: record.logoUrl,
		themePrimary: record.themePrimary,
		themeSecondary: record.themeSecondary
	};
}

test('CE-2: charity public page management is unavailable', async () => {
	const owner = await verifiedUser('charity-public-owner', 'Owner');
	const org = await createCharity(owner);
	const admin = await inviteMember(owner, org.id, 'admin');

	const before = publicationSnapshot(await getOrg(owner, org.id));

	for (const actor of [owner, admin]) {
		for (const body of [
			{ slug: 'community-steps-foundation' },
			{ tagline: 'Community fundraising' },
			{ published: true },
			{ published: false },
			{ slug: 'community-steps-foundation', published: true }
		]) {
			await expectHookError(publicPage(actor, org.id, body), 403, 'charity_public_unavailable');
		}
	}

	assert.deepEqual(publicationSnapshot(await getOrg(owner, org.id)), before);

	await expectHookError(
		owner.send('/api/flihub/public/community-steps-foundation', {
			method: 'GET'
		}),
		404,
		'not_found'
	);
});

test('CE-2: charity members cannot preview public pages or competitive standings', async () => {
	const owner = await verifiedUser('charity-preview-owner', 'Owner');
	const org = await createCharity(owner);

	const admin = await inviteMember(owner, org.id, 'admin');
	const viewer = await inviteMember(owner, org.id, 'viewer');
	const scorekeeper = await inviteMember(owner, org.id, 'scorekeeper');

	for (const actor of [owner, admin, viewer, scorekeeper]) {
		await expectHookError(publicPreview(actor, org.id), 403, 'charity_public_unavailable');

		await expectHookError(standings(actor, org.id), 403, 'charity_standings_unavailable');
	}

	for (const actor of [viewer, scorekeeper]) {
		await expectHookError(publicPage(actor, org.id, { published: true }), 403, 'forbidden_role');
	}
});

test('CE-2: outsiders cannot access charity publication or standings endpoints', async () => {
	const owner = await verifiedUser('charity-public-isolation', 'Owner');
	const org = await createCharity(owner);
	const outsider = await verifiedUser('charity-public-outsider', 'Outsider');

	await expectHookError(publicPreview(outsider, org.id), 404, 'not_found');

	await expectHookError(standings(outsider, org.id), 404, 'not_found');

	await expectHookError(publicPage(outsider, org.id, { published: true }), 403, 'forbidden_role');
});

test('CE-2: charity owners cannot directly publish organization records', async () => {
	const owner = await verifiedUser('charity-direct-public', 'Owner');
	const org = await createCharity(owner);

	const before = publicationSnapshot(await getOrg(owner, org.id));

	await assert.rejects(
		owner.collection('organizations').update(org.id, {
			publicSlug: 'unauthorized-charity-page',
			publicPublished: true
		}),
		(err) => err.status === 403 || err.status === 404
	);

	assert.deepEqual(publicationSnapshot(await getOrg(owner, org.id)), before);
});

test('CE-2: charity default distances remain configurable without enabling workflows', async () => {
	const owner = await verifiedUser('charity-distances', 'Owner');
	const org = await createCharity(owner);
	const admin = await inviteMember(owner, org.id, 'admin');

	const distances = [...defaultDistances, { key: '10k', label: '10K', distance: 10, unit: 'km' }];

	await configure(admin, org.id, {
		raceDistances: distances
	});

	let record = await getOrg(owner, org.id);

	assert.deepEqual(listOf(record.race_distances), distances);
	assert.deepEqual(listOf(record.capabilities), []);
	assert.equal(record.profile, 'charity-run-walk');
	assert.equal(record.template, 'race-event');

	await configure(owner, org.id, {
		raceDistances: defaultDistances
	});

	record = await getOrg(owner, org.id);
	assertCharityConfiguration(record);
});
