// Commissioner-only transitions. The clock freezes on the server, not in a browser tab.
routerAdd(
	'POST',
	'/api/flihub/fantasy/drafts/{id}/clock',
	(e) => {
		const operation = String((e.requestInfo().body || {}).operation ?? '');
		if (!['pause', 'resume'].includes(operation))
			throw new BadRequestError('Choose pause or resume.');
		const draftId = String(e.request.pathValue('id') ?? '');
		let result;
		e.app.runInTransaction((app) => {
			const draft = app.findRecordById('fantasy_drafts', draftId);
			const league = app.findRecordById('fantasy_leagues', draft.getString('league'));
			if (league.getString('owner') !== e.auth.id)
				throw new ForbiddenError('Only the commissioner can pause or resume this draft.');
			// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM requires CommonJS.
			const rules = require(`${__hooks}/fantasy_rules.js`);
			rules.assertBeforeCutoff(app, draft);
			const now = Date.now();
			if (operation === 'pause') {
				if (draft.getString('status') !== 'active')
					throw new BadRequestError('Only a running draft can be paused.');
				const deadline = Date.parse(draft.getString('deadline'));
				const remaining = deadline - now;
				if (
					!Number.isFinite(remaining) ||
					remaining <= 0 ||
					remaining > Number(draft.get('pickSeconds')) * 1000
				) {
					throw new BadRequestError(
						'The pick timer has expired or changed. Refresh the board before pausing.'
					);
				}
				draft.set('pausedRemainingMs', remaining);
				draft.set('deadline', '');
				draft.set('status', 'paused');
			} else {
				if (draft.getString('status') !== 'paused')
					throw new BadRequestError('Only a paused draft can be resumed.');
				const remaining = Number(draft.get('pausedRemainingMs'));
				if (
					!Number.isInteger(remaining) ||
					remaining <= 0 ||
					remaining > Number(draft.get('pickSeconds')) * 1000
				) {
					throw new BadRequestError('The paused timer is invalid.');
				}
				draft.set('deadline', new Date(now + remaining).toISOString());
				draft.set('pausedRemainingMs', 0);
				draft.set('status', 'active');
			}
			app.save(draft);
			result = { status: draft.getString('status') };
		});
		return e.json(200, result);
	},
	$apis.requireAuth()
);
