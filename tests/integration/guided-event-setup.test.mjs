import assert from 'node:assert/strict';
import test from 'node:test';
import {
	acceptInvitation,
	createInvitation,
	registerVerifiedUser,
	uniqueEmail,
	newClient
} from './helpers.mjs';
const CAPS = [
	'athletes',
	'teams',
	'leagues-seasons',
	'events',
	'venues-courses',
	'scoring-results'
];
async function fixture() {
	const owner = await registerVerifiedUser(uniqueEmail('guided-event'), 'Event Owner');
	const org = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: { name: 'Guided event test', template: 'custom', capabilities: CAPS }
	});
	const make = (table, values) =>
		owner.collection(table).create({ organization: org.id, status: 'active', ...values });
	const league = await make('leagues', { name: 'Test league' });
	const season = await make('seasons', {
		league: league.id,
		name: 'Spring 2027',
		startsOn: '2027-03-01',
		endsOn: '2027-05-31',
		status: 'planned'
	});
	const course = await make('courses', { name: 'Short test course' });
	const holes = [];
	for (let number = 1; number <= 2; number++) {
		const hole = await make('course_holes', {
			course: course.id,
			number,
			name: `Hole ${number}`,
			par: 3
		});
		holes.push(hole.id);
		for (const label of ['Red', 'Blue'])
			await make('hole_positions', {
				hole: hole.id,
				label,
				distance: label === 'Red' ? 250 : 350,
				unit: 'feet'
			});
	}
	const selections = [];
	for (let n = 1; n <= 2; n++) {
		const team = await make('teams', { name: `Team ${n}` });
		const entry = await make('season_entries', {
			season: season.id,
			team: team.id
		});
		const athlete = await make('athletes', {
			firstName: `Athlete${n}`,
			lastName: 'Test'
		});
		await make('roster_memberships', { entry: entry.id, athlete: athlete.id });
		selections.push({ entry: entry.id, athletes: [athlete.id] });
	}
	const body = {
		version: 1,
		name: 'First guided event',
		venueName: 'Coastal Community Park',
		venueAddress: '123 Example Lane, San Diego CA',
		season: season.id,
		date: '2027-04-10',
		rounds: ['Red', 'Blue'].map((position) => ({
			name: position,
			course: course.id,
			position,
			holeIds: holes
		})),
		groups: [
			{
				name: 'Group 1',
				scorekeeper: owner.authStore.record.id,
				entries: selections
			}
		]
	};
	const send = (input = body, client = owner) =>
		client.send(`/api/flihub/organizations/${org.id}/guided-event`, {
			method: 'POST',
			body: input,
			requestKey: null
		});
	const count = async (table) =>
		(await owner.collection(table).getList(1, 1, { filter: `organization = "${org.id}"` }))
			.totalItems;
	return { owner, org, make, body, send, count };
}
const rejected = (status) => (error) => error.status === status;

test('guided event creates related setup once; preserves rosters; concurrent repeat cannot duplicate', async () => {
	const f = await fixture();
	const results = await Promise.allSettled([f.send(), f.send()]);
	assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
	const created = results.find((r) => r.status === 'fulfilled').value;
	assert.equal(created.rounds, 2);
	for (const [table, expected] of [
		['events', 1],
		['rounds', 2],
		['event_groups', 1],
		['group_teams', 2],
		['group_athletes', 2],
		['roster_memberships', 2],
		['scorecards', 0]
	])
		assert.equal(await f.count(table), expected, table);
	const event = await f.owner.collection('events').getOne(created.eventId);
	assert.equal(event.status, 'planned');
	assert.equal(event.venueName, f.body.venueName);
	assert.equal(event.venueAddress, f.body.venueAddress);
	await f.owner.collection('events').update(event.id, { venueName: 'Updated Park' });
	assert.equal((await f.owner.collection('events').getOne(event.id)).venueName, 'Updated Park');
	assert.equal(
		(await f.owner.collection('events').getOne(event.id)).venueAddress,
		f.body.venueAddress
	);
	assert.equal(event.season, f.body.season);
	await assert.rejects(f.send(), rejected(400));
});

test('guided event refuses stale reviewed rosters and incomplete courses without writes', async () => {
	const f = await fixture();
	const athlete = await f.make('athletes', {
		firstName: 'Unreviewed',
		lastName: 'Athlete'
	});
	await f.make('roster_memberships', {
		entry: f.body.groups[0].entries[0].entry,
		athlete: athlete.id
	});
	await assert.rejects(f.send(), rejected(400));
	assert.equal(await f.count('events'), 0);
	f.body.groups[0].entries[0].athletes.push(athlete.id);
	f.body.rounds[1].position = 'Missing position';
	await assert.rejects(f.send(), rejected(400));
	assert.equal(await f.count('rounds'), 0);
	assert.equal(await f.count('group_athletes'), 0);
});

test('guided event checks current roles, organization scope and disabled capabilities', async () => {
	const f = await fixture();
	const email = uniqueEmail('guided-viewer');
	const viewer = await registerVerifiedUser(email, 'Event Viewer');
	await assert.rejects(f.send(f.body, viewer), rejected(404));
	const invitation = await createInvitation(f.owner, f.org.id, email, 'viewer');
	await acceptInvitation(viewer, invitation.token);
	await assert.rejects(f.send(f.body, viewer), rejected(403));
	await assert.rejects(f.send(f.body, newClient()), rejected(401));
	const keeperInput = structuredClone(f.body);
	keeperInput.groups[0].scorekeeper = viewer.authStore.record.id;
	await assert.rejects(f.send(keeperInput), rejected(400));
	await f.owner.send(`/api/flihub/organizations/${f.org.id}/configure`, {
		method: 'POST',
		body: { capabilities: CAPS.filter((cap) => cap !== 'scoring-results') }
	});
	await assert.rejects(f.send(), rejected(400));
	assert.equal(await f.count('events'), 0);
});

test('guided multi-day event saves its complete date range and rejects invalid ranges without partial records', async () => {
	const f = await fixture();
	const input = { ...f.body, multiDay: true, endDate: '2027-04-12' };
	for (const endDate of ['', '2027-04-10', '2027-04-09', '2027-06-01']) {
		await assert.rejects(f.send({ ...input, endDate }), rejected(400));
		assert.equal(await f.count('events'), 0);
		assert.equal(await f.count('rounds'), 0);
	}
	const result = await f.send(input);
	const event = await f.owner.collection('events').getOne(result.eventId);
	assert.equal(
		new Date(event.startsAt.replace(' ', 'T')).toISOString(),
		'2027-04-10T00:00:00.000Z'
	);
	assert.equal(new Date(event.endsAt.replace(' ', 'T')).toISOString(), '2027-04-12T23:59:59.999Z');
	assert.equal(event.venueName, f.body.venueName);
	assert.equal(await f.count('group_athletes'), 2);
});

test('guided creation saves per-round tee schedules with real group IDs and preserves ordinary schedule validation', async () => {
	const f = await fixture();
	const value = {
		...f.body,
		teeTimeZone: 'America/Los_Angeles',
		teeIntervalMinutes: 10,
		rounds: f.body.rounds.map((round, index) => ({
			...round,
			teeStartsAt: index ? '2027-04-10T20:00:00.000Z' : '2027-04-10T16:00:00.000Z'
		}))
	};
	const result = await f.send(value);
	const rounds = await f.owner
		.collection('rounds')
		.getFullList({ filter: `event = "${result.eventId}"`, sort: 'number' });
	const groups = await f.owner
		.collection('event_groups')
		.getFullList({ filter: `event = "${result.eventId}"` });
	assert.equal(rounds[0].teeSchedule.timeZone, value.teeTimeZone);
	assert.equal(rounds[0].teeSchedule.intervalMinutes, 10);
	assert.equal(rounds[0].teeSchedule.slots[0].group, groups[0].id);
	assert.equal(rounds[1].teeSchedule.slots[0].startsAt, value.rounds[1].teeStartsAt);
	// Existing hooks still reject schedules missing a group on ordinary edits.
	await assert.rejects(
		f.owner
			.collection('rounds')
			.update(rounds[0].id, { teeSchedule: { ...rounds[0].teeSchedule, slots: [] } }),
		rejected(400)
	);
});
