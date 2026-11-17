import { generateTeeTimes, teeLocal } from '../tee-times.ts';
import timeZones from '../../../pocketbase/pb_hooks/tee_time_zones.json' with { type: 'json' };
import type { GuidedEventInput } from './types';

export const GUIDED_TEE_ZONES = timeZones;

/** Convert reviewed local clock times using the existing timezone/DST rules. */
export function prepareGuidedTeeTimes(input: GuidedEventInput): GuidedEventInput {
	if (!input || !Array.isArray(input.rounds) || !Array.isArray(input.groups))
		throw new Error('Invalid guided setup.');
	if (input.teeTimeZone === undefined) {
		if (input.rounds.some((round) => round.teeStartLocal || round.teeStartsAt))
			throw new Error('Choose a timezone for tee times.');
		return input; // Older clients can still create an unscheduled event.
	}
	if (!timeZones.includes(input.teeTimeZone)) throw new Error('Choose a timezone from the list.');
	const interval = input.teeIntervalMinutes ?? 10;
	if (!Number.isInteger(interval) || interval < 1 || interval > 240)
		throw new Error('Use a tee interval from 1 to 240 whole minutes.');
	if (!input.groups.length || input.groups.length > 64)
		throw new Error('Choose the event groups before scheduling.');
	const lastDay = input.multiDay ? (input.endDate ?? '') : input.date;
	let previousLast = -Infinity;
	const rounds = input.rounds.map((round, index) => {
		const first = round.teeStartLocal ?? '';
		if (!first) throw new Error(`Choose the first group's date and time for Round ${index + 1}.`);
		const times = generateTeeTimes(first, interval, input.groups.length, input.teeTimeZone!);
		const firstDay = first.slice(0, 10),
			finalDay = teeLocal(times[times.length - 1], input.teeTimeZone!).slice(0, 10);
		if (firstDay < input.date || finalDay > lastDay)
			throw new Error(
				`Round ${index + 1} tee times must stay within the event's selected local dates.`
			);
		if (Date.parse(times[0]) <= previousLast)
			throw new Error(
				'Start the next round after all groups have teed off in the preceding round. Allow enough playing time as well.'
			);
		previousLast = Date.parse(times[times.length - 1]);
		return { ...round, teeStartsAt: times[0] };
	});
	return { ...input, teeIntervalMinutes: interval, rounds };
}
