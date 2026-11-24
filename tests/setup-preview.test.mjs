import test from 'node:test';
import assert from 'node:assert/strict';
import { activities, blankSelection, choicesFor, reconcile } from '../src/lib/setup/preview.ts';

test('every activity offers a complete path to review', () => {
	for (const activity of activities) {
		let selection = { ...blankSelection, activity: activity.id };
		for (const field of ['format', 'competitors', 'result']) {
			const choices = choicesFor(selection, field);
			assert.ok(choices.length, `${activity.id}: missing ${field}`);
			selection = reconcile({ ...selection, [field]: choices[0].id });
		}
		assert.deepEqual(reconcile(selection), selection);
	}
});
test('switching bowling league to race clears pins and retains compatible answers', () => {
	const next = reconcile({
		activity: 'running',
		format: 'league',
		competitors: 'individual',
		result: 'pins'
	});
	assert.deepEqual(next, {
		activity: 'running',
		format: 'league',
		competitors: 'individual',
		result: ''
	});
	assert.deepEqual(
		choicesFor(next, 'result').map((item) => item.id),
		['time']
	);
});
test('switching race to pageant clears incompatible format and downstream answers', () => {
	assert.deepEqual(
		reconcile({ activity: 'pageant', format: 'league', competitors: 'relay', result: 'time' }),
		{ activity: 'pageant', format: '', competitors: '', result: '' }
	);
});
test('animals and vehicles are distinct from people in suggested show paths', () => {
	for (const [activity, entry] of [
		['dog-show', 'animal'],
		['car-show', 'vehicle'],
		['pageant', 'contestant']
	]) {
		assert.deepEqual(
			choicesFor({ ...blankSelection, activity, format: 'show' }, 'competitors').map(
				(item) => item.id
			),
			[entry]
		);
	}
});
test('invalid activity cannot retain a stale configuration', () => {
	assert.deepEqual(
		reconcile({ activity: 'forged', format: 'league', competitors: 'team', result: 'points' }),
		blankSelection
	);
});
test('revisiting a compatible configuration preserves all answers', () => {
	const selection = { activity: 'bowling', format: 'league', competitors: 'team', result: 'pins' };
	assert.deepEqual(reconcile(selection), selection);
});

test('CE-2: charity preview offers only the reviewed participation path', () => {
	const selection = {
		activity: 'charity-run-walk',
		format: 'single',
		competitors: 'individual',
		result: 'participation'
	};

	assert.deepEqual(
		choicesFor(selection, 'format').map((item) => item.id),
		['single']
	);

	assert.deepEqual(
		choicesFor(selection, 'competitors').map((item) => item.id),
		['individual']
	);

	assert.equal(choicesFor(selection, 'competitors')[0].label, 'Individual participants');

	assert.deepEqual(
		choicesFor(selection, 'result').map((item) => item.id),
		['participation']
	);

	assert.deepEqual(reconcile(selection), selection);
});

test('CE-2: switching disc golf to charity clears incompatible answers', () => {
	assert.deepEqual(
		reconcile({
			activity: 'charity-run-walk',
			format: 'league',
			competitors: 'team',
			result: 'strokes'
		}),
		{
			activity: 'charity-run-walk',
			format: '',
			competitors: '',
			result: ''
		}
	);
});

test('CE-2: switching competitive running to charity clears timing', () => {
	assert.deepEqual(
		reconcile({
			activity: 'charity-run-walk',
			format: 'single',
			competitors: 'individual',
			result: 'time'
		}),
		{
			activity: 'charity-run-walk',
			format: 'single',
			competitors: 'individual',
			result: ''
		}
	);
});

test('CE-2: switching charity to competitive running clears participation', () => {
	assert.deepEqual(
		reconcile({
			activity: 'running',
			format: 'single',
			competitors: 'individual',
			result: 'participation'
		}),
		{
			activity: 'running',
			format: 'single',
			competitors: 'individual',
			result: ''
		}
	);
});

test('CE-2: charity terminology does not change other activities', () => {
	const selection = {
		activity: 'running',
		format: 'single',
		competitors: 'individual',
		result: 'time'
	};

	assert.equal(
		choicesFor(selection, 'competitors').find((item) => item.id === 'individual').label,
		'Individuals'
	);

	assert.deepEqual(
		choicesFor(selection, 'result').map((item) => item.id),
		['time']
	);
});
