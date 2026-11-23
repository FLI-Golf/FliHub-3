import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { placeShares, tournamentAwards } from '../src/lib/standings-payouts.ts';

const module = { exports: {} };
runInNewContext(
	readFileSync(new URL('../pocketbase/pb_hooks/playoff_rules.js', import.meta.url), 'utf8'),
	{ module }
);
const { podiumTie, measureAttempt } = module.exports;

function event(totals) {
	const teams = totals.map((total, i) => ({ entry: String(i), total }));
	return {
		event: 'demo',
		eventName: 'Tie test event',
		purseCents: 78260869,
		teams,
		athletes: teams.flatMap(({ entry }) => [0, 1].map((i) => ({ entry, athlete: `${entry}-${i}` })))
	};
}

for (const [place, totals] of [
	[1, [117, 117, 123]],
	[2, [110, 117, 117]],
	[3, [110, 112, 117, 117]]
]) {
	test(`payouts for a tie at place ${place}`, () => {
		const data = event(totals);
		const shares = placeShares(data.purseCents, totals.length, 0, 20);
		const pending = tournamentAwards(data, 0, 20);
		if (place === 3) {
			assert.equal(podiumTie(data.teams), null);
			assert.equal(pending.held, 0);
			return;
		}
		assert.equal(podiumTie(data.teams).place, place);
		assert.equal(pending.held, 2 * (shares[place - 1] + shares[place]));
		if (place === 2)
			assert.equal(pending.awards.find((award) => award.entry === '0').perPro, shares[0]);
		const paid = tournamentAwards({ ...data, playoffWinner: String(place) }, 0, 20);
		assert.equal(paid.held, 0);
		assert.equal(
			paid.awards.find((award) => award.entry === String(place)).perPro,
			shares[place - 1]
		);
		assert.equal(
			paid.awards.find((award) => award.entry === String(place - 1)).perPro,
			shares[place]
		);
	});
}

test('mixed units compare exactly and equal distances leave the purse held', () => {
	const data = event([117, 117, 123]);
	const tie = podiumTie(data.teams);
	const throwsFor = (entry, distance, unit) => ({
		entry,
		throws: [0, 1].map((i) => ({ athlete: `${entry}-${i}`, distance, unit }))
	});
	const equal = measureAttempt(tie, data.athletes, [
		throwsFor('0', '3', 'feet'),
		throwsFor('1', '1', 'yards')
	]);
	assert.equal(equal.winner, null);
	assert.ok(tournamentAwards({ ...data, playoffWinner: equal.winner }, 0).held > 0);
	const decisive = measureAttempt(tie, data.athletes, [
		throwsFor('0', '0.914', 'meters'),
		throwsFor('1', '1', 'yards')
	]);
	assert.equal(decisive.winner, '0');
	assert.throws(() =>
		measureAttempt(tie, data.athletes, [
			throwsFor('0', '1.0001', 'feet'),
			throwsFor('1', '1', 'yards')
		])
	);
});

test('matches the published Tie test event baseline', () => {
	const data = event([117, 117, 123, 126, 131, 132, 133, 134, 134, 137, 138, 141]);
	assert.equal(tournamentAwards(data, 0, 20).held, 21732894);
	const paid = tournamentAwards({ ...data, playoffWinner: '1' }, 0, 20);
	assert.equal(paid.held, 0);
	assert.equal(paid.awards.find((award) => award.entry === '1').perPro, 5653853);
	assert.equal(paid.awards.find((award) => award.entry === '0').perPro, 5212594);
});

for (const place of [1, 2]) {
	test(`multi-team playoff for place ${place} preserves separated positions`, () => {
		const data = event(
			place === 1 ? [120, 120, 120, 120, 120, 120, 121] : [119, 120, 120, 120, 120, 120, 121]
		);
		const tie = podiumTie(data.teams);
		const entries = tie.teams.map((team) => team.entry);
		const shots = (entry, feet) => ({
			entry,
			throws: [0, 1].map((i) => ({
				athlete: `${entry}-${i}`,
				distance: String(feet),
				unit: 'feet'
			}))
		});
		const first = measureAttempt(
			tie,
			data.athletes,
			entries.map((entry, index) => shots(entry, [8, 8, 9, 10, 10, 11][index]))
		);
		assert.equal(first.winner, null);
		assert.ok(tournamentAwards(data, 0).held > 0);
		const retry = [
			shots(entries[0], 30),
			shots(entries[1], 20),
			shots(entries[3], 2),
			shots(entries[4], 1)
		];
		assert.throws(() =>
			measureAttempt(tie, data.athletes, [...retry, shots(entries[2], 1)], [first])
		);
		const resolved = measureAttempt(tie, data.athletes, retry, [first]);
		const order = Array.from(resolved.bands.flat());
		assert.deepEqual(order, [
			entries[1],
			entries[0],
			entries[2],
			entries[4],
			entries[3],
			...entries.slice(5)
		]);
		const paid = tournamentAwards({ ...data, playoffOrder: order }, 0);
		const shares = placeShares(data.purseCents, data.teams.length, 0);
		assert.equal(paid.held, 0);
		for (const [index, entry] of order.entries()) {
			assert.equal(
				paid.awards.find((award) => award.entry === entry).perPro,
				shares[place - 1 + index]
			);
		}
		if (place === 2)
			assert.equal(paid.awards.find((award) => award.entry === '0').perPro, shares[0]);
	});
}
