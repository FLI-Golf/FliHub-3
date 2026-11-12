/**
 * Phase 1H integration tests: official results and corrections (Dustin's
 * approved decisions, D16) — against a disposable PocketBase with ordinary
 * user credentials.
 *
 * Covers capability gating, Owner/Admin-only approval/publication/correction
 * (viewers and scorekeepers denied; approval/author metadata not forgeable),
 * completeness (missing or unsubmitted scorecards and course-less rounds
 * block approval), totals snapshots per version, the scorecard lock while a
 * result is approved/published, the reasoned correction flow producing
 * exactly one new version per reapproval, idempotent reprocessing (no
 * duplicate versions, re-approve/re-publish rejected, no unpublish), the
 * locked append-only version/audit collections, and organization scoping.
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

async function orgWithCaps(prefix, name) {
	const owner = await registerVerifiedUser(uniqueEmail(prefix), 'Owner');
	const org = await createOrgFull(owner, {
		name,
		template: 'custom',
		capabilities: CAPS
	});
	return { owner, org };
}

async function member(owner, orgId, prefix, role) {
	const email = uniqueEmail(prefix);
	const pb = await registerVerifiedUser(email, role);
	await acceptInvitation(pb, (await createInvitation(owner, orgId, email, role)).token);
	return pb;
}

/**
 * Results fixture: a two-hole course, one season with two teams (two
 * athletes + one athlete), one event with two course-backed rounds and two
 * staffed groups (group one's scorekeeper is `skId` when provided).
 */
async function resultsFixture(owner, orgId, label, skId) {
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
		const team = await pb.collection('teams').create({
			organization: orgId,
			name: `${label} ${name}`,
			status: 'active'
		});
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
		return { team, entry, athletes };
	};
	const teamOne = await mkTeam('T1', [
		['Ava', 'female'],
		['Ben', 'male']
	]);
	const teamTwo = await mkTeam('T2', [['Cal', 'male']]);
	const event = await pb.collection('events').create({
		organization: orgId,
		season: season.id,
		name: `${label} E1`,
		status: 'planned'
	});
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
	const mkGroup = async (name, teams, keeper) => {
		const group = await pb.collection('event_groups').create({
			organization: orgId,
			event: event.id,
			name,
			scorekeeper: keeper ?? null,
			status: 'active'
		});
		for (const t of teams) {
			await pb.collection('group_teams').create({
				organization: orgId,
				group: group.id,
				entry: t.entry.id,
				status: 'active'
			});
			for (const athlete of t.athletes) {
				await pb.collection('group_athletes').create({
					organization: orgId,
					group: group.id,
					entry: t.entry.id,
					athlete: athlete.id,
					status: 'active'
				});
			}
		}
		return group;
	};
	const groupOne = await mkGroup('Group 1', [teamOne], skId);
	const groupTwo = await mkGroup('Group 2', [teamTwo], null);
	return {
		course,
		holes,
		teamOne,
		teamTwo,
		event,
		roundOne,
		roundTwo,
		groupOne,
		groupTwo
	};
}

/** Fills every cell of one (round, group) scorecard and submits it. */
async function submitScorecard(pb, orgId, fixture, round, group, members, strokesFor) {
	const card = await pb
		.collection('scorecards')
		.create({ organization: orgId, round: round.id, group: group.id });
	for (const athlete of members) {
		for (const hole of fixture.holes) {
			await pb.collection('scores').create({
				organization: orgId,
				scorecard: card.id,
				athlete: athlete.id,
				hole: hole.id,
				strokes: strokesFor(athlete, hole)
			});
		}
	}
	await pb.collection('scorecards').update(card.id, { status: 'submitted' });
	return card;
}

async function submitAll(pb, orgId, fixture, strokes = () => 3) {
	const cards = [];
	for (const round of [fixture.roundOne, fixture.roundTwo]) {
		cards.push(
			await submitScorecard(
				pb,
				orgId,
				fixture,
				round,
				fixture.groupOne,
				fixture.teamOne.athletes,
				strokes
			)
		);
		cards.push(
			await submitScorecard(
				pb,
				orgId,
				fixture,
				round,
				fixture.groupTwo,
				fixture.teamTwo.athletes,
				strokes
			)
		);
	}
	return cards;
}

const isCode = (code) => (err) =>
	err.status === 400 && new RegExp(code, 'i').test(String(err.response?.message ?? err.message));
const isDenied = (err) => err.status === 400 || err.status === 403 || err.status === 404;

test('official results require the scoring-results capability (hook-gated)', async () => {
	const owner = await registerUser(uniqueEmail('cap1h'), 'Owner');
	const org = await createOrgFull(owner, {
		name: 'No Results Cap Org',
		template: 'custom',
		capabilities: ['athletes', 'teams', 'leagues-seasons', 'events', 'venues-courses']
	});
	const fixture = await resultsFixture(owner, org.id, 'HCap', null);
	await assert.rejects(
		owner.collection('event_results').create({ organization: org.id, event: fixture.event.id }),
		isCode('capability_disabled'),
		'approval requires the scoring-results capability'
	);
});

test('D16 authority: Owner/Admin approve; viewers/scorekeepers denied; metadata not forgeable', async () => {
	const { owner, org } = await orgWithCaps('auth1h', 'Results Authority Org');
	const admin = await member(owner, org.id, 'auth1hadm', 'admin');
	const sk = await member(owner, org.id, 'auth1hsk', 'scorekeeper');
	const viewer = await member(owner, org.id, 'auth1hview', 'viewer');
	const fixture = await resultsFixture(owner, org.id, 'HAuth', sk.authStore.record.id);
	await submitAll(owner, org.id, fixture);

	for (const [who, pb] of [
		['viewer', viewer],
		['scorekeeper', sk]
	]) {
		await assert.rejects(
			pb.collection('event_results').create({ organization: org.id, event: fixture.event.id }),
			isDenied,
			`${who} cannot approve`
		);
	}
	// Client-sent lifecycle metadata is overwritten by the hook.
	const result = await admin.collection('event_results').create({
		organization: org.id,
		event: fixture.event.id,
		status: 'published',
		currentVersion: 7,
		publishedVersion: 9,
		pendingReason: 'forged'
	});
	assert.equal(result.status, 'approved');
	assert.equal(result.currentVersion, 1);
	assert.equal(result.publishedVersion, 0, 'nothing is official before publication');
	assert.equal(result.pendingReason, '');
	const versions = await admin
		.collection('result_versions')
		.getFullList({ filter: `result = "${result.id}"` });
	assert.equal(versions.length, 1);
	assert.equal(versions[0].approvedBy, admin.authStore.record.id);
	assert.ok(versions[0].approvedAt, 'approval is timestamped');
	// Versions and the audit log reject direct writes — metadata is hook-only.
	await assert.rejects(
		owner.collection('result_versions').create({
			organization: org.id,
			event: fixture.event.id,
			result: result.id,
			version: 2,
			totals: {},
			approvedBy: owner.authStore.record.id
		}),
		isDenied,
		'result_versions is locked'
	);
	await assert.rejects(
		owner.collection('result_versions').update(versions[0].id, { version: 9 }),
		isDenied,
		'result versions cannot be edited'
	);
	await assert.rejects(
		owner.collection('result_changes').create({
			organization: org.id,
			event: fixture.event.id,
			result: result.id,
			action: 'approved',
			version: 1,
			author: owner.authStore.record.id
		}),
		isDenied,
		'result_changes is locked'
	);
	// Viewers and scorekeepers cannot publish or reopen either.
	await assert.rejects(
		viewer.collection('event_results').update(result.id, { status: 'published' }),
		isDenied,
		'viewer cannot publish'
	);
	await assert.rejects(
		sk.collection('event_results').update(result.id, { status: 'correcting', reason: 'nope' }),
		isDenied,
		'scorekeeper cannot reopen a result'
	);
});

test('D16 completeness: unsubmitted scorecards and course-less rounds block approval', async () => {
	const { owner, org } = await orgWithCaps('comp1h', 'Results Completeness Org');
	const fixture = await resultsFixture(owner, org.id, 'HComp', null);
	// Nothing submitted: 4 of 4 blocked.
	await assert.rejects(
		owner.collection('event_results').create({ organization: org.id, event: fixture.event.id }),
		(err) =>
			isCode('approval_blocked')(err) &&
			/4 of 4/.test(String(err.response?.message ?? err.message)),
		'approval is blocked while scorecards are missing'
	);
	// Partially submitted: still blocked.
	await submitScorecard(
		owner,
		org.id,
		fixture,
		fixture.roundOne,
		fixture.groupOne,
		fixture.teamOne.athletes,
		() => 3
	);
	await assert.rejects(
		owner.collection('event_results').create({ organization: org.id, event: fixture.event.id }),
		(err) =>
			isCode('approval_blocked')(err) &&
			/3 of 4/.test(String(err.response?.message ?? err.message)),
		'approval is blocked while any scorecard is unsubmitted'
	);
	// A course-less active round blocks approval outright.
	const bare = await owner.collection('rounds').create({
		organization: org.id,
		event: fixture.event.id,
		number: 3,
		status: 'active'
	});
	await assert.rejects(
		owner.collection('event_results').create({ organization: org.id, event: fixture.event.id }),
		(err) =>
			isCode('approval_blocked')(err) &&
			/no course/.test(String(err.response?.message ?? err.message)),
		'a course-less active round blocks approval'
	);
	await owner.collection('rounds').update(bare.id, { status: 'archived' });
});

test('D16 lifecycle: approve snapshots totals; publish stamps; correction creates exactly one new version; no unpublish', async () => {
	const { owner, org } = await orgWithCaps('life1h', 'Results Lifecycle Org');
	const admin = await member(owner, org.id, 'life1hadm', 'admin');
	const fixture = await resultsFixture(owner, org.id, 'HLife', null);
	// Distinct strokes so the snapshot is checkable: hole number + 2.
	await submitAll(owner, org.id, fixture, (_athlete, hole) => Number(hole.number) + 2);

	// Approve: version 1 snapshot.
	const result = await admin
		.collection('event_results')
		.create({ organization: org.id, event: fixture.event.id });
	assert.equal(result.status, 'approved');
	assert.equal(result.currentVersion, 1);
	assert.equal(result.publishedVersion, 0, 'approved v1 is not official until published');
	const v1 = await admin
		.collection('result_versions')
		.getFirstListItem(`result = "${result.id}" && version = 1`);
	// Each athlete: holes 1+2 → 3+4=7 per round, 14 total; team one has two athletes.
	const teamOneRow = v1.totals.teams.find((t) => t.entry === fixture.teamOne.entry.id);
	const teamTwoRow = v1.totals.teams.find((t) => t.entry === fixture.teamTwo.entry.id);
	assert.equal(teamOneRow.total, 28, 'team one snapshot total');
	assert.equal(teamTwoRow.total, 14, 'team two snapshot total');
	assert.equal(v1.totals.rounds.length, 2);
	assert.equal(v1.totals.athletes.length, 3);
	assert.equal(v1.totals.schemaVersion, 2);
	assert.equal(v1.totals.scoringConvention, 'strokes-minus-par');
	for (const round of v1.totals.rounds) {
		assert.equal(round.par, 6);
		assert.equal(round.holeCount, 2);
		assert.equal(round.holes.length, 2);
	}
	for (const athlete of v1.totals.athletes) {
		assert.equal(athlete.par, 12);
		assert.equal(athlete.scoreToPar, 2);
		assert.equal(athlete.complete, true);
		assert.equal(athlete.roundPars[fixture.roundOne.id], 6);
		assert.equal(athlete.roundScores[fixture.roundOne.id][fixture.holes[0].id], 3);
	}
	// Duplicate approval attempts create nothing (unique event + guarded update).
	await assert.rejects(
		admin.collection('event_results').create({ organization: org.id, event: fixture.event.id }),
		isDenied,
		'one official result per event'
	);
	await assert.rejects(
		admin.collection('event_results').update(result.id, { status: 'approved' }),
		isCode('invalid_transition'),
		're-approving an approved result is rejected'
	);

	// Scorecards are locked while the result exists (approved).
	const cards = await admin
		.collection('scorecards')
		.getFullList({ filter: `event = "${fixture.event.id}"` });
	await assert.rejects(
		admin
			.collection('scorecards')
			.update(cards[0].id, { status: 'draft', reason: 'tweak after approval' }),
		isCode('result_locked'),
		'scorecard reopen is blocked while the result is approved'
	);

	// Publish stamps the current version; republish and unpublish are rejected.
	const published = await admin
		.collection('event_results')
		.update(result.id, { status: 'published' });
	assert.equal(published.status, 'published');
	assert.equal(published.publishedVersion, 1, 'publication makes v1 the official version');
	const v1Published = await admin.collection('result_versions').getOne(v1.id);
	assert.equal(v1Published.publishedBy, admin.authStore.record.id);
	assert.ok(v1Published.publishedAt, 'publication is timestamped');
	await assert.rejects(
		admin.collection('event_results').update(result.id, { status: 'published' }),
		isCode('invalid_transition'),
		'republishing the same state is rejected (idempotent)'
	);
	await assert.rejects(
		admin.collection('event_results').update(result.id, { status: 'approved' }),
		isCode('invalid_transition'),
		'published results cannot be unpublished'
	);

	// Reopen requires a reason; the reason is recorded.
	await assert.rejects(
		admin.collection('event_results').update(result.id, { status: 'correcting' }),
		isCode('reason_required'),
		'result reopen requires a reason'
	);
	const correcting = await admin.collection('event_results').update(result.id, {
		status: 'correcting',
		reason: 'Hole 1 recorded for the wrong athlete'
	});
	assert.equal(correcting.status, 'correcting');
	assert.equal(correcting.pendingReason, 'Hole 1 recorded for the wrong athlete');
	assert.equal(correcting.publishedVersion, 1, 'v1 stays the official version during correction');

	// Correction: reopen the scorecard (1G reasoned flow), fix one score, resubmit.
	const cardOneRoundOne = cards.find(
		(c) => c.round === fixture.roundOne.id && c.group === fixture.groupOne.id
	);
	await admin.collection('scorecards').update(cardOneRoundOne.id, {
		status: 'draft',
		reason: 'Correcting hole 1'
	});
	const score = await admin
		.collection('scores')
		.getFirstListItem(
			`scorecard = "${cardOneRoundOne.id}" && athlete = "${fixture.teamOne.athletes[0].id}" && hole = "${fixture.holes[0].id}"`
		);
	await admin.collection('scores').update(score.id, { strokes: 5 }); // was 3
	await admin.collection('scorecards').update(cardOneRoundOne.id, { status: 'submitted' });

	// Reapprove: exactly one new version carrying the reopen reason.
	const reapproved = await admin
		.collection('event_results')
		.update(result.id, { status: 'approved' });
	assert.equal(reapproved.status, 'approved');
	assert.equal(reapproved.currentVersion, 2);
	assert.equal(
		reapproved.publishedVersion,
		1,
		'approved v2 is NOT official until published — v1 remains the official version'
	);
	assert.equal(reapproved.pendingReason, '');
	const versions = await admin
		.collection('result_versions')
		.getFullList({ filter: `result = "${result.id}"`, sort: 'version' });
	assert.equal(versions.length, 2, 'exactly one new version per reapproval');
	const v2 = versions[1];
	assert.equal(v2.reason, 'Hole 1 recorded for the wrong athlete');
	assert.equal(v2.approvedBy, admin.authStore.record.id);
	const v2TeamOne = v2.totals.teams.find((t) => t.entry === fixture.teamOne.entry.id);
	assert.equal(v2TeamOne.total, 30, 'corrected standings input changed exactly once (+2)');
	const changedAthlete = v2.totals.athletes.find(
		(a) => a.athlete === fixture.teamOne.athletes[0].id
	);
	assert.equal(changedAthlete.total, 16);
	assert.equal(changedAthlete.par, 12);
	assert.equal(changedAthlete.scoreToPar, 4);
	assert.equal(changedAthlete.roundScores[fixture.roundOne.id][fixture.holes[0].id], 5);
	// The previous version is untouched: original totals and publication stamps.
	const v1After = versions[0];
	assert.equal(
		v1After.totals.teams.find((t) => t.entry === fixture.teamOne.entry.id).total,
		28,
		'previous version keeps its original values'
	);
	assert.ok(v1After.publishedAt, 'previous publication stamp preserved');

	// Republish the corrected version; the audit log holds the full story.
	const republished = await admin
		.collection('event_results')
		.update(result.id, { status: 'published' });
	assert.equal(republished.publishedVersion, 2, 'republication makes v2 the official version');
	const v2Published = await admin.collection('result_versions').getOne(v2.id);
	assert.ok(v2Published.publishedAt, 'corrected version published');
	const log = await admin
		.collection('result_changes')
		.getFullList({ filter: `result = "${result.id}"`, sort: 'created' });
	const story = log.map((l) => `${l.action} v${l.version}`);
	assert.deepEqual(story, [
		'approved v1',
		'published v1',
		'reopened v1',
		'approved v2',
		'published v2'
	]);
	const reopenRow = log.find((l) => l.action === 'reopened');
	assert.equal(reopenRow.reason, 'Hole 1 recorded for the wrong athlete');
	assert.equal(reopenRow.author, admin.authStore.record.id);

	// With the result published again, no new scorecard can appear either.
	const lateGroup = await admin.collection('event_groups').create({
		organization: org.id,
		event: fixture.event.id,
		name: 'Group 3',
		status: 'active'
	});
	await assert.rejects(
		admin.collection('scorecards').create({
			organization: org.id,
			round: fixture.roundOne.id,
			group: lateGroup.id
		}),
		isCode('result_locked'),
		'new scorecards are blocked while the result is published'
	);
});

test('organization scoping: outsiders see and touch nothing', async () => {
	const { owner, org } = await orgWithCaps('scope1h', 'Results Scope Org');
	const fixture = await resultsFixture(owner, org.id, 'HScope', null);
	await submitAll(owner, org.id, fixture);
	const result = await owner
		.collection('event_results')
		.create({ organization: org.id, event: fixture.event.id });

	const outsider = await registerVerifiedUser(uniqueEmail('out1h'), 'Outsider');
	const visible = await outsider.collection('event_results').getFullList();
	assert.equal(visible.length, 0, 'outsider lists no results');
	await assert.rejects(
		outsider.collection('event_results').update(result.id, { status: 'published' }),
		isDenied,
		'outsider cannot publish'
	);
	await assert.rejects(
		outsider.collection('event_results').create({ organization: org.id, event: fixture.event.id }),
		isDenied,
		'outsider cannot approve'
	);
	const versions = await outsider.collection('result_versions').getFullList();
	assert.equal(versions.length, 0, 'outsider lists no versions');
	// Cross-organization reference is rejected for members of another org.
	const { owner: ownerB, org: orgB } = await orgWithCaps('scope1hB', 'Results Scope Org B');
	await assert.rejects(
		ownerB.collection('event_results').create({ organization: orgB.id, event: fixture.event.id }),
		isDenied,
		'cross-organization event reference rejected'
	);
});
