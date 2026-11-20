import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const rulesFile = new URL('../pocketbase/pb_hooks/injury_substitution_rules.js', import.meta.url);
const hookModule = { exports: {} };
runInNewContext(readFileSync(rulesFile, 'utf8'), { module: hookModule }, {
    filename: rulesFile.pathname
});
const rules = hookModule.exports;

const { planInjuryHandoff, splitSlotAward } = rules;
const holes = ['r1:h1', 'r1:h2', 'r1:h3', 'r1:h4', 'r2:h1'];
const lineup = ['calvin', 'ohn'];
const scores = holes.slice(0, 3).flatMap((hole) =>
	lineup.map((athlete) => ({ hole, athlete, strokes: 3 }))
);

function plan(savedScores = scores, reserve = 'elliot') {
	return planInjuryHandoff(holes, lineup, savedScores, 'r1:h4', 'calvin', reserve);
}

test('preserves the original slot through hole 3 and starts the reserve at hole 4', () => {
	const handoff = plan();
	assert.deepEqual(structuredClone(handoff.lineups), [
		{ hole: 'r1:h1', athletes: ['calvin', 'ohn'] },
		{ hole: 'r1:h2', athletes: ['calvin', 'ohn'] },
		{ hole: 'r1:h3', athletes: ['calvin', 'ohn'] },
		{ hole: 'r1:h4', athletes: ['elliot', 'ohn'] },
		{ hole: 'r2:h1', athletes: ['elliot', 'ohn'] }
	]);
	const award = splitSlotAward(10001, handoff.outgoingHoles, handoff.reserveHoles);
	assert.deepEqual({ ...award }, {
		outgoingCents: 6001,
		reserveCents: 4000
	});
});

test('rejects a handoff when any earlier score is missing', () => {
	assert.throws(() => plan(scores.slice(1)), /Complete every score/);
});

test('rejects a handoff if any player has already scored the cutoff hole', () => {
	assert.throws(
		() => plan([...scores, { hole: 'r1:h4', athlete: 'ohn', strokes: 3 }]),
		/next unstarted hole/
	);
});

test('rejects a reserve already playing in the group', () => {
	assert.throws(() => plan(scores, 'ohn'), /reserve outside the lineup/);
});
