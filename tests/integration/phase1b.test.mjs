/**
 * Phase 1B integration tests: capability catalog, template onboarding,
 * validated configuration writes, race distances, and tenant isolation —
 * against a disposable PocketBase with ordinary user credentials and direct
 * API requests.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
	acceptInvitation,
	createInvitation,
	expectHookError,
	newClient,
	registerUser,
	registerVerifiedUser,
	uniqueEmail,
	PASSWORD
} from './helpers.mjs';

/** JSON fields arrive as a real array via the SDK, but tolerate string form. */
function listOf(value) {
	if (Array.isArray(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') return JSON.parse(value);
	return [];
}

async function createOrgFull(pb, body) {
	return pb.send('/api/flihub/organizations', { method: 'POST', body });
}

async function configure(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/configure`, { method: 'POST', body });
}

async function getOrg(pb, orgId) {
	return pb.collection('organizations').getOne(orgId);
}

test('catalog parity: hooks enforce the same IDs the app ships', async () => {
	// The hooks require the same catalog.json the app imports; an unknown ID
	// proves enforcement reads the shared list.
	const alice = await registerUser(uniqueEmail('cat'), 'Alice');
	const org = await createOrgFull(alice, { name: 'Catalog Org', template: 'custom' });
	await expectHookError(
		configure(alice, org.id, { capabilities: ['not-a-capability'] }),
		400,
		'unknown_capability'
	);
});

test('all three templates produce their documented defaults', async () => {
	const alice = await registerUser(uniqueEmail('tpl'), 'Alice');

	const league = await createOrgFull(alice, { name: 'League Org', template: 'league' });
	let rec = await getOrg(alice, league.id);
	assert.equal(rec.template, 'league');
	assert.equal(rec.onboarded, true);
	assert.deepEqual(listOf(rec.capabilities), [
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'events',
		'scoring-results',
		'standings'
	]);

	const race = await createOrgFull(alice, { name: 'Race Org', template: 'race-event' });
	rec = await getOrg(alice, race.id);
	assert.deepEqual(listOf(rec.capabilities), [
		'athletes',
		'venues-courses',
		'events',
		'scoring-results',
		'standings'
	]);
	const distances = listOf(rec.race_distances);
	assert.deepEqual(
		distances.map((d) => d.key),
		['marathon', 'half-marathon']
	);
	assert.equal(distances[0].distance, 42.195);
	assert.equal(distances[0].unit, 'km');

	const custom = await createOrgFull(alice, { name: 'Custom Org', template: 'custom' });
	rec = await getOrg(alice, custom.id);
	assert.deepEqual(listOf(rec.capabilities), []);
	assert.equal(rec.template, 'custom');
});

test('onboarding selections are editable subsets, validated server-side', async () => {
	const alice = await registerUser(uniqueEmail('sel'), 'Alice');
	// Explicit subset of the league defaults.
	const org = await createOrgFull(alice, {
		name: 'Subset Org',
		template: 'league',
		capabilities: ['athletes', 'teams']
	});
	const rec = await getOrg(alice, org.id);
	assert.deepEqual(listOf(rec.capabilities), ['athletes', 'teams']);

	// Dependency closure is enforced: teams requires athletes.
	await expectHookError(
		createOrgFull(alice, { name: 'Bad Subset', template: 'league', capabilities: ['teams'] }),
		400,
		'missing_dependency'
	);
});

test('name-only creation stays Phase 1A compatible and can be onboarded later', async () => {
	const alice = await registerUser(uniqueEmail('legacy'), 'Alice');
	const org = await createOrgFull(alice, { name: 'Legacy Org' });
	let rec = await getOrg(alice, org.id);
	assert.equal(rec.template, '');
	assert.equal(rec.onboarded, false);
	assert.deepEqual(listOf(rec.capabilities), []);

	// Existing organization keeps working: memberships/invitations unaffected.
	const bobEmail = uniqueEmail('legacy-bob');
	const bob = await registerVerifiedUser(bobEmail, 'Bob');
	await acceptInvitation(bob, (await createInvitation(alice, org.id, bobEmail, 'viewer')).token);
	assert.equal((await bob.collection('organizations').getFullList()).length, 1);

	// Owner onboards it later; ID and membership preserved.
	const after = await configure(alice, org.id, {
		template: 'custom',
		capabilities: ['athletes'],
		completeOnboarding: true
	});
	assert.equal(after.onboarded, true);
	rec = await getOrg(alice, org.id);
	assert.equal(rec.id, org.id);
	assert.deepEqual(listOf(rec.capabilities), ['athletes']);
	assert.equal((await bob.collection('organizations').getFullList()).length, 1);
});

test('owner and admin can configure; scorekeeper, viewer, and outsiders cannot', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('cf-own'), 'Owner');
	const org = await createOrgFull(owner, { name: 'Config Org', template: 'custom' });

	const adminEmail = uniqueEmail('cf-admin');
	const admin = await registerVerifiedUser(adminEmail, 'Admin');
	await acceptInvitation(admin, (await createInvitation(owner, org.id, adminEmail, 'admin')).token);
	const skEmail = uniqueEmail('cf-sk');
	const sk = await registerVerifiedUser(skEmail, 'Scorekeeper');
	await acceptInvitation(sk, (await createInvitation(owner, org.id, skEmail, 'scorekeeper')).token);
	const vwEmail = uniqueEmail('cf-vw');
	const viewer = await registerVerifiedUser(vwEmail, 'Viewer');
	await acceptInvitation(viewer, (await createInvitation(owner, org.id, vwEmail, 'viewer')).token);
	const outsider = await registerVerifiedUser(uniqueEmail('cf-out'), 'Outsider');

	// Admin may configure (approved decision).
	const res = await configure(admin, org.id, { capabilities: ['athletes'] });
	assert.deepEqual(res.capabilities, ['athletes']);

	// Scorekeeper / Viewer / outsider are denied by the hook…
	await expectHookError(
		configure(sk, org.id, { capabilities: ['athletes', 'teams'] }),
		403,
		'forbidden_role'
	);
	await expectHookError(
		configure(viewer, org.id, { capabilities: ['fantasy'] }),
		403,
		'forbidden_role'
	);
	await expectHookError(
		configure(outsider, org.id, { capabilities: ['athletes'] }),
		403,
		'forbidden_role'
	);

	// …and direct record writes are locked for everyone, including the owner.
	await assert.rejects(
		owner.collection('organizations').update(org.id, { capabilities: '["fantasy"]' }),
		(err) => err.status === 403 || err.status === 404
	);
	await assert.rejects(
		outsider.collection('organizations').update(org.id, { name: 'Hijacked' }),
		(err) => err.status === 403 || err.status === 404
	);
});

test('cross-organization configuration isolation', async () => {
	const alice = await registerVerifiedUser(uniqueEmail('iso-a'), 'Alice');
	const orgA = await createOrgFull(alice, { name: 'Iso A', template: 'league' });
	const betty = await registerVerifiedUser(uniqueEmail('iso-b'), 'Betty');
	const orgB = await createOrgFull(betty, { name: 'Iso B', template: 'race-event' });

	// Betty cannot even read org A (member-scoped view rule), let alone its settings.
	await assert.rejects(
		betty.collection('organizations').getOne(orgA.id),
		(err) => err.status === 404
	);
	await expectHookError(
		configure(betty, orgA.id, {
			capabilities: ['fantasy', 'standings', 'scoring-results', 'events']
		}),
		403,
		'forbidden_role'
	);
	// Org B configuration untouched.
	const rec = await getOrg(betty, orgB.id);
	assert.deepEqual(listOf(rec.capabilities), [
		'athletes',
		'venues-courses',
		'events',
		'scoring-results',
		'standings'
	]);
});

test('race distance validation', async () => {
	const alice = await registerUser(uniqueEmail('dist'), 'Alice');
	const org = await createOrgFull(alice, { name: 'Distance Org', template: 'race-event' });

	await expectHookError(
		configure(alice, org.id, { raceDistances: [{ label: 'Zero', distance: 0, unit: 'km' }] }),
		400,
		'invalid_distance'
	);
	await expectHookError(
		configure(alice, org.id, { raceDistances: [{ label: 'Neg', distance: -3, unit: 'km' }] }),
		400,
		'invalid_distance'
	);
	await expectHookError(
		configure(alice, org.id, { raceDistances: [{ label: 'Unit', distance: 5, unit: 'furlongs' }] }),
		400,
		'invalid_distance'
	);
	await expectHookError(
		configure(alice, org.id, { raceDistances: [{ label: '', distance: 5, unit: 'km' }] }),
		400,
		'invalid_distance'
	);

	// Valid custom distance with explicit unit persists.
	const res = await configure(alice, org.id, {
		raceDistances: [
			{ label: 'Marathon', distance: 42.195, unit: 'km' },
			{ label: 'Charity 5 Miler', distance: 5, unit: 'mi' }
		]
	});
	assert.equal(res.race_distances.length, 2);
	assert.equal(res.race_distances[1].unit, 'mi');
});

test('configuration persists across sessions and writes audit entries', async () => {
	const email = uniqueEmail('per');
	const alice = await registerUser(email, 'Alice');
	const org = await createOrgFull(alice, {
		name: 'Persist Org',
		template: 'custom',
		capabilities: ['athletes']
	});

	// A brand-new client and session must see the same configuration —
	// proof it lives server-side, not in local state.
	const fresh = newClient();
	await fresh.collection('users').authWithPassword(email, PASSWORD);
	let rec = await getOrg(fresh, org.id);
	assert.deepEqual(listOf(rec.capabilities), ['athletes']);

	await configure(alice, org.id, { capabilities: ['athletes', 'events'] });
	const events = await alice.collection('membership_events').getFullList({
		filter: `organization = "${org.id}" && action = "configuration_changed"`
	});
	assert.ok(events.length >= 1);
	const last = events[events.length - 1];
	assert.equal(last.actor, alice.authStore.record.id);
	assert.deepEqual(last.details.before.capabilities, ['athletes']);
	assert.deepEqual(last.details.after.capabilities, ['athletes', 'events']);
});

test('disabling and re-enabling preserves configuration and records', async () => {
	const alice = await registerUser(uniqueEmail('tgl'), 'Alice');
	const org = await createOrgFull(alice, {
		name: 'Toggle Org',
		template: 'race-event',
		raceDistances: [{ label: 'Marathon', distance: 42.195, unit: 'km' }]
	});

	const before = await getOrg(alice, org.id);
	const beforeDistances = listOf(before.race_distances);

	// Disable events (and dependents) then re-enable.
	await configure(alice, org.id, { capabilities: ['athletes', 'venues-courses'] });
	let rec = await getOrg(alice, org.id);
	assert.deepEqual(listOf(rec.capabilities), ['athletes', 'venues-courses']);
	// Distances and name preserved while capabilities were toggled.
	assert.deepEqual(listOf(rec.race_distances), beforeDistances);
	assert.equal(rec.name, 'Toggle Org');

	await configure(alice, org.id, {
		capabilities: ['athletes', 'venues-courses', 'events', 'scoring-results', 'standings']
	});
	rec = await getOrg(alice, org.id);
	assert.deepEqual(listOf(rec.capabilities), [
		'athletes',
		'venues-courses',
		'events',
		'scoring-results',
		'standings'
	]);
	assert.deepEqual(listOf(rec.race_distances), beforeDistances);
});

test('capability enablement never escalates a role', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('esc-own'), 'Owner');
	const org = await createOrgFull(owner, { name: 'Escalation Org', template: 'custom' });
	const vwEmail = uniqueEmail('esc-vw');
	const viewer = await registerVerifiedUser(vwEmail, 'Viewer');
	await acceptInvitation(viewer, (await createInvitation(owner, org.id, vwEmail, 'viewer')).token);

	// Enable every capability; the viewer's permissions must not change.
	await configure(owner, org.id, {
		capabilities: [
			'athletes',
			'teams',
			'leagues-seasons',
			'venues-courses',
			'events',
			'scoring-results',
			'standings',
			'fantasy',
			'sponsorships',
			'reimbursements'
		]
	});
	// Listing stays scoped out (empty result, not an error), and writes are denied.
	const list = await viewer
		.collection('invitations')
		.getFullList({ filter: `organization = "${org.id}"` })
		.catch(() => []);
	assert.equal(list.length, 0);
	await expectHookError(
		configure(viewer, org.id, { name: 'Viewer Rename' }),
		403,
		'forbidden_role'
	);
	// Viewer still cannot create memberships or change roles.
	await assert.rejects(
		viewer
			.collection('memberships')
			.create({ organization: org.id, user: viewer.authStore.record.id, role: 'admin' }),
		(err) => err.status === 403 || err.status === 404
	);
});
