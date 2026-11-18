function reject(message, status = 400) {
	const error = new Error(message);
	error.testGroupError = true;
	error.status = status;
	throw error;
}
function shuffle(values, random = Math.random) {
	const result = [...values];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}
/** Caller must run this operation in a transaction and enforce the demo gate. */
function randomizeEventGroups(app, eventId, actorId, random = Math.random) {
	let event;
	try {
		event = app.findRecordById('events', eventId);
	} catch {
		reject('Event not found.', 404);
	}
	const orgId = event.getString('organization');
	let member;
	try {
		member = app.findFirstRecordByFilter('memberships', 'organization = {:org} && user = {:user}', {
			org: orgId,
			user: actorId
		});
	} catch {
		reject('Event not found.', 404);
	}
	if (!['owner', 'admin'].includes(member.getString('role')))
		reject('Only Owners and Admins can rebuild test groups.', 403);
	if (event.getString('status') !== 'planned' || !event.getString('season'))
		reject('Choose a planned, season-linked event.');
	const organization = app.findRecordById('organizations', orgId);
	let caps = [];
	try {
		caps = JSON.parse(String(organization.get('capabilities') || '[]'));
	} catch {
		/* Invalid configuration grants nothing. */
	}
	if (
		!Array.isArray(caps) ||
		!['events', 'teams', 'athletes', 'leagues-seasons'].every((cap) => caps.includes(cap))
	)
		reject('Enable Events, Teams, Athletes and Leagues & seasons first.');
	const all = (table, filter, params) => {
		const rows = [];
		for (let offset = 0; ; offset += 200) {
			const page = app.findRecordsByFilter(table, filter, 'id', 200, offset, params);
			rows.push(...page);
			if (page.length < 200) return rows;
			if (rows.length > 5000) reject('This setup exceeds the test-group batch limit.');
		}
	};
	// Refuse any started workflow, including empty Draft scorecards and unused drafts.
	for (const table of [
		'scorecards',
		'scores',
		'event_results',
		'fantasy_drafts',
		'substitutions'
	]) {
		if (app.findRecordsByFilter(table, 'event = {:event}', '', 1, 0, { event: eventId }).length)
			reject(
				'Test regrouping is locked: this event already has scoring, an official result, a fantasy draft or substitutions. Use a fresh unscored event.'
			);
	}
	const get = (table, id) => {
		let record;
		try {
			record = app.findRecordById(table, id);
		} catch {
			reject('A selected season record is unavailable.');
		}
		if (record.getString('organization') !== orgId)
			reject('Every setup record must belong to this organization.');
		return record;
	};
	const season = get('seasons', event.getString('season'));
	if (
		!['planned', 'active'].includes(season.getString('status')) ||
		get('leagues', season.getString('league')).getString('status') !== 'active'
	)
		reject('Choose an active league with a planned or active season.');
	const entries = all('season_entries', 'season = {:season} && status = "active"', {
		season: season.id
	});
	if (!entries.length || entries.length > 128)
		reject('This test action supports 1–128 active season team entries.');
	const seen = new Set();
	let males = 0,
		females = 0,
		other = 0;
	const teams = entries.map((entry) => {
		if (
			entry.getString('organization') !== orgId ||
			get('teams', entry.getString('team')).getString('status') !== 'active'
		)
			reject('Correct inactive or cross-organization season team entries first.');
		const roster = all('roster_memberships', 'entry = {:entry} && status = "active"', {
			entry: entry.id
		});
		if (!roster.length)
			reject('Every season team must have an active roster before generating groups.');
		const athletes = roster.map((row) => {
			if (row.getString('organization') !== orgId)
				reject('A roster record belongs to another organization.');
			const athlete = get('athletes', row.getString('athlete'));
			if (athlete.getString('status') !== 'active' || seen.has(athlete.id))
				reject('Roster athletes must be active and assigned to only one selected team.');
			seen.add(athlete.id);
			if (seen.size > 1024) reject('This test action supports at most 1024 athletes.');
			if (athlete.getString('gender') === 'male') males++;
			else if (athlete.getString('gender') === 'female') females++;
			else other++;
			return athlete.id;
		});
		return { entry: entry.id, athletes };
	});
	const oldGroups = all('event_groups', 'event = {:event} && status = "active"', {
		event: eventId
	});
	const oldTeams = all('group_teams', 'event = {:event} && status = "active"', { event: eventId });
	const oldAthletes = all('group_athletes', 'event = {:event} && status = "active"', {
		event: eventId
	});
	for (const row of [...oldGroups, ...oldTeams, ...oldAthletes])
		if (row.getString('organization') !== orgId)
			reject('Existing group records have inconsistent organization ownership.');
	const rounds = all('rounds', 'event = {:event} && status = "active"', { event: eventId }).sort(
		(a, b) => Number(a.get('number')) - Number(b.get('number'))
	);
	const schedules = rounds.map((round) => {
		if (round.getString('organization') !== orgId)
			reject('A round belongs to another organization.');
		const raw = round.get('teeSchedule');
		if (!raw || String(raw) === 'null') return null;
		let schedule;
		try {
			schedule =
				typeof raw === 'object' && Array.isArray(raw.slots) ? raw : JSON.parse(String(raw));
		} catch {
			reject('Fix the existing tee schedule before rebuilding groups.');
		}
		const first = schedule?.slots?.[0]?.startsAt;
		if (
			!first ||
			!Number.isFinite(Date.parse(first)) ||
			new Date(first).toISOString() !== first ||
			typeof schedule.timeZone !== 'string' ||
			!schedule.timeZone ||
			!Number.isInteger(schedule.intervalMinutes) ||
			schedule.intervalMinutes < 1 ||
			schedule.intervalMinutes > 240
		)
			reject('Fix the existing tee schedule before rebuilding groups.');
		return {
			first: Date.parse(first),
			timeZone: schedule.timeZone,
			intervalMinutes: schedule.intervalMinutes
		};
	});
	const groupCount = Math.ceil(teams.length / 2);
	let previousLast = -Infinity;
	for (const schedule of schedules) {
		if (!schedule) continue;
		if (schedule.first <= previousLast)
			reject(
				'Space the round starts farther apart before adding groups: every group must tee off before the next round starts.'
			);
		previousLast = schedule.first + (groupCount - 1) * schedule.intervalMinutes * 60000;
	}
	const ordered = shuffle(teams, random);
	// Archive previous unscored setup records; preserve their history.
	for (const row of [...oldAthletes, ...oldTeams, ...oldGroups]) {
		row.set('status', 'archived');
		app.save(row);
	}
	const save = (table, values) => {
		const row = new Record(app.findCollectionByNameOrId(table));
		for (const key of Object.keys(values)) row.set(key, values[key]);
		app.save(row);
		return row;
	};
	const created = [];
	for (let offset = 0; offset < ordered.length; offset += 2) {
		let group = oldGroups[created.length];
		if (group) {
			group.set('name', `Group ${created.length + 1}`);
			group.set('scorekeeper', actorId);
			group.set('status', 'active');
			app.save(group);
		} else
			group = save('event_groups', {
				organization: orgId,
				event: eventId,
				name: `Group ${created.length + 1}`,
				scorekeeper: actorId,
				status: 'active'
			});
		created.push(group);
		for (const team of ordered.slice(offset, offset + 2)) {
			save('group_teams', {
				organization: orgId,
				event: eventId,
				group: group.id,
				entry: team.entry,
				status: 'active'
			});
			for (const athlete of team.athletes)
				save('group_athletes', {
					organization: orgId,
					event: eventId,
					group: group.id,
					entry: team.entry,
					athlete,
					status: 'active'
				});
		}
	}
	for (const [index, round] of rounds.entries()) {
		const schedule = schedules[index];
		if (!schedule) continue;
		round.set('teeSchedule', {
			timeZone: schedule.timeZone,
			intervalMinutes: schedule.intervalMinutes,
			slots: created.map((group, i) => ({
				group: group.id,
				startsAt: new Date(schedule.first + i * schedule.intervalMinutes * 60000).toISOString()
			}))
		});
		app.save(round);
	}
	return {
		eventId,
		groups: created.length,
		teams: teams.length,
		athletes: seen.size,
		males,
		females,
		other
	};
}
module.exports = { shuffle, randomizeEventGroups };
