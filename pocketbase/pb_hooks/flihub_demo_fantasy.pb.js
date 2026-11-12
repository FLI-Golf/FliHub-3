// Explicitly enabled Codespace-only data for testing fantasy participation.
routerAdd(
	'POST',
	'/api/flihub/demo/fantasy/{id}/fill-participants',
	(e) => {
		if ($os.getenv('FLIHUB_DEMO_FANTASY') !== '1' || !$os.getenv('CODESPACE_NAME')) {
			throw new ForbiddenError(
				'Demo fantasy setup is disabled. Start PocketBase with FLIHUB_DEMO_FANTASY=1 in your Codespace.'
			);
		}
		const password = String((e.requestInfo().body || {}).password ?? '');
		if (password.length < 12 || password.length > 72) {
			throw new BadRequestError('Choose a demo password of 12–72 characters.');
		}
		const leagueId = String(e.request.pathValue('id') ?? '');
		const created = [];
		e.app.runInTransaction((app) => {
			const league = app.findRecordById('fantasy_leagues', leagueId);
			if (league.getString('owner') !== e.auth.id) {
				throw new ForbiddenError(
					'Only this league commissioner can add demo fantasy participants.'
				);
			}
			const drafts = app.findRecordsByFilter('fantasy_drafts', 'league = {:league}', '', 1, 0, {
				league: leagueId
			});
			if (drafts.length)
				throw new BadRequestError('Add demo participants before creating any drafts.');
			const seats = app
				.findRecordsByFilter('fantasy_members', 'league = {:league}', '', 100, 0, {
					league: leagueId
				})
				.filter((seat) => !['removed', 'declined'].includes(seat.getString('status')));
			if (seats.some((seat) => seat.getString('status') !== 'approved')) {
				throw new BadRequestError(
					'Resolve pending fantasy invitations before filling demo places.'
				);
			}
			const limit = Number(league.get('participantLimit'));
			if (!Number.isInteger(limit) || limit < 2 || limit > 12 || seats.length > limit) {
				throw new BadRequestError(
					'This league has an invalid participant limit or membership count.'
				);
			}
			const names = [
				'Devon',
				'Robin',
				'Avery',
				'Quinn',
				'Riley',
				'Charlie',
				'Cameron',
				'Reese',
				'Jamie',
				'Skyler',
				'Blair'
			];
			const missing = limit - seats.length;
			let added = 0;
			for (let index = 0; index < names.length && added < missing; index++) {
				const email = `fantasy-demo-${leagueId}-${index + 1}@example.com`;
				const existing = app.findRecordsByFilter('users', 'email = {:email}', '', 1, 0, { email });
				if (existing.length) {
					// Never reset or take over an existing account. An already approved
					// participant from a previous run is left untouched.
					if (seats.some((seat) => seat.getString('user') === existing[0].id)) continue;
					throw new BadRequestError(
						'A demo address already exists outside this league membership. No accounts were changed.'
					);
				}
				const user = new Record(app.findCollectionByNameOrId('users'));
				user.set('email', email);
				user.set('name', `${names[index]} (Demo)`);
				user.set('verified', true);
				user.set('emailVisibility', true);
				user.setPassword(password);
				app.save(user);
				const seat = new Record(app.findCollectionByNameOrId('fantasy_members'));
				seat.set('league', leagueId);
				seat.set('user', user.id);
				seat.set('role', 'manager'); // Existing storage enum; UI calls these fantasy participants.
				seat.set('status', 'approved');
				seat.set('invitedBy', e.auth.id);
				app.save(seat);
				created.push({ name: user.getString('name'), email });
				added++;
			}
			if (added !== missing)
				throw new BadRequestError('No unused demo addresses remain for this league.');
		});
		return e.json(200, { created, count: created.length });
	},
	$apis.requireAuth()
);
