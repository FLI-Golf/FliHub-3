routerAdd(
	'POST',
	'/api/flihub/organizations/{org}/events/{event}/playoff',
	(e) => {
		const org = e.request.pathValue('org');
		const event = e.request.pathValue('event');
		const body = e.requestInfo().body || {};
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM.
		const { podiumTie, measureAttempt } = require(`${__hooks}/playoff_rules.js`);
		let outcome;
		let rejection;
		try {
			e.app.runInTransaction((app) => {
				const reject = (status, message) => {
					rejection = { status, message };
					throw new Error(message);
				};
				const members = app.findRecordsByFilter('memberships',
					'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
					'', 1, 0, { org, user: e.auth.id });
				if (!members.length) reject(403, 'Only Owners and Admins can record playoffs.');
				const scope = { org, event };
				const [result] = app.findRecordsByFilter('event_results',
					'organization = {:org} && event = {:event}', '', 1, 0, scope);
				if (!result || result.getString('status') !== 'published' ||
					result.getInt('publishedVersion') !== body.version || body.version < 1)
					reject(409, 'Refresh and use the current published result.');
				const version = app.findFirstRecordByFilter('result_versions',
					'result = {:id} && version = {:version}', { id: result.id, version: body.version });
				const saved = String(version.get('playoffAttempts') ?? '');
				const attempts = saved && saved !== 'null' ? JSON.parse(saved) : [];
				if (attempts.length >= 100) reject(400, 'The shootout has reached the attempt limit.');
				if (attempts.length !== body.attemptCount || attempts.some((attempt) => attempt.winner))
					reject(409, 'The playoff changed. Refresh the result.');
				const totals = JSON.parse(String(version.get('totals')));
				const tie = podiumTie(totals.teams);
				if (!tie) reject(400, 'A tie for first or second is required.');
				try {
					const lastRound = totals.rounds?.[totals.rounds.length - 1];
					const lastHole = lastRound?.holes?.[lastRound.holes.length - 1]?.hole;
					const lineup = totals.hasInjuryHandoff
						? totals.athletes.filter((row) => lastHole && row.roundScores?.[lastRound.round]?.[lastHole] !== undefined)
						: totals.athletes;
					outcome = measureAttempt(tie, lineup, body.entries, attempts);
				} catch (error) {
					reject(400, error.message);
				}
				attempts.push({ ...outcome, author: e.auth.id, recordedAt: new Date().toISOString() });
				version.set('playoffAttempts', attempts);
				app.save(version);
			});
		} catch (error) {
			if (rejection) return e.json(rejection.status, { message: rejection.message });
			throw error;
		}
		return e.json(200, { winner: outcome.winner });
	},
	$apis.requireAuth('users')
);
