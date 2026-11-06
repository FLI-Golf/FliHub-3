/**
 * Phase 1F integration tests: event operations — courses with holes and
 * labeled positions, rounds, event groups, and group team/athlete
 * assignments (Dustin's approved decisions, D14) — against a disposable
 * PocketBase with ordinary user credentials.
 *
 * Covers: capability-gated writes (venues-courses and events), course layout
 * invariants (unique active hole numbers and position labels, positive
 * distances with explicit units), round numbering, scorekeeper-must-be-member
 * (any role — score entry permissions are 1G), season-linked-event
 * requirement, event derivation from the group (never client-trusted),
 * roster + substitution eligibility (reserves appear only for the event
 * where the substitution applies; substituted-out athletes blocked for that
 * event only), season-roster preservation, assignment immutability
 * (archive-and-recreate as the change record), one group per event per team
 * and per athlete, organization scoping, role enforcement, and disable →
 * preserve → re-enable.
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

const CAPS = ['athletes', 'teams', 'leagues-seasons', 'events', 'venues-courses'];

async function createOrgFull(pb, body) {
	return pb.send('/api/flihub/organizations', { method: 'POST', body });
}

async function configure(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/configure`, { method: 'POST', body });
}

/** Sets up an org with the 1F capabilities; returns { owner, org }. */
async function orgWithCaps(prefix, name) {
	const owner = await registerVerifiedUser(uniqueEmail(prefix), 'Owner');
	const org = await createOrgFull(owner, { name, template: 'custom', capabilities: CAPS });
	return { owner, org };
}

/** League + season + team + entry + rostered athlete + reserve + event. */
async function competitionFixture(pb, orgId, label) {
	const league = await pb
		.collection('leagues')
		.create({ organization: orgId, name: `${label} League`, status: 'active' });
	const season = await pb.collection('seasons').create({
		organization: orgId,
		league: league.id,
		name: `${label} Season`,
		status: 'active'
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
	const rostered = await pb.collection('athletes').create({
		organization: orgId,
		firstName: 'Ava',
		lastName: `${label}R`,
		gender: 'female',
		status: 'active'
	});
	await pb.collection('roster_memberships').create({
		organization: orgId,
		entry: entry.id,
		athlete: rostered.id,
		status: 'active'
	});
	const reserve = await pb.collection('athletes').create({
		organization: orgId,
		firstName: 'Ben',
		lastName: `${label}V`,
		gender: 'male',
		status: 'active'
	});
	const pool = await pb.collection('reserve_pools').create({
		organization: orgId,
		season: season.id,
		name: `${label} Reserve`,
		status: 'active'
	});
	await pb.collection('reserve_members').create({
		organization: orgId,
		pool: pool.id,
		athlete: reserve.id,
		status: 'active'
	});
	const event = await pb.collection('events').create({
		organization: orgId,
		season: season.id,
		name: `${label} Week 1`,
		status: 'planned'
	});
	return { league, season, team, entry, rostered, reserve, pool, event };
}

const isCode = (code) => (err) =>
	err.status === 400 && new RegExp(code, 'i').test(String(err.response?.message ?? err.message));

test('event-operations writes require their capabilities (hook-gated)', async () => {
	const owner = await registerUser(uniqueEmail('cap1f'), 'Owner');
	const org = await createOrgFull(owner, {
		name: 'No 1F Caps Org',
		template: 'custom',
		capabilities: ['athletes', 'teams', 'leagues-seasons']
	});
	await assert.rejects(
		owner.collection('courses').create({ organization: org.id, name: 'C', status: 'active' }),
		isCode('capability_disabled')
	);

	await configure(owner, org.id, { capabilities: CAPS });
	const course = await owner
		.collection('courses')
		.create({ organization: org.id, name: 'C', status: 'active' });
	assert.ok(course.id);

	// rounds/groups gate on `events`, not `venues-courses`.
	await configure(owner, org.id, {
		capabilities: ['athletes', 'teams', 'leagues-seasons', 'venues-courses']
	});
	const league = await owner
		.collection('leagues')
		.create({ organization: org.id, name: 'L', status: 'active' });
	const season = await owner.collection('seasons').create({
		organization: org.id,
		league: league.id,
		name: 'S',
		status: 'planned'
	});
	assert.ok(league.id && season.id);
	await assert.rejects(
		owner.collection('rounds').create({
			organization: org.id,
			event: 'xxxxxxxxxxxxxxx',
			number: 1,
			status: 'active'
		}),
		isCode('capability_disabled')
	);
});

test('course layout: holes and labeled positions with generic invariants', async () => {
	const { owner, org } = await orgWithCaps('course', 'Course Org');
	const course = await owner
		.collection('courses')
		.create({ organization: org.id, name: 'Lakeside DGC', status: 'active' });

	const hole = await owner.collection('course_holes').create({
		organization: org.id,
		course: course.id,
		number: 1,
		name: 'The Willow',
		par: 3,
		status: 'active'
	});
	assert.equal(hole.par, 3);

	// Unique active hole number per course; archived numbers are reusable.
	await assert.rejects(
		owner.collection('course_holes').create({
			organization: org.id,
			course: course.id,
			number: 1,
			name: 'Dup',
			par: 3,
			status: 'active'
		}),
		(err) => err.status === 400
	);
	await owner.collection('course_holes').update(hole.id, { status: 'archived' });
	const replacement = await owner.collection('course_holes').create({
		organization: org.id,
		course: course.id,
		number: 1,
		name: 'The New Willow',
		par: 3,
		status: 'active'
	});
	assert.ok(replacement.id);

	// Positions: label unique per hole while active; distance must be positive
	// with an explicit unit. Demo ranges (220–425 ft) are pilot configuration,
	// verified in the demo build — not a model constraint.
	const red = await owner.collection('hole_positions').create({
		organization: org.id,
		hole: replacement.id,
		label: 'red',
		distance: 280,
		unit: 'feet',
		status: 'active'
	});
	const blue = await owner.collection('hole_positions').create({
		organization: org.id,
		hole: replacement.id,
		label: 'blue',
		distance: 342,
		unit: 'feet',
		status: 'active'
	});
	assert.notEqual(red.distance, blue.distance);
	await assert.rejects(
		owner.collection('hole_positions').create({
			organization: org.id,
			hole: replacement.id,
			label: 'red',
			distance: 300,
			unit: 'feet',
			status: 'active'
		}),
		(err) => err.status === 400
	);
	await assert.rejects(
		owner.collection('hole_positions').create({
			organization: org.id,
			hole: replacement.id,
			label: 'gold',
			distance: 0,
			unit: 'feet',
			status: 'active'
		}),
		(err) => err.status === 400
	);
	await assert.rejects(
		owner.collection('hole_positions').create({
			organization: org.id,
			hole: replacement.id,
			label: 'gold',
			distance: 250,
			unit: 'furlongs',
			status: 'active'
		}),
		(err) => err.status === 400
	);

	// Parent links immutable: a hole cannot move to another course.
	const course2 = await owner
		.collection('courses')
		.create({ organization: org.id, name: 'Second DGC', status: 'active' });
	await assert.rejects(
		owner.collection('course_holes').update(replacement.id, { course: course2.id }),
		isCode('immutable_relation')
	);
	await assert.rejects(
		owner.collection('hole_positions').update(red.id, { hole: hole.id }),
		isCode('immutable_relation')
	);
});

test('rounds: ordered per event, optional course/position label, no times', async () => {
	const { owner, org } = await orgWithCaps('round', 'Round Org');
	const { event } = await competitionFixture(owner, org.id, 'R');
	const course = await owner
		.collection('courses')
		.create({ organization: org.id, name: 'Lakeside DGC', status: 'active' });
	// Nine holes: red on all nine, blue on only eight (hole 9 has no blue).
	for (let i = 1; i <= 9; i++) {
		const hole = await owner.collection('course_holes').create({
			organization: org.id,
			course: course.id,
			number: i,
			name: `Hole ${i}`,
			par: 3,
			status: 'active'
		});
		await owner.collection('hole_positions').create({
			organization: org.id,
			hole: hole.id,
			label: 'red',
			distance: 250 + i,
			unit: 'feet',
			status: 'active'
		});
		if (i < 9) {
			await owner.collection('hole_positions').create({
				organization: org.id,
				hole: hole.id,
				label: 'blue',
				distance: 320 + i,
				unit: 'feet',
				status: 'active'
			});
		}
	}

	// A fully covered named position (red on 9/9) saves.
	const one = await owner.collection('rounds').create({
		organization: org.id,
		event: event.id,
		number: 1,
		name: 'Round one',
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});
	// A blank position stays valid for planning.
	const two = await owner.collection('rounds').create({
		organization: org.id,
		event: event.id,
		number: 2,
		name: 'Round two',
		course: course.id,
		status: 'active'
	});
	// The event distinguishes round one from round two by number.
	assert.notEqual(one.number, two.number);
	assert.equal(one.positionLabel, 'red');
	assert.equal(two.positionLabel, '');

	// Coverage rule (D14): a partially covered label is rejected with the
	// missing hole named; an unknown label and a course-less named label are
	// rejected too — on create AND update (direct API included).
	await assert.rejects(
		owner.collection('rounds').create({
			organization: org.id,
			event: event.id,
			number: 3,
			course: course.id,
			positionLabel: 'blue',
			status: 'active'
		}),
		(err) =>
			isCode('position_incomplete')(err) &&
			/hole 9/.test(String(err.response?.message ?? err.message))
	);
	await assert.rejects(
		owner.collection('rounds').create({
			organization: org.id,
			event: event.id,
			number: 3,
			course: course.id,
			positionLabel: 'gold',
			status: 'active'
		}),
		isCode('position_unknown')
	);
	await assert.rejects(
		owner.collection('rounds').create({
			organization: org.id,
			event: event.id,
			number: 3,
			positionLabel: 'red',
			status: 'active'
		}),
		isCode('position_requires_course')
	);
	await assert.rejects(
		owner.collection('rounds').update(two.id, { positionLabel: 'blue' }),
		isCode('position_incomplete')
	);

	// Saved rounds stay as saved: archiving a red position AFTER round one was
	// saved does not rewrite it, and status-only updates (archive) still work.
	// Scoring-time resolution of a position missing after the save is a 1G rule.
	const redOnHole1 = await owner
		.collection('hole_positions')
		.getFirstListItem(`organization = "${org.id}" && label = "red" && distance = 251`);
	await owner.collection('hole_positions').update(redOnHole1.id, { status: 'archived' });
	assert.equal((await owner.collection('rounds').getOne(one.id)).positionLabel, 'red');
	const archivedRound = await owner.collection('rounds').update(one.id, { status: 'archived' });
	assert.equal(archivedRound.status, 'archived');
	const restored = await owner.collection('rounds').update(one.id, { status: 'active' });
	assert.equal(restored.status, 'active');
	// …but only CHANGING the position re-validates: re-sending the SAME label
	// (now incomplete after the archive) alongside a rename still succeeds.
	const renamed = await owner
		.collection('rounds')
		.update(one.id, { positionLabel: 'red', name: 'Edited' });
	assert.equal(renamed.name, 'Edited');
	assert.equal(renamed.positionLabel, 'red');

	await assert.rejects(
		owner.collection('rounds').create({
			organization: org.id,
			event: event.id,
			number: 2,
			status: 'active'
		}),
		(err) => err.status === 400
	);
	await assert.rejects(
		owner.collection('rounds').update(two.id, { event: 'xxxxxxxxxxxxxxx' }),
		isCode('immutable_relation')
	);
});

test('groups: scorekeeper must be an organization member (any role)', async () => {
	const { owner, org } = await orgWithCaps('skgrp', 'Scorekeeper Org');
	const { event } = await competitionFixture(owner, org.id, 'K');

	// A Viewer-role member is assignable: assignment is a plan; score-entry
	// permissions arrive with Phase 1G.
	const viewerEmail = uniqueEmail('skv');
	const viewer = await registerVerifiedUser(viewerEmail, 'Viewer Member');
	await acceptInvitation(
		viewer,
		(await createInvitation(owner, org.id, viewerEmail, 'viewer')).token
	);
	const viewerId = viewer.authStore.record.id;

	const group = await owner.collection('event_groups').create({
		organization: org.id,
		event: event.id,
		name: 'Group 1',
		scorekeeper: viewerId,
		status: 'active'
	});
	assert.equal(group.scorekeeper, viewerId);

	// A verified user with NO membership is rejected.
	const outsider = await registerVerifiedUser(uniqueEmail('skout'), 'Outsider');
	await assert.rejects(
		owner.collection('event_groups').create({
			organization: org.id,
			event: event.id,
			name: 'Group 2',
			scorekeeper: outsider.authStore.record.id,
			status: 'active'
		}),
		isCode('not_a_member')
	);
	await assert.rejects(
		owner
			.collection('event_groups')
			.update(group.id, { scorekeeper: outsider.authStore.record.id }),
		isCode('not_a_member')
	);

	// Duplicate active group name per event rejected; archived name reusable.
	await assert.rejects(
		owner.collection('event_groups').create({
			organization: org.id,
			event: event.id,
			name: 'Group 1',
			status: 'active'
		}),
		(err) => err.status === 400
	);
});

test('D14: group teams require a season-linked event and a same-season entry', async () => {
	const { owner, org } = await orgWithCaps('gteam', 'Group Team Org');
	const { season, entry, event, league } = await competitionFixture(owner, org.id, 'G');

	const group = await owner.collection('event_groups').create({
		organization: org.id,
		event: event.id,
		name: 'Group 1',
		status: 'active'
	});

	// Event is derived from the group — client-sent values are ignored.
	const assigned = await owner.collection('group_teams').create({
		organization: org.id,
		group: group.id,
		entry: entry.id,
		event: 'xxxxxxxxxxxxxxx',
		status: 'active'
	});
	assert.equal(assigned.event, event.id);

	// One group per event per team.
	const group2 = await owner.collection('event_groups').create({
		organization: org.id,
		event: event.id,
		name: 'Group 2',
		status: 'active'
	});
	await assert.rejects(
		owner.collection('group_teams').create({
			organization: org.id,
			group: group2.id,
			entry: entry.id,
			status: 'active'
		}),
		(err) => err.status === 400
	);

	// Independent events have no entries or rosters: assignment rejected.
	const independent = await owner
		.collection('events')
		.create({ organization: org.id, name: 'Standalone', status: 'planned' });
	const indGroup = await owner.collection('event_groups').create({
		organization: org.id,
		event: independent.id,
		name: 'Group 1',
		status: 'active'
	});
	await assert.rejects(
		owner.collection('group_teams').create({
			organization: org.id,
			group: indGroup.id,
			entry: entry.id,
			status: 'active'
		}),
		isCode('event_not_in_season')
	);

	// An entry from a different season is rejected.
	const season2 = await owner.collection('seasons').create({
		organization: org.id,
		league: league.id,
		name: 'Other Season',
		status: 'planned'
	});
	const team2 = await owner
		.collection('teams')
		.create({ organization: org.id, name: 'Other Team', status: 'active' });
	const otherEntry = await owner.collection('season_entries').create({
		organization: org.id,
		season: season2.id,
		team: team2.id,
		status: 'active'
	});
	await assert.rejects(
		owner.collection('group_teams').create({
			organization: org.id,
			group: group.id,
			entry: otherEntry.id,
			status: 'active'
		}),
		isCode('entry_not_in_season')
	);
	assert.ok(season.id);
});

test('D14 eligibility: rosters + event-scoped substitutions decide group athletes', async () => {
	const { owner, org } = await orgWithCaps('gath', 'Group Athlete Org');
	const { season, entry, rostered, reserve, event } = await competitionFixture(owner, org.id, 'E');
	const group = await owner.collection('event_groups').create({
		organization: org.id,
		event: event.id,
		name: 'Group 1',
		status: 'active'
	});

	// The athlete's team must be in the group first.
	await assert.rejects(
		owner.collection('group_athletes').create({
			organization: org.id,
			group: group.id,
			entry: entry.id,
			athlete: rostered.id,
			status: 'active'
		}),
		isCode('team_not_in_group')
	);
	await owner.collection('group_teams').create({
		organization: org.id,
		group: group.id,
		entry: entry.id,
		status: 'active'
	});

	// Rostered athlete assignable; event derived from the group.
	const avaRow = await owner.collection('group_athletes').create({
		organization: org.id,
		group: group.id,
		entry: entry.id,
		athlete: rostered.id,
		event: 'xxxxxxxxxxxxxxx',
		status: 'active'
	});
	assert.equal(avaRow.event, event.id);

	// Reserve without a substitution is NOT eligible.
	await assert.rejects(
		owner.collection('group_athletes').create({
			organization: org.id,
			group: group.id,
			entry: entry.id,
			athlete: reserve.id,
			status: 'active'
		}),
		isCode('athlete_not_eligible')
	);

	// An official substitution for THIS event brings the reserve in…
	await owner.collection('substitutions').create({
		organization: org.id,
		event: event.id,
		entry: entry.id,
		athleteOut: rostered.id,
		athleteIn: reserve.id,
		reason: 'Travel conflict'
	});
	const benRow = await owner.collection('group_athletes').create({
		organization: org.id,
		group: group.id,
		entry: entry.id,
		athlete: reserve.id,
		status: 'active'
	});
	assert.ok(benRow.id);

	// …and blocks the replaced athlete for this event (restore re-checked).
	await owner.collection('group_athletes').update(avaRow.id, { status: 'archived' });
	await assert.rejects(
		owner.collection('group_athletes').update(avaRow.id, { status: 'active' }),
		isCode('athlete_substituted_out')
	);

	// The substitution is event-scoped: for a second event in the same season
	// the reserve is NOT eligible and the rostered athlete IS.
	const event2 = await owner.collection('events').create({
		organization: org.id,
		season: season.id,
		name: 'E Week 2',
		status: 'planned'
	});
	const group2 = await owner.collection('event_groups').create({
		organization: org.id,
		event: event2.id,
		name: 'Group 1',
		status: 'active'
	});
	await owner.collection('group_teams').create({
		organization: org.id,
		group: group2.id,
		entry: entry.id,
		status: 'active'
	});
	await assert.rejects(
		owner.collection('group_athletes').create({
			organization: org.id,
			group: group2.id,
			entry: entry.id,
			athlete: reserve.id,
			status: 'active'
		}),
		isCode('athlete_not_eligible')
	);
	const avaEvent2 = await owner.collection('group_athletes').create({
		organization: org.id,
		group: group2.id,
		entry: entry.id,
		athlete: rostered.id,
		status: 'active'
	});
	assert.ok(avaEvent2.id);

	// Group assignment preserved the season roster: Ava's single active
	// roster membership is untouched, and the reserve pool is unchanged.
	const roster = await owner
		.collection('roster_memberships')
		.getFullList({ filter: `entry = "${entry.id}"` });
	assert.equal(roster.length, 1);
	assert.equal(roster[0].athlete, rostered.id);
	assert.equal(roster[0].status, 'active');
	const reserves = await owner
		.collection('reserve_members')
		.getFullList({ filter: `organization = "${org.id}" && status = "active"` });
	assert.equal(reserves.length, 1);
	assert.equal(reserves[0].athlete, reserve.id);

	// One group per event per athlete (partial unique index).
	await assert.rejects(
		owner.collection('group_athletes').create({
			organization: org.id,
			group: group2.id,
			entry: entry.id,
			athlete: rostered.id,
			status: 'active'
		}),
		(err) => err.status === 400
	);

	// Assignments cannot be rewired — archive and recreate (the change record).
	await assert.rejects(
		owner.collection('group_athletes').update(benRow.id, { athlete: rostered.id }),
		isCode('immutable_relation')
	);
});

test('organization scoping: cross-organization reads, writes, and links denied', async () => {
	const { owner: ownerA, org: orgA } = await orgWithCaps('fopsA', 'F Ops Org A');
	const fixtureA = await competitionFixture(ownerA, orgA.id, 'A');
	const courseA = await ownerA
		.collection('courses')
		.create({ organization: orgA.id, name: 'A DGC', status: 'active' });
	const groupA = await ownerA.collection('event_groups').create({
		organization: orgA.id,
		event: fixtureA.event.id,
		name: 'Group 1',
		status: 'active'
	});

	const { owner: ownerB, org: orgB } = await orgWithCaps('fopsB', 'F Ops Org B');
	const fixtureB = await competitionFixture(ownerB, orgB.id, 'B');

	for (const collection of [
		'courses',
		'course_holes',
		'hole_positions',
		'rounds',
		'event_groups',
		'group_teams',
		'group_athletes'
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

	await assert.rejects(
		ownerB.collection('course_holes').create({
			organization: orgB.id,
			course: courseA.id,
			number: 1,
			name: 'X',
			par: 3,
			status: 'active'
		}),
		isCode('cross_organization')
	);
	await assert.rejects(
		ownerB.collection('rounds').create({
			organization: orgB.id,
			event: fixtureA.event.id,
			number: 1,
			status: 'active'
		}),
		isCode('cross_organization')
	);
	await assert.rejects(
		ownerB.collection('group_teams').create({
			organization: orgB.id,
			group: groupA.id,
			entry: fixtureB.entry.id,
			status: 'active'
		}),
		isCode('cross_organization')
	);
	await assert.rejects(
		ownerA.collection('group_teams').create({
			organization: orgA.id,
			group: groupA.id,
			entry: fixtureB.entry.id,
			status: 'active'
		}),
		isCode('cross_organization')
	);
});

test('role enforcement: owners/admins write, scorekeepers/viewers read-only', async () => {
	const { owner, org } = await orgWithCaps('froles', 'F Roles Org');
	const { event } = await competitionFixture(owner, org.id, 'P');
	const course = await owner
		.collection('courses')
		.create({ organization: org.id, name: 'Roles DGC', status: 'active' });
	const group = await owner.collection('event_groups').create({
		organization: org.id,
		event: event.id,
		name: 'Group 1',
		status: 'active'
	});

	const mk = async (prefix, role, name) => {
		const email = uniqueEmail(prefix);
		const pb = await registerVerifiedUser(email, name);
		await acceptInvitation(pb, (await createInvitation(owner, org.id, email, role)).token);
		return pb;
	};
	const admin = await mk('fadm', 'admin', 'Admin');
	const sk = await mk('fsk', 'scorekeeper', 'Scorekeeper');
	const vw = await mk('fvw', 'viewer', 'Viewer');

	// Admin writes.
	const hole = await admin.collection('course_holes').create({
		organization: org.id,
		course: course.id,
		number: 1,
		name: 'Admin Hole',
		par: 3,
		status: 'active'
	});
	assert.ok(hole.id);

	for (const [label, pb] of [
		['scorekeeper', sk],
		['viewer', vw]
	]) {
		for (const collection of [
			'courses',
			'course_holes',
			'hole_positions',
			'rounds',
			'event_groups',
			'group_teams',
			'group_athletes'
		]) {
			assert.ok(
				Array.isArray(
					await pb.collection(collection).getFullList({ filter: `organization = "${org.id}"` })
				),
				`${label} reads ${collection}`
			);
		}
		await assert.rejects(
			pb.collection('courses').create({ organization: org.id, name: 'Nope', status: 'active' }),
			(err) => err.status === 400 || err.status === 403
		);
		await assert.rejects(
			pb.collection('event_groups').update(group.id, { name: 'Nope' }),
			(err) => err.status === 400 || err.status === 403 || err.status === 404
		);
		await assert.rejects(
			pb.collection('courses').delete(course.id),
			(err) => err.status === 400 || err.status === 403 || err.status === 404,
			`${label} delete denied`
		);
	}

	// Outsider (no membership) sees nothing.
	const outsider = await registerVerifiedUser(uniqueEmail('fout'), 'Outsider');
	assert.equal(
		(await outsider.collection('courses').getFullList({ filter: `organization = "${org.id}"` }))
			.length,
		0
	);
});

test('disable capabilities → writes blocked, reads preserved → re-enable restores', async () => {
	const { owner, org } = await orgWithCaps('ftoggle', 'F Toggle Org');
	const { event } = await competitionFixture(owner, org.id, 'T');
	const course = await owner
		.collection('courses')
		.create({ organization: org.id, name: 'Toggle DGC', status: 'active' });
	const round = await owner.collection('rounds').create({
		organization: org.id,
		event: event.id,
		number: 1,
		status: 'active'
	});

	await configure(owner, org.id, { capabilities: ['athletes', 'teams', 'leagues-seasons'] });

	await assert.rejects(
		owner.collection('courses').update(course.id, { status: 'archived' }),
		isCode('capability_disabled')
	);
	await assert.rejects(
		owner.collection('rounds').update(round.id, { status: 'archived' }),
		isCode('capability_disabled')
	);
	// Preserved records stay readable.
	assert.equal((await owner.collection('courses').getOne(course.id)).name, 'Toggle DGC');
	assert.equal((await owner.collection('rounds').getOne(round.id)).number, 1);

	await configure(owner, org.id, { capabilities: CAPS });
	const archived = await owner.collection('courses').update(course.id, { status: 'archived' });
	assert.equal(archived.status, 'archived');
});
