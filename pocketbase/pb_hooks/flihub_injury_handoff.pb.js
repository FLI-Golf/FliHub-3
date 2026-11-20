onRecordCreateRequest((e) => {
	e.record.set('injuryHandoff', null);
	e.next();
}, 'event_groups');

onRecordUpdateRequest((e) => {
	e.record.set('injuryHandoff', e.record.original().get('injuryHandoff'));
	e.next();
}, 'event_groups');

routerAdd(
	'POST',
	'/api/flihub/organizations/{org}/events/{event}/injury-handoff',
	(e) => {
		if ($os.getenv('FLIHUB_TEST_INJURY_HANDOFF') !== '1') {
			return e.json(404, { message: 'Draft injury handoff testing is disabled.' });
		}
		const org = e.request.pathValue('org');
		const eventId = e.request.pathValue('event');
		const { group: groupId, round: roundId, hole: holeId, outgoing, reserve, reason } =
			e.requestInfo().body || {};
		if (![groupId, roundId, holeId, outgoing, reserve].every(
			(id) => typeof id === 'string' && /^[a-z0-9]{15}$/.test(id)
		) || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
			throw new BadRequestError('Choose the players and starting hole, and enter a reason of up to 500 characters.');
		}
		const { planInjuryHandoff } = require(`${__hooks}/injury_substitution_rules.js`);
		e.app.runInTransaction((app) => {
			const membership = app.findRecordsByFilter('memberships',
				'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
				'', 1, 0, { org, user: e.auth.id });
			if (!membership.length) throw new ForbiddenError('Only Owners and Admins can record an injury handoff.');

			const organization = app.findRecordById('organizations', org);
			const capabilities = JSON.parse(String(organization.get('capabilities') ?? '[]'));
			if (!capabilities.includes('scoring-results')) throw new ForbiddenError('Scoring is disabled.');
			const event = app.findRecordById('events', eventId);
			const group = app.findRecordById('event_groups', groupId);
			if (event.getString('organization') !== org || event.getString('status') === 'archived' ||
				group.getString('organization') !== org || group.getString('event') !== eventId ||
				group.getString('status') !== 'active' || !event.getString('season')) {
				throw new BadRequestError('Choose an active group in a season event.');
			}
			const scope = { event: eventId, group: groupId };
			const handoffs = app.findRecordsByFilter('event_groups', 'event = {:event}', '', 0, 0, scope)
				.map((item) => JSON.parse(String(item.get('injuryHandoff') || 'null')));
			if (JSON.parse(String(group.get('injuryHandoff') || 'null'))) {
				throw new BadRequestError('This group already has an injury handoff.');
			}
			if (app.findRecordsByFilter('event_results', 'event = {:event}', '', 1, 0, scope).length) {
				throw new BadRequestError('An injury handoff requires an event without an approved result.');
			}
			const assignments = app.findRecordsByFilter('group_athletes',
				"event = {:event} && status = 'active'", '', 0, 0, scope);
			const lineup = assignments.filter((item) => item.getString('group') === groupId);
			const outgoingAssignment = lineup.find((item) => item.getString('athlete') === outgoing);
			const reserveRecord = app.findRecordById('athletes', reserve);
			if (!outgoingAssignment || reserveRecord.getString('organization') !== org ||
				reserveRecord.getString('status') !== 'active' ||
				assignments.some((item) => item.getString('athlete') === reserve) ||
				handoffs.some((handoff) => handoff?.reserve === reserve)) {
				throw new BadRequestError('Choose a player in this group and an active reserve who is free for this event.');
			}
			const reserveMembership = app.findRecordsByFilter('reserve_members',
				"season = {:season} && athlete = {:reserve} && status = 'active'",
				'', 1, 0, { season: event.getString('season'), reserve });
			if (!reserveMembership.length) throw new BadRequestError('The replacement needs an active reserve spot this season.');
			const rounds = app.findRecordsByFilter('rounds', "event = {:event} && status = 'active'",
				'number', 0, 0, scope);
			const cards = app.findRecordsByFilter('scorecards', 'group = {:group}', '', 0, 0, scope);
			const cutoffRound = rounds.find((round) => round.id === roundId);
			const firstDraftRound = rounds.find((round) =>
				!cards.some((card) => card.getString('round') === round.id && card.getString('status') === 'submitted'));
			if (firstDraftRound?.id !== roundId) {
				throw new BadRequestError('Choose the first unsubmitted round for this group.');
			}
			const cutoffCard = cards.find((card) => card.getString('round') === roundId);
			if (!cutoffRound || cutoffCard?.getString('status') !== 'draft') {
				throw new BadRequestError('Choose a hole on the current draft scorecard.');
			}
			const holes = rounds.flatMap((round) => app.findRecordsByFilter('course_holes',
				"course = {:course} && status = 'active'", 'number', 0, 0, { course: round.getString('course') })
				.map((hole) => ({ key: round.id + ':' + hole.id, number: hole.getInt('number') })));
			const cutoff = holes.find((hole) => hole.key === roundId + ':' + holeId);
			if (!cutoff) throw new BadRequestError('Choose an active hole on this round.');
			const scores = app.findRecordsByFilter('scores', 'group = {:group}', '', 0, 0, scope)
				.map((score) => ({
					hole: score.getString('round') + ':' + score.getString('hole'),
					athlete: score.getString('athlete'),
					strokes: score.getInt('strokes')
				}));
			try {
				planInjuryHandoff(holes.map((hole) => hole.key),
					lineup.map((item) => item.getString('athlete')), scores, cutoff.key, outgoing, reserve);
			} catch (err) {
				throw new BadRequestError(err.message);
			}
			group.set('injuryHandoff', {
				round: roundId, hole: holeId, roundNumber: cutoffRound.getInt('number'),
				holeNumber: cutoff.number, outgoing, reserve, entry: outgoingAssignment.getString('entry'),
				reason: reason.trim(), author: e.auth.id, recordedAt: new Date().toISOString()
			});
			app.save(group);
		});
		return e.json(200, { saved: true });
	},
	$apis.requireAuth('users')
);
