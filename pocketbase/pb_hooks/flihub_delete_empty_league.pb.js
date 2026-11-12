/// <reference path="../pb_data/types.d.ts" />
routerAdd(
	'POST',
	'/api/flihub/leagues/{id}/delete-empty',
	(e) => {
		e.app.runInTransaction((app) => {
			const league = app.findRecordById('leagues', e.request.pathValue('id'));
			const orgId = league.getString('organization');
			const members = app.findRecordsByFilter(
				'memberships',
				'organization = {:org} && user = {:user}',
				'',
				1,
				0,
				{ org: orgId, user: e.auth.id }
			);
			if (!members.length || !['owner', 'admin'].includes(members[0].getString('role'))) {
				throw new ForbiddenError('Only Owners and Admins can delete empty leagues.');
			}
			const org = app.findRecordById('organizations', orgId);
			const caps = JSON.parse(String(org.get('capabilities') || '[]'));
			if (!Array.isArray(caps) || !caps.includes('leagues-seasons')) {
				throw new BadRequestError('The Leagues & seasons capability is disabled.');
			}
			const seasons = app.findRecordsByFilter('seasons', 'league = {:league}', '', 1, 0, {
				league: league.id
			});
			if (seasons.length) {
				throw new BadRequestError('This league contains seasons and cannot be deleted.');
			}
			app.delete(league);
		});
		return e.json(200, { deleted: true });
	},
	$apis.requireAuth()
);
