import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generateTeeTimes, teeLocal, toTeeInstant } from '../src/lib/tee-times.ts';

test('six Arizona groups at ten-minute intervals', () => {
	const times = generateTeeTimes('2027-06-05T09:00', 10, 6, 'America/Phoenix');
	assert.equal(times[0], '2027-06-05T16:00:00.000Z');
	assert.equal(teeLocal(times[5], 'America/Phoenix'), '2027-06-05T09:50');
});
test('custom interval crosses midnight correctly', () => {
	const times = generateTeeTimes('2027-06-05T23:55', 15, 2, 'America/Phoenix');
	assert.equal(teeLocal(times[1], 'America/Phoenix'), '2027-06-06T00:10');
});
test('rejects bad intervals, dates, zones and DST ambiguities', () => {
	for (const interval of [0, -1, 1.5, 241])
		assert.throws(() => generateTeeTimes('2027-06-05T09:00', interval, 2, 'UTC'));
	for (const [local, zone] of [
		['2027-02-30T09:00', 'UTC'],
		['2027-03-14T02:30', 'America/Los_Angeles'],
		['2027-11-07T01:30', 'America/Los_Angeles'],
		['2027-06-05T09:00', 'invalid']
	])
		assert.throws(() => toTeeInstant(local, zone));
});

function validate(schedule, { locked = false, groups = ['a', 'b'] } = {}) {
	let handler;
	vm.runInNewContext(
		readFileSync(
			new URL('../pocketbase/pb_hooks/flihub_tee_schedule.pb.js', import.meta.url),
			'utf8'
		),
		{
			onRecordUpdateRequest: (callback) => (handler = callback),
			onRecordCreateRequest: () => {},
			BadRequestError: Error
		}
	);
	const record = {
		id: 'round1',
		get: (key) => (key === 'teeSchedule' ? schedule : null),
		getString: (key) => ({ organization: 'org', event: 'event', status: 'active' })[key] || '',
		original: () => ({ get: () => null })
	};
	let called = false;
	handler({
		record,
		next: () => (called = true),
		app: {
			findRecordById: (collection) =>
				collection === 'organizations'
					? { get: () => '["events"]' }
					: { getString: () => 'planned' },
			findRecordsByFilter: (collection) =>
				collection === 'scorecards' ? (locked ? [{}] : []) : groups.map((id) => ({ id }))
		}
	});
	return called;
}
const schedule = () => ({
	timeZone: 'America/Phoenix',
	intervalMinutes: 10,
	slots: [
		{ group: 'a', startsAt: '2027-06-05T16:00:00.000Z' },
		{ group: 'b', startsAt: '2027-06-05T16:10:00.000Z' }
	]
});
test('hook accepts complete schedule and rejects locked rounds', () => {
	assert.equal(validate(schedule()), true);
	assert.throws(() => validate(schedule(), { locked: true }), /locked/);
});
test('hook rejects missing, foreign or duplicate groups and nonincreasing times', () => {
	const missing = schedule();
	missing.slots.pop();
	assert.throws(() => validate(missing), /every active group/);
	const foreign = schedule();
	foreign.slots[1].group = 'outside';
	assert.throws(() => validate(foreign), /Invalid or repeated/);
	const duplicate = schedule();
	duplicate.slots[1].group = 'a';
	assert.throws(() => validate(duplicate), /Invalid or repeated/);
	const equal = schedule();
	equal.slots[1].startsAt = equal.slots[0].startsAt;
	assert.throws(() => validate(equal), /strictly increasing/);
});
