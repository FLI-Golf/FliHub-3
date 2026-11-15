import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOrganizationNavigationCounts } from '../src/lib/server/organization-navigation-counts.ts';
const context = {
	organizationId: 'organization123',
	userId: 'morgan',
	isMember: true,
	enabled: [
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'events',
		'scoring-results',
		'standings',
		'fantasy',
		'sponsorships'
	]
};
function fixture(values = {}, failures = []) {
	const calls = [],
		filters = [];
	return {
		calls,
		filters,
		pb: {
			filter: (expression, params) => {
				filters.push({ expression, params });
				return expression + JSON.stringify(params);
			},
			collection: (name) => ({
				getList: async (page, perPage, options) => {
					calls.push({ name, page, perPage, options });
					if (failures.includes(name)) throw new Error('forbidden');
					return { totalItems: values[name] ?? 0 };
				}
			})
		}
	};
}
test('missing membership or invalid organization produces no reads', async () => {
	const f = fixture();
	assert.deepEqual(
		await loadOrganizationNavigationCounts(f.pb, { ...context, isMember: false }),
		{}
	);
	assert.deepEqual(
		await loadOrganizationNavigationCounts(f.pb, { ...context, organizationId: 'bad' }),
		{}
	);
	assert.equal(f.calls.length, 0);
});
test('counts remain separate for teams/rosters and leagues/seasons', async () => {
	const f = fixture({ athletes: 28, teams: 12, roster_memberships: 24, leagues: 1, seasons: 2 });
	const counts = await loadOrganizationNavigationCounts(f.pb, context);
	assert.equal(counts.athletes[0].value, 28);
	assert.deepEqual(
		counts.teams.map((item) => item.value),
		[12, 24]
	);
	assert.deepEqual(
		counts['leagues-seasons'].map((item) => item.value),
		[1, 2]
	);
	assert.equal(counts.events[0].value, 0);
});
test('failed or invalid count stays unavailable, never zero', async () => {
	const f = fixture({ teams: -1 }, ['athletes']);
	const counts = await loadOrganizationNavigationCounts(f.pb, context);
	assert.equal(counts.athletes[0].value, null);
	assert.equal(counts.teams[0].value, null);
	assert.equal(counts.events[0].value, 0);
});
test('reads use organization boundaries, identity fields only, and current-user fantasy scope', async () => {
	const f = fixture();
	await loadOrganizationNavigationCounts(f.pb, context);
	for (const call of f.calls) {
		assert.equal(call.page, 1);
		assert.equal(call.perPage, 1);
		assert.equal(call.options.fields, 'id');
		assert.notEqual(call.name, 'athlete_private');
	}
	for (const filter of f.filters) assert.equal(filter.params.org, context.organizationId);
	const fantasy = f.filters.find((item) => item.expression.includes('league.organization'));
	assert.equal(fantasy.params.user, 'morgan');
	assert.match(fantasy.expression, /status != "removed"/);
	assert.match(
		f.filters.find((item) => item.expression.includes('publishedVersion')).expression,
		/event.status != "archived"/
	);
});
test('disabled and planned capabilities do not produce badges or reads', async () => {
	const f = fixture();
	const counts = await loadOrganizationNavigationCounts(f.pb, {
		...context,
		enabled: ['events', 'sponsorships']
	});
	assert.deepEqual(Object.keys(counts).sort(), ['events', 'overview']);
	assert.deepEqual(f.calls.map((item) => item.name).sort(), ['events', 'memberships']);
});
test('shared published-result count is queried only once per page load', async () => {
	const f = fixture();
	const counts = await loadOrganizationNavigationCounts(f.pb, context);
	assert.equal(f.calls.filter((item) => item.name === 'event_results').length, 1);
	assert.equal(counts.standings[0].value, counts['scoring-results'][1].value);
});

test('nine physical holes with Red and Blue positions stay nine physical holes', async () => {
	const f = fixture({ courses: 1, course_holes: 9, hole_positions: 9 });
	const counts = await loadOrganizationNavigationCounts(f.pb, context);
	assert.deepEqual(
		counts['venues-courses'].map((item) => [item.shortLabel, item.value]),
		[
			['Courses', 1],
			['Physical holes', 9],
			['Red', 9],
			['Blue', 9]
		]
	);
	assert.equal(counts['venues-courses'][2].tone, 'red');
	assert.equal(counts['venues-courses'][3].group, 'positions');
	const positions = f.filters.filter((item) => item.params.position);
	assert.deepEqual(positions.map((item) => item.params.position).sort(), ['Blue', 'Red']);
	for (const filter of positions) {
		assert.equal(filter.params.org, context.organizationId);
		assert.match(filter.expression, /hole.status != "archived"/);
		assert.match(filter.expression, /hole.course.status != "archived"/);
	}
	assert.match(
		f.filters.find((item) => item.expression.includes('course.status') && !item.params.position)
			.expression,
		/course.status != "archived"/
	);
});
test('missing course positions show zero while failed reads stay unavailable', async () => {
	const empty = fixture({ courses: 1, course_holes: 9 });
	const emptyCounts = await loadOrganizationNavigationCounts(empty.pb, context);
	assert.deepEqual(
		emptyCounts['venues-courses'].slice(2).map((item) => item.value),
		[0, 0]
	);
	const failed = fixture({ courses: 1, course_holes: 9 }, ['hole_positions']);
	const failedCounts = await loadOrganizationNavigationCounts(failed.pb, context);
	assert.deepEqual(
		failedCounts['venues-courses'].map((item) => item.value),
		[1, 9, null, null]
	);
});
test('disabling courses skips all physical-hole and position queries', async () => {
	const f = fixture();
	const counts = await loadOrganizationNavigationCounts(f.pb, { ...context, enabled: ['events'] });
	assert.equal(counts['venues-courses'], undefined);
	assert.ok(
		!f.calls.some((call) => ['courses', 'course_holes', 'hole_positions'].includes(call.name))
	);
});
