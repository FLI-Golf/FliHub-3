/// <reference path="../pb_data/types.d.ts" />
// Read-only preview for the same totals and completeness rules used at approval.
routerAdd(
	'GET',
	'/api/flihub/organizations/{org}/events/{event}/result-preview',
	(e) => {
		const org = e.request.pathValue('org');
		const eventId = e.request.pathValue('event');
		const [membership] = e.app.findRecordsByFilter(
			'memberships',
			'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
			'', 1, 0, { org, user: e.auth.id }
		);
		if (!membership) throw new ForbiddenError('Owner or Admin access required.');
		const event = e.app.findRecordById('events', eventId);
		if (event.getString('organization') !== org) throw new NotFoundError('Event not found.');
		const organization = e.app.findRecordById('organizations', org);
		const capabilities = JSON.parse(organization.getString('capabilities') || '[]');
		if (!capabilities.includes('scoring-results'))
			throw new ForbiddenError('Scoring & official results is disabled.');

		const totals = require(`${__hooks}/result_snapshot_rules.js`).computeEventTotals(e.app, eventId);
		return e.json(200, {
			teams: totals.teams.map(({ entry, teamName, total }) => ({ entry, teamName, total }))
		});
	},
	$apis.requireAuth('users')
);
