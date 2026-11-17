import assert from 'node:assert/strict';
import test from 'node:test';
import { firstUnsubmittedRound, blockingRounds } from '../src/lib/scoring/round-flow.ts';
const rounds = [
	{ id: 'blue', number: 2 },
	{ id: 'red', number: 1 }
];
const submitted = (round, group = 'g1') => ({ round, group, status: 'submitted' });
test('new groups start on the earliest round even when records arrive out of order', () => {
	assert.equal(firstUnsubmittedRound(rounds, [], 'g1'), 'red');
	assert.deepEqual(blockingRounds('blue', 'g1', rounds, []), [1]);
});
test('saved draft scores do not unlock round two before submission', () => {
	const cards = [{ round: 'red', group: 'g1', status: 'draft' }];
	assert.deepEqual(blockingRounds('blue', 'g1', rounds, cards), [1]);
	assert.equal(firstUnsubmittedRound(rounds, cards, 'g1'), 'red');
});
test('submitting round one unlocks and selects round two for that group', () => {
	const cards = [submitted('red')];
	assert.deepEqual(blockingRounds('blue', 'g1', rounds, cards), []);
	assert.equal(firstUnsubmittedRound(rounds, cards, 'g1'), 'blue');
});
test('another group submission cannot unlock this group', () => {
	assert.deepEqual(blockingRounds('blue', 'g1', rounds, [submitted('red', 'g2')]), [1]);
});
test('first round is always available', () =>
	assert.deepEqual(blockingRounds('red', 'g1', rounds, []), []));
test('all submitted rounds leave no pending round', () => {
	assert.equal(firstUnsubmittedRound(rounds, [submitted('red'), submitted('blue')], 'g1'), null);
});
test('previously submitted later cards remain viewable when an earlier card is reopened', () => {
	const cards = [{ round: 'red', group: 'g1', status: 'draft' }, submitted('blue')];
	assert.deepEqual(blockingRounds('blue', 'g1', rounds, cards), []);
	assert.equal(firstUnsubmittedRound(rounds, cards, 'g1'), 'red');
});
test('third round waits for every earlier round in the selected group', () => {
	const three = [...rounds, { id: 'gold', number: 3 }];
	assert.deepEqual(blockingRounds('gold', 'g1', three, []), [1, 2]);
	assert.deepEqual(blockingRounds('gold', 'g1', three, [submitted('red')]), [2]);
});
test('empty round lists have no next round', () =>
	assert.equal(firstUnsubmittedRound([], [], 'g1'), null));
