import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const module = { exports: {} };
const rules = new URL('../pocketbase/pb_hooks/injury_substitution_rules.js', import.meta.url);
runInNewContext(readFileSync(rules, 'utf8'), { module });
const { splitScoringSlot, splitSlotAward } = module.exports;

const holes = ['r1', 'r2'].flatMap((round) =>
	Array.from({ length: 9 }, (_, index) => `${round}:${index + 1}`)
);

test('Calvin keeps holes 1–4 and Elliot takes hole 5 through round 2', () => {
	const assignments = splitScoringSlot(holes, holes.slice(0, 4), 'r1:5', 'Calvin', 'Elliot');
	assert.equal(assignments.filter(({ athlete }) => athlete === 'Calvin').length, 4);
	assert.equal(assignments.filter(({ athlete }) => athlete === 'Elliot').length, 14);
	assert.equal(assignments[3].athlete, 'Calvin');
	assert.equal(assignments[4].athlete, 'Elliot');
	assert.equal(assignments[9].hole, 'r2:1');
	assert.equal(assignments[9].athlete, 'Elliot');
});

test('a handoff into a hole that already has a group score is rejected', () => {
	assert.throws(
		() => splitScoringSlot(holes, holes.slice(0, 5), 'r1:5', 'Calvin', 'Elliot'),
		/next unstarted hole/
	);
});

test('the 4/14 hole split preserves the full second-place slot award', () => {
	const { outgoingCents, reserveCents } = splitSlotAward(7_094_412, 4, 14);
	assert.equal(outgoingCents, 1_576_536);
	assert.equal(reserveCents, 5_517_876);
	assert.equal(outgoingCents + reserveCents, 7_094_412);
});

test('rounding never creates or loses a cent', () => {
	const { outgoingCents, reserveCents } = splitSlotAward(101, 1, 1);
	assert.equal(outgoingCents, 51);
	assert.equal(reserveCents, 50);
});
