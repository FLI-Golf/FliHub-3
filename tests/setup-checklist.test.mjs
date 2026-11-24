import test from 'node:test';
import assert from 'node:assert/strict';
import { isGuidedDiscGolf, loadSetupChecklist } from '../src/lib/setup/checklist.ts';

const details = {
	guidedSetup: {
		version: 1,
		activity: 'disc-golf',
		format: 'league',
		competitors: 'team',
		result: 'strokes'
	}
};
const context = {
	canManage: true,
	organizationId: 'testorg12345678',
	capabilities: [
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'events',
		'scoring-results',
		'standings'
	],
	creationDetails: details
};
function fixture(counts = {}, rejected = []) {
	const calls = [];
	return {
		calls,
		pb: {
			filter: (expression, params) => {
				assert.equal(expression, 'organization = {:org} && status != "archived"');
				assert.equal(params.org, context.organizationId);
				return `organization = "${params.org}" && status != "archived"`;
			},
			collection: (name) => ({
				getList: async (page, perPage, options) => {
					calls.push({ name, page, perPage, options });
					if (rejected.includes(name)) throw new Error('read unavailable');
					return { totalItems: counts[name] ?? 0 };
				}
			})
		}
	};
}
test('recognizes only the supported creation provenance, including serialized details', () => {
	assert.ok(isGuidedDiscGolf(details));
	assert.ok(isGuidedDiscGolf(JSON.stringify(details)));
	for (const value of [
		null,
		'{invalid',
		{ template: 'league' },
		{ guidedSetup: { ...details.guidedSetup, activity: 'running' } },
		{ guidedSetup: { ...details.guidedSetup, competitors: 'individual' } }
	])
		assert.equal(isGuidedDiscGolf(value), false);
});
test('non-management callers get no checklist and trigger no queries', async () => {
	const { pb, calls } = fixture();
	assert.equal(await loadSetupChecklist(pb, { ...context, canManage: false }), null);
	assert.deepEqual(calls, []);
});
test('legacy organizations are not guessed to be disc golf from a League template', async () => {
	const { pb, calls } = fixture();
	assert.equal(
		await loadSetupChecklist(pb, { ...context, creationDetails: { template: 'league' } }),
		null
	);
	assert.deepEqual(calls, []);
});
test('every count is scoped to this organization and excludes archived records', async () => {
	const { pb, calls } = fixture();
	const result = await loadSetupChecklist(pb, context);
	assert.equal(result.steps.length, 7);
	assert.equal(calls.length, 13);
	for (const call of calls) {
		assert.equal(call.page, 1);
		assert.equal(call.perPage, 1);
		assert.equal(call.options.fields, 'id');
		assert.equal(
			call.options.filter,
			`organization = "${context.organizationId}" && status != "archived"`
		);
		assert.notEqual(call.name, 'athlete_private');
	}
	assert.ok(result.steps.every((step) => step.state === 'empty'));
});
test('disabled capability dependencies do not issue affected collection reads', async () => {
	const { pb, calls } = fixture();
	const result = await loadSetupChecklist(pb, {
		...context,
		capabilities: context.capabilities.filter((item) => item !== 'teams')
	});
	assert.equal(result.steps.find((step) => step.id === 'rosters').state, 'disabled');
	assert.equal(result.steps.find((step) => step.id === 'operations').state, 'disabled');
	assert.ok(
		!calls.some((call) =>
			['teams', 'season_entries', 'roster_memberships', 'group_athletes'].includes(call.name)
		)
	);
});
test('failed count reads stay unknown rather than becoming zero or complete', async () => {
	const { pb } = fixture({ leagues: 2 }, ['seasons']);
	const result = await loadSetupChecklist(pb, context);
	const step = result.steps.find((item) => item.id === 'structure');
	assert.equal(step.state, 'unknown');
	assert.deepEqual(step.counts, [
		{ label: 'Leagues', count: 2 },
		{ label: 'Seasons', count: null }
	]);
});
test('positive counts are presence hints, never event readiness', async () => {
	const { pb } = fixture({ leagues: 1, seasons: 1 });
	const result = await loadSetupChecklist(pb, context);
	const step = result.steps.find((item) => item.id === 'structure');
	assert.ok(step);
	assert.equal(step.state, 'started');
	assert.ok(!result.steps.some((step) => step.state === 'complete'));
});
test('malformed totalItems cannot become a false presence or absence claim', async () => {
	const { pb } = fixture({ leagues: -1, seasons: '2' });
	const result = await loadSetupChecklist(pb, context);
	const step = result.steps.find((item) => item.id === 'structure');
	assert.ok(step);
	assert.equal(step.state, 'unknown');
	assert.ok(step.counts.every((item) => item.count === null));
});

test('charity guided creation does not trigger the disc golf checklist', async () => {
	const { pb, calls } = fixture();

	const result = await loadSetupChecklist(pb, {
		...context,
		capabilities: [],
		creationDetails: {
			profile: 'charity-run-walk',
			guidedSetup: {
				version: 1,
				activity: 'charity-run-walk',
				format: 'single',
				competitors: 'individual',
				result: 'participation'
			}
		}
	});

	assert.equal(result, null);
	assert.deepEqual(calls, []);
});
