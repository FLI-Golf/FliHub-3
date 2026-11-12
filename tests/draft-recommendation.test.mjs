import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const scoringModule = { exports: {} };
vm.runInNewContext(
	readFileSync(new URL('../pocketbase/pb_hooks/fantasy_scoring_rules.js', import.meta.url), 'utf8'),
	{ module: scoringModule, BadRequestError: Error }
);
const module = { exports: {} };
vm.runInNewContext(
	readFileSync(new URL('../pocketbase/pb_hooks/fantasy_rules.js', import.meta.url), 'utf8'),
	{ module, BadRequestError: Error, __hooks: '.', require: () => scoringModule.exports }
);
const rules = module.exports;
function record(id, data) {
	return {
		id,
		get: (key) => data[key],
		getString: (key) => String(data[key] ?? ''),
		getBool: (key) => Boolean(data[key])
	};
}
function fixture(status = 'active', picks = [], currentPick = 1) {
	const draft = record('draft', {
		league: 'league',
		event: 'event',
		status,
		currentPick,
		draftOrder: '["jim","robin"]',
		rankings: '["m2","f2","m1","f1"]'
	});
	const athletes = Object.fromEntries(
		['m1', 'm2', 'f1', 'f2'].map((id) => [
			id,
			record(id, { firstName: id, lastName: 'Athlete', gender: id[0] === 'm' ? 'male' : 'female' })
		])
	);
	const app = {
		findRecordById: (table, id) => {
			if (table === 'fantasy_drafts') return draft;
			if (table === 'athletes') return athletes[id];
			if (table === 'fantasy_leagues') return record('league', { name: 'Test', owner: 'jim' });
			if (table === 'events') return record('event', { name: 'Event' });
			if (table === 'users') return record(id, { name: id });
			throw new Error('No team needed in this fixture');
		},
		findRecordsByFilter: (table) => {
			if (table === 'group_athletes')
				return Object.keys(athletes).map((id) => record(id, { athlete: id }));
			if (table === 'fantasy_picks')
				return picks.map((data, index) =>
					record(`pick${index}`, { pickNumber: index + 1, round: 1, ...data })
				);
			if (table === 'substitutions' || table === 'event_results') return [];
			throw new Error(`Unexpected table ${table}`);
		}
	};
	return { app, draft };
}
test('recommendation follows saved ranking, rather than alphabetical pool order', () => {
	const { app, draft } = fixture();
	const board = rules.buildBoard(app, draft, 'jim');
	assert.equal(board.recommendedAthlete, 'm2');
	assert.equal(board.recommendedAthlete, rules.autoPickAthlete(app, draft, 'jim'));
});
test('recommendation skips athletes already picked', () => {
	const { app, draft } = fixture('active', [{ athlete: 'm2', manager: 'robin' }]);
	assert.equal(rules.buildBoard(app, draft, 'jim').recommendedAthlete, 'f2');
});
test('recommendation respects the current participant gender limit', () => {
	const { app, draft } = fixture('active', [
		{ athlete: 'm1', manager: 'jim' },
		{ athlete: 'm2', manager: 'jim' }
	]);
	assert.equal(rules.buildBoard(app, draft, 'robin').recommendedAthlete, 'f2');
});
test('all viewers see the recommendation for the participant on the clock', () => {
	const { app, draft } = fixture('active', [], 2);
	assert.equal(rules.buildBoard(app, draft, 'jim').draft.onTheClock.user, 'robin');
	assert.equal(
		rules.buildBoard(app, draft, 'jim').recommendedAthlete,
		rules.buildBoard(app, draft, 'robin').recommendedAthlete
	);
});
for (const status of ['ready', 'paused', 'complete']) {
	test(`${status} board has no active recommendation`, () => {
		const { app, draft } = fixture(status);
		assert.equal(rules.buildBoard(app, draft, 'jim').recommendedAthlete, null);
	});
}

test('paused board preserves the current turn but disables manual picks', () => {
	const { app, draft } = fixture('paused');
	const board = rules.buildBoard(app, draft, 'jim');
	assert.equal(board.draft.onTheClock.user, 'jim');
	assert.equal(board.myTurn, false);
	assert.throws(
		() => rules.performPick(app, draft.id, 'jim', 'm2', false, new Date()),
		/draft_not_active/
	);
});
