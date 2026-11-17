/// <reference path="../pb_data/types.d.ts" />
routerAdd(
	'POST',
	'/api/flihub/organizations/{id}/guided-event',
	(e) => {
		const orgId = e.request.pathValue('id');
		if (!/^[a-z0-9]{15}$/.test(orgId)) return e.json(404, { message: 'Organization not found.' });
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM uses require
		const { createGuidedEvent } = require(`${__hooks}/guided_event_setup_rules.js`);
		let result;
		let rejection;
		try {
			e.app.runInTransaction((app) => {
				try {
					result = createGuidedEvent(app, orgId, e.auth.id, e.requestInfo().body || {});
				} catch (error) {
					// Preserve a safe validation response across the transaction's Go/JS boundary.
					if (error.guidedSetupError) rejection = { status: error.status, message: error.message };
					throw error;
				}
			});
		} catch (err) {
			if (rejection)
				return e.json(rejection.status, {
					code: 'guided_setup_rejected',
					message: rejection.message
				});
			throw err;
		}
		return e.json(200, result);
	},
	$apis.requireAuth()
);
