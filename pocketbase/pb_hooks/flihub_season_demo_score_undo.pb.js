/// <reference path="../pb_data/types.d.ts" />
routerAdd(
	'POST',
	'/api/flihub/demo/organizations/{org}/seasons/{season}/events/{event}/undo-scores',
	(e) => {
		if ($os.getenv('FLIHUB_DEMO_FANTASY') !== '1' || !$os.getenv('CODESPACE_NAME'))
			throw new ForbiddenError(
				'Start local PocketBase with FLIHUB_DEMO_FANTASY=1 to undo demo scores.'
			);

		const org = e.request.pathValue('org');
		const season = e.request.pathValue('season');
		const eventId = e.request.pathValue('event');
		const user = e.auth.id;
		let removed = 0;
		let locked = 0;
		e.app.runInTransaction((app) => {
			const scope = { org, event: eventId };
			const [membership] = app.findRecordsByFilter(
				'memberships',
				'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
				'',
				1,
				0,
				{ org, user }
			);
			if (!membership) throw new ForbiddenError('Owner or Admin access required.');
			const organization = app.findRecordById('organizations', org);
			const capabilities = JSON.parse(organization.getString('capabilities') || '[]');
			if (!capabilities.includes('scoring-results'))
				throw new ForbiddenError('Scoring & official results is disabled.');
			const event = app.findRecordById('events', eventId);
			if (
				event.getString('organization') !== org ||
				event.getString('season') !== season ||
				event.getString('status') === 'archived'
			)
				throw new NotFoundError('Event not found in this season.');
			if (
				app.findRecordsByFilter(
					'event_results',
					'organization = {:org} && event = {:event}',
					'',
					1,
					0,
					scope
				).length
			)
				throw new BadRequestError('Use the correction workflow for events with official results.');

			const cards = app.findRecordsByFilter(
				'scorecards',
				'organization = {:org} && event = {:event}',
				'',
				0,
				0,
				scope
			);
			const changes = app.findCollectionByNameOrId('score_changes');
			for (const card of cards) {
				const scores = app.findRecordsByFilter(
					'scores',
					'scorecard = {:card} && seasonDemoGenerated = true',
					'',
					0,
					0,
					{ card: card.id }
				);
				if (!scores.length) continue;
				const submitted = app.findRecordsByFilter(
					'score_changes',
					'scorecard = {:card} && action = "submitted"',
					'',
					1,
					0,
					{ card: card.id }
				);
				if (card.getString('status') !== 'draft' || submitted.length) {
					locked += scores.length;
					continue;
				}
				for (const score of scores) {
					const change = new Record(changes);
					change.set('organization', org);
					change.set('event', eventId);
					change.set('scorecard', card.id);
					change.set('athlete', score.getString('athlete'));
					change.set('hole', score.getString('hole'));
					change.set('action', 'demo_undone');
					change.set('prevStrokes', score.getInt('strokes'));
					change.set('author', user);
					app.save(change);
					app.delete(score);
					removed++;
				}
			}
		});
		return e.json(200, { removed, locked });
	},
	$apis.requireAuth('users')
);
