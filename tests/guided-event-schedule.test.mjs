import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareGuidedTeeTimes } from '../src/lib/event-setup/schedule.ts';
import { teeLocal } from '../src/lib/tee-times.ts';
const input = () => ({
	version: 1,
	name: 'Open',
	season: 'test',
	date: '2027-03-06',
	teeTimeZone: 'America/Los_Angeles',
	teeIntervalMinutes: 10,
	rounds: [
		{
			name: 'Red',
			course: 'east',
			position: 'Red',
			holeIds: [],
			teeStartLocal: '2027-03-06T09:00'
		},
		{
			name: 'Blue',
			course: 'east',
			position: 'Blue',
			holeIds: [],
			teeStartLocal: '2027-03-06T13:00'
		}
	],
	groups: Array.from({ length: 6 }, (_, i) => ({
		name: `Group ${i + 1}`,
		scorekeeper: 'bob',
		entries: []
	}))
});
test('six groups begin at 09:00 through 09:50 in the chosen timezone', () => {
	const result = prepareGuidedTeeTimes(input());
	assert.equal(result.rounds[0].teeStartsAt, '2027-03-06T17:00:00.000Z');
	assert.equal(
		teeLocal(
			new Date(Date.parse(result.rounds[0].teeStartsAt) + 5 * 10 * 60000).toISOString(),
			result.teeTimeZone
		),
		'2027-03-06T09:50'
	);
});
test('different round dates work for multi-day events', () => {
	const value = input();
	value.multiDay = true;
	value.endDate = '2027-03-07';
	value.rounds[1].teeStartLocal = '2027-03-07T09:00';
	assert.equal(prepareGuidedTeeTimes(value).rounds[1].teeStartsAt, '2027-03-07T17:00:00.000Z');
});
for (const [label, change] of [
	['missing time', (v) => (v.rounds[0].teeStartLocal = '')],
	['unknown timezone', (v) => (v.teeTimeZone = 'Invalid/Zone')],
	['zero interval', (v) => (v.teeIntervalMinutes = 0)],
	['outside local dates', (v) => (v.rounds[1].teeStartLocal = '2027-03-07T13:00')],
	['last group crosses event day', (v) => (v.rounds[1].teeStartLocal = '2027-03-06T23:50')],
	['overlapping starts', (v) => (v.rounds[1].teeStartLocal = '2027-03-06T09:30')],
	[
		'DST gap',
		(v) => {
			v.date = '2027-03-14';
			v.rounds[0].teeStartLocal = '2027-03-14T02:30';
			v.rounds[1].teeStartLocal = '2027-03-14T12:00';
		}
	],
	[
		'DST ambiguity',
		(v) => {
			v.date = '2027-11-07';
			v.rounds[0].teeStartLocal = '2027-11-07T01:30';
			v.rounds[1].teeStartLocal = '2027-11-07T12:00';
		}
	]
])
	test(`local schedule rejects ${label}`, () => {
		const value = input();
		change(value);
		assert.throws(() => prepareGuidedTeeTimes(value));
	});
test('older unscheduled requests remain supported', () => {
	const value = input();
	delete value.teeTimeZone;
	for (const round of value.rounds) delete round.teeStartLocal;
	assert.equal(prepareGuidedTeeTimes(value), value);
});
