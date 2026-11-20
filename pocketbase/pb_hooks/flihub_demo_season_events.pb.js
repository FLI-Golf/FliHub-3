/// <reference path="../pb_data/types.d.ts" />
routerAdd(
	'POST',
	'/api/flihub/demo/organizations/{id}/season-events',
	(e) => {
		if ($os.getenv('FLIHUB_DEMO_FANTASY') !== '1' || !$os.getenv('CODESPACE_NAME'))
			throw new ForbiddenError('Start local PocketBase with FLIHUB_DEMO_FANTASY=1 to create demo events.');

		const org = e.request.pathValue('id');
		const { source, destination, teeTime, secondTeeTime } = e.requestInfo().body || {};
		const validTeeTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
		if (!validTeeTime(teeTime) || !validTeeTime(secondTeeTime))
			return e.json(400, { message: 'Choose valid tee times for both rounds.' });
		const idPattern = /^[a-z0-9]{15}$/;
		if (![org, source, destination].every((id) => typeof id === 'string' && idPattern.test(id)) ||
			source === destination) {
			return e.json(400, { message: 'Choose two different seasons.' });
		}

		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM uses require.
		const { createGuidedEvent } = require(`${__hooks}/guided_event_setup_rules.js`);
		const actor = e.auth.id;
		let summary, rejection;
		try {
			e.app.runInTransaction((app) => {
				const fail = (message, status = 400) => {
					rejection = { status, message };
					throw new Error(message);
				};
				const rows = (collection, filter, params, sort = 'id') => {
					const records = app.findRecordsByFilter(collection, filter, sort, 501, 0, params);
					if (records.length > 500) fail('This selection is too large for demo setup.');
					return records;
				};
				const save = (collection, fields) => {
					const record = new Record(app.findCollectionByNameOrId(collection));
					for (const key of Object.keys(fields)) record.set(key, fields[key]);
					app.save(record);
					return record;
				};

				const membership = rows('memberships',
					'organization = {:org} && user = {:actor}', { org, actor })[0];
				if (!membership || !['owner', 'admin'].includes(membership.getString('role')))
					fail('Owner or Admin access is required.', 403);

				const seasons = rows('seasons',
					'organization = {:org} && (id = {:source} || id = {:destination})',
					{ org, source, destination });
				const from = seasons.find((row) => row.id === source);
				const to = seasons.find((row) => row.id === destination);
				if (!from || from.getString('status') !== 'completed' ||
					!to || to.getString('status') !== 'planned')
					fail('Choose a completed template season and a planned destination in this organization.');

				const eventsIn = (season) => rows('events',
					'organization = {:org} && season = {:season}', { org, season }, 'startsAt,name,id');
				const templates = eventsIn(source).filter((event) => event.getString('status') !== 'archived');
				if (!templates.length || templates.length > 24)
					fail('Choose a template season with 1–24 non-archived events.');
				const names = templates.map((event) => event.getString('name').trim().toLowerCase());
				if (new Set(names).size !== names.length)
					fail('The template season needs unique event names.');
				const destinationEvents = eventsIn(destination);
				const existing = new Set(destinationEvents.map((event) => event.getString('name').trim().toLowerCase()));
				const pending = templates.map((event, index) => ({ event, index }))
					.filter(({ index }) => !existing.has(names[index]));
				summary = {
					created: 0,
					skipped: templates.length - pending.length,
					copiedTeams: 0,
					scheduledRounds: 0
				};
				const timeZone = 'America/Phoenix';
				const intervalMinutes = 10;
				const [hour, minute] = teeTime.split(':').map(Number);
				const firstMinute = hour * 60 + minute;
				const [secondHour, secondMinuteOfHour] = secondTeeTime.split(':').map(Number);
				const secondMinute = secondHour * 60 + secondMinuteOfHour;
				const roundMinute = (index) => index === 0 ? firstMinute : secondMinute + (index - 1) * 120;

				function teeStart(date, roundIndex, roundCount, groupCount) {
					const lastGroupOffset = (groupCount - 1) * intervalMinutes;
					if (roundCount > 1 && secondMinute <= firstMinute + lastGroupOffset)
						fail('Round 2 must start after the last group starts Round 1.');
					if (roundCount > 2 && lastGroupOffset >= 120)
						fail('There are too many groups for later rounds spaced two hours apart.');
					if (roundMinute(roundCount - 1) + lastGroupOffset >= 1440)
						fail('Choose an earlier tee time so all groups can start on the event date.');

					// The Arizona demo venues use UTC−07:00 year-round.
					const midnight = Date.parse(`${date}T00:00:00-07:00`);
					if (!Number.isFinite(midnight)) fail('Set a planning date on the event first.');
					return new Date(midnight + roundMinute(roundIndex) * 60000).toISOString();
				}

				for (const event of destinationEvents) {
					if (event.getString('status') !== 'planned' ||
						!names.includes(event.getString('name').trim().toLowerCase()) ||
						event.getString('fantasyCutoffAt')) continue;
					const scope = { org, event: event.id };
					if (rows('event_results', 'organization = {:org} && event = {:event}', scope).length)
						continue;
					const rounds = rows('rounds',
						'organization = {:org} && event = {:event} && status = "active"', scope, 'number');
					if (!rounds.length || rounds.some((round) => {
						const saved = round.getString('teeSchedule');
						return saved && saved !== 'null';
					})) continue;
					const groups = rows('event_groups',
						'organization = {:org} && event = {:event} && status = "active"', scope, 'created,id');
					if (!groups.length) fail(`Set up groups for ${event.getString('name')} first.`);
					const date = event.getString('startsAt').slice(0, 10);
					for (const [index, round] of rounds.entries()) {
						const start = Date.parse(teeStart(date, index, rounds.length, groups.length));
						round.set('teeSchedule', {
							timeZone,
							intervalMinutes,
							slots: groups.map((group, groupIndex) => ({
								group: group.id,
								startsAt: new Date(start + groupIndex * intervalMinutes * 60000).toISOString()
							}))
						});
						app.save(round);
						summary.scheduledRounds++;
					}
				}
				if (!pending.length) return;

				const startsOn = to.getString('startsOn').slice(0, 10);
				const firstDay = Date.parse(startsOn + 'T00:00:00.000Z');
				const lastDay = to.getString('endsOn').slice(0, 10);
				if (!Number.isFinite(firstDay)) fail('Set a start date on the destination season.');

				const entriesIn = (season) => rows('season_entries',
					'organization = {:org} && season = {:season}', { org, season });
				const activeRoster = (entry) => rows('roster_memberships',
					'organization = {:org} && entry = {:entry} && status = "active"', { org, entry });
				let entries = entriesIn(destination);
				if (!entries.length) {
					entries = entriesIn(source).filter((entry) => entry.getString('status') === 'active')
						.map((entry) => {
							const copy = save('season_entries', {
								organization: org,
								season: destination,
								team: entry.getString('team'),
								status: 'active'
							});
							for (const member of activeRoster(entry.id)) {
								save('roster_memberships', {
									organization: org,
									season: destination,
									entry: copy.id,
									athlete: member.getString('athlete'),
									status: 'active'
								});
							}
							summary.copiedTeams++;
							return copy;
						});
				}
				const lineups = entries.filter((entry) => entry.getString('status') === 'active')
					.map((entry) => ({
						entry: entry.id,
						athletes: activeRoster(entry.id).map((member) => member.getString('athlete'))
					}));
				if (!lineups.length || lineups.some((lineup) => !lineup.athletes.length))
					fail('Every active team in the destination season needs an active roster.');
				const groups = [];
				for (let index = 0; index < lineups.length; index += 2) {
					groups.push({
						name: `Group ${groups.length + 1}`,
						scorekeeper: actor,
						entries: lineups.slice(index, index + 2)
					});
				}

				for (const { event, index } of pending) {
					const date = new Date(firstDay + index * 7 * 86400000).toISOString().slice(0, 10);
					if (lastDay && date > lastDay)
						fail('The destination season is too short for the weekly schedule.');
					const rounds = rows('rounds',
						'organization = {:org} && event = {:event} && status = "active"',
						{ org, event: event.id }, 'number').map((round) => {
							const course = round.getString('course');
							return {
								name: round.getString('name'),
								course,
								position: round.getString('positionLabel'),
								holeIds: rows('course_holes',
									'organization = {:org} && course = {:course} && status = "active"',
									{ org, course }).map((hole) => hole.id)
							};
						});
					try {
						createGuidedEvent(app, org, actor, {
							version: 1,
							name: event.getString('name'),
							venueName: event.getString('venueName'),
							venueAddress: event.getString('venueAddress'),
							season: destination,
							date,
							teeTimeZone: timeZone,
							teeIntervalMinutes: intervalMinutes,
							rounds: rounds.map((round, index) => ({
								...round,
								teeStartsAt: teeStart(date, index, rounds.length, groups.length)
							})),
							groups
						});
					} catch (error) {
						if (error.guidedSetupError) {
							rejection = {
								status: error.status,
								message: `${event.getString('name')}: ${error.message}`
							};
						}
						throw error;
					}
					summary.scheduledRounds += rounds.length;
					summary.created++;
				}
			});
		} catch (error) {
			if (rejection) return e.json(rejection.status, { message: rejection.message });
			throw error;
		}
		return e.json(200, summary);
	},
	$apis.requireAuth()
);
