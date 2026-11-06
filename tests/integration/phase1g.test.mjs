/**
 * Phase 1G integration tests: mobile scorekeeping — scorecards, per-athlete
 * per-hole scores, and the append-only change log (Dustin's approved
 * decisions, D15) — against a disposable PocketBase with ordinary user
 * credentials.
 *
 * Covers the full permission matrix (Owner/Admin; Scorekeeper role WITH an
 * active group assignment granting event-wide cross-group entry; the same
 * scorekeeper denied in another event; an unassigned scorekeeper denied; a
 * Viewer denied even when listed as a group's scorekeeper; access following
 * reassignment), capability gating, server-side derivation (event/round/
 * group/entry/enteredBy never client-trusted), physical-hole score keys with
 * per-round separation, missing-is-never-zero submission validation, the
 * Draft → Submitted lifecycle with Owner/Admin-only reopen preserving values
 * and authorship, and the locked append-only history log.
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

const CAPS = [
	'athletes',
	'teams',
	'leagues-seasons',
	'events',
	'venues-courses',
	'scoring-results'
];

async function createOrgFull(pb, body) {
	return pb.send('/api/flihub/organizations', { method: 'POST', body });
}

async function configure(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/configure`, { method: 'POST', body });
}

async function orgWithCaps(prefix, name) {
	const owner = await registerVerifiedUser(uniqueEmail(prefix), 'Owner');
	const org = await createOrgFull(owner, { name, template: 'custom', capabilities: CAPS });
	return { owner, org };
}

async function member(owner, orgId, prefix, role) {
	const email = uniqueEmail(prefix);
	const pb = await registerVerifiedUser(email, role);
	await acceptInvitation(pb, (await createInvitation(owner, orgId, email, role)).token);
	return pb;
}

/**
 * Full scoring fixture: a two-hole course (red positions), a season with two
 * teams (two athletes and one athlete on their rosters), one event with two
 * rounds on the course plus a course-less round, two groups (group one's
 * scorekeeper is `sk`, group two's is `viewerAsKeeper` when provided), and a
 * second event with its own group and round.
 */
async function scoringFixture(owner, orgId, label, skId, viewerId) {
	const pb = owner;
	const league = await pb
		.collection('leagues')
		.create({ organization: orgId, name: `${label} League`, status: 'active' });
	const season = await pb.collection('seasons').create({
		organization: orgId,
		league: league.id,
		name: `${label} Season`,
		status: 'active'
	});
	const course = await pb
		.collection('courses')
		.create({ organization: orgId, name: `${label} Course`, status: 'active' });
	const holes = [];
	for (let i = 1; i <= 2; i++) {
		const hole = await pb.collection('course_holes').create({
			organization: orgId,
			course: course.id,
			number: i,
			name: `Hole ${i}`,
			par: 3,
			status: 'active'
		});
		await pb.collection('hole_positions').create({
			organization: orgId,
			hole: hole.id,
			label: 'red',
			distance: 250 + i,
			unit: 'feet',
			status: 'active'
		});
		holes.push(hole);
	}
	const mkTeam = async (name, athleteSpecs) => {
		const team = await pb
			.collection('teams')
			.create({ organization: orgId, name: `${label} ${name}`, status: 'active' });
		const entry = await pb.collection('season_entries').create({
			organization: orgId,
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const athletes = [];
		for (const [firstName, gender] of athleteSpecs) {
			const athlete = await pb.collection('athletes').create({
				organization: orgId,
				firstName,
				lastName: `${label}${name}`,
				gender,
				status: 'active'
			});
			await pb.collection('roster_memberships').create({
				organization: orgId,
				entry: entry.id,
				athlete: athlete.id,
				status: 'active'
			});
			athletes.push(athlete);
		}
		return { entry, athletes };
	};
	const teamOne = await mkTeam('T1', [
		['Ava', 'female'],
		['Ben', 'male']
	]);
	const teamTwo = await mkTeam('T2', [['Cal', 'male']]);
	const event = await pb
		.collection('events')
		.create({ organization: orgId, season: season.id, name: `${label} E1`, status: 'planned' });
	const otherEvent = await pb
		.collection('events')
		.create({ organization: orgId, season: season.id, name: `${label} E2`, status: 'planned' });
	const roundOne = await pb.collection('rounds').create({
		organization: orgId,
		event: event.id,
		number: 1,
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});
	const roundTwo = await pb.collection('rounds').create({
		organization: orgId,
		event: event.id,
		number: 2,
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});
	const roundNoCourse = await pb
		.collection('rounds')
		.create({ organization: orgId, event: event.id, number: 3, status: 'active' });
	const groupOne = await pb.collection('event_groups').create({
		organization: orgId,
		event: event.id,
		name: 'Group 1',
		scorekeeper: skId ?? null,
		status: 'active'
	});
	const groupTwo = await pb.collection('event_groups').create({
		organization: orgId,
		event: event.id,
		name: 'Group 2',
		scorekeeper: viewerId ?? null,
		status: 'active'
	});
	const otherGroup = await pb.collection('event_groups').create({
		organization: orgId,
		event: otherEvent.id,
		name: 'Group 1',
		status: 'active'
	});
	const otherRound = await pb.collection('rounds').create({
		organization: orgId,
		event: otherEvent.id,
		number: 1,
		course: course.id,
		status: 'active'
	});
	await pb.collection('group_teams').create({
		organization: orgId,
		group: groupOne.id,
		entry: teamOne.entry.id,
		status: 'active'
	});
	for (const athlete of teamOne.athletes) {
		await pb.collection('group_athletes').create({
			organization: orgId,
			group: groupOne.id,
			entry: teamOne.entry.id,
			athlete: athlete.id,
			status: 'active'
		});
	}
	await pb.collection('group_teams').create({
		organization: orgId,
		group: groupTwo.id,
		entry: teamTwo.entry.id,
		status: 'active'
	});
	await pb.collection('group_athletes').create({
		organization: orgId,
		group: groupTwo.id,
		entry: teamTwo.entry.id,
		athlete: teamTwo.athletes[0].id,
		status: 'active'
	});
	return {
		course,
		holes,
		teamOne,
		teamTwo,
		event,
		otherEvent,
		roundOne,
		roundTwo,
		roundNoCourse,
		groupOne,
		groupTwo,
		otherGroup,
		otherRound
	};
}

const isCode = (code) => (err) =>
	err.status === 400 && new RegExp(code, 'i').test(String(err.response?.message ?? err.message));
const isDenied = (err) => err.status === 400 || err.status === 403 || err.status === 404;

test('scoring writes require the scoring-results capability (hook-gated)', async () => {
	const owner = await registerUser(uniqueEmail('cap1g'), 'Owner');
	const org = await createOrgFull(owner, {
		name: 'No Scoring Cap Org',
		template: 'custom',
		capabilities: ['athletes', 'teams', 'leagues-seasons', 'events', 'venues-courses']
	});
	const fixture = await scoringFixture(owner, org.id, 'Cap', null, null);
	await assert.rejects(
		owner.collection('scorecards').create({
			organization: org.id,
			round: fixture.roundOne.id,
			group: fixture.groupOne.id
		}),
		isCode('capability_disabled')
	);
	await configure(owner, org.id, { capabilities: CAPS });
	const card = await owner.collection('scorecards').create({
		organization: org.id,
		round: fixture.roundOne.id,
		group: fixture.groupOne.id
	});
	assert.ok(card.id);
});

test('D15 permission matrix: role + event assignment, cross-group, reassignment', async () => {
	const { owner, org } = await orgWithCaps('mtx', 'Matrix Org');
	const sk = await member(owner, org.id, 'mtxsk', 'scorekeeper');
	const skUnassigned = await member(owner, org.id, 'mtxsk2', 'scorekeeper');
	const viewer = await member(owner, org.id, 'mtxvw', 'viewer');
	const fixture = await scoringFixture(
		owner,
		org.id,
		'M',
		sk.authStore.record.id,
		viewer.authStore.record.id
	);

	// Scorekeeper role + assignment: creates a scorecard; event derived and
	// status forced to draft even when the client spoofs them.
	const cardOne = await sk.collection('scorecards').create({
		organization: org.id,
		round: fixture.roundOne.id,
		group: fixture.groupOne.id,
		event: 'xxxxxxxxxxxxxxx',
		status: 'submitted'
	});
	assert.equal(cardOne.event, fixture.event.id);
	assert.equal(cardOne.status, 'draft');

	// Cross-group entry WITHIN the assigned event (sk is not group two's
	// scorekeeper, the Viewer is).
	const cardTwo = await sk.collection('scorecards').create({
		organization: org.id,
		round: fixture.roundOne.id,
		group: fixture.groupTwo.id
	});
	const crossScore = await sk.collection('scores').create({
		organization: org.id,
		scorecard: cardTwo.id,
		athlete: fixture.teamTwo.athletes[0].id,
		hole: fixture.holes[0].id,
		strokes: 3
	});
	assert.ok(crossScore.id, 'cross-group score entry within the assigned event');

	// The SAME scorekeeper is denied in another event of the same org.
	await assert.rejects(
		sk.collection('scorecards').create({
			organization: org.id,
			round: fixture.otherRound.id,
			group: fixture.otherGroup.id
		}),
		isDenied
	);

	// A scorekeeper-role member with NO assignment anywhere is denied.
	await assert.rejects(
		skUnassigned.collection('scorecards').create({
			organization: org.id,
			round: fixture.roundTwo.id,
			group: fixture.groupOne.id
		}),
		isDenied
	);

	// A Viewer is read-only even though group two lists them as scorekeeper.
	await assert.rejects(
		viewer.collection('scores').create({
			organization: org.id,
			scorecard: cardTwo.id,
			athlete: fixture.teamTwo.athletes[0].id,
			hole: fixture.holes[1].id,
			strokes: 3
		}),
		isDenied
	);
	assert.ok(
		Array.isArray(
			await viewer.collection('scores').getFullList({ filter: `organization = "${org.id}"` })
		),
		'viewer still reads scores'
	);

	// Reassignment takes effect immediately: owner moves both groups'
	// scorekeeper to the previously unassigned member.
	await owner
		.collection('event_groups')
		.update(fixture.groupOne.id, { scorekeeper: skUnassigned.authStore.record.id });
	await owner
		.collection('event_groups')
		.update(fixture.groupTwo.id, { scorekeeper: skUnassigned.authStore.record.id });
	await assert.rejects(
		sk.collection('scores').update(crossScore.id, { strokes: 4 }),
		isDenied,
		'former scorekeeper denied after reassignment'
	);
	const taken = await skUnassigned.collection('scores').update(crossScore.id, { strokes: 4 });
	assert.equal(taken.enteredBy, skUnassigned.authStore.record.id);
});

test('D15 scores: derivation, physical-hole keys, per-round separation, bounds', async () => {
	const { owner, org } = await orgWithCaps('keys', 'Keys Org');
	const fixture = await scoringFixture(owner, org.id, 'K', null, null);
	const card = await owner.collection('scorecards').create({
		organization: org.id,
		round: fixture.roundOne.id,
		group: fixture.groupOne.id
	});

	// enteredBy and entry are derived; spoofed values ignored.
	const score = await owner.collection('scores').create({
		organization: org.id,
		scorecard: card.id,
		athlete: fixture.teamOne.athletes[0].id,
		hole: fixture.holes[0].id,
		strokes: 3,
		enteredBy: 'spoofedidspoofed',
		entry: 'xxxxxxxxxxxxxxx',
		event: 'xxxxxxxxxxxxxxx'
	});
	assert.equal(score.enteredBy, owner.authStore.record.id);
	assert.equal(score.entry, fixture.teamOne.entry.id);
	assert.equal(score.event, fixture.event.id);
	assert.equal(score.round, fixture.roundOne.id);

	// Athletes outside the group and holes outside the round's course rejected.
	await assert.rejects(
		owner.collection('scores').create({
			organization: org.id,
			scorecard: card.id,
			athlete: fixture.teamTwo.athletes[0].id,
			hole: fixture.holes[0].id,
			strokes: 3
		}),
		isCode('athlete_not_in_group')
	);
	const foreignCourse = await owner
		.collection('courses')
		.create({ organization: org.id, name: 'K Other', status: 'active' });
	const foreignHole = await owner.collection('course_holes').create({
		organization: org.id,
		course: foreignCourse.id,
		number: 1,
		name: 'FH',
		par: 3,
		status: 'active'
	});
	await assert.rejects(
		owner.collection('scores').create({
			organization: org.id,
			scorecard: card.id,
			athlete: fixture.teamOne.athletes[0].id,
			hole: foreignHole.id,
			strokes: 3
		}),
		isCode('hole_not_in_round')
	);

	// Positive integers only — zero (and thus "missing as zero") is invalid.
	await assert.rejects(
		owner.collection('scores').create({
			organization: org.id,
			scorecard: card.id,
			athlete: fixture.teamOne.athletes[1].id,
			hole: fixture.holes[0].id,
			strokes: 0
		}),
		(err) => err.status === 400
	);

	// One score per (round, athlete, PHYSICAL hole)…
	await assert.rejects(
		owner.collection('scores').create({
			organization: org.id,
			scorecard: card.id,
			athlete: fixture.teamOne.athletes[0].id,
			hole: fixture.holes[0].id,
			strokes: 4
		}),
		(err) => err.status === 400
	);
	// …while the second round scores the same physical hole separately — the
	// FLI demo may DISPLAY it as hole 10+, but storage stays (round, hole 1–9).
	const cardRoundTwo = await owner.collection('scorecards').create({
		organization: org.id,
		round: fixture.roundTwo.id,
		group: fixture.groupOne.id
	});
	const secondPass = await owner.collection('scores').create({
		organization: org.id,
		scorecard: cardRoundTwo.id,
		athlete: fixture.teamOne.athletes[0].id,
		hole: fixture.holes[0].id,
		strokes: 5
	});
	assert.equal(secondPass.round, fixture.roundTwo.id);
	assert.equal(secondPass.hole, fixture.holes[0].id);

	// Scores cannot be rewired.
	await assert.rejects(
		owner.collection('scores').update(score.id, { hole: fixture.holes[1].id }),
		isCode('immutable_relation')
	);

	// A round without a course cannot be scored.
	await assert.rejects(
		owner.collection('scorecards').create({
			organization: org.id,
			round: fixture.roundNoCourse.id,
			group: fixture.groupOne.id
		}),
		isCode('round_without_course')
	);
});

test('D15 lifecycle: missing-never-zero submission, lock, reopen preserves values and authorship', async () => {
	const { owner, org } = await orgWithCaps('life', 'Lifecycle Org');
	const sk = await member(owner, org.id, 'lifesk', 'scorekeeper');
	const fixture = await scoringFixture(owner, org.id, 'L', sk.authStore.record.id, null);
	const card = await sk.collection('scorecards').create({
		organization: org.id,
		round: fixture.roundOne.id,
		group: fixture.groupOne.id
	});
	const [ava, ben] = fixture.teamOne.athletes;
	const [holeOne, holeTwo] = fixture.holes;

	const first = await sk.collection('scores').create({
		organization: org.id,
		scorecard: card.id,
		athlete: ava.id,
		hole: holeOne.id,
		strokes: 3
	});

	// Scoring has started (the group has a scorecard): the athlete lineup is
	// fixed through the direct API — no additions, no archiving, no restores.
	await assert.rejects(
		owner.collection('group_athletes').create({
			organization: org.id,
			group: fixture.groupOne.id,
			entry: fixture.teamOne.entry.id,
			athlete: ava.id
		}),
		isCode('lineup_locked'),
		'lineup additions blocked once scoring starts'
	);
	const avaAssignment = await owner
		.collection('group_athletes')
		.getFirstListItem(`group = "${fixture.groupOne.id}" && athlete = "${ava.id}"`);
	await assert.rejects(
		owner.collection('group_athletes').update(avaAssignment.id, { status: 'archived' }),
		isCode('lineup_locked'),
		'lineup archiving blocked once scoring starts'
	);
	// Scorekeeper reassignment is NOT lineup — it keeps working while locked.
	const reassigned = await owner
		.collection('event_groups')
		.update(fixture.groupOne.id, { scorekeeper: owner.authStore.record.id });
	assert.equal(reassigned.scorekeeper, owner.authStore.record.id);
	await owner
		.collection('event_groups')
		.update(fixture.groupOne.id, { scorekeeper: sk.authStore.record.id });

	// Submission is rejected while cells are missing — missing is never zero.
	await assert.rejects(
		sk.collection('scorecards').update(card.id, { status: 'submitted' }),
		(err) =>
			isCode('missing_scores')(err) && /3 of 4/.test(String(err.response?.message ?? err.message))
	);

	for (const [athlete, hole, strokes] of [
		[ava, holeTwo, 4],
		[ben, holeOne, 2],
		[ben, holeTwo, 3]
	]) {
		await sk.collection('scores').create({
			organization: org.id,
			scorecard: card.id,
			athlete: athlete.id,
			hole: hole.id,
			strokes
		});
	}
	const submitted = await sk.collection('scorecards').update(card.id, { status: 'submitted' });
	assert.equal(submitted.status, 'submitted');
	assert.equal(submitted.submittedBy, sk.authStore.record.id);
	assert.ok(submitted.submittedAt);

	// Submitted is locked for everyone — no silent overwrite.
	await assert.rejects(sk.collection('scores').update(first.id, { strokes: 6 }), isDenied);
	await assert.rejects(owner.collection('scores').update(first.id, { strokes: 6 }), isDenied);
	await assert.rejects(
		sk.collection('scorecards').update(card.id, { status: 'draft' }),
		isDenied,
		'scorekeeper cannot reopen'
	);

	// Owner reopen requires a reason; the reason lands in the change history.
	await assert.rejects(
		owner.collection('scorecards').update(card.id, { status: 'draft' }),
		isCode('reason_required'),
		'reopening without a reason is rejected'
	);
	const reopened = await owner
		.collection('scorecards')
		.update(card.id, { status: 'draft', reason: 'Hole 1 was entered for the wrong athlete' });
	assert.equal(reopened.status, 'draft');
	assert.equal(reopened.submittedBy, '');
	const preserved = await owner.collection('scores').getOne(first.id);
	assert.equal(preserved.strokes, 3);
	assert.equal(preserved.enteredBy, sk.authStore.record.id);

	// The scorekeeper edits after reopen; the change log carries the history.
	const edited = await sk.collection('scores').update(first.id, { strokes: 4 });
	assert.equal(edited.enteredBy, sk.authStore.record.id);
	const log = await owner
		.collection('score_changes')
		.getFullList({ filter: `scorecard = "${card.id}"`, sort: 'created' });
	const actions = log.map((l) => String(l.action));
	for (const expected of ['entered', 'submitted', 'reopened', 'updated']) {
		assert.ok(actions.includes(expected), `log includes ${expected}`);
	}
	const reopenRow = log.find((l) => String(l.action) === 'reopened');
	assert.equal(reopenRow.reason, 'Hole 1 was entered for the wrong athlete');
	assert.equal(reopenRow.author, owner.authStore.record.id);
	const updated = log.find((l) => String(l.action) === 'updated');
	assert.equal(updated.prevStrokes, 3);
	assert.equal(updated.newStrokes, 4);
	assert.equal(updated.author, sk.authStore.record.id);

	// The log is append-only and hook-written: direct writes are locked.
	await assert.rejects(
		owner.collection('score_changes').create({
			organization: org.id,
			event: fixture.event.id,
			scorecard: card.id,
			action: 'entered',
			author: owner.authStore.record.id
		}),
		(err) => err.status === 400 || err.status === 403
	);
});

test('organization scoping and outsiders', async () => {
	const { owner: ownerA, org: orgA } = await orgWithCaps('scoA', 'Score Org A');
	const fixtureA = await scoringFixture(ownerA, orgA.id, 'A', null, null);
	const cardA = await ownerA.collection('scorecards').create({
		organization: orgA.id,
		round: fixtureA.roundOne.id,
		group: fixtureA.groupOne.id
	});
	await ownerA.collection('scores').create({
		organization: orgA.id,
		scorecard: cardA.id,
		athlete: fixtureA.teamOne.athletes[0].id,
		hole: fixtureA.holes[0].id,
		strokes: 3
	});

	const { owner: ownerB, org: orgB } = await orgWithCaps('scoB', 'Score Org B');
	const fixtureB = await scoringFixture(ownerB, orgB.id, 'B', null, null);

	for (const collection of ['scorecards', 'scores', 'score_changes']) {
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
	// Cross-org relation targets rejected.
	await assert.rejects(
		ownerB.collection('scorecards').create({
			organization: orgB.id,
			round: fixtureA.roundOne.id,
			group: fixtureA.groupOne.id
		}),
		isDenied
	);
	await assert.rejects(
		ownerA.collection('scorecards').create({
			organization: orgA.id,
			round: fixtureB.roundOne.id,
			group: fixtureA.groupTwo.id
		}),
		isDenied
	);

	// Outsider (no membership) sees nothing and writes nothing.
	const outsider = await registerVerifiedUser(uniqueEmail('scout'), 'Outsider');
	assert.equal(
		(await outsider.collection('scores').getFullList({ filter: `organization = "${orgA.id}"` }))
			.length,
		0
	);
	await assert.rejects(
		outsider.collection('scores').create({
			organization: orgA.id,
			scorecard: cardA.id,
			athlete: fixtureA.teamOne.athletes[1].id,
			hole: fixtureA.holes[0].id,
			strokes: 3
		}),
		isDenied
	);
});
