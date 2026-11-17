const ID = /^[a-z0-9]{15}$/;
const fail = (message, status = 400) => {
	const error = new Error(message);
	error.guidedSetupError = true;
	error.status = status;
	throw error;
};
const validId = (value) => typeof value === 'string' && ID.test(value);
function parseGuidedEvent(input) {
	if (!input || input.version !== 1) fail('Invalid guided event version.');
	const text = (value, max) =>
		typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
	const optionalText = (value, max, label) => {
		if (value === undefined) return '';
		if (typeof value !== 'string' || value.trim().length > max)
			fail(`${label} must be text of at most ${max} characters.`);
		return value.trim();
	};
	const venueName = optionalText(input.venueName, 120, 'Venue name');
	const venueAddress = optionalText(input.venueAddress, 500, 'Venue address');
	const name = text(input.name, 120);
	if (!name || !validId(input.season)) fail('Choose an event name and season.');
	const date = text(input.date, 10);
	const instant = new Date(date + 'T00:00:00.000Z');
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
		!Number.isFinite(instant.getTime()) ||
		instant.toISOString().slice(0, 10) !== date
	)
		fail('Choose a valid event date.');
	if (input.multiDay !== undefined && typeof input.multiDay !== 'boolean')
		fail('Multi-day event must be a boolean.');
	const multiDay = input.multiDay === true;
	const endDate = multiDay ? text(input.endDate, 10) : '';
	let endsAt = '';
	if (multiDay) {
		const end = new Date(endDate + 'T00:00:00.000Z');
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
			!Number.isFinite(end.getTime()) ||
			end.toISOString().slice(0, 10) !== endDate
		)
			fail('Choose a valid end date for the multi-day event.');
		if (endDate <= date) fail('The end date must be after the start date.');
		endsAt = new Date(endDate + 'T23:59:59.999Z').toISOString();
	}
	const idList = (values, limit) => {
		if (
			!Array.isArray(values) ||
			!values.length ||
			values.length > limit ||
			values.some((id) => typeof id !== 'string' || !ID.test(id)) ||
			new Set(values).size !== values.length
		)
			fail('Refresh the setup and review its selected records.');
		return values;
	};
	if (!Array.isArray(input.rounds) || !input.rounds.length || input.rounds.length > 12)
		fail('This wizard supports 1–12 rounds.');
	let timeZone = '',
		intervalMinutes = 10;
	if (input.teeTimeZone !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Shared static IANA names.
		const zones = require(`${__hooks}/tee_time_zones.json`);
		if (typeof input.teeTimeZone !== 'string' || !zones.includes(input.teeTimeZone))
			fail('Choose a supported tee-time timezone.');
		timeZone = input.teeTimeZone;
		intervalMinutes = input.teeIntervalMinutes === undefined ? 10 : input.teeIntervalMinutes;
		if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 240)
			fail('Use a tee interval from 1 to 240 whole minutes.');
	}
	const rounds = input.rounds.map((round, index) => {
		if (!round || !validId(round.course) || !text(round.position, 40))
			fail('Every round needs a course and complete named position.');
		if (typeof round.name !== 'string' || round.name.trim().length > 120)
			fail('Round names must be at most 120 characters.');
		let teeStartsAt = '';
		if (timeZone) {
			const start =
				typeof round.teeStartsAt === 'string' ? new Date(round.teeStartsAt) : new Date(NaN);
			if (!Number.isFinite(start.getTime()) || start.toISOString() !== round.teeStartsAt)
				fail('Every round needs a valid first tee time.');
			teeStartsAt = start.toISOString();
		} else if (round.teeStartsAt || round.teeStartLocal) fail('Choose a timezone for tee times.');
		return {
			teeStartsAt,
			course: round.course,
			position: round.position.trim(),
			name: round.name.trim() || `Round ${index + 1}`,
			holeIds: idList(round.holeIds, 500)
		};
	});
	if (!Array.isArray(input.groups) || !input.groups.length || input.groups.length > 64)
		fail('This wizard supports 1–64 groups.');
	const names = new Set(),
		entries = new Set(),
		athletes = new Set();
	const groups = input.groups.map((group) => {
		if (!group || !text(group.name, 80) || !validId(group.scorekeeper))
			fail('Each group needs a name and authorized scorekeeper.');
		const groupName = group.name.trim();
		if (names.has(groupName)) fail('Group names must be unique.');
		names.add(groupName);
		if (!Array.isArray(group.entries) || !group.entries.length || group.entries.length > 256)
			fail('Every group must contain a season team.');
		return {
			name: groupName,
			scorekeeper: group.scorekeeper,
			entries: group.entries.map((selection) => {
				if (!selection || !validId(selection.entry) || entries.has(selection.entry))
					fail('A season team may be assigned only once.');
				entries.add(selection.entry);
				if (entries.size > 256) fail('This setup exceeds the wizard team batch size.');
				const ids = idList(selection.athletes, 128);
				for (const id of ids) {
					if (athletes.has(id)) fail('An athlete may be assigned only once in this event.');
					athletes.add(id);
					if (athletes.size > 1024) fail('This setup exceeds the wizard athlete batch size.');
				}
				return { entry: selection.entry, athletes: ids };
			})
		};
	});
	if (entries.size > 256 || athletes.size > 1024) fail('This setup exceeds the wizard batch size.');
	if (timeZone) {
		let previousLast = -Infinity;
		for (const round of rounds) {
			const start = Date.parse(round.teeStartsAt);
			if (start <= previousLast)
				fail('Round tee times must follow the preceding round group starts.');
			previousLast = start + (groups.length - 1) * intervalMinutes * 60000;
		}
	}

	return {
		name,
		timeZone,
		intervalMinutes,
		venueName,
		venueAddress,
		season: input.season,
		date,
		startsAt: instant.toISOString(),
		multiDay,
		endDate,
		endsAt,
		rounds,
		groups
	};
}
/** Must execute inside the same transaction as the saves below. */
function createGuidedEvent(app, orgId, actorId, raw) {
	let membership;
	try {
		membership = app.findFirstRecordByFilter(
			'memberships',
			'organization = {:org} && user = {:user}',
			{ org: orgId, user: actorId }
		);
	} catch {
		fail('Organization not found.', 404);
	}
	if (!['owner', 'admin'].includes(membership.getString('role')))
		fail('Only Owners and Admins can create a guided event.', 403);
	const org = app.findRecordById('organizations', orgId);
	let caps = [];
	try {
		caps = JSON.parse(String(org.get('capabilities') ?? '[]'));
	} catch {
		/* No grant from invalid configuration. */
	}
	const required = [
		'events',
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'scoring-results'
	];
	if (!Array.isArray(caps) || !required.every((cap) => caps.includes(cap)))
		fail('Enable the golf event, athlete, team, season, course and scoring capabilities first.');
	const input = parseGuidedEvent(raw);
	const get = (table, id) => {
		let record;
		try {
			record = app.findRecordById(table, id);
		} catch {
			fail('A selected setup record is no longer available. Refresh and review.');
		}
		if (record.getString('organization') !== orgId)
			fail('All selected records must belong to this organization.');
		return record;
	};
	const all = (table, filter, params) => {
		const rows = [];
		for (let offset = 0; ; offset += 200) {
			const page = app.findRecordsByFilter(table, filter, 'id', 200, offset, params);
			rows.push(...page);
			if (page.length < 200) return rows;
			if (rows.length > 5000) fail('This selection is too large for the guided setup.');
		}
	};
	const same = (a, b) =>
		a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));
	const season = get('seasons', input.season);
	if (!['planned', 'active'].includes(season.getString('status')))
		fail('Choose a planned or active season.');
	const league = get('leagues', season.getString('league'));
	if (league.getString('status') !== 'active') fail('The season league must be active.');
	const first = season.getString('startsOn').slice(0, 10),
		last = season.getString('endsOn').slice(0, 10);
	if ((first && input.date < first) || (last && input.date > last))
		fail('The event date must fall within the season dates.');
	if (input.multiDay && ((first && input.endDate < first) || (last && input.endDate > last)))
		fail('The event end date must fall within the season dates.');
	const duplicate = app.findRecordsByFilter(
		'events',
		'organization = {:org} && season = {:season} && name = {:name} && startsAt = {:start}',
		'',
		1,
		0,
		{
			org: orgId,
			season: input.season,
			name: input.name,
			start: input.startsAt.replace('T', ' ')
		}
	);
	if (duplicate.length)
		fail(
			'An event with this name, season and date already exists. Open it instead of submitting again.'
		);
	for (const round of input.rounds) {
		const course = get('courses', round.course);
		if (course.getString('status') !== 'active') fail('Choose an active course.');
		const holes = all('course_holes', 'course = {:course} && status = "active"', {
			course: course.id
		});
		if (
			!same(
				holes.map((row) => row.id),
				round.holeIds
			)
		)
			fail('Course holes changed. Refresh and review the rounds.');
		for (const hole of holes) {
			if (hole.getString('organization') !== orgId)
				fail('A course hole belongs to another organization.');
			const position = app.findRecordsByFilter(
				'hole_positions',
				'organization = {:org} && hole = {:hole} && label = {:label} && status = "active"',
				'',
				1,
				0,
				{ org: orgId, hole: hole.id, label: round.position }
			);
			if (position.length !== 1)
				fail('The selected position must exist on every active course hole.');
		}
	}
	for (const group of input.groups) {
		let keeper;
		try {
			keeper = app.findFirstRecordByFilter(
				'memberships',
				'organization = {:org} && user = {:user}',
				{ org: orgId, user: group.scorekeeper }
			);
		} catch {
			fail('A selected scorekeeper is no longer an organization member.');
		}
		if (!['owner', 'admin', 'scorekeeper'].includes(keeper.getString('role')))
			fail('A Viewer cannot be an operational scorekeeper.');
		for (const selection of group.entries) {
			const entry = get('season_entries', selection.entry);
			if (entry.getString('status') !== 'active' || entry.getString('season') !== input.season)
				fail('Choose active team entries from the selected season.');
			if (get('teams', entry.getString('team')).getString('status') !== 'active')
				fail('A selected team is archived.');
			const roster = all(
				'roster_memberships',
				'organization = {:org} && entry = {:entry} && status = "active"',
				{ org: orgId, entry: entry.id }
			);
			const ids = roster.map((row) => row.getString('athlete'));
			if (!same(ids, selection.athletes))
				fail('A season roster changed. Refresh and review the athlete lineups.');
			for (const id of ids)
				if (get('athletes', id).getString('status') !== 'active')
					fail('A selected athlete is inactive.');
		}
	}
	// Nothing is saved until every selection above has passed current validation.
	const save = (table, values) => {
		const record = new Record(app.findCollectionByNameOrId(table));
		for (const key of Object.keys(values)) record.set(key, values[key]);
		app.save(record);
		return record;
	};
	const event = save('events', {
		organization: orgId,
		season: input.season,
		name: input.name,
		startsAt: input.startsAt,
		endsAt: input.endsAt,
		venueName: input.venueName,
		venueAddress: input.venueAddress,
		status: 'planned'
	});
	const savedRounds = input.rounds.map((round, index) =>
		save('rounds', {
			organization: orgId,
			event: event.id,
			number: index + 1,
			name: round.name,
			course: round.course,
			positionLabel: round.position,
			status: 'active'
		})
	);
	const savedGroups = [];
	for (const group of input.groups) {
		const saved = save('event_groups', {
			organization: orgId,
			event: event.id,
			name: group.name,
			scorekeeper: group.scorekeeper,
			status: 'active'
		});
		savedGroups.push(saved);
		for (const selection of group.entries) {
			save('group_teams', {
				organization: orgId,
				event: event.id,
				group: saved.id,
				entry: selection.entry,
				status: 'active'
			});
			for (const athlete of selection.athletes)
				save('group_athletes', {
					organization: orgId,
					event: event.id,
					group: saved.id,
					entry: selection.entry,
					athlete,
					status: 'active'
				});
		}
	}
	if (input.timeZone) {
		for (const [index, round] of savedRounds.entries()) {
			const first = Date.parse(input.rounds[index].teeStartsAt);
			round.set('teeSchedule', {
				timeZone: input.timeZone,
				intervalMinutes: input.intervalMinutes,
				slots: savedGroups.map((group, groupIndex) => ({
					group: group.id,
					startsAt: new Date(first + groupIndex * input.intervalMinutes * 60000).toISOString()
				}))
			});
			app.save(round);
		}
	}
	return {
		eventId: event.id,
		name: input.name,
		rounds: input.rounds.length,
		groups: input.groups.length
	};
}
module.exports = { parseGuidedEvent, createGuidedEvent };
