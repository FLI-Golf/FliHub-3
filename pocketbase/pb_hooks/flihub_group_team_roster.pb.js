/// <reference path="../pb_data/types.d.ts" />

// Add a season team and its eligible event lineup atomically.
routerAdd('POST', '/api/flihub/groups/{id}/add-team-roster', (e) => {
	const groupId = e.request.pathValue('id');
	const entryId = String((e.requestInfo().body || {}).entry || '');
	let added = 0;

	e.app.runInTransaction((app) => {
		const group = app.findRecordById('event_groups', groupId);
		const orgId = group.getString('organization');
		const caller = app.findFirstRecordByFilter(
			'memberships',
			'organization = {:org} && user = {:user}',
			{ org: orgId, user: e.auth.id }
		);
		if (!['owner', 'admin'].includes(caller.getString('role'))) {
			throw new ForbiddenError('Only Owners and Admins can assign teams.');
		}

		const org = app.findRecordById('organizations', orgId);
		const caps = JSON.parse(String(org.get('capabilities') || '[]'));
		if (!Array.isArray(caps) || !caps.includes('events')) {
			throw new BadRequestError('The Events capability is disabled.');
		}

		const event = app.findRecordById('events', group.getString('event'));
		const entry = app.findRecordById('season_entries', entryId);
		const team = app.findRecordById('teams', entry.getString('team'));
		if (
			event.getString('organization') !== orgId ||
			entry.getString('organization') !== orgId ||
			team.getString('organization') !== orgId ||
			!event.getString('season') ||
			entry.getString('season') !== event.getString('season')
		) {
			throw new BadRequestError('The team must belong to this event’s organization and season.');
		}
		if (
			group.getString('status') !== 'active' ||
			entry.getString('status') !== 'active' ||
			team.getString('status') !== 'active' ||
			event.getString('status') === 'archived'
		) {
			throw new BadRequestError('Choose an active group and active season team.');
		}

		const cards = app.findRecordsByFilter(
			'scorecards', 'group = {:group}', '', 1, 0, { group: groupId }
		);
		if (cards.length) {
			throw new BadRequestError('Scoring has started for this group. Its lineup is locked.');
		}

		const roster = app.findRecordsByFilter(
			'roster_memberships',
			"entry = {:entry} && status = 'active'",
			'', 0, 0, { entry: entryId }
		);
		const substitutions = app.findRecordsByFilter(
			'substitutions',
			'event = {:event} && entry = {:entry}',
			'', 0, 0, { event: event.id, entry: entryId }
		);
		const outgoing = new Set(substitutions.map((row) => row.getString('athleteOut')));
		const eligible = new Set(roster.map((row) => row.getString('athlete')));
		for (const substitution of substitutions) {
			eligible.add(substitution.getString('athleteIn'));
		}
		for (const athleteId of outgoing) eligible.delete(athleteId);

		if (!eligible.size) {
			throw new BadRequestError('This team has no eligible roster athletes for the event.');
		}
		for (const athleteId of eligible) {
			const athlete = app.findRecordById('athletes', athleteId);
			if (
				athlete.getString('organization') !== orgId ||
				athlete.getString('status') !== 'active'
			) {
				throw new BadRequestError('The event lineup includes an inactive or invalid athlete.');
			}
		}

		const teamAssignments = app.findRecordsByFilter(
			'group_teams',
			"event = {:event} && entry = {:entry} && status = 'active'",
			'', 0, 0, { event: event.id, entry: entryId }
		);
		if (teamAssignments.some((row) => row.getString('group') !== groupId)) {
			throw new BadRequestError('This team is already assigned to another group in this event.');
		}

		const athleteAssignments = app.findRecordsByFilter(
			'group_athletes',
			"event = {:event} && status = 'active'",
			'', 0, 0, { event: event.id }
		);
		for (const assignment of athleteAssignments) {
			if (
				eligible.has(assignment.getString('athlete')) &&
				(assignment.getString('group') !== groupId ||
					assignment.getString('entry') !== entryId)
			) {
				throw new BadRequestError('An eligible athlete is already assigned elsewhere in this event.');
			}
		}

		if (!teamAssignments.length) {
			const assignment = new Record(app.findCollectionByNameOrId('group_teams'));
			assignment.set('organization', orgId);
			assignment.set('event', event.id);
			assignment.set('group', groupId);
			assignment.set('entry', entryId);
			assignment.set('status', 'active');
			app.save(assignment);
		}

		for (const athleteId of eligible) {
			const exists = athleteAssignments.some((row) =>
				row.getString('group') === groupId &&
				row.getString('entry') === entryId &&
				row.getString('athlete') === athleteId
			);
			if (exists) continue;
			const assignment = new Record(app.findCollectionByNameOrId('group_athletes'));
			assignment.set('organization', orgId);
			assignment.set('event', event.id);
			assignment.set('group', groupId);
			assignment.set('entry', entryId);
			assignment.set('athlete', athleteId);
			assignment.set('status', 'active');
			app.save(assignment);
			added += 1;
		}
	});

	return e.json(200, { athletesAdded: added });
}, $apis.requireAuth());
