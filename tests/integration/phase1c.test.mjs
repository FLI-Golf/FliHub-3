/**
 * Phase 1C integration tests: sport-neutral athlete identity — org-scoped
 * access, role enforcement, capability gating, and data preservation —
 * against a disposable PocketBase with ordinary user credentials.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
	acceptInvitation,
	createInvitation,
	registerUser,
	registerVerifiedUser,
	uniqueEmail
} from './helpers.mjs';

async function createOrgFull(pb, body) {
	return pb.send('/api/flihub/organizations', { method: 'POST', body });
}

async function configure(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/configure`, { method: 'POST', body });
}

async function createAthlete(pb, orgId, body = {}) {
	return pb.collection('athletes').create({
		organization: orgId,
		firstName: 'Riley',
		lastName: 'Chen',
		status: 'active',
		...body
	});
}

test('athlete creation requires the athletes capability (hook-gated)', async () => {
	const owner = await registerUser(uniqueEmail('cap'), 'Owner');
	const org = await createOrgFull(owner, { name: 'No Cap Org', template: 'custom' });

	await assert.rejects(createAthlete(owner, org.id), (err) => {
		assert.equal(err.status, 400);
		assert.match(String(err.response?.message ?? err.message), /capability_disabled/i);
		return true;
	});

	await configure(owner, org.id, { capabilities: ['athletes'] });
	const athlete = await createAthlete(owner, org.id);
	assert.ok(athlete.id);
});

test('athletes are scoped to their organization', async () => {
	const ownerA = await registerVerifiedUser(uniqueEmail('orgA'), 'Owner A');
	const orgA = await createOrgFull(ownerA, {
		name: 'Org A',
		template: 'custom',
		capabilities: ['athletes']
	});
	await createAthlete(ownerA, orgA.id, { firstName: 'Alpha', lastName: 'Athlete' });

	const ownerB = await registerVerifiedUser(uniqueEmail('orgB'), 'Owner B');
	const orgB = await createOrgFull(ownerB, {
		name: 'Org B',
		template: 'custom',
		capabilities: ['athletes']
	});

	// B cannot read A's athletes (list or direct view).
	assert.equal(
		(await ownerB.collection('athletes').getFullList({ filter: `organization = "${orgA.id}"` }))
			.length,
		0
	);
	const aRecord = (await ownerA.collection('athletes').getFullList())[0];
	await assert.rejects(
		ownerB.collection('athletes').getOne(aRecord.id),
		(err) => err.status === 404
	);
	// B cannot write into A's org.
	await assert.rejects(
		createAthlete(ownerB, orgA.id),
		(err) => err.status === 400 || err.status === 403 || err.status === 404
	);
	// B's own org works.
	await createAthlete(ownerB, orgB.id, { firstName: 'Beta', lastName: 'Athlete' });
	assert.equal((await ownerB.collection('athletes').getFullList()).length, 1);
});

test('role enforcement: owners/admins write, scorekeepers/viewers read-only', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('own'), 'Owner');
	const org = await createOrgFull(owner, {
		name: 'Roles Org',
		template: 'custom',
		capabilities: ['athletes']
	});

	const mk = async (prefix, role, name) => {
		const email = uniqueEmail(prefix);
		const pb = await registerVerifiedUser(email, name);
		await acceptInvitation(pb, (await createInvitation(owner, org.id, email, role)).token);
		return pb;
	};
	const admin = await mk('adm', 'admin', 'Admin');
	const sk = await mk('sk', 'scorekeeper', 'Scorekeeper');
	const vw = await mk('vw', 'viewer', 'Viewer');

	// Admin can create/edit/archive.
	const rec = await createAthlete(admin, org.id, { firstName: 'Admin', lastName: 'Created' });
	await admin.collection('athletes').update(rec.id, { nationality: 'USA' });
	await admin.collection('athletes').update(rec.id, { status: 'archived' });

	// Scorekeeper/viewer can read but not write. PocketBase reports
	// rule-denied creates as 400 and rule-denied updates/deletes as 404/403.
	for (const [label, pb] of [
		['scorekeeper', sk],
		['viewer', vw]
	]) {
		assert.equal(
			(await pb.collection('athletes').getFullList({ filter: `organization = "${org.id}"` }))
				.length,
			1,
			`${label} can read`
		);
		await assert.rejects(
			createAthlete(pb, org.id),
			(err) => err.status === 400 || err.status === 403 || err.status === 404
		);
		await assert.rejects(
			pb.collection('athletes').update(rec.id, { firstName: 'Hijack' }),
			(err) => err.status === 400 || err.status === 403 || err.status === 404
		);
		await assert.rejects(
			pb.collection('athletes').delete(rec.id),
			(err) => err.status === 400 || err.status === 403 || err.status === 404
		);
	}
});

test('disabling the capability preserves records; re-enabling restores the workflow', async () => {
	const owner = await registerUser(uniqueEmail('tgl'), 'Owner');
	const org = await createOrgFull(owner, {
		name: 'Toggle Org',
		template: 'custom',
		capabilities: ['athletes']
	});
	const rec = await createAthlete(owner, org.id, {
		firstName: 'Keep',
		lastName: 'Me',
		nationality: 'Canada'
	});

	// Disable: writes rejected by the hook, records still readable by members.
	await configure(owner, org.id, { capabilities: [] });
	await assert.rejects(
		createAthlete(owner, org.id, { firstName: 'New', lastName: 'Row' }),
		(err) => err.status === 400
	);
	const kept = await owner
		.collection('athletes')
		.getFullList({ filter: `organization = "${org.id}"` });
	assert.equal(kept.length, 1);
	assert.equal(kept[0].id, rec.id);
	assert.equal(kept[0].nationality, 'Canada');

	// Re-enable: workflow resumes, data intact.
	await configure(owner, org.id, { capabilities: ['athletes'] });
	await createAthlete(owner, org.id, { firstName: 'Back', lastName: 'Again' });
	assert.equal(
		(await owner.collection('athletes').getFullList({ filter: `organization = "${org.id}"` }))
			.length,
		2
	);

	// Permanent delete is locked for everyone, including Owners (D11: the
	// Phase 1C lifecycle is archive/restore only).
	await assert.rejects(
		owner.collection('athletes').delete(rec.id),
		(err) => err.status === 403 || err.status === 404
	);
	const stillThere = await owner.collection('athletes').getOne(rec.id);
	assert.equal(stillThere.id, rec.id);
});

test('required identity fields are validated; record is sport-neutral', async () => {
	const owner = await registerUser(uniqueEmail('val'), 'Owner');
	const org = await createOrgFull(owner, {
		name: 'Validate Org',
		template: 'custom',
		capabilities: ['athletes']
	});

	// firstName/lastName are required.
	await assert.rejects(
		createAthlete(owner, org.id, { firstName: '' }),
		(err) => err.status === 400
	);

	// The record carries only sport-neutral identity fields — no sport or
	// competition structure (pairing is a later competition-format rule).
	const rec = await createAthlete(owner, org.id, {
		firstName: 'Sport',
		lastName: 'Neutral',
		gender: 'female'
	});
	for (const forbidden of ['team', 'division', 'league', 'season', 'event', 'pair', 'score']) {
		assert.equal(rec[forbidden], undefined, `record must not have ${forbidden}`);
	}
	assert.equal(rec.gender, 'female');
	assert.equal(rec.status, 'active');
});

test('privacy: contact/eligibility fields are restricted to Owners and Admins', async () => {
	// Documented model (docs/CAPABILITIES.md + DECISIONS.md D11): identity
	// fields live on `athletes` (all org members); email, phone, and
	// eligibilityNotes live on `athlete_private` (Owner/Admin-only by
	// collection rules). Scorekeepers, Viewers, and outsiders must never
	// receive the private fields — not via list, detail, relation expansion,
	// or any other API path.
	const owner = await registerVerifiedUser(uniqueEmail('pr-own'), 'Owner');
	const org = await createOrgFull(owner, {
		name: 'Privacy Org',
		template: 'custom',
		capabilities: ['athletes']
	});
	const rec = await createAthlete(owner, org.id, { firstName: 'Private', lastName: 'Person' });
	await owner.collection('athlete_private').create({
		athlete: rec.id,
		organization: org.id,
		email: 'private.person@example.com',
		phone: '+1-555-0100',
		eligibilityNotes: 'U24 eligibility confirmed'
	});

	const mk = async (prefix, role, name) => {
		const email = uniqueEmail(prefix);
		const pb = await registerVerifiedUser(email, name);
		await acceptInvitation(pb, (await createInvitation(owner, org.id, email, role)).token);
		return pb;
	};
	const admin = await mk('pr-adm', 'admin', 'Admin');
	const sk = await mk('pr-sk', 'scorekeeper', 'Scorekeeper');
	const vw = await mk('pr-vw', 'viewer', 'Viewer');
	const outsider = await registerVerifiedUser(uniqueEmail('pr-out'), 'Outsider');

	// Owners and Admins can read AND edit the private fields.
	for (const [label, pb] of [
		['owner', owner],
		['admin', admin]
	]) {
		const list = await pb.collection('athlete_private').getFullList({
			filter: `organization = "${org.id}"`
		});
		assert.equal(list.length, 1, `${label} sees one private row`);
		assert.equal(list[0].email, 'private.person@example.com', `${label} list email`);
		assert.equal(list[0].phone, '+1-555-0100', `${label} list phone`);
		assert.equal(list[0].eligibilityNotes, 'U24 eligibility confirmed', `${label} list notes`);
		const detail = await pb.collection('athlete_private').getOne(list[0].id);
		assert.equal(detail.email, 'private.person@example.com', `${label} detail email`);
		// Identity stays on `athletes`; the private fields are not on it.
		const athlete = await pb.collection('athletes').getOne(rec.id);
		assert.equal(athlete.firstName, 'Private', `${label} identity firstName`);
		assert.equal(athlete.email, undefined, `${label} athletes record has no email field`);
	}
	// Admin edit of the private fields succeeds.
	const adminRow = (
		await admin.collection('athlete_private').getFullList({ filter: `athlete = "${rec.id}"` })
	)[0];
	await admin.collection('athlete_private').update(adminRow.id, { phone: '+1-555-0199' });
	assert.equal(
		(await owner.collection('athlete_private').getOne(adminRow.id)).phone,
		'+1-555-0199',
		'admin edit persisted'
	);

	// Scorekeepers and Viewers read identity via `athletes` but get nothing
	// from `athlete_private` — empty lists, 404 on detail.
	for (const [label, pb] of [
		['scorekeeper', sk],
		['viewer', vw]
	]) {
		const list = await pb.collection('athletes').getFullList({
			filter: `organization = "${org.id}"`
		});
		assert.equal(list.length, 1, `${label} reads identity list`);
		assert.equal(list[0].firstName, 'Private', `${label} identity firstName`);
		assert.equal(list[0].email, undefined, `${label} identity has no email field`);
		assert.equal(
			(await pb.collection('athlete_private').getFullList({ filter: `organization = "${org.id}"` }))
				.length,
			0,
			`${label} athlete_private list is empty`
		);
		await assert.rejects(
			pb.collection('athlete_private').getOne(adminRow.id),
			(err) => err.status === 404 || err.status === 403,
			`${label} athlete_private detail denied`
		);
		// Relation expansion must not leak: expanding the only relation on
		// `athletes` (organization) contains no private field values.
		const expanded = await pb
			.collection('athletes')
			.getFullList({ filter: `organization = "${org.id}"`, expand: 'organization' });
		assert.ok(
			!JSON.stringify(expanded).includes('private.person@example.com'),
			`${label} expansion does not leak private fields`
		);
	}

	// The outsider receives nothing from either collection.
	for (const col of ['athletes', 'athlete_private']) {
		assert.equal(
			(await outsider.collection(col).getFullList({ filter: `organization = "${org.id}"` })).length,
			0,
			`outsider ${col} list empty`
		);
	}
	await assert.rejects(
		outsider.collection('athletes').getOne(rec.id),
		(err) => err.status === 404 || err.status === 403,
		'outsider athlete detail denied'
	);
});

test('organization is immutable on update for athletes and athlete_private', async () => {
	// Regression: org A's Owner could previously PATCH either record's
	// organization into org B (no membership there), orphaning links. Now
	// rejected at the API boundary with the persisted record as source of truth.
	const ownerA = await registerVerifiedUser(uniqueEmail('moveA'), 'Owner A');
	const orgA = await createOrgFull(ownerA, {
		name: 'Move Org A',
		template: 'custom',
		capabilities: ['athletes']
	});
	const ownerB = await registerVerifiedUser(uniqueEmail('moveB'), 'Owner B');
	const orgB = await createOrgFull(ownerB, {
		name: 'Move Org B',
		template: 'custom',
		capabilities: ['athletes']
	});

	const athlete = await createAthlete(ownerA, orgA.id);
	const priv = await ownerA.collection('athlete_private').create({
		athlete: athlete.id,
		organization: orgA.id,
		email: 'move.fixture@example.com'
	});

	// Both relocation attempts are rejected.
	await assert.rejects(
		ownerA.collection('athletes').update(athlete.id, { organization: orgB.id }),
		(err) =>
			err.status === 400 &&
			/immutable_relation/i.test(String(err.response?.message ?? err.message)),
		'athletes organization move rejected'
	);
	await assert.rejects(
		ownerA.collection('athlete_private').update(priv.id, { organization: orgB.id }),
		(err) =>
			err.status === 400 &&
			/immutable_relation/i.test(String(err.response?.message ?? err.message)),
		'athlete_private organization move rejected'
	);

	// Re-read: organization and the athlete link are unchanged.
	const athleteAfter = await ownerA.collection('athletes').getOne(athlete.id);
	const privAfter = await ownerA.collection('athlete_private').getOne(priv.id);
	assert.equal(athleteAfter.organization, orgA.id, 'athlete stays in org A');
	assert.equal(privAfter.organization, orgA.id, 'private record stays in org A');
	assert.equal(privAfter.athlete, athlete.id, 'private record keeps its athlete link');

	// Positive controls: ordinary same-org edits still succeed.
	await ownerA.collection('athletes').update(athlete.id, { nationality: 'Canada' });
	await ownerA.collection('athlete_private').update(priv.id, { phone: '+1-555-0111' });
	assert.equal(
		(await ownerA.collection('athletes').getOne(athlete.id)).nationality,
		'Canada',
		'normal athlete edit still works'
	);
	assert.equal(
		(await ownerA.collection('athlete_private').getOne(priv.id)).phone,
		'+1-555-0111',
		'private-field edit still works'
	);
});
