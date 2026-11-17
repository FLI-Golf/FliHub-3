import assert from 'node:assert/strict';
import test from 'node:test';
import { cardProgress } from '../src/lib/scoring/card-progress.ts';
const holes = [{ id: 'h1' }, { id: 'h2' }];
const athletes = [{ athlete: 'a1' }, { athlete: 'a2' }];
const scores = () =>
	athletes.flatMap(({ athlete }) =>
		holes.map(({ id: hole }) => ({ round: 'red', group: 'g1', athlete, hole, strokes: 3 }))
	);
const progress = (rows) => cardProgress('red', 'g1', holes, athletes, rows);
test('all four required saved scores complete the card independently of submission', () => {
	assert.deepEqual(progress(scores()), { required: 4, recorded: 4, missing: 0, complete: true });
});
test('one missing score keeps the card incomplete', () => {
	assert.deepEqual(progress(scores().slice(1)), {
		required: 4,
		recorded: 3,
		missing: 1,
		complete: false
	});
});
test('no athletes or holes never counts as complete', () => {
	assert.equal(cardProgress('red', 'g1', [], athletes, []).complete, false);
	assert.equal(cardProgress('red', 'g1', holes, [], []).complete, false);
});
test('another group or round cannot complete this card', () => {
	assert.equal(progress(scores().map((row) => ({ ...row, group: 'g2' }))).recorded, 0);
	assert.equal(progress(scores().map((row) => ({ ...row, round: 'blue' }))).recorded, 0);
});
for (const value of [null, 0, -1, 1.5, NaN])
	test(`invalid or missing strokes ${value} do not complete a card`, () => {
		const rows = scores();
		rows[0].strokes = value;
		assert.equal(progress(rows).complete, false);
	});
test('duplicate and unrelated score rows cannot inflate completion', () => {
	const rows = scores().slice(1);
	rows.push(rows[0], { ...rows[0], athlete: 'other' }, { ...rows[0], hole: 'other' });
	assert.equal(progress(rows).recorded, 3);
	assert.equal(progress(rows).complete, false);
});
