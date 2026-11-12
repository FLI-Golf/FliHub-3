/** Approval-time scoring snapshots. No current-course fallback for old versions. */

function blocked(message) {
	throw new BadRequestError('approval_blocked: ' + message);
}

function positiveInteger(value, label) {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		blocked(label + ' must be a positive integer.');
	}
	return value;
}

// Stable pagination avoids silently truncating large events.
function allRows(app, collection, filter, params) {
	const rows = [];
	const ids = new Set();
	for (let offset = 0; ; offset += 500) {
		const page = app.findRecordsByFilter(collection, filter, 'id', 500, offset, params);
		for (const row of page) {
			if (ids.has(row.id)) blocked('Duplicate records while reading ' + collection + '.');
			ids.add(row.id);
			rows.push(row);
		}
		if (page.length < 500) return rows;
	}
}

function same(record, field, expected, label) {
	if (record.getString(field) !== expected) blocked(label + ' has an invalid ' + field + '.');
}

function computeEventTotals(app, eventId) {
	const event = app.findRecordById('events', eventId);
	const orgId = event.getString('organization');
	const rounds = allRows(app, 'rounds', "event = {:event} && status = 'active'", {
		event: eventId
	});
	rounds.sort(
		(a, b) => Number(a.get('number')) - Number(b.get('number')) || a.id.localeCompare(b.id)
	);
	if (!rounds.length) blocked('The event has no active rounds to approve.');
	const groups = allRows(app, 'event_groups', "event = {:event} && status = 'active'", {
		event: eventId
	});
	if (!groups.length) blocked('The event has no active groups to approve.');
	const roundIds = new Set(rounds.map((r) => r.id));
	const groupIds = new Set(groups.map((g) => g.id));
	const roundSnapshots = [];
	const holesByRound = new Map();
	const courseCache = new Map();
	for (const round of rounds) {
		same(round, 'organization', orgId, 'Round');
		const courseId = round.getString('course');
		if (!courseId) blocked('Round ' + round.get('number') + ' has no course.');
		if (!courseCache.has(courseId)) {
			const course = app.findRecordById('courses', courseId);
			same(course, 'organization', orgId, 'Course');
			const holes = allRows(app, 'course_holes', "course = {:course} && status = 'active'", {
				course: courseId
			});
			if (!holes.length) blocked('The round course has no active holes.');
			const numbers = new Set();
			const snapshot = holes
				.map((hole) => {
					same(hole, 'organization', orgId, 'Hole');
					const number = positiveInteger(hole.get('number'), 'Hole number');
					if (numbers.has(number)) blocked('Duplicate active hole numbers.');
					numbers.add(number);
					return {
						hole: hole.id,
						number,
						name: hole.getString('name'),
						par: positiveInteger(hole.get('par'), 'Hole par')
					};
				})
				.sort((a, b) => a.number - b.number);
			courseCache.set(courseId, snapshot);
		}
		const holes = courseCache.get(courseId).map((h) => ({ ...h }));
		holesByRound.set(round.id, new Map(holes.map((h) => [h.hole, h])));
		roundSnapshots.push({
			round: round.id,
			number: positiveInteger(round.get('number'), 'Round number'),
			name: round.getString('name'),
			positionLabel: round.getString('positionLabel'),
			course: courseId,
			holes,
			holeCount: holes.length,
			par: holes.reduce((sum, h) => sum + h.par, 0)
		});
	}
	for (const group of groups) same(group, 'organization', orgId, 'Group');
	const assignments = allRows(app, 'group_athletes', "event = {:event} && status = 'active'", {
		event: eventId
	}).filter((ga) => groupIds.has(ga.getString('group')));
	const athleteById = new Map();
	const athletesByGroup = new Map(groups.map((g) => [g.id, new Map()]));
	const entries = new Map();
	for (const ga of assignments) {
		same(ga, 'organization', orgId, 'Athlete assignment');
		const athleteId = ga.getString('athlete');
		if (athleteById.has(athleteId))
			blocked('An athlete is assigned more than once in the active groups.');
		const athlete = app.findRecordById('athletes', athleteId);
		same(athlete, 'organization', orgId, 'Athlete');
		const entryId = ga.getString('entry');
		if (!entries.has(entryId)) {
			const entry = app.findRecordById('season_entries', entryId);
			same(entry, 'organization', orgId, 'Season entry');
			if (event.getString('season'))
				same(entry, 'season', event.getString('season'), 'Season entry');
			const team = app.findRecordById('teams', entry.getString('team'));
			same(team, 'organization', orgId, 'Team');
			entries.set(entryId, team.getString('name'));
		}
		const row = {
			athlete: athleteId,
			athleteName: (athlete.getString('firstName') + ' ' + athlete.getString('lastName')).trim(),
			entry: entryId,
			teamName: entries.get(entryId),
			roundTotals: {},
			roundPars: {},
			roundScores: {},
			roundToPar: {},
			total: 0,
			par: 0,
			scoreToPar: 0,
			complete: true
		};
		athleteById.set(athleteId, row);
		athletesByGroup.get(ga.getString('group')).set(athleteId, row);
	}
	for (const members of athletesByGroup.values()) {
		if (!members.size) blocked('An active group has no assigned athletes.');
	}
	const cards = allRows(app, 'scorecards', 'event = {:event}', {
		event: eventId
	});
	const cardByKey = new Map();
	for (const card of cards) {
		if (!roundIds.has(card.getString('round')) || !groupIds.has(card.getString('group'))) continue;
		same(card, 'organization', orgId, 'Scorecard');
		const key = card.getString('round') + '|' + card.getString('group');
		if (cardByKey.has(key)) blocked('Duplicate active round/group scorecards.');

		cardByKey.set(key, card);
	}
	let incompleteCards = 0;
	for (const round of rounds) {
		for (const group of groups) {
			const card = cardByKey.get(round.id + '|' + group.id);
			if (!card || card.getString('status') !== 'submitted') {
				incompleteCards++;
			}
		}
	}
	if (incompleteCards > 0) {
		blocked(
			incompleteCards +
				' of ' +
				rounds.length * groups.length +
				' scorecards are not submitted. Missing scores never count as zero.'
		);
	}

	const cells = new Map();
	const scores = allRows(app, 'scores', 'event = {:event}', { event: eventId });
	for (const score of scores) {
		const roundId = score.getString('round');
		const groupId = score.getString('group');
		// Retired rounds/groups do not contribute to this new result version.
		if (!roundIds.has(roundId) || !groupIds.has(groupId)) continue;
		same(score, 'organization', orgId, 'Score');
		const card = cardByKey.get(roundId + '|' + groupId);
		same(score, 'scorecard', card.id, 'Score');
		const row = athletesByGroup.get(groupId).get(score.getString('athlete'));
		if (!row) blocked('A score references an athlete outside the required group lineup.');
		same(score, 'entry', row.entry, 'Score');
		const holeId = score.getString('hole');
		if (!holesByRound.get(roundId).has(holeId))
			blocked('A score references a hole outside the active round course.');
		const key = roundId + '|' + row.athlete + '|' + holeId;
		if (cells.has(key)) blocked('Duplicate athlete/round/hole scores.');
		cells.set(key, positiveInteger(score.get('strokes'), 'Strokes'));
	}
	for (const round of roundSnapshots) {
		for (const row of athleteById.values()) {
			let strokes = 0;
			const holeScores = {};
			for (const hole of round.holes) {
				const value = cells.get(round.round + '|' + row.athlete + '|' + hole.hole);
				if (value === undefined)
					blocked('Missing required athlete/round/hole score. Missing scores never count as zero.');
				holeScores[hole.hole] = value;
				strokes += value;
			}
			row.roundTotals[round.round] = strokes;
			row.roundPars[round.round] = round.par;
			row.roundScores[round.round] = holeScores;
			row.roundToPar[round.round] = strokes - round.par;
			row.total += strokes;
			row.par += round.par;
			row.scoreToPar = row.total - row.par;
			if (!Number.isSafeInteger(row.total) || !Number.isSafeInteger(row.par))
				blocked('Event totals exceed the supported numeric range.');
		}
	}
	const teamsByEntry = new Map();
	for (const row of athleteById.values()) {
		if (!teamsByEntry.has(row.entry))
			teamsByEntry.set(row.entry, {
				entry: row.entry,
				teamName: row.teamName,
				roundTotals: {},
				total: 0
			});
		const team = teamsByEntry.get(row.entry);
		for (const round of roundSnapshots)
			team.roundTotals[round.round] =
				(team.roundTotals[round.round] ?? 0) + row.roundTotals[round.round];
		team.total += row.total;
		if (!Number.isSafeInteger(team.total))
			blocked('Team totals exceed the supported numeric range.');
	}
	return {
		schemaVersion: 2,
		scoringConvention: 'strokes-minus-par',
		complete: true,
		rounds: roundSnapshots,
		teams: Array.from(teamsByEntry.values()).sort((a, b) => a.total - b.total),
		athletes: Array.from(athleteById.values()).sort((a, b) => a.total - b.total)
	};
}

module.exports = { computeEventTotals };
