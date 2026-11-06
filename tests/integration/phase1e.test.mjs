/**
 * Phase 1E integration tests: season rosters, reserve pools, and
 * substitutions (Dustin's approved decisions, D13) — against a disposable
 * PocketBase with ordinary user credentials.
 *
 * Covers: capability-gated writes, organization scoping, role enforcement,
 * season derivation (never client-trusted), one-active-spot-per-season
 * exclusivity across rosters and reserve pools, pool gender restrictions
 * (pilot configuration), parent-link immutability, append-only substitutions
 * with hook-set recordedBy, substitution side-effect isolation (roster and
 * pool untouched), participation-history preservation, disable → preserve →
 * re-enable, and locked deletes.
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

/** Sets up an org with the 1E capabilities; returns { owner, org }. */
async function orgWithCaps(prefix, name) {
	const owner = await registerVerifiedUser(uniqueEmail(prefix), 'Owner');
	const org = await createOrgFull(owner, { name, template: 'custom', capabilities: CAPS });
	return { owner, org };
}

/** League + season + team + season entry; returns their records. */
async function structure(pb, orgId, label) {
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
	const entry = await pb.collection('season_entries').create({
		organization: orgId,
		season: season.id,
		team: team.id,
		status: 'active'
	});
	return { league, season, team, entry };
}

async function athlete(pb, orgId, first, last, gender) {
	return pb.collection('athletes').create({
		organization: orgId,
		firstName: first,
		lastName: last,
		gender,
		status: 'active'
	});
}

const isCode = (code) => (err) =>
	err.status === 400 && new RegExp(code, 'i').test(String(err.response?.message ?? err.message));

test('roster writes require the teams capability (hook-gated)', async () => {
	const owner = await registerUser(uniqueEmail('cap1e'), 'Owner');
	const org = await createOrgFull(owner, {
		name: 'No Teams Cap Org',
		template: 'custom',
		capabilities: ['athletes', 'leagues-seasons', 'events']
	});
	// Structure exists (leagues-seasons enabled), but rosters are teams-gated.
	const league = await owner
		.collection('leagues')
		.create({ organization: org.id, name: 'L', status: 'active' });
	const season = await owner.collection('seasons').create({
		organization: org.id,
		league: league.id,
		name: 'S',
		status: 'planned'
	});
	await assert.rejects(
		owner.collection('reserve_pools').create({
			organization: org.id,
			season: season.id,
			name: 'Pool',
			status: 'active'
		}),
		isCode('capability_disabled')
	);

	await configure(owner, org.id, { capabilities: CAPS });
	const pool = await owner.collection('reserve_pools').create({
		organization: org.id,
		season: season.id,
		name: 'Pool',
		status: 'active'
	});
	assert.ok(pool.id);
});

test('D13: roster rows belong to the entry; season derived, never client-trusted', async () => {
	const { owner, org } = await orgWithCaps('roster', 'Roster Org');
	const { season, entry } = await structure(owner, org.id, 'Main');
	const ava = await athlete(owner, org.id, 'Ava', 'Stone', 'female');

	// Client-sent season is ignored — the hook derives it from the entry.
	const row = await owner.collection('roster_memberships').create({
		organization: org.id,
		entry: entry.id,
		athlete: ava.id,
		season: 'xxxxxxxxxxxxxxx',
		status: 'active'
	});
	assert.equal(row.season, season.id);
	assert.equal(row.entry, entry.id);
});

test('D13 exclusivity: one active spot per athlete per season, across rosters and pools', async () => {
	const { owner, org } = await orgWithCaps('excl', 'Exclusive Org');
	const { season, entry, league } = await structure(owner, org.id, 'Main');
	const ava = await athlete(owner, org.id, 'Ava', 'Stone', 'female');
	const ben = await athlete(owner, org.id, 'Ben', 'Reed', 'male');

	await owner.collection('roster_memberships').create({
		organization: org.id,
		entry: entry.id,
		athlete: ava.id,
		status: 'active'
	});

	// Second active roster spot in the same season (other team) rejected.
	const team2 = await owner
		.collection('teams')
		.create({ organization: org.id, name: 'Second Team', status: 'active' });
	const entry2 = await owner.collection('season_entries').create({
		organization: org.id,
		season: season.id,
		team: team2.id,
		status: 'active'
	});
	await assert.rejects(
		owner.collection('roster_memberships').create({
			organization: org.id,
			entry: entry2.id,
			athlete: ava.id,
			status: 'active'
		}),
		(err) => err.status === 400
	);

	// A rostered athlete cannot join a reserve pool in the same season…
	const pool = await owner.collection('reserve_pools').create({
		organization: org.id,
		season: season.id,
		name: 'Open Reserve',
		status: 'active'
	});
	await assert.rejects(
		owner.collection('reserve_members').create({
			organization: org.id,
			pool: pool.id,
			athlete: ava.id,
			status: 'active'
		}),
		isCode('athlete_unavailable')
	);

	// …and a reserve member cannot take a roster spot.
	await owner.collection('reserve_members').create({
		organization: org.id,
		pool: pool.id,
		athlete: ben.id,
		status: 'active'
	});
	await assert.rejects(
		owner.collection('roster_memberships').create({
			organization: org.id,
			entry: entry2.id,
			athlete: ben.id,
			status: 'active'
		}),
		isCode('athlete_unavailable')
	);

	// A different season is a different spot: Ava may roster there.
	const season2 = await owner.collection('seasons').create({
		organization: org.id,
		league: league.id,
		name: 'Next Season',
		status: 'planned'
	});
	const entryNext = await owner.collection('season_entries').create({
		organization: org.id,
		season: season2.id,
		team: team2.id,
		status: 'active'
	});
	const next = await owner.collection('roster_memberships').create({
		organization: org.id,
		entry: entryNext.id,
		athlete: ava.id,
		status: 'active'
	});
	assert.equal(next.season, season2.id);
});

test('participation history: archived rows persist; restore re-checks exclusivity', async () => {
	const { owner, org } = await orgWithCaps('hist', 'History Org');
	const { season, entry } = await structure(owner, org.id, 'Main');
	const ava = await athlete(owner, org.id, 'Ava', 'Stone', 'female');

	const first = await owner.collection('roster_memberships').create({
		organization: org.id,
		entry: entry.id,
		athlete: ava.id,
		status: 'active'
	});
	await owner.collection('roster_memberships').update(first.id, { status: 'archived' });

	// The archived row IS the preserved history — still readable, unchanged.
	const archived = await owner.collection('roster_memberships').getOne(first.id);
	assert.equal(archived.status, 'archived');
	assert.equal(archived.athlete, ava.id);
	assert.equal(archived.entry, entry.id);

	// The freed spot can be taken on another team in the same season.
	const team2 = await owner
		.collection('teams')
		.create({ organization: org.id, name: 'New Team', status: 'active' });
	const entry2 = await owner.collection('season_entries').create({
		organization: org.id,
		season: season.id,
		team: team2.id,
		status: 'active'
	});
	const second = await owner.collection('roster_memberships').create({
		organization: org.id,
		entry: entry2.id,
		athlete: ava.id,
		status: 'active'
	});
	assert.ok(second.id);

	// Restoring the old row would create a second active spot — rejected
	// (partial unique index), and the history stays intact.
	await assert.rejects(
		owner.collection('roster_memberships').update(first.id, { status: 'active' }),
		(err) => err.status === 400
	);
	assert.equal((await owner.collection('roster_memberships').getOne(first.id)).status, 'archived');
});

test('reserve pools: gender restriction is pilot configuration, enforced at join time', async () => {
	const { owner, org } = await orgWithCaps('pool', 'Pool Org');
	const { season } = await structure(owner, org.id, 'Main');
	const ava = await athlete(owner, org.id, 'Ava', 'Stone', 'female');
	const ben = await athlete(owner, org.id, 'Ben', 'Reed', 'male');

	const mens = await owner.collection('reserve_pools').create({
		organization: org.id,
		season: season.id,
		name: 'Men\u2019s Reserve',
		gender: 'male',
		status: 'active'
	});
	await assert.rejects(
		owner.collection('reserve_members').create({
			organization: org.id,
			pool: mens.id,
			athlete: ava.id,
			status: 'active'
		}),
		isCode('gender_restricted')
	);
	const joined = await owner.collection('reserve_members').create({
		organization: org.id,
		pool: mens.id,
		athlete: ben.id,
		status: 'active'
	});
	assert.equal(joined.season, season.id);

	// An unrestricted pool admits anyone (sport-neutral default).
	const open = await owner.collection('reserve_pools').create({
		organization: org.id,
		season: season.id,
		name: 'Open Reserve',
		status: 'active'
	});
	const avaJoined = await owner.collection('reserve_members').create({
		organization: org.id,
		pool: open.id,
		athlete: ava.id,
		status: 'active'
	});
	assert.ok(avaJoined.id);

	// Duplicate pool name per season rejected (unique index).
	await assert.rejects(
		owner.collection('reserve_pools').create({
			organization: org.id,
			season: season.id,
			name: 'Open Reserve',
			status: 'active'
		}),
		(err) => err.status === 400
	);

	// The restriction is immutable — archive and recreate instead.
	await assert.rejects(
		owner.collection('reserve_pools').update(mens.id, { gender: 'female' }),
		isCode('immutable_restriction')
	);
});

test('substitutions: append-only, hook-recorded author, event must be in the entry season', async () => {
	const { owner, org } = await orgWithCaps('sub', 'Sub Org');
	const { season, entry, league } = await structure(owner, org.id, 'Main');
	const ava = await athlete(owner, org.id, 'Ava', 'Stone', 'female');
	const ben = await athlete(owner, org.id, 'Ben', 'Reed', 'male');
	const cal = await athlete(owner, org.id, 'Cal', 'Hart', 'male');

	await owner.collection('roster_memberships').create({
		organization: org.id,
		entry: entry.id,
		athlete: ava.id,
		status: 'active'
	});
	const pool = await owner.collection('reserve_pools').create({
		organization: org.id,
		season: season.id,
		name: 'Reserve',
		status: 'active'
	});
	await owner.collection('reserve_members').create({
		organization: org.id,
		pool: pool.id,
		athlete: ben.id,
		status: 'active'
	});
	const event = await owner.collection('events').create({
		organization: org.id,
		season: season.id,
		name: 'Week 1',
		status: 'planned'
	});

	// Happy path: recordedBy is the authenticated caller, spoofing ignored.
	const sub = await owner.collection('substitutions').create({
		organization: org.id,
		event: event.id,
		entry: entry.id,
		athleteOut: ava.id,
		athleteIn: ben.id,
		reason: 'Injury',
		recordedBy: 'spoofedidspoofed'
	});
	assert.equal(sub.recordedBy, owner.authStore.record.id);
	assert.equal(sub.reason, 'Injury');

	// Side-effect isolation: the substitution touches ONLY the event record of
	// fact — the roster spot and the reserve membership are unchanged.
	const roster = await owner
		.collection('roster_memberships')
		.getFullList({ filter: `entry = "${entry.id}"` });
	assert.equal(roster.length, 1);
	assert.equal(roster[0].athlete, ava.id);
	assert.equal(roster[0].status, 'active');
	const reserves = await owner
		.collection('reserve_members')
		.getFullList({ filter: `pool = "${pool.id}"` });
	assert.equal(reserves.length, 1);
	assert.equal(reserves[0].athlete, ben.id);
	assert.equal(reserves[0].status, 'active');

	// Append-only: even the Owner cannot update or delete.
	await assert.rejects(
		owner.collection('substitutions').update(sub.id, { reason: 'Edited' }),
		(err) => err.status === 403 || err.status === 404
	);
	await assert.rejects(
		owner.collection('substitutions').delete(sub.id),
		(err) => err.status === 403 || err.status === 404
	);

	// An independent event has no roster context.
	const independent = await owner
		.collection('events')
		.create({ organization: org.id, name: 'Standalone', status: 'planned' });
	await assert.rejects(
		owner.collection('substitutions').create({
			organization: org.id,
			event: independent.id,
			entry: entry.id,
			athleteOut: ava.id,
			athleteIn: ben.id
		}),
		isCode('event_not_in_season')
	);

	// An event from a different season is rejected.
	const season2 = await owner.collection('seasons').create({
		organization: org.id,
		league: league.id,
		name: 'Other Season',
		status: 'planned'
	});
	const otherEvent = await owner.collection('events').create({
		organization: org.id,
		season: season2.id,
		name: 'Elsewhere',
		status: 'planned'
	});
	await assert.rejects(
		owner.collection('substitutions').create({
			organization: org.id,
			event: otherEvent.id,
			entry: entry.id,
			athleteOut: ava.id,
			athleteIn: ben.id
		}),
		isCode('event_not_in_season')
	);

	// The replaced athlete must hold an active spot on THIS entry.
	await assert.rejects(
		owner.collection('substitutions').create({
			organization: org.id,
			event: event.id,
			entry: entry.id,
			athleteOut: cal.id,
			athleteIn: ben.id
		}),
		isCode('athlete_not_rostered')
	);

	// The replacement must be an active reserve member this season.
	await assert.rejects(
		owner.collection('substitutions').create({
			organization: org.id,
			event: event.id,
			entry: entry.id,
			athleteOut: ava.id,
			athleteIn: cal.id
		}),
		isCode('athlete_not_reserve')
	);

	// Replacing an athlete with themselves is meaningless.
	await assert.rejects(
		owner.collection('substitutions').create({
			organization: org.id,
			event: event.id,
			entry: entry.id,
			athleteOut: ava.id,
			athleteIn: ava.id
		}),
		(err) => err.status === 400
	);
});

test('organization scoping: cross-organization reads, writes, and links denied', async () => {
	const { owner: ownerA, org: orgA } = await orgWithCaps('rosA', 'Roster Org A');
	const { season: seasonA, entry: entryA } = await structure(ownerA, orgA.id, 'A');
	const avaA = await athlete(ownerA, orgA.id, 'Ava', 'Stone', 'female');
	await ownerA.collection('roster_memberships').create({
		organization: orgA.id,
		entry: entryA.id,
		athlete: avaA.id,
		status: 'active'
	});
	const poolA = await ownerA.collection('reserve_pools').create({
		organization: orgA.id,
		season: seasonA.id,
		name: 'A Reserve',
		status: 'active'
	});

	const { owner: ownerB, org: orgB } = await orgWithCaps('rosB', 'Roster Org B');
	await structure(ownerB, orgB.id, 'B');
	const benB = await athlete(ownerB, orgB.id, 'Ben', 'Reed', 'male');

	// B reads zero of A's roster records.
	for (const collection of [
		'roster_memberships',
		'reserve_pools',
		'reserve_members',
		'substitutions'
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

	// Cross-org relation targets rejected in both directions.
	await assert.rejects(
		ownerB.collection('roster_memberships').create({
			organization: orgB.id,
			entry: entryA.id,
			athlete: benB.id,
			status: 'active'
		}),
		isCode('cross_organization')
	);
	await assert.rejects(
		ownerA.collection('roster_memberships').create({
			organization: orgA.id,
			entry: entryA.id,
			athlete: benB.id,
			status: 'active'
		}),
		isCode('cross_organization')
	);
	await assert.rejects(
		ownerB.collection('reserve_members').create({
			organization: orgB.id,
			pool: poolA.id,
			athlete: benB.id,
			status: 'active'
		}),
		isCode('cross_organization')
	);
});

test('role enforcement: owners/admins write, scorekeepers/viewers read-only', async () => {
	const { owner, org } = await orgWithCaps('rroles', 'Roster Roles Org');
	const { season, entry } = await structure(owner, org.id, 'Main');
	const ava = await athlete(owner, org.id, 'Ava', 'Stone', 'female');

	const mk = async (prefix, role, name) => {
		const email = uniqueEmail(prefix);
		const pb = await registerVerifiedUser(email, name);
		await acceptInvitation(pb, (await createInvitation(owner, org.id, email, role)).token);
		return pb;
	};
	const admin = await mk('radm', 'admin', 'Admin');
	const sk = await mk('rsk', 'scorekeeper', 'Scorekeeper');
	const vw = await mk('rvw', 'viewer', 'Viewer');

	// Admin writes.
	const row = await admin.collection('roster_memberships').create({
		organization: org.id,
		entry: entry.id,
		athlete: ava.id,
		status: 'active'
	});
	const pool = await admin.collection('reserve_pools').create({
		organization: org.id,
		season: season.id,
		name: 'Admin Pool',
		status: 'active'
	});

	for (const [label, pb] of [
		['scorekeeper', sk],
		['viewer', vw]
	]) {
		for (const collection of [
			'roster_memberships',
			'reserve_pools',
			'reserve_members',
			'substitutions'
		]) {
			assert.ok(
				Array.isArray(
					await pb.collection(collection).getFullList({ filter: `organization = "${org.id}"` })
				),
				`${label} reads ${collection}`
			);
		}
		await assert.rejects(
			pb.collection('roster_memberships').create({
				organization: org.id,
				entry: entry.id,
				athlete: ava.id,
				status: 'active'
			}),
			(err) => err.status === 400 || err.status === 403
		);
		await assert.rejects(
			pb.collection('roster_memberships').update(row.id, { status: 'archived' }),
			(err) => err.status === 400 || err.status === 403 || err.status === 404
		);
		await assert.rejects(
			pb.collection('reserve_pools').delete(pool.id),
			(err) => err.status === 400 || err.status === 403 || err.status === 404,
			`${label} delete denied`
		);
	}

	// Outsider (no membership) sees nothing.
	const outsider = await registerVerifiedUser(uniqueEmail('rout'), 'Outsider');
	assert.equal(
		(
			await outsider
				.collection('roster_memberships')
				.getFullList({ filter: `organization = "${org.id}"` })
		).length,
		0
	);
});

test('immutability: roster and reserve records cannot be relocated or rewired', async () => {
	const { owner, org } = await orgWithCaps('rimm', 'Immutable Org');
	const { season, entry, league } = await structure(owner, org.id, 'Main');
	const ava = await athlete(owner, org.id, 'Ava', 'Stone', 'female');
	const ben = await athlete(owner, org.id, 'Ben', 'Reed', 'male');

	const row = await owner.collection('roster_memberships').create({
		organization: org.id,
		entry: entry.id,
		athlete: ava.id,
		status: 'active'
	});
	const team2 = await owner
		.collection('teams')
		.create({ organization: org.id, name: 'Other Team', status: 'active' });
	const entry2 = await owner.collection('season_entries').create({
		organization: org.id,
		season: season.id,
		team: team2.id,
		status: 'active'
	});

	await assert.rejects(
		owner.collection('roster_memberships').update(row.id, { entry: entry2.id }),
		isCode('immutable_relation')
	);
	await assert.rejects(
		owner.collection('roster_memberships').update(row.id, { athlete: ben.id }),
		isCode('immutable_relation')
	);

	const pool = await owner.collection('reserve_pools').create({
		organization: org.id,
		season: season.id,
		name: 'Reserve',
		status: 'active'
	});
	const member = await owner.collection('reserve_members').create({
		organization: org.id,
		pool: pool.id,
		athlete: ben.id,
		status: 'active'
	});
	const season2 = await owner.collection('seasons').create({
		organization: org.id,
		league: league.id,
		name: 'Second Season',
		status: 'planned'
	});
	const pool2 = await owner.collection('reserve_pools').create({
		organization: org.id,
		season: season2.id,
		name: 'Other Reserve',
		status: 'active'
	});

	await assert.rejects(
		owner.collection('reserve_pools').update(pool.id, { season: season2.id }),
		isCode('immutable_relation')
	);
	await assert.rejects(
		owner.collection('reserve_members').update(member.id, { pool: pool2.id }),
		isCode('immutable_relation')
	);
	await assert.rejects(
		owner.collection('reserve_members').update(member.id, { athlete: ava.id }),
		isCode('immutable_relation')
	);
});

test('D13 exclusivity holds under concurrent writes from two sessions (regression)', async () => {
	// Reproduced before the fix: the hook's cross-table check is read-then-write,
	// so two concurrent direct API requests from independent authorized sessions
	// could both pass it (4/20 concurrent creates, 2/20 concurrent restores ended
	// with two active spots). SQLite triggers (phase1e_exclusivity_triggers
	// migration) now re-run the check inside the serialized write itself.
	const { owner, org } = await orgWithCaps('race', 'Race Org');
	const { season, entry } = await structure(owner, org.id, 'Main');
	const pool = await owner.collection('reserve_pools').create({
		organization: org.id,
		season: season.id,
		name: 'Race Reserve',
		status: 'active'
	});
	// Second independent authorized session.
	const adminEmail = uniqueEmail('raceadm');
	const admin = await registerVerifiedUser(adminEmail, 'Race Admin');
	await acceptInvitation(admin, (await createInvitation(owner, org.id, adminEmail, 'admin')).token);

	const activeSpots = async (athleteId) => {
		const ros = await owner
			.collection('roster_memberships')
			.getFullList({ filter: `athlete = "${athleteId}" && status = "active"` });
		const rsv = await owner
			.collection('reserve_members')
			.getFullList({ filter: `athlete = "${athleteId}" && status = "active"` });
		return ros.length + rsv.length;
	};

	// Concurrent CREATE: owner adds to the roster while admin adds the same
	// athlete to the reserve pool, in flight at the same time.
	for (let i = 0; i < 5; i++) {
		const a = await athlete(owner, org.id, `Create${i}`, 'Race', 'male');
		const results = await Promise.allSettled([
			owner.collection('roster_memberships').create({
				organization: org.id,
				entry: entry.id,
				athlete: a.id,
				status: 'active'
			}),
			admin.collection('reserve_members').create({
				organization: org.id,
				pool: pool.id,
				athlete: a.id,
				status: 'active'
			})
		]);
		assert.ok(
			results.some((r) => r.status === 'fulfilled'),
			`create pair ${i}: at least one write persisted`
		);
		assert.equal(await activeSpots(a.id), 1, `create pair ${i}: exactly one active spot persisted`);
	}

	// Concurrent RESTORE: one archived row in each table, both restored at once.
	for (let i = 0; i < 5; i++) {
		const a = await athlete(owner, org.id, `Restore${i}`, 'Race', 'male');
		const ros = await owner.collection('roster_memberships').create({
			organization: org.id,
			entry: entry.id,
			athlete: a.id,
			status: 'active'
		});
		await owner.collection('roster_memberships').update(ros.id, { status: 'archived' });
		const rsv = await owner.collection('reserve_members').create({
			organization: org.id,
			pool: pool.id,
			athlete: a.id,
			status: 'active'
		});
		await owner.collection('reserve_members').update(rsv.id, { status: 'archived' });
		const results = await Promise.allSettled([
			owner.collection('roster_memberships').update(ros.id, { status: 'active' }),
			admin.collection('reserve_members').update(rsv.id, { status: 'active' })
		]);
		assert.ok(
			results.some((r) => r.status === 'fulfilled'),
			`restore pair ${i}: at least one restore persisted`
		);
		assert.equal(
			await activeSpots(a.id),
			1,
			`restore pair ${i}: exactly one active spot persisted`
		);
	}
});

test('disable teams → roster writes blocked, reads preserved → re-enable restores', async () => {
	const { owner, org } = await orgWithCaps('rtoggle', 'Toggle Org');
	const { entry } = await structure(owner, org.id, 'Main');
	const ava = await athlete(owner, org.id, 'Ava', 'Stone', 'female');
	const row = await owner.collection('roster_memberships').create({
		organization: org.id,
		entry: entry.id,
		athlete: ava.id,
		status: 'active'
	});

	await configure(owner, org.id, {
		capabilities: ['athletes', 'leagues-seasons', 'events']
	});

	// Writes blocked while disabled…
	await assert.rejects(
		owner.collection('roster_memberships').update(row.id, { status: 'archived' }),
		isCode('capability_disabled')
	);
	// …but the preserved record stays readable (disabling hides the workflow,
	// never the data).
	assert.equal((await owner.collection('roster_memberships').getOne(row.id)).athlete, ava.id);

	await configure(owner, org.id, { capabilities: CAPS });
	const archived = await owner
		.collection('roster_memberships')
		.update(row.id, { status: 'archived' });
	assert.equal(archived.status, 'archived');
});
