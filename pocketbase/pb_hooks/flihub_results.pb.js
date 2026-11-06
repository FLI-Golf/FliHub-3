/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1H hook — official results and corrections (D16).
 *
 * Collection rules already restrict event_results writes to Owners/Admins of
 * the organization; this hook enforces the lifecycle itself:
 *
 * 1. CREATE = approval. Allowed only when the organization has the
 *    `scoring-results` capability, every active round of the event
 *    references a course, and every (active round × active group) scorecard
 *    exists and is Submitted — missing scorecards block approval (missing
 *    scores already block submission and never count as zero). Approval
 *    snapshots per-athlete and per-team totals into result version 1.
 *    `status`, `currentVersion`, and `pendingReason` are never trusted from
 *    the client.
 * 2. UPDATE = transition. approved → published stamps the current version;
 *    approved/published → correcting requires a reason (recorded, and
 *    carried into the next version); correcting → approved re-runs the
 *    completeness check and appends version N+1. Anything else — including
 *    published → approved (unpublish) and re-approving/re-publishing the
 *    same state — is rejected, which keeps reprocessing idempotent.
 * 3. Versions and the `result_changes` audit log are written internally
 *    after e.next(); their client write rules are locked, so approval,
 *    publication, author, and correction metadata cannot be forged.
 *
 * Handlers are self-contained (the JSVM serializes them into isolated
 * contexts), so the completeness/totals and audit-log helpers are inlined.
 */

onRecordCreateRequest((e) => {
	// D16: every active round must have a course and every (round × group)
	// scorecard must be Submitted; totals are snapshotted at approval.
	function computeEventTotals(app, eventId) {
		const rounds = app.findRecordsByFilter(
			'rounds',
			"event = {:event} && status = 'active'",
			'number',
			200,
			0,
			{ event: eventId }
		);
		if (rounds.length === 0) {
			throw new BadRequestError('approval_blocked: The event has no active rounds to approve.');
		}
		const courseless = rounds.filter((r) => !r.getString('course'));
		if (courseless.length > 0) {
			throw new BadRequestError(
				'approval_blocked: Round ' +
					String(courseless[0].get('number')) +
					' has no course — every active round must be scorable before approval.'
			);
		}
		const groups = app.findRecordsByFilter(
			'event_groups',
			"event = {:event} && status = 'active'",
			'name',
			500,
			0,
			{ event: eventId }
		);
		if (groups.length === 0) {
			throw new BadRequestError('approval_blocked: The event has no active groups to approve.');
		}
		const scorecards = app.findRecordsByFilter('scorecards', 'event = {:event}', '', 2000, 0, {
			event: eventId
		});
		const byKey = new Map(
			scorecards.map((c) => [c.getString('round') + '|' + c.getString('group'), c])
		);
		const missing = [];
		for (const round of rounds) {
			for (const group of groups) {
				const card = byKey.get(round.id + '|' + group.id);
				if (!card) {
					missing.push(
						'Round ' +
							String(round.get('number')) +
							' × ' +
							group.getString('name') +
							' (no scorecard)'
					);
				} else if (card.getString('status') !== 'submitted') {
					missing.push(
						'Round ' +
							String(round.get('number')) +
							' × ' +
							group.getString('name') +
							' (' +
							card.getString('status') +
							')'
					);
				}
			}
		}
		if (missing.length > 0) {
			throw new BadRequestError(
				'approval_blocked: ' +
					missing.length +
					' of ' +
					rounds.length * groups.length +
					' scorecards are not submitted (first: ' +
					missing[0] +
					'). Missing scores never count as zero.'
			);
		}
		const groupAthletes = app.findRecordsByFilter(
			'group_athletes',
			"event = {:event} && status = 'active'",
			'',
			2000,
			0,
			{ event: eventId }
		);
		const scores = app.findRecordsByFilter('scores', 'event = {:event}', '', 50000, 0, {
			event: eventId
		});
		const athleteRound = new Map();
		for (const s of scores) {
			const key = s.getString('athlete') + '|' + s.getString('round');
			athleteRound.set(key, (athleteRound.get(key) ?? 0) + Number(s.get('strokes')));
		}
		const entryName = new Map();
		const athleteName = new Map();
		const athletes = [];
		const seenAthletes = new Set();
		for (const ga of groupAthletes) {
			const athleteId = ga.getString('athlete');
			if (seenAthletes.has(athleteId)) continue;
			seenAthletes.add(athleteId);
			const entryId = ga.getString('entry');
			if (!entryName.has(entryId)) {
				const entry = app.findRecordById('season_entries', entryId);
				const team = app.findRecordById('teams', entry.getString('team'));
				entryName.set(entryId, team.getString('name'));
			}
			if (!athleteName.has(athleteId)) {
				const athlete = app.findRecordById('athletes', athleteId);
				athleteName.set(
					athleteId,
					(athlete.getString('firstName') + ' ' + athlete.getString('lastName')).trim()
				);
			}
			const roundTotals = {};
			let total = 0;
			for (const round of rounds) {
				const strokes = athleteRound.get(athleteId + '|' + round.id) ?? 0;
				roundTotals[round.id] = strokes;
				total += strokes;
			}
			athletes.push({
				athlete: athleteId,
				athleteName: athleteName.get(athleteId),
				entry: entryId,
				teamName: entryName.get(entryId),
				roundTotals,
				total
			});
		}
		const teams = [];
		const byEntry = new Map();
		for (const a of athletes) {
			if (!byEntry.has(a.entry)) {
				byEntry.set(a.entry, { entry: a.entry, teamName: a.teamName, roundTotals: {}, total: 0 });
				teams.push(byEntry.get(a.entry));
			}
			const bucket = byEntry.get(a.entry);
			for (const round of rounds) {
				bucket.roundTotals[round.id] =
					(bucket.roundTotals[round.id] ?? 0) + a.roundTotals[round.id];
			}
			bucket.total += a.total;
		}
		teams.sort((x, y) => x.total - y.total);
		athletes.sort((x, y) => x.total - y.total);
		return {
			rounds: rounds.map((r) => ({
				round: r.id,
				number: Number(r.get('number')),
				name: r.getString('name'),
				positionLabel: r.getString('positionLabel')
			})),
			teams,
			athletes
		};
	}

	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('scoring-results')) {
		throw new BadRequestError(
			'capability_disabled: The Scoring & official results capability is not enabled for this organization.'
		);
	}
	let event;
	try {
		event = e.app.findRecordById('events', e.record.getString('event'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected event does not exist.');
	}
	if (event.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: An official result cannot reference an event from another organization.'
		);
	}
	if (!e.auth || !e.auth.id) {
		throw new BadRequestError('unauthenticated: Approval requires a signed-in caller.');
	}
	const totals = computeEventTotals(e.app, e.record.getString('event'));
	e.record.set('status', 'approved');
	e.record.set('currentVersion', 1);
	e.record.set('publishedVersion', 0);
	e.record.set('pendingReason', '');
	e.next();
	const versions = e.app.findCollectionByNameOrId('result_versions');
	const version = new Record(versions);
	version.set('organization', e.record.getString('organization'));
	version.set('event', e.record.getString('event'));
	version.set('result', e.record.id);
	version.set('version', 1);
	version.set('totals', totals);
	version.set('reason', '');
	version.set('approvedBy', e.auth.id);
	version.set('approvedAt', new Date().toISOString());
	e.app.save(version);
	const changes = e.app.findCollectionByNameOrId('result_changes');
	const change = new Record(changes);
	change.set('organization', e.record.getString('organization'));
	change.set('event', e.record.getString('event'));
	change.set('result', e.record.id);
	change.set('action', 'approved');
	change.set('version', 1);
	change.set('reason', '');
	change.set('author', e.auth.id);
	e.app.save(change);
}, 'event_results');

onRecordUpdateRequest((e) => {
	// Same completeness/totals computation as approval (handlers are
	// self-contained — the JSVM serializes them into isolated contexts).
	function computeEventTotals(app, eventId) {
		const rounds = app.findRecordsByFilter(
			'rounds',
			"event = {:event} && status = 'active'",
			'number',
			200,
			0,
			{ event: eventId }
		);
		if (rounds.length === 0) {
			throw new BadRequestError('approval_blocked: The event has no active rounds to approve.');
		}
		const courseless = rounds.filter((r) => !r.getString('course'));
		if (courseless.length > 0) {
			throw new BadRequestError(
				'approval_blocked: Round ' +
					String(courseless[0].get('number')) +
					' has no course — every active round must be scorable before approval.'
			);
		}
		const groups = app.findRecordsByFilter(
			'event_groups',
			"event = {:event} && status = 'active'",
			'name',
			500,
			0,
			{ event: eventId }
		);
		if (groups.length === 0) {
			throw new BadRequestError('approval_blocked: The event has no active groups to approve.');
		}
		const scorecards = app.findRecordsByFilter('scorecards', 'event = {:event}', '', 2000, 0, {
			event: eventId
		});
		const byKey = new Map(
			scorecards.map((c) => [c.getString('round') + '|' + c.getString('group'), c])
		);
		const missing = [];
		for (const round of rounds) {
			for (const group of groups) {
				const card = byKey.get(round.id + '|' + group.id);
				if (!card) {
					missing.push(
						'Round ' +
							String(round.get('number')) +
							' × ' +
							group.getString('name') +
							' (no scorecard)'
					);
				} else if (card.getString('status') !== 'submitted') {
					missing.push(
						'Round ' +
							String(round.get('number')) +
							' × ' +
							group.getString('name') +
							' (' +
							card.getString('status') +
							')'
					);
				}
			}
		}
		if (missing.length > 0) {
			throw new BadRequestError(
				'approval_blocked: ' +
					missing.length +
					' of ' +
					rounds.length * groups.length +
					' scorecards are not submitted (first: ' +
					missing[0] +
					'). Missing scores never count as zero.'
			);
		}
		const groupAthletes = app.findRecordsByFilter(
			'group_athletes',
			"event = {:event} && status = 'active'",
			'',
			2000,
			0,
			{ event: eventId }
		);
		const scores = app.findRecordsByFilter('scores', 'event = {:event}', '', 50000, 0, {
			event: eventId
		});
		const athleteRound = new Map();
		for (const s of scores) {
			const key = s.getString('athlete') + '|' + s.getString('round');
			athleteRound.set(key, (athleteRound.get(key) ?? 0) + Number(s.get('strokes')));
		}
		const entryName = new Map();
		const athleteName = new Map();
		const athletes = [];
		const seenAthletes = new Set();
		for (const ga of groupAthletes) {
			const athleteId = ga.getString('athlete');
			if (seenAthletes.has(athleteId)) continue;
			seenAthletes.add(athleteId);
			const entryId = ga.getString('entry');
			if (!entryName.has(entryId)) {
				const entry = app.findRecordById('season_entries', entryId);
				const team = app.findRecordById('teams', entry.getString('team'));
				entryName.set(entryId, team.getString('name'));
			}
			if (!athleteName.has(athleteId)) {
				const athlete = app.findRecordById('athletes', athleteId);
				athleteName.set(
					athleteId,
					(athlete.getString('firstName') + ' ' + athlete.getString('lastName')).trim()
				);
			}
			const roundTotals = {};
			let total = 0;
			for (const round of rounds) {
				const strokes = athleteRound.get(athleteId + '|' + round.id) ?? 0;
				roundTotals[round.id] = strokes;
				total += strokes;
			}
			athletes.push({
				athlete: athleteId,
				athleteName: athleteName.get(athleteId),
				entry: entryId,
				teamName: entryName.get(entryId),
				roundTotals,
				total
			});
		}
		const teams = [];
		const byEntry = new Map();
		for (const a of athletes) {
			if (!byEntry.has(a.entry)) {
				byEntry.set(a.entry, { entry: a.entry, teamName: a.teamName, roundTotals: {}, total: 0 });
				teams.push(byEntry.get(a.entry));
			}
			const bucket = byEntry.get(a.entry);
			for (const round of rounds) {
				bucket.roundTotals[round.id] =
					(bucket.roundTotals[round.id] ?? 0) + a.roundTotals[round.id];
			}
			bucket.total += a.total;
		}
		teams.sort((x, y) => x.total - y.total);
		athletes.sort((x, y) => x.total - y.total);
		return {
			rounds: rounds.map((r) => ({
				round: r.id,
				number: Number(r.get('number')),
				name: r.getString('name'),
				positionLabel: r.getString('positionLabel')
			})),
			teams,
			athletes
		};
	}
	function logResultChange(app, result, action, version, reason, authorId) {
		const collection = app.findCollectionByNameOrId('result_changes');
		const change = new Record(collection);
		change.set('organization', result.getString('organization'));
		change.set('event', result.getString('event'));
		change.set('result', result.id);
		change.set('action', action);
		change.set('version', version);
		change.set('reason', reason);
		change.set('author', authorId);
		app.save(change);
	}

	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('scoring-results')) {
		throw new BadRequestError(
			'capability_disabled: The Scoring & official results capability is not enabled for this organization.'
		);
	}
	const original = e.record.original();
	if (
		original &&
		(original.getString('organization') !== e.record.getString('organization') ||
			original.getString('event') !== e.record.getString('event'))
	) {
		throw new BadRequestError(
			'immutable_relation: An official result cannot be rewired; its organization and event are fixed.'
		);
	}
	if (!e.auth || !e.auth.id) {
		throw new BadRequestError('unauthenticated: Result transitions require a signed-in caller.');
	}
	const prev = original ? original.getString('status') : '';
	const next = e.record.getString('status');
	// Fields the client may never steer directly.
	e.record.set('currentVersion', original.get('currentVersion'));
	e.record.set('publishedVersion', original.get('publishedVersion'));
	e.record.set('pendingReason', original.getString('pendingReason'));

	if (prev === 'approved' && next === 'published') {
		const currentVersion = Number(original.get('currentVersion'));
		e.record.set('publishedVersion', currentVersion);
		e.next();
		const rows = e.app.findRecordsByFilter(
			'result_versions',
			'result = {:result} && version = {:version}',
			'',
			1,
			0,
			{ result: e.record.id, version: currentVersion }
		);
		if (rows.length === 1) {
			rows[0].set('publishedBy', e.auth.id);
			rows[0].set('publishedAt', new Date().toISOString());
			e.app.save(rows[0]);
		}
		logResultChange(e.app, e.record, 'published', currentVersion, '', e.auth.id);
		return;
	}

	if ((prev === 'approved' || prev === 'published') && next === 'correcting') {
		const body = e.requestInfo().body || {};
		const reason = String(body.reason ?? '').trim();
		if (!reason) {
			throw new BadRequestError(
				'reason_required: Reopening an official result requires a reason; it is recorded in the result history.'
			);
		}
		e.record.set('pendingReason', reason);
		e.next();
		logResultChange(
			e.app,
			e.record,
			'reopened',
			Number(original.get('currentVersion')),
			reason,
			e.auth.id
		);
		return;
	}

	if (prev === 'correcting' && next === 'approved') {
		const totals = computeEventTotals(e.app, e.record.getString('event'));
		const newVersion = Number(original.get('currentVersion')) + 1;
		const reason = original.getString('pendingReason');
		e.record.set('currentVersion', newVersion);
		e.record.set('pendingReason', '');
		e.next();
		const versions = e.app.findCollectionByNameOrId('result_versions');
		const version = new Record(versions);
		version.set('organization', e.record.getString('organization'));
		version.set('event', e.record.getString('event'));
		version.set('result', e.record.id);
		version.set('version', newVersion);
		version.set('totals', totals);
		version.set('reason', reason);
		version.set('approvedBy', e.auth.id);
		version.set('approvedAt', new Date().toISOString());
		e.app.save(version);
		logResultChange(e.app, e.record, 'approved', newVersion, reason, e.auth.id);
		return;
	}

	if (prev === next) {
		throw new BadRequestError(
			'invalid_transition: The result is already ' +
				prev +
				' — reprocessing the same transition creates nothing.'
		);
	}
	if (prev === 'published' && next === 'approved') {
		throw new BadRequestError(
			'invalid_transition: Published results cannot be unpublished — reopen with a reason, correct, and reapprove instead.'
		);
	}
	throw new BadRequestError(
		'invalid_transition: Cannot move a result from ' + prev + ' to ' + next + '.'
	);
}, 'event_results');
