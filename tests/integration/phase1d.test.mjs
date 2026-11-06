/**
 * Phase 1D integration tests: competition structure — leagues, seasons,
 * divisions, season entries, and events (Dustin's approved decisions, D12) —
 * against a disposable PocketBase with ordinary user credentials.
 *
 * Covers: capability-gated writes, organization scoping, role enforcement,
 * duplicate-entry rejection, division-in-season assignment, parent-link
 * immutability, independent vs season-linked events, schedule validation,
 * disable → preserve → re-enable, and archive-only lifecycle.
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

const CAPS = ['athletes', 'teams', 'leagues-seasons', 'events'];

async function createOrgFull(pb, body) {
	return pb.send('/api/flihub/organizations', { method: 'POST', body });
}

async function configure(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/configure`, { method: 'POST', body });
}

/** Sets up an org with all 1D capabilities; returns { owner, org }. */
async function orgWithCaps(prefix, name) {
	const owner = await registerVerifiedUser(uniqueEmail(prefix), 'Owner');
	const org = await createOrgFull(owner, { name, template: 'custom', capabilities: CAPS });
	return { owner, org };
}

/** Builds a league + season + team in one call chain; returns their records. */
async function leagueSeasonTeam(pb, orgId, label) {
	const league = await pb
		.collection('leagues')
		.create({ organization: orgId, name: `${label} League`, status: 'active' });
	const season = await pb.collection('seasons').create({
		organization: orgId,
		league: league.id,
		name: `${label} Season`,
		status: 'planned'
	});
	const team = await pb
		.collection('teams')
		.create({ organization: orgId, name: `${label} Team`, status: 'active' });
	return { league, season, team };
}

test('competition writes require their capabilities (hook-gated)', async () => {
	const owner = await registerUser(uniqueEmail('cap'), 'Owner');
	const org = await createOrgFull(owner, { name: 'No Cap Org', template: 'custom' });

	await assert.rejects(
		owner.collection('teams').create({ organization: org.id, name: 'T', status: 'active' }),
		(err) =>
			err.status === 400 &&
			/capability_disabled/i.test(String(err.response?.message ?? err.message))
	);
	await assert.rejects(
		owner.collection('leagues').create({ organization: org.id, name: 'L', status: 'active' }),
		(err) =>
			err.status === 400 &&
			/capability_disabled/i.test(String(err.response?.message ?? err.message))
	);
	await assert.rejects(
		owner.collection('events').create({ organization: org.id, name: 'E', status: 'planned' }),
		(err) =>
			err.status === 400 &&
			/capability_disabled/i.test(String(err.response?.message ?? err.message))
	);

	await configure(owner, org.id, { capabilities: CAPS });
	const team = await owner
		.collection('teams')
		.create({ organization: org.id, name: 'T', status: 'active' });
	assert.ok(team.id);
});

test('D12: division-less seasons, late division assignment, duplicate rejection', async () => {
	const { owner, org } = await orgWithCaps('d12', 'D12 Org');
	const { season, team } = await leagueSeasonTeam(owner, org.id, 'Spring');

	// Teams enter a season directly, with no division (division-less season).
	const entry = await owner.collection('season_entries').create({
		organization: org.id,
		season: season.id,
		team: team.id,
		division: null,
		status: 'active'
	});
	assert.equal(entry.division, '');

	// Duplicate (season, team) entry rejected by the unique index.
	await assert.rejects(
		owner.collection('season_entries').create({
			organization: org.id,
			season: season.id,
			team: team.id,
			status: 'active'
		}),
		(err) => err.status === 400
	);

	// Divisions can be finalized later; assignment after entry works.
	const open = await owner
		.collection('divisions')
		.create({ organization: org.id, season: season.id, name: 'Open', status: 'active' });
	const assigned = await owner.collection('season_entries').update(entry.id, { division: open.id });
	assert.equal(assigned.division, open.id);

	// A division from another season is rejected (D12).
	const season2 = await owner.collection('seasons').create({
		organization: org.id,
		league: (await owner.collection('seasons').getOne(season.id)).league,
		name: 'Summer Season',
		status: 'planned'
	});
	const otherDivision = await owner
		.collection('divisions')
		.create({ organization: org.id, season: season2.id, name: 'Am', status: 'active' });
	await assert.rejects(
		owner.collection('season_entries').update(entry.id, { division: otherDivision.id }),
		(err) =>
			err.status === 400 &&
			/division_not_in_season/i.test(String(err.response?.message ?? err.message))
	);
});

test('events: independent or one season, never another organization', async () => {
	const { owner, org } = await orgWithCaps('evt', 'Events Org');
	const { season } = await leagueSeasonTeam(owner, org.id, 'Main');

	const independent = await owner
		.collection('events')
		.create({ organization: org.id, season: null, name: 'Standalone', status: 'planned' });
	assert.equal(independent.season, '');

	const linked = await owner.collection('events').create({
		organization: org.id,
		season: season.id,
		name: 'Season Event',
		status: 'planned'
	});
	assert.equal(linked.season, season.id);

	const { owner: ownerB, org: orgB } = await orgWithCaps('evtB', 'Other Org');
	const { season: seasonB } = await leagueSeasonTeam(ownerB, orgB.id, 'B');
	await assert.rejects(
		owner.collection('events').create({
			organization: org.id,
			season: seasonB.id,
			name: 'Hijack',
			status: 'planned'
		}),
		(err) =>
			err.status === 400 && /cross_organization/i.test(String(err.response?.message ?? err.message))
	);
});

test('organization scoping: cross-organization reads, writes, and links denied', async () => {
	const { owner: ownerA, org: orgA } = await orgWithCaps('orgA', 'Org A');
	const { season, team } = await leagueSeasonTeam(ownerA, orgA.id, 'A');
	const division = await ownerA
		.collection('divisions')
		.create({ organization: orgA.id, season: season.id, name: 'Open', status: 'active' });

	const { owner: ownerB, org: orgB } = await orgWithCaps('orgB', 'Org B');

	// B cannot read A's competition records.
	for (const collection of [
		'teams',
		'leagues',
		'seasons',
		'divisions',
		'season_entries',
		'events'
	]) {
		assert.equal(
			(
				await ownerB.collection(collection).getFullList({
					filter: `organization = "${orgA.id}"`
				})
			).length,
			0,
			`B reads zero A ${collection}`
		);
	}

	// B cannot write into A's org.
	await assert.rejects(
		ownerB.collection('teams').create({ organization: orgA.id, name: 'X', status: 'active' }),
		(err) => err.status === 400 || err.status === 403 || err.status === 404
	);

	// A cannot link to B's records (cross-org relation targets rejected).
	const {
		league: leagueB,
		season: seasonB,
		team: teamB
	} = await leagueSeasonTeam(ownerB, orgB.id, 'B');
	const divisionB = await ownerB
		.collection('divisions')
		.create({ organization: orgB.id, season: seasonB.id, name: 'Open', status: 'active' });
	await assert.rejects(
		ownerA.collection('seasons').create({
			organization: orgA.id,
			league: leagueB.id,
			name: 'X',
			status: 'planned'
		}),
		(err) =>
			err.status === 400 && /cross_organization/i.test(String(err.response?.message ?? err.message))
	);
	await assert.rejects(
		ownerA.collection('divisions').create({
			organization: orgA.id,
			season: seasonB.id,
			name: 'X',
			status: 'active'
		}),
		(err) =>
			err.status === 400 && /cross_organization/i.test(String(err.response?.message ?? err.message))
	);
	await assert.rejects(
		ownerA.collection('season_entries').create({
			organization: orgA.id,
			season: season.id,
			team: teamB.id,
			status: 'active'
		}),
		(err) =>
			err.status === 400 && /cross_organization/i.test(String(err.response?.message ?? err.message))
	);
	await assert.rejects(
		ownerA.collection('season_entries').create({
			organization: orgA.id,
			season: seasonB.id,
			team: team.id,
			status: 'active'
		}),
		(err) =>
			err.status === 400 && /cross_organization/i.test(String(err.response?.message ?? err.message))
	);
	assert.ok(division.id && divisionB.id);
});

test('role enforcement: owners/admins write, scorekeepers/viewers read-only', async () => {
	const { owner, org } = await orgWithCaps('roles', 'Roles Org');
	await leagueSeasonTeam(owner, org.id, 'R');

	const mk = async (prefix, role, name) => {
		const email = uniqueEmail(prefix);
		const pb = await registerVerifiedUser(email, name);
		await acceptInvitation(pb, (await createInvitation(owner, org.id, email, role)).token);
		return pb;
	};
	const admin = await mk('adm', 'admin', 'Admin');
	const sk = await mk('sk', 'scorekeeper', 'Scorekeeper');
	const vw = await mk('vw', 'viewer', 'Viewer');

	// Admin writes.
	const league = await admin
		.collection('leagues')
		.create({ organization: org.id, name: 'Admin League', status: 'active' });
	await admin.collection('leagues').update(league.id, { name: 'Admin League 2' });

	// Scorekeeper/viewer read all six collections but cannot write.
	for (const [label, pb] of [
		['scorekeeper', sk],
		['viewer', vw]
	]) {
		for (const collection of [
			'teams',
			'leagues',
			'seasons',
			'divisions',
			'season_entries',
			'events'
		]) {
			assert.ok(
				Array.isArray(
					await pb.collection(collection).getFullList({ filter: `organization = "${org.id}"` })
				),
				`${label} reads ${collection}`
			);
		}
		await assert.rejects(
			pb.collection('leagues').create({ organization: org.id, name: 'Nope', status: 'active' }),
			(err) => err.status === 400 || err.status === 403
		);
		await assert.rejects(
			pb.collection('leagues').update(league.id, { name: 'Nope' }),
			(err) => err.status === 400 || err.status === 403 || err.status === 404
		);
		await assert.rejects(
			pb.collection('leagues').delete(league.id),
			(err) => err.status === 400 || err.status === 403 || err.status === 404,
			`${label} delete denied`
		);
	}

	// Outsider (no membership) sees nothing.
	const outsider = await registerVerifiedUser(uniqueEmail('out'), 'Outsider');
	assert.equal(
		(await outsider.collection('leagues').getFullList({ filter: `organization = "${org.id}"` }))
			.length,
		0
	);
});

test('organization is immutable on update: records cannot be relocated cross-org', async () => {
	// Regression: org A's Owner could previously PATCH a record's organization
	// into org B (no membership there), orphaning links. Now rejected at the
	// API boundary with the persisted record as the source of truth.
	const { owner: ownerA, org: orgA } = await orgWithCaps('moveA', 'Move Org A');
	const { org: orgB } = await orgWithCaps('moveB', 'Move Org B');

	const { league, season, team } = await leagueSeasonTeam(ownerA, orgA.id, 'M');
	const division = await ownerA
		.collection('divisions')
		.create({ organization: orgA.id, season: season.id, name: 'Open', status: 'active' });
	const entry = await ownerA.collection('season_entries').create({
		organization: orgA.id,
		season: season.id,
		team: team.id,
		division: division.id,
		status: 'active'
	});
	const event = await ownerA
		.collection('events')
		.create({ organization: orgA.id, season: null, name: 'M Event', status: 'planned' });

	// Every attempt to relocate a record into org B is rejected.
	for (const [collection, id] of [
		['teams', team.id],
		['leagues', league.id],
		['seasons', season.id],
		['divisions', division.id],
		['season_entries', entry.id],
		['events', event.id]
	]) {
		await assert.rejects(
			ownerA.collection(collection).update(id, { organization: orgB.id }),
			(err) =>
				err.status === 400 &&
				/immutable_relation/i.test(String(err.response?.message ?? err.message)),
			`${collection} organization move rejected`
		);
	}

	// Re-read: organization and every existing link are unchanged.
	const teamAfter = await ownerA.collection('teams').getOne(team.id);
	const leagueAfter = await ownerA.collection('leagues').getOne(league.id);
	const seasonAfter = await ownerA.collection('seasons').getOne(season.id);
	const divisionAfter = await ownerA.collection('divisions').getOne(division.id);
	const entryAfter = await ownerA.collection('season_entries').getOne(entry.id);
	const eventAfter = await ownerA.collection('events').getOne(event.id);
	for (const [label, rec] of [
		['team', teamAfter],
		['league', leagueAfter],
		['season', seasonAfter],
		['division', divisionAfter],
		['entry', entryAfter],
		['event', eventAfter]
	]) {
		assert.equal(rec.organization, orgA.id, `${label} stays in org A`);
	}
	assert.equal(seasonAfter.league, league.id, 'season keeps its league');
	assert.equal(divisionAfter.season, season.id, 'division keeps its season');
	assert.equal(entryAfter.season, season.id, 'entry keeps its season');
	assert.equal(entryAfter.team, team.id, 'entry keeps its team');
	assert.equal(entryAfter.division, division.id, 'entry keeps its division');
	assert.equal(eventAfter.season, '', 'independent event stays independent');

	// Positive control: ordinary same-org edits still work.
	await ownerA.collection('teams').update(team.id, { name: 'M Team Renamed' });
	const reassigned = await ownerA.collection('season_entries').update(entry.id, { division: null });
	assert.equal(reassigned.division, '', 'same-org division reassignment still works');
	assert.equal(
		(await ownerA.collection('teams').getOne(team.id)).name,
		'M Team Renamed',
		'same-org rename still works'
	);
});

test('parent links are immutable: updates cannot invalidate existing links', async () => {
	const { owner, org } = await orgWithCaps('imm', 'Immutable Org');
	const { season, team } = await leagueSeasonTeam(owner, org.id, 'I');
	const season2 = await owner.collection('seasons').create({
		organization: org.id,
		league: season.league,
		name: 'Second Season',
		status: 'planned'
	});
	const division = await owner
		.collection('divisions')
		.create({ organization: org.id, season: season.id, name: 'Open', status: 'active' });
	const entry = await owner.collection('season_entries').create({
		organization: org.id,
		season: season.id,
		team: team.id,
		division: division.id,
		status: 'active'
	});

	// Moving the division to another season would invalidate the entry — rejected.
	await assert.rejects(
		owner.collection('divisions').update(division.id, { season: season2.id }),
		(err) =>
			err.status === 400 && /immutable_relation/i.test(String(err.response?.message ?? err.message))
	);
	// Repointing the entry's season/team bypasses the duplicate guarantee — rejected.
	await assert.rejects(
		owner.collection('season_entries').update(entry.id, { season: season2.id }),
		(err) =>
			err.status === 400 && /immutable_relation/i.test(String(err.response?.message ?? err.message))
	);
	const team2 = await owner
		.collection('teams')
		.create({ organization: org.id, name: 'I Team 2', status: 'active' });
	await assert.rejects(
		owner.collection('season_entries').update(entry.id, { team: team2.id }),
		(err) =>
			err.status === 400 && /immutable_relation/i.test(String(err.response?.message ?? err.message))
	);

	// Non-parent updates still work: rename division, reassign within season.
	await owner.collection('divisions').update(division.id, { name: 'Open Pro' });
	const ok = await owner.collection('season_entries').update(entry.id, { division: null });
	assert.equal(ok.division, '');
});

test('schedule foundation: season dates validated, never auto-transitioned', async () => {
	const { owner, org } = await orgWithCaps('sched', 'Schedule Org');
	const league = await owner
		.collection('leagues')
		.create({ organization: org.id, name: 'Sched League', status: 'active' });

	await assert.rejects(
		owner.collection('seasons').create({
			organization: org.id,
			league: league.id,
			name: 'Backwards',
			status: 'planned',
			startsOn: '2026-06-01',
			endsOn: '2026-05-01'
		}),
		(err) =>
			err.status === 400 && /invalid_schedule/i.test(String(err.response?.message ?? err.message))
	);

	const season = await owner.collection('seasons').create({
		organization: org.id,
		league: league.id,
		name: 'Ordered',
		status: 'planned',
		startsOn: '2026-05-01',
		endsOn: '2026-06-01'
	});
	assert.equal(season.status, 'planned', 'status stays as set — no automation');
});

test('disable preserves records; re-enable restores access; archive keeps links', async () => {
	const { owner, org } = await orgWithCaps('arch', 'Archive Org');
	const { season, team } = await leagueSeasonTeam(owner, org.id, 'AR');
	const division = await owner
		.collection('divisions')
		.create({ organization: org.id, season: season.id, name: 'Open', status: 'active' });
	const entry = await owner.collection('season_entries').create({
		organization: org.id,
		season: season.id,
		team: team.id,
		division: division.id,
		status: 'active'
	});
	const event = await owner.collection('events').create({
		organization: org.id,
		season: season.id,
		name: 'Linked Event',
		status: 'planned'
	});

	// Archive the season: records and relationships survive untouched.
	await owner.collection('seasons').update(season.id, { status: 'archived' });
	const entryAfter = await owner.collection('season_entries').getOne(entry.id);
	const eventAfter = await owner.collection('events').getOne(event.id);
	const divisionAfter = await owner.collection('divisions').getOne(division.id);
	assert.equal(entryAfter.season, season.id);
	assert.equal(entryAfter.division, division.id);
	assert.equal(eventAfter.season, season.id);
	assert.equal(divisionAfter.season, season.id);

	// Restore returns the season to planned (least-committed state).
	await owner.collection('seasons').update(season.id, { status: 'planned' });
	assert.equal((await owner.collection('seasons').getOne(season.id)).status, 'planned');

	// Disable the capability: writes blocked, reads preserved.
	await configure(owner, org.id, { capabilities: ['athletes', 'teams', 'events'] });
	await assert.rejects(
		owner.collection('leagues').create({ organization: org.id, name: 'X', status: 'active' }),
		(err) =>
			err.status === 400 &&
			/capability_disabled/i.test(String(err.response?.message ?? err.message))
	);
	assert.equal(
		(await owner.collection('season_entries').getFullList({ filter: `organization = "${org.id}"` }))
			.length,
		1,
		'reads stay open while disabled'
	);

	// Re-enable: everything intact.
	await configure(owner, org.id, { capabilities: CAPS });
	const league2 = await owner
		.collection('leagues')
		.create({ organization: org.id, name: 'Back League', status: 'active' });
	assert.ok(league2.id);
	assert.equal((await owner.collection('seasons').getOne(season.id)).name, 'AR Season');
});

test('delete is locked on all six competition collections (archive-only)', async () => {
	const { owner, org } = await orgWithCaps('del', 'Delete Org');
	const { league, season, team } = await leagueSeasonTeam(owner, org.id, 'D');
	const division = await owner
		.collection('divisions')
		.create({ organization: org.id, season: season.id, name: 'Open', status: 'active' });
	const entry = await owner.collection('season_entries').create({
		organization: org.id,
		season: season.id,
		team: team.id,
		status: 'active'
	});
	const event = await owner.collection('events').create({
		organization: org.id,
		season: null,
		name: 'D Event',
		status: 'planned'
	});

	for (const [collection, id] of [
		['teams', team.id],
		['leagues', league.id],
		['seasons', season.id],
		['divisions', division.id],
		['season_entries', entry.id],
		['events', event.id]
	]) {
		await assert.rejects(
			owner.collection(collection).delete(id),
			(err) => err.status === 400 || err.status === 403 || err.status === 404,
			`${collection} delete locked`
		);
	}
});
