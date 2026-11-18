/// <reference path="../pb_data/types.d.ts" />
routerAdd(
	'POST',
	'/api/flihub/demo/events/{id}/randomize-groups',
	(e) => {
		if ($os.getenv('FLIHUB_DEMO_FANTASY') !== '1' || !$os.getenv('CODESPACE_NAME'))
			throw new ForbiddenError(
				'Test grouping is disabled. Enable FLIHUB_DEMO_FANTASY=1 for local PocketBase in your Codespace.'
			);
		const eventId = e.request.pathValue('id');
		if (!/^[a-z0-9]{15}$/.test(eventId)) throw new NotFoundError('Event not found.');
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM uses require.
		const { randomizeEventGroups } = require(`${__hooks}/test_event_group_rules.js`);
		let result, rejection;
		try {
			e.app.runInTransaction((app) => {
				try {
					result = randomizeEventGroups(app, eventId, e.auth.id);
				} catch (error) {
					if (error.testGroupError) rejection = { status: error.status, message: error.message };
					throw error;
				}
			});
		} catch (error) {
			if (rejection) return e.json(rejection.status, { message: rejection.message });
			throw error;
		}
		return e.json(200, result);
	},
	$apis.requireAuth()
);
