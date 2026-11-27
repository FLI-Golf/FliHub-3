import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import { createIntelligence } from '$lib/server/intelligence/service';
import { syntheticFixtureIds } from '$lib/server/intelligence/application/fixtures';
import { syntheticObjectiveIds } from '$lib/server/intelligence/application/batch';
import { capabilitiesForObjective } from '$lib/server/intelligence/application/capabilities';
import type { Actions, PageServerLoad } from './$types';

const intelligence = createIntelligence(
	{
		FLIHUB_INTELLIGENCE_ENABLED: 'true',
		FLIHUB_INTELLIGENCE_PROVIDER: 'mock',
		FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '10',
		FLIHUB_INTELLIGENCE_CONCURRENCY: '1'
	},
	{
		fetch: async () => {
			throw new Error('External provider access is disabled.');
		}
	}
);

function requirePlaygroundAccess(locals: App.Locals) {
	if (!dev) error(404, 'Not found');
	if (!locals.user || locals.sessionVerified !== true) {
		error(401, 'Verified authentication required');
	}
}

export const load: PageServerLoad = ({ locals }) => {
	requirePlaygroundAccess(locals);

	return {
		objectives: syntheticObjectiveIds(),
		scenarios: syntheticFixtureIds(),
		capabilities: capabilitiesForObjective('prepare_event'),
		limits: {
			requestsPerMinute: 10,
			concurrency: 1,
			historyLimit: 50
		}
	};
};

export const actions = {
	assess: async ({ locals, request, url }) => {
		requirePlaygroundAccess(locals);

		// SvelteKit's framework CSRF check is disabled in development.
		// Require a same-origin submission explicitly for this route.
		if (request.headers.get('origin') !== url.origin) {
			error(403, 'Cross-origin assessment forbidden');
		}

		let form: FormData;

		try {
			form = await request.formData();
		} catch {
			return fail(400, {
				message: 'Invalid assessment form.'
			});
		}
		const keys = [...form.keys()];

		if (keys.length !== 2 || !keys.includes('objectiveId') || !keys.includes('fixtureId')) {
			return fail(400, { message: 'Invalid assessment request.' });
		}

		const objectiveId = form.get('objectiveId');
		const fixtureId = form.get('fixtureId');

		if (
			typeof objectiveId !== 'string' ||
			typeof fixtureId !== 'string' ||
			!syntheticObjectiveIds().some((id) => id === objectiveId) ||
			!syntheticFixtureIds().some((id) => id === fixtureId)
		) {
			return fail(400, { message: 'Select a registered objective and scenario.' });
		}

		const result = await intelligence.adviseApplication({
			objectiveId,
			fixtureId
		});

		return { result, objectiveId, fixtureId };
	}
} satisfies Actions;
