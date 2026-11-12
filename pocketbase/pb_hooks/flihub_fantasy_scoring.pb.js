routerAdd(
	'GET',
	'/api/flihub/fantasy/organizations/{org}/leagues/{league}/drafts/{draft}/standings',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM requires CommonJS.
		const scoring = require(`${__hooks}/fantasy_scoring_rules.js`);
		let response;
		e.app.runInTransaction((app) => {
			const orgId = String(e.request.pathValue('org'));
			const leagueId = String(e.request.pathValue('league'));
			const draftId = String(e.request.pathValue('draft'));
			const memberships = app.findRecordsByFilter(
				'fantasy_members',
				"league = {:league} && user = {:user} && status = 'approved'",
				'',
				2,
				0,
				{ league: leagueId, user: e.auth.id }
			);
			if (memberships.length !== 1) throw new NotFoundError('Standings not found.');
			let league;
			let draft;
			let event;
			try {
				league = app.findRecordById('fantasy_leagues', leagueId);
				draft = app.findRecordById('fantasy_drafts', draftId);
				event = app.findRecordById('events', draft.getString('event'));
			} catch {
				throw new NotFoundError('Standings not found.');
			}
			if (
				league.getString('organization') !== orgId ||
				draft.getString('organization') !== orgId ||
				draft.getString('league') !== leagueId ||
				event.getString('organization') !== orgId ||
				(league.getString('season') && league.getString('season') !== event.getString('season'))
			)
				throw new NotFoundError('Standings not found.');
			response = scoring.buildStandings(app, draft, league, event);
		});
		e.response.header().set('Cache-Control', 'private, no-store');
		return e.json(200, response);
	},
	$apis.requireAuth()
);
