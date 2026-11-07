/**
 * Phase 1I integration tests: organization publishing and public competition
 * standings — against a disposable PocketBase with ordinary user credentials
 * plus raw unauthenticated fetches for the public surface.
 *
 * Covers the trusted public-page management endpoint (Owner/Admin only, slug
 * validation/reservation/uniqueness, publish requires a slug, locked direct
 * writes), the unauthenticated public payload (hidden-404 behavior, exact
 * field whitelists, per-record publication, no private athlete data, no
 * correction reasons), the D16 standings lifecycle (published v1 counts
 * once; a pending corrected version changes nothing; republication replaces
 * the contribution exactly once), the D17 completeness ranking (incomplete
 * participation is Unranked with its strokes until its missing result is
 * published, then shares a rank on equal totals), aggregation across events
 * and competition boundaries (season sums, cross-season separation,
 * cross-organization isolation, member-vs-public eligibility), and
 * preview/member-standings access control.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
	acceptInvitation,
	createInvitation,
	PB_URL,
	registerVerifiedUser,
	uniqueEmail
} from './helpers.mjs';

const CAPS = [
	'athletes',
	'teams',
	'leagues-seasons',
	'events',
	'venues-courses',
	'scoring-results',
	'standings'
];

let slugCounter = 0;
function uniqueSlug(prefix) {
	slugCounter += 1;
	return `${prefix}-${Date.now().toString(36)}-${slugCounter}`;
}

async function orgWithCaps(prefix, name) {
	const owner = await registerVerifiedUser(uniqueEmail(prefix), 'Owner');
	const org = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: { name, template: 'custom', capabilities: CAPS }
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
 * Base competition fixture: one league + season, a two-hole par-3 course,
 * and two teams (two athletes + one athlete). Events are added separately so
 * aggregation across events and seasons is testable.
 */
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
		return { team, entry, athletes };
	};
	const teamOne = await mkTeam('T1', [
		['Ava', 'female'],
		['Ben', 'male']
	]);
	const teamTwo = await mkTeam('T2', [['Cal', 'male']]);
	return { league, season, course, holes, teamOne, teamTwo };
}

/** Adds one event (two course-backed rounds, two staffed groups) to the fixture. */
async function addEvent(pb, orgId, base, name, { seasonId, teams, startsAt = '' } = {}) {
	const [teamOne, teamTwo] = teams ?? [base.teamOne, base.teamTwo];
	const event = await pb.collection('events').create({
		organization: orgId,
		season: seasonId ?? base.season.id,
		name,
		status: 'planned',
		startsAt
	});
	const rounds = [];
	for (let number = 1; number <= 2; number++) {
		rounds.push(
			await pb.collection('rounds').create({
				organization: orgId,
				event: event.id,
				number,
				course: base.course.id,
				positionLabel: 'red',
				status: 'active'
			})
		);
	}
	const mkGroup = async (groupName, teams) => {
		const group = await pb.collection('event_groups').create({
			organization: orgId,
			event: event.id,
			name: groupName,
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
	const groupOne = await mkGroup(`${name} G1`, [teamOne]);
	const groupTwo = await mkGroup(`${name} G2`, [teamTwo]);
	return { event, rounds, groupOne, groupTwo };
}

/**
 * Enters the fixture's two teams into a brand-new season (fresh
 * season_entries + rosters) so cross-season competition boundaries are
 * testable. Entries are season-scoped, so totals can never mix.
 */
async function secondSeason(pb, orgId, base, name) {
	const season = await pb.collection('seasons').create({
		organization: orgId,
		league: base.league.id,
		name,
		status: 'active'
	});
	const enter = async (teamFixture) => {
		const entry = await pb.collection('season_entries').create({
			organization: orgId,
			season: season.id,
			team: teamFixture.team.id,
			status: 'active'
		});
		for (const athlete of teamFixture.athletes) {
			await pb.collection('roster_memberships').create({
				organization: orgId,
				entry: entry.id,
				athlete: athlete.id,
				status: 'active'
			});
		}
		return { team: teamFixture.team, entry, athletes: teamFixture.athletes };
	};
	return { season, teamOne: await enter(base.teamOne), teamTwo: await enter(base.teamTwo) };
}

/** Fills and submits every scorecard of one event. */
async function submitAll(pb, orgId, base, eventFixture, strokesFor = () => 3) {
	const cards = [];
	for (const round of eventFixture.rounds) {
		for (const [group, athletes] of [
			[eventFixture.groupOne, base.teamOne.athletes],
			[eventFixture.groupTwo, base.teamTwo.athletes]
		]) {
			const card = await pb
				.collection('scorecards')
				.create({ organization: orgId, round: round.id, group: group.id });
			for (const athlete of athletes) {
				for (const hole of base.holes) {
					await pb.collection('scores').create({
						organization: orgId,
						scorecard: card.id,
						athlete: athlete.id,
						hole: hole.id,
						strokes: strokesFor(athlete, hole, round)
					});
				}
			}
			await pb.collection('scorecards').update(card.id, { status: 'submitted' });
			cards.push(card);
		}
	}
	return cards;
}

/** Approves and publishes the event's official result (D16 lifecycle). */
async function approveAndPublish(pb, orgId, eventId) {
	const result = await pb
		.collection('event_results')
		.create({ organization: orgId, event: eventId });
	return pb.collection('event_results').update(result.id, { status: 'published' });
}

async function publicPage(slug) {
	const res = await fetch(`${PB_URL}/api/flihub/public/${slug}`);
	return { status: res.status, body: await res.json().catch(() => null) };
}

async function managePublicPage(pb, orgId, body) {
	return pb.send(`/api/flihub/organizations/${orgId}/public-page`, { method: 'POST', body });
}

const hasCode = (code) => (err) =>
	(err.status === 400 || err.status === 403) && err?.response?.code === code;
const isDenied = (err) => err.status === 400 || err.status === 403 || err.status === 404;

test('public-page management: Owner/Admin only, validated slugs, reservation, publish rules', async () => {
	const { owner, org } = await orgWithCaps('mgmt1i', 'Public Mgmt Org');
	const viewer = await member(owner, org.id, 'mgmt1iv', 'viewer');

	// Viewers cannot manage the public page.
	await assert.rejects(
		managePublicPage(viewer, org.id, { slug: uniqueSlug('viewer') }),
		hasCode('forbidden_role'),
		'viewer denied'
	);

	// Slug validation: format, length, reserved words.
	for (const bad of ['ab', 'has space', '-lead', 'trail-', 'dou--ble', 'api', 'o']) {
		await assert.rejects(
			managePublicPage(owner, org.id, { slug: bad }),
			hasCode('invalid_slug'),
			`slug rejected: ${bad}`
		);
	}

	// Publishing requires a reserved slug.
	await assert.rejects(
		managePublicPage(owner, org.id, { published: true }),
		hasCode('slug_required'),
		'publish without slug rejected'
	);

	// Mixed-case input normalizes to the lowercase slug.
	const upper = uniqueSlug('upper');
	const normalized = await managePublicPage(owner, org.id, { slug: upper.toUpperCase() });
	assert.equal(normalized.publicSlug, upper, 'slugs normalize to lowercase');

	// Reserve + brand; invalid colors/logo rejected.
	const slug = uniqueSlug('mgmt');
	await assert.rejects(
		managePublicPage(owner, org.id, { themePrimary: 'blue' }),
		hasCode('invalid_color')
	);
	await assert.rejects(
		managePublicPage(owner, org.id, { logoUrl: 'javascript:alert(1)' }),
		hasCode('invalid_logo')
	);
	const saved = await managePublicPage(owner, org.id, {
		slug,
		tagline: 'Disc golf, honestly.',
		themePrimary: '#1d4ed8'
	});
	assert.equal(saved.publicSlug, slug);
	assert.equal(saved.publicPublished, false, 'reserving a slug does not publish');

	// Slug uniqueness across organizations.
	const other = await orgWithCaps('mgmt1io', 'Other Org');
	await assert.rejects(
		managePublicPage(other.owner, other.org.id, { slug }),
		hasCode('slug_taken'),
		'slug reservation is exclusive'
	);

	// The organizations update rule stays locked — no direct writes.
	await assert.rejects(
		owner.collection('organizations').update(org.id, { publicSlug: uniqueSlug('direct') }),
		isDenied,
		'direct organization PATCH rejected'
	);

	// Audit trail records the change.
	const events = await owner.collection('membership_events').getFullList({
		filter: `organization = "${org.id}" && action = "public_page_changed"`
	});
	assert.ok(events.length >= 1, 'public-page changes are audited');
});

test('public page is hidden until published, exposes only whitelisted published data', async () => {
	const { owner, org } = await orgWithCaps('page1i', 'Public Page Org');
	const base = await competitionFixture(owner, org.id, 'IPage');
	const e1 = await addEvent(owner, org.id, base, 'IPage E1', { startsAt: '2026-11-01 10:00:00' });
	await submitAll(owner, org.id, base, e1); // everyone shoots par (3s)
	await approveAndPublish(owner, org.id, e1.event.id);

	// Private contact data exists and must never surface publicly.
	await owner.collection('athlete_private').create({
		organization: org.id,
		athlete: base.teamOne.athletes[0].id,
		email: 'secret-contact@example.com',
		phone: '555-0100',
		eligibilityNotes: 'confidential-note'
	});

	const slug = uniqueSlug('page');
	await managePublicPage(owner, org.id, { slug, tagline: 'Fairways & chains' });

	// Hidden before publish: indistinguishable from an unknown slug.
	assert.equal((await publicPage(slug)).status, 404, 'unpublished page hidden');
	assert.equal((await publicPage('definitely-not-a-slug')).status, 404);

	await managePublicPage(owner, org.id, { published: true });

	// Nothing is published per-record yet: sections render but are empty.
	let { status, body } = await publicPage(slug);
	assert.equal(status, 200);
	assert.deepEqual(
		Object.keys(body).sort(),
		['athletes', 'organization', 'results', 'schedule', 'sections', 'standings', 'teams'].sort(),
		'payload has exactly the public top-level keys'
	);
	assert.deepEqual(
		Object.keys(body.organization).sort(),
		['logoUrl', 'name', 'slug', 'tagline', 'themePrimary', 'themeSecondary'].sort(),
		'organization exposes only branding fields'
	);
	assert.deepEqual(body.schedule, [], 'no events published yet');
	assert.deepEqual(body.teams, [], 'no teams published yet');
	assert.deepEqual(body.athletes, [], 'no athletes published yet');
	assert.deepEqual(body.results, [], 'no results published yet');
	assert.deepEqual(body.standings, [], 'no standings yet');

	// Publish records: the event, one team, one athlete.
	await owner.collection('events').update(e1.event.id, { publicPublished: true });
	await owner.collection('teams').update(base.teamOne.team.id, { publicPublished: true });
	await owner.collection('athletes').update(base.teamOne.athletes[0].id, { publicPublished: true });

	({ status, body } = await publicPage(slug));
	assert.equal(status, 200);
	assert.equal(body.schedule.length, 1);
	assert.deepEqual(
		Object.keys(body.schedule[0]).sort(),
		['event', 'name', 'seasonName', 'startsAt', 'status'].sort()
	);
	assert.deepEqual(body.teams, [{ name: base.teamOne.team.name }], 'only the published team');
	assert.equal(body.athletes.length, 1, 'only the published athlete profile');
	assert.deepEqual(
		Object.keys(body.athletes[0]).sort(),
		['displayName', 'gender', 'nationality'].sort(),
		'athlete profiles expose exactly the D11 display fields'
	);
	assert.equal(body.results.length, 1, 'published official result visible');
	assert.equal(body.results[0].corrected, false);
	const teamRow = body.results[0].teams.find((t) => t.entry === base.teamOne.entry.id);
	assert.equal(teamRow.total, 24, 'two athletes x two rounds x two par-3 holes at par');
	assert.equal(teamRow.par, 24, 'team par from current course configuration');
	// All three athletes shot 12 (par): shared tied positions 1,1,1.
	assert.deepEqual(
		body.standings[0].athletes.map((a) => a.rank),
		[1, 1, 1],
		'ties share a position'
	);

	// Private and internal data never leaks into the payload.
	const raw = JSON.stringify(body);
	for (const secret of [
		'secret-contact@example.com',
		'555-0100',
		'confidential-note',
		'capabilities',
		'pendingReason'
	]) {
		assert.ok(!raw.includes(secret), `payload must not contain ${secret}`);
	}

	// Direct collection reads stay members-only for anonymous callers.
	for (const collection of [
		'events',
		'teams',
		'athletes',
		'athlete_private',
		'event_results',
		'result_versions',
		'result_changes',
		'organizations'
	]) {
		const res = await fetch(`${PB_URL}/api/collections/${collection}/records?perPage=50`);
		const json = await res.json().catch(() => null);
		const items = json?.items ?? [];
		assert.equal(items.length, 0, `anonymous ${collection} list returns nothing`);
	}

	// Unpublish hides the page again without deleting anything; republishing restores it.
	await managePublicPage(owner, org.id, { published: false });
	assert.equal((await publicPage(slug)).status, 404, 'unpublished page hidden again');
	await managePublicPage(owner, org.id, { published: true });
	({ status, body } = await publicPage(slug));
	assert.equal(status, 200);
	assert.equal(body.results.length, 1, 'unpublish deleted nothing');
});

test('D16 acceptance: published v1 counts once; pending v2 changes nothing; republication replaces exactly once', async () => {
	const { owner, org } = await orgWithCaps('life1i', 'Standings Lifecycle Org');
	const base = await competitionFixture(owner, org.id, 'ILife');
	const e1 = await addEvent(owner, org.id, base, 'ILife E1');
	// Distinct strokes: hole number + 2 → 7 per athlete per round, 14 per athlete.
	await submitAll(owner, org.id, base, e1, (_a, hole) => Number(hole.number) + 2);
	const result = await approveAndPublish(owner, org.id, e1.event.id);
	await owner.collection('events').update(e1.event.id, { publicPublished: true });
	const slug = uniqueSlug('life');
	await managePublicPage(owner, org.id, { slug, published: true });

	const teamOneEntry = base.teamOne.entry.id;
	const totalOf = (body) =>
		body.standings[0].teams.find((t) => t.name === base.teamOne.team.name)?.total;

	// Published v1 counts exactly once.
	let { body } = await publicPage(slug);
	assert.equal(totalOf(body), 28, 'published v1 counts once');
	assert.equal(body.results[0].corrected, false, 'v1 carries no correction indicator');

	// Reopen with a reason, correct one score (+2), reapprove → v2 PENDING.
	const reason = 'Hole 1 recorded for the wrong athlete';
	await owner.collection('event_results').update(result.id, { status: 'correcting', reason });
	const cards = await owner
		.collection('scorecards')
		.getFullList({ filter: `event = "${e1.event.id}"` });
	const card = cards.find((c) => c.round === e1.rounds[0].id && c.group === e1.groupOne.id);
	await owner.collection('scorecards').update(card.id, { status: 'draft', reason: 'fix hole 1' });
	const score = await owner
		.collection('scores')
		.getFirstListItem(
			`scorecard = "${card.id}" && athlete = "${base.teamOne.athletes[0].id}" && hole = "${base.holes[0].id}"`
		);
	await owner.collection('scores').update(score.id, { strokes: Number(score.strokes) + 2 });
	await owner.collection('scorecards').update(card.id, { status: 'submitted' });
	const reapproved = await owner
		.collection('event_results')
		.update(result.id, { status: 'approved' });
	assert.equal(reapproved.currentVersion, 2);
	assert.equal(reapproved.publishedVersion, 1, 'v2 is approved but NOT published');

	// Pending v2 leaves the public surface untouched.
	({ body } = await publicPage(slug));
	assert.equal(totalOf(body), 28, 'pending v2 leaves standings unchanged');
	assert.equal(body.results[0].corrected, false, 'no correction indicator before republication');
	assert.equal(
		body.results[0].teams.find((t) => t.entry === teamOneEntry).total,
		28,
		'results still show the official v1 totals'
	);
	assert.ok(!JSON.stringify(body).includes(reason), 'correction reasons stay private');

	// Republication replaces the contribution exactly once (30, not 28+30).
	await owner.collection('event_results').update(result.id, { status: 'published' });
	({ body } = await publicPage(slug));
	assert.equal(totalOf(body), 30, 'republished v2 replaces v1 exactly once');
	assert.equal(body.results.length, 1, 'still exactly one result for the event');
	assert.equal(body.results[0].corrected, true, 'corrected indicator after republication');
	assert.ok(body.results[0].correctedAt, 'correction indicator carries the republication date');
	assert.ok(!JSON.stringify(body).includes(reason), 'reasons stay private after republication');
});

test('aggregation: season sums across events, competition boundaries hold, eligibility differs member vs public', async () => {
	const { owner, org } = await orgWithCaps('agg1i', 'Aggregation Org');
	const base = await competitionFixture(owner, org.id, 'IAgg');
	const e1 = await addEvent(owner, org.id, base, 'IAgg E1', { startsAt: '2026-11-01 09:00:00' });
	const e2 = await addEvent(owner, org.id, base, 'IAgg E2', { startsAt: '2026-11-08 09:00:00' });
	// NOTE: season-less events cannot produce official results today — the 1F
	// hook requires season-linked events for group team assignments — so the
	// cross-competition boundary is verified with a SECOND season instead.
	const seasonB = await secondSeason(owner, org.id, base, 'IAgg Season B');
	const eB = await addEvent(owner, org.id, base, 'IAgg B Open', {
		seasonId: seasonB.season.id,
		teams: [seasonB.teamOne, seasonB.teamTwo],
		startsAt: '2026-11-10 09:00:00'
	});
	const memberOnly = await addEvent(owner, org.id, base, 'IAgg Hidden', {
		startsAt: '2026-11-15 09:00:00'
	});
	const scheduled = await addEvent(owner, org.id, base, 'IAgg Future', {
		startsAt: '2026-12-01 09:00:00'
	});

	await submitAll(owner, org.id, base, e1); // 3s: team1 24, team2 12
	await submitAll(owner, org.id, base, e2, () => 4); // 4s: team1 32, team2 16
	await submitAll(owner, org.id, base, eB, () => 5); // 5s: team1 40, team2 20
	await submitAll(owner, org.id, base, memberOnly, () => 6); // 6s: team1 48, team2 24
	for (const ev of [e1, e2, eB, memberOnly]) {
		await approveAndPublish(owner, org.id, ev.event.id);
	}
	// `scheduled` has no official result at all.

	// Public flags: e1, e2, eB, scheduled — but NOT memberOnly.
	for (const ev of [e1, e2, eB, scheduled]) {
		await owner.collection('events').update(ev.event.id, { publicPublished: true });
	}

	const slug = uniqueSlug('agg');
	await managePublicPage(owner, org.id, { slug, published: true });
	const { body } = await publicPage(slug);

	// Schedule lists all four public events; results only the three with
	// published official results.
	assert.equal(body.schedule.length, 4);
	assert.deepEqual(
		body.results.map((r) => r.eventName).sort(),
		['IAgg B Open', 'IAgg E1', 'IAgg E2'].sort(),
		'results require a published official result AND the public flag'
	);

	// Standings: one table per season — totals never cross the boundary.
	assert.equal(body.standings.length, 2, 'one standings table per season');
	const seasonTable = body.standings.find((t) => t.seasonName === 'IAgg Season');
	const seasonBTable = body.standings.find((t) => t.seasonName === 'IAgg Season B');
	assert.deepEqual(
		seasonTable.events.map((e) => e.eventName),
		['IAgg E1', 'IAgg E2'],
		'the hidden and resultless events never join the public season standings'
	);
	const t1 = seasonTable.teams.find((t) => t.name === base.teamOne.team.name);
	const t2 = seasonTable.teams.find((t) => t.name === base.teamTwo.team.name);
	assert.equal(t1.total, 56, 'team one sums 24 + 32 across the season');
	assert.equal(t1.played, 2);
	assert.equal(t1.par, 48, 'summed par across two events');
	assert.equal(t2.total, 28, 'team two sums 12 + 16');
	assert.equal(t2.rank, 1, 'lowest total leads');
	assert.equal(t1.rank, 2);
	const ava = seasonTable.athletes.find((a) => a.name.startsWith('Ava'));
	assert.equal(ava.total, 28, 'athlete sums 12 + 16 across the season');
	assert.equal(ava.diff, 4, '+4 against a 24-stroke two-event par');
	assert.deepEqual(
		seasonBTable.events.map((e) => e.eventName),
		['IAgg B Open'],
		'the second season stands alone'
	);
	assert.equal(
		seasonBTable.teams.find((t) => t.name === base.teamOne.team.name).total,
		40,
		'season B totals never mix into season A'
	);

	// Member standings include the member-only event (official publication is
	// the input; the public flag gates only the public surfaces).
	const memberStandings = await owner.send(`/api/flihub/organizations/${org.id}/standings`, {
		method: 'GET'
	});
	const memberSeason = memberStandings.standings.find((t) => t.seasonName === 'IAgg Season');
	assert.deepEqual(
		memberSeason.events.map((e) => e.eventName),
		['IAgg E1', 'IAgg E2', 'IAgg Hidden'],
		'member standings count every event with a published official result'
	);
	assert.equal(
		memberSeason.teams.find((t) => t.name === base.teamOne.team.name).total,
		104,
		'member season total includes the hidden event (24+32+48)'
	);

	// Cross-organization isolation: another org's page never sees this data.
	const other = await orgWithCaps('agg1io', 'Isolated Org');
	const otherSlug = uniqueSlug('iso');
	await managePublicPage(other.owner, other.org.id, { slug: otherSlug, published: true });
	const otherPage = await publicPage(otherSlug);
	assert.deepEqual(otherPage.body.standings, [], 'no cross-organization standings');
	assert.ok(!JSON.stringify(otherPage.body).includes('IAgg'), 'no cross-organization event names');
});

test('preview and member standings are members-only; anonymous callers are rejected', async () => {
	const { owner, org } = await orgWithCaps('prev1i', 'Preview Org');
	const viewer = await member(owner, org.id, 'prev1iv', 'viewer');
	const outsider = await registerVerifiedUser(uniqueEmail('prev1io'), 'Outsider');

	// Members preview an UNPUBLISHED page; the payload matches the public shape.
	const preview = await viewer.send(`/api/flihub/organizations/${org.id}/public-preview`, {
		method: 'GET'
	});
	assert.equal(preview.preview.published, false);
	assert.deepEqual(
		Object.keys(preview.page.organization).sort(),
		['logoUrl', 'name', 'slug', 'tagline', 'themePrimary', 'themeSecondary'].sort()
	);

	// Outsiders and anonymous callers get nothing.
	await assert.rejects(
		outsider.send(`/api/flihub/organizations/${org.id}/public-preview`, { method: 'GET' }),
		isDenied,
		'outsider preview denied'
	);
	await assert.rejects(
		outsider.send(`/api/flihub/organizations/${org.id}/standings`, { method: 'GET' }),
		isDenied,
		'outsider standings denied'
	);
	const anonPreview = await fetch(`${PB_URL}/api/flihub/organizations/${org.id}/public-preview`);
	assert.ok([401, 403, 404].includes(anonPreview.status), 'anonymous preview rejected');
	const anonStandings = await fetch(`${PB_URL}/api/flihub/organizations/${org.id}/standings`);
	assert.ok([401, 403, 404].includes(anonStandings.status), 'anonymous standings rejected');

	// Per-record publication toggles are Owner/Admin only (collection rules).
	const athlete = await owner.collection('athletes').create({
		organization: org.id,
		firstName: 'Tess',
		lastName: 'Preview',
		gender: 'female',
		status: 'active'
	});
	await assert.rejects(
		viewer.collection('athletes').update(athlete.id, { publicPublished: true }),
		isDenied,
		'viewer cannot toggle athlete publication'
	);
});

test('D17 completeness: incomplete participation is Unranked; a published second result restores rank sharing', async () => {
	const { owner, org } = await orgWithCaps('rank1i', 'Completeness Org');
	const orgId = org.id;
	// One-athlete teams for clean numbers: 2 holes x par 3 x 2 rounds = 12
	// strokes per athlete per event when everyone shoots par.
	const league = await owner
		.collection('leagues')
		.create({ organization: orgId, name: 'Rank League', status: 'active' });
	const season = await owner.collection('seasons').create({
		organization: orgId,
		league: league.id,
		name: 'Rank Season',
		status: 'active'
	});
	const course = await owner
		.collection('courses')
		.create({ organization: orgId, name: 'Rank Course', status: 'active' });
	const holes = [];
	for (let i = 1; i <= 2; i++) {
		const hole = await owner.collection('course_holes').create({
			organization: orgId,
			course: course.id,
			number: i,
			name: `Hole ${i}`,
			par: 3,
			status: 'active'
		});
		await owner.collection('hole_positions').create({
			organization: orgId,
			hole: hole.id,
			label: 'red',
			distance: 250 + i,
			unit: 'feet',
			status: 'active'
		});
		holes.push(hole);
	}
	const mkSoloTeam = async (name, firstName) => {
		const team = await owner
			.collection('teams')
			.create({ organization: orgId, name, status: 'active' });
		const entry = await owner.collection('season_entries').create({
			organization: orgId,
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const athlete = await owner.collection('athletes').create({
			organization: orgId,
			firstName,
			lastName: 'Rank',
			gender: 'female',
			status: 'active'
		});
		await owner.collection('roster_memberships').create({
			organization: orgId,
			entry: entry.id,
			athlete: athlete.id,
			status: 'active'
		});
		return { team, entry, athlete };
	};
	const soloA = await mkSoloTeam('Solo A', 'Alice');
	const soloB = await mkSoloTeam('Solo B', 'Bree');

	const addGroupWithCards = async (eventId, rounds, t, groupName) => {
		const group = await owner
			.collection('event_groups')
			.create({ organization: orgId, event: eventId, name: groupName, status: 'active' });
		await owner
			.collection('group_teams')
			.create({ organization: orgId, group: group.id, entry: t.entry.id, status: 'active' });
		await owner.collection('group_athletes').create({
			organization: orgId,
			group: group.id,
			entry: t.entry.id,
			athlete: t.athlete.id,
			status: 'active'
		});
		for (const round of rounds) {
			const card = await owner
				.collection('scorecards')
				.create({ organization: orgId, round: round.id, group: group.id });
			for (const hole of holes) {
				await owner.collection('scores').create({
					organization: orgId,
					scorecard: card.id,
					athlete: t.athlete.id,
					hole: hole.id,
					strokes: 3
				});
			}
			await owner.collection('scorecards').update(card.id, { status: 'submitted' });
		}
		return group;
	};
	const mkEvent = async (name, teams, startsAt) => {
		const event = await owner.collection('events').create({
			organization: orgId,
			season: season.id,
			name,
			status: 'completed',
			startsAt
		});
		const rounds = [];
		for (let number = 1; number <= 2; number++) {
			rounds.push(
				await owner.collection('rounds').create({
					organization: orgId,
					event: event.id,
					number,
					course: course.id,
					positionLabel: 'red',
					status: 'active'
				})
			);
		}
		for (const t of teams) {
			await addGroupWithCards(event.id, rounds, t, `${name} ${t.team.name}`);
		}
		const result = await owner
			.collection('event_results')
			.create({ organization: orgId, event: event.id });
		await owner.collection('event_results').update(result.id, { status: 'published' });
		await owner.collection('events').update(event.id, { publicPublished: true });
		return { event, rounds, result };
	};

	await mkEvent('Rank E1', [soloA, soloB], '2026-11-01 09:00:00');
	const e2 = await mkEvent('Rank E2', [soloB], '2026-11-08 09:00:00');

	const slug = uniqueSlug('rank');
	await managePublicPage(owner, orgId, { slug, published: true });

	// Stage 1 — Solo A played 1 of the 2 counted events: Unranked with its
	// strokes (missing results add none); Solo B has complete participation.
	let { body } = await publicPage(slug);
	let teams = body.standings[0].teams;
	let a = teams.find((t) => t.name === 'Solo A');
	let b = teams.find((t) => t.name === 'Solo B');
	assert.equal(b.rank, 1, 'complete participation ranks first by lowest total');
	assert.equal(b.played, 2);
	assert.equal(b.eventsCounted, 2, 'Solo B: 2 of 2 events');
	assert.equal(b.total, 24);
	assert.equal(a.rank, null, 'incomplete participation is Unranked');
	assert.equal(a.played, 1);
	assert.equal(a.eventsCounted, 2, 'Solo A: 1 of 2 events');
	assert.equal(a.total, 12, 'missing results never add strokes');
	assert.deepEqual(
		teams.map((t) => t.name),
		['Solo B', 'Solo A'],
		'ranked rows list before Unranked rows'
	);
	// The same rule applies to athlete rows.
	const alice = body.standings[0].athletes.find((r) => r.name.startsWith('Alice'));
	assert.equal(alice.rank, null, 'athlete rows follow the same completeness rule');
	// ...and to the member view, over the member-eligible counted events.
	const member = await owner.send(`/api/flihub/organizations/${orgId}/standings`, {
		method: 'GET'
	});
	const memberA = member.standings[0].teams.find((t) => t.name === 'Solo A');
	assert.equal(memberA.rank, null, 'member standings apply the same rule');
	assert.equal(memberA.eventsCounted, 2);

	// Stage 2 — Solo A's second result arrives through the D16 correction
	// window: reopen E2, add Solo A's group and submitted scorecards,
	// reapprove (v2 pending — nothing changes publicly), then republish.
	await owner
		.collection('event_results')
		.update(e2.result.id, { status: 'correcting', reason: 'Solo A group was omitted' });
	await addGroupWithCards(e2.event.id, e2.rounds, soloA, 'Rank E2 Solo A');
	await owner.collection('event_results').update(e2.result.id, { status: 'approved' });

	({ body } = await publicPage(slug));
	a = body.standings[0].teams.find((t) => t.name === 'Solo A');
	assert.equal(a.rank, null, 'pending v2 changes nothing: Solo A stays Unranked');
	assert.equal(a.total, 12, 'pending v2 adds no strokes');

	await owner.collection('event_results').update(e2.result.id, { status: 'published' });
	({ body } = await publicPage(slug));
	teams = body.standings[0].teams;
	a = teams.find((t) => t.name === 'Solo A');
	b = teams.find((t) => t.name === 'Solo B');
	assert.equal(a.played, 2, 'Solo A now has a result in every counted event');
	assert.equal(a.eventsCounted, 2);
	assert.equal(a.total, 24, 'republication added the second result exactly once');
	assert.equal(a.rank, 1, 'eligible again — and equal totals share the rank');
	assert.equal(b.rank, 1, 'Solo B keeps rank 1 (shared)');
	assert.equal(b.total, 24);
});
