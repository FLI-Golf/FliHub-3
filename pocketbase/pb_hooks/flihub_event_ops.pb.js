/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phase 1F — capability gate + integrity for event operations
 * (courses, course_holes, hole_positions, rounds, event_groups, group_teams,
 * group_athletes). Decisions recorded as D14.
 *
 * Role enforcement lives in the collection API rules (Owner/Admin write, any
 * member reads, delete locked). These hooks add what rules cannot express:
 *
 * 1. Capability gate: courses/course_holes/hole_positions → `venues-courses`;
 *    rounds/event_groups/group_teams/group_athletes → `events`. Writes are
 *    rejected when the capability is disabled, including direct API requests.
 *    Reads stay open: disabling hides the workflow, never the data.
 * 2. Organization boundary: every relation target must belong to the same
 *    organization, and a record's organization is immutable on update.
 * 3. D14 decisions: group team/athlete assignment requires a SEASON-LINKED
 *    event; teams join groups through their season entries (entry season must
 *    equal the event season); `event` on group_teams/group_athletes is
 *    DERIVED from the group — never trusted from the client; a group's
 *    scorekeeper must be an organization member (any role — score-entry
 *    permissions arrive with 1G); parent links are immutable — archive and
 *    recreate instead, so assignment changes always leave a row behind.
 * 4. Athlete eligibility (Phase 1E rosters + event-scoped substitutions):
 *    the athlete's entry must be actively assigned to the same group; a
 *    ROSTERED athlete (active roster membership on that entry) is eligible
 *    unless a substitution for THIS event replaced them (athleteOut); a
 *    NON-ROSTERED athlete is eligible only when a substitution for THIS
 *    event brought them in (athleteIn) for that entry — so a reserve appears
 *    only for the event where the substitution applies, and assignments
 *    never touch roster_memberships. Restoring an archived assignment
 *    re-runs the eligibility check.
 *
 * The one-group-per-event invariants (per team, per athlete) are enforced by
 * partial unique indexes. Eligibility checks are hook-level; ordering races
 * between a concurrent substitution and an assignment are accepted for 1F
 * and revisited with 1G's "after scoring begins" rules (recorded in D14).
 *
 * JSVM notes (verified on v0.40): handler-first registration; handlers are
 * serialized and re-evaluated per invocation with only `$app` bound — every
 * handler below is fully self-contained.
 */

// --- courses (capability: venues-courses) — gate only --------------------
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('venues-courses')) {
		throw new BadRequestError(
			'capability_disabled: The Venues & courses capability is not enabled for this organization.'
		);
	}
	e.next();
}, 'courses');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('venues-courses')) {
		throw new BadRequestError(
			'capability_disabled: The Venues & courses capability is not enabled for this organization.'
		);
	}
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	e.next();
}, 'courses');

// --- course_holes (capability: venues-courses) — course same-org ----------
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('venues-courses')) {
		throw new BadRequestError(
			'capability_disabled: The Venues & courses capability is not enabled for this organization.'
		);
	}
	let course;
	try {
		course = e.app.findRecordById('courses', e.record.getString('course'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected course does not exist.');
	}
	if (course.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A hole cannot be linked to a course from another organization.'
		);
	}
	e.next();
}, 'course_holes');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('venues-courses')) {
		throw new BadRequestError(
			'capability_disabled: The Venues & courses capability is not enabled for this organization.'
		);
	}
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (original && original.getString('course') !== e.record.getString('course')) {
		throw new BadRequestError(
			'immutable_relation: A hole cannot be moved to another course; archive it and create a new hole.'
		);
	}
	e.next();
}, 'course_holes');

// --- hole_positions (capability: venues-courses) — hole same-org ----------
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('venues-courses')) {
		throw new BadRequestError(
			'capability_disabled: The Venues & courses capability is not enabled for this organization.'
		);
	}
	let hole;
	try {
		hole = e.app.findRecordById('course_holes', e.record.getString('hole'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected hole does not exist.');
	}
	if (hole.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A position cannot be linked to a hole from another organization.'
		);
	}
	e.next();
}, 'hole_positions');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('venues-courses')) {
		throw new BadRequestError(
			'capability_disabled: The Venues & courses capability is not enabled for this organization.'
		);
	}
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (original && original.getString('hole') !== e.record.getString('hole')) {
		throw new BadRequestError(
			'immutable_relation: A position cannot be moved to another hole; archive it and create a new position.'
		);
	}
	e.next();
}, 'hole_positions');

// --- rounds (capability: events) — event required, optional course --------
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('events')) {
		throw new BadRequestError(
			'capability_disabled: The Events capability is not enabled for this organization.'
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
			'cross_organization: A round cannot be linked to an event from another organization.'
		);
	}
	const courseId = e.record.getString('course');
	if (courseId) {
		let course;
		try {
			course = e.app.findRecordById('courses', courseId);
		} catch (_) {
			throw new BadRequestError('invalid_relation: The selected course does not exist.');
		}
		if (course.getString('organization') !== e.record.getString('organization')) {
			throw new BadRequestError(
				'cross_organization: A round cannot be linked to a course from another organization.'
			);
		}
	}
	// A NAMED position must be covered on EVERY active hole of the selected
	// course; a blank position stays valid for planning and for courses
	// without labeled positions. Validated at save time — later archiving a
	// position does not rewrite saved rounds (scoring-time resolution is 1G).
	const positionLabel = e.record.getString('positionLabel');
	if (positionLabel) {
		if (!courseId) {
			throw new BadRequestError(
				'position_requires_course: A named position needs a selected course whose holes define it.'
			);
		}
		const holes = e.app.findRecordsByFilter(
			'course_holes',
			"course = {:course} && status = 'active'",
			'number',
			500,
			0,
			{ course: courseId }
		);
		const missing = [];
		for (const hole of holes) {
			const covered = e.app.findRecordsByFilter(
				'hole_positions',
				"hole = {:hole} && label = {:label} && status = 'active'",
				'',
				1,
				0,
				{ hole: hole.id, label: positionLabel }
			);
			if (covered.length === 0) missing.push(String(hole.get('number')));
		}
		if (holes.length === 0 || missing.length === holes.length) {
			throw new BadRequestError(
				'position_unknown: The "' +
					positionLabel +
					'" position does not exist on this course\u2019s active holes.'
			);
		}
		if (missing.length > 0) {
			throw new BadRequestError(
				'position_incomplete: The "' +
					positionLabel +
					'" position is missing on hole ' +
					missing.join(', ') +
					' — add it to every active hole of the course or leave the round\u2019s position unspecified.'
			);
		}
	}
	e.next();
}, 'rounds');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('events')) {
		throw new BadRequestError(
			'capability_disabled: The Events capability is not enabled for this organization.'
		);
	}
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (original && original.getString('event') !== e.record.getString('event')) {
		throw new BadRequestError(
			'immutable_relation: A round cannot be moved to another event; archive it and create a new round.'
		);
	}
	const courseId = e.record.getString('course');
	if (courseId) {
		let course;
		try {
			course = e.app.findRecordById('courses', courseId);
		} catch (_) {
			throw new BadRequestError('invalid_relation: The selected course does not exist.');
		}
		if (course.getString('organization') !== e.record.getString('organization')) {
			throw new BadRequestError(
				'cross_organization: A round cannot be linked to a course from another organization.'
			);
		}
	}
	// Coverage re-validates only when the position or course CHANGES: saved
	// rounds stay as saved (archiving a position later never blocks status
	// changes like archiving the round), and scoring-time resolution of a
	// position that disappeared after the save is a Phase 1G rule.
	const positionLabel = e.record.getString('positionLabel');
	const positionChanged =
		!original ||
		original.getString('positionLabel') !== positionLabel ||
		original.getString('course') !== courseId;
	if (positionLabel && positionChanged) {
		if (!courseId) {
			throw new BadRequestError(
				'position_requires_course: A named position needs a selected course whose holes define it.'
			);
		}
		const holes = e.app.findRecordsByFilter(
			'course_holes',
			"course = {:course} && status = 'active'",
			'number',
			500,
			0,
			{ course: courseId }
		);
		const missing = [];
		for (const hole of holes) {
			const covered = e.app.findRecordsByFilter(
				'hole_positions',
				"hole = {:hole} && label = {:label} && status = 'active'",
				'',
				1,
				0,
				{ hole: hole.id, label: positionLabel }
			);
			if (covered.length === 0) missing.push(String(hole.get('number')));
		}
		if (holes.length === 0 || missing.length === holes.length) {
			throw new BadRequestError(
				'position_unknown: The "' +
					positionLabel +
					'" position does not exist on this course\u2019s active holes.'
			);
		}
		if (missing.length > 0) {
			throw new BadRequestError(
				'position_incomplete: The "' +
					positionLabel +
					'" position is missing on hole ' +
					missing.join(', ') +
					' — add it to every active hole of the course or leave the round\u2019s position unspecified.'
			);
		}
	}
	e.next();
}, 'rounds');

// --- event_groups (capability: events) — scorekeeper must be a member -----
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('events')) {
		throw new BadRequestError(
			'capability_disabled: The Events capability is not enabled for this organization.'
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
			'cross_organization: A group cannot be linked to an event from another organization.'
		);
	}
	const scorekeeperId = e.record.getString('scorekeeper');
	if (scorekeeperId) {
		const member = e.app.findRecordsByFilter(
			'memberships',
			'organization = {:org} && user = {:user}',
			'',
			1,
			0,
			{ org: e.record.getString('organization'), user: scorekeeperId }
		);
		if (member.length === 0) {
			throw new BadRequestError(
				'not_a_member: The assigned scorekeeper must be a member of this organization.'
			);
		}
	}
	e.next();
}, 'event_groups');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('events')) {
		throw new BadRequestError(
			'capability_disabled: The Events capability is not enabled for this organization.'
		);
	}
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (original && original.getString('event') !== e.record.getString('event')) {
		throw new BadRequestError(
			'immutable_relation: A group cannot be moved to another event; archive it and create a new group.'
		);
	}
	const scorekeeperId = e.record.getString('scorekeeper');
	if (scorekeeperId) {
		const member = e.app.findRecordsByFilter(
			'memberships',
			'organization = {:org} && user = {:user}',
			'',
			1,
			0,
			{ org: e.record.getString('organization'), user: scorekeeperId }
		);
		if (member.length === 0) {
			throw new BadRequestError(
				'not_a_member: The assigned scorekeeper must be a member of this organization.'
			);
		}
	}
	e.next();
}, 'event_groups');

// --- group_teams (capability: events) — season-linked event; entry in season
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('events')) {
		throw new BadRequestError(
			'capability_disabled: The Events capability is not enabled for this organization.'
		);
	}
	let group;
	let entry;
	try {
		group = e.app.findRecordById('event_groups', e.record.getString('group'));
		entry = e.app.findRecordById('season_entries', e.record.getString('entry'));
	} catch (_) {
		throw new BadRequestError(
			'invalid_relation: The selected group or season entry does not exist.'
		);
	}
	if (group.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A group assignment cannot reference a group from another organization.'
		);
	}
	if (entry.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A group assignment cannot reference a season entry from another organization.'
		);
	}
	// D14: event is derived from the group, never trusted from the client.
	const eventId = group.getString('event');
	e.record.set('event', eventId);
	const event = e.app.findRecordById('events', eventId);
	if (!event.getString('season')) {
		throw new BadRequestError(
			'event_not_in_season: Group team assignment requires a season-linked event.'
		);
	}
	if (entry.getString('season') !== event.getString('season')) {
		throw new BadRequestError(
			'entry_not_in_season: The team entry must belong to the same season as the event.'
		);
	}
	e.next();
}, 'group_teams');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('events')) {
		throw new BadRequestError(
			'capability_disabled: The Events capability is not enabled for this organization.'
		);
	}
	// Assignment rows are the change record: only `status` may change.
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (
		original &&
		(original.getString('group') !== e.record.getString('group') ||
			original.getString('event') !== e.record.getString('event') ||
			original.getString('entry') !== e.record.getString('entry'))
	) {
		throw new BadRequestError(
			'immutable_relation: A group team assignment cannot be rewired; archive it and create a new assignment.'
		);
	}
	e.next();
}, 'group_teams');

// --- group_athletes (capability: events) — roster + substitution eligibility
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('events')) {
		throw new BadRequestError(
			'capability_disabled: The Events capability is not enabled for this organization.'
		);
	}
	let group;
	let entry;
	let athlete;
	try {
		group = e.app.findRecordById('event_groups', e.record.getString('group'));
		entry = e.app.findRecordById('season_entries', e.record.getString('entry'));
		athlete = e.app.findRecordById('athletes', e.record.getString('athlete'));
	} catch (_) {
		throw new BadRequestError(
			'invalid_relation: The selected group, season entry, or athlete does not exist.'
		);
	}
	const orgId = e.record.getString('organization');
	if (
		group.getString('organization') !== orgId ||
		entry.getString('organization') !== orgId ||
		athlete.getString('organization') !== orgId
	) {
		throw new BadRequestError(
			'cross_organization: A group assignment cannot reference records from another organization.'
		);
	}
	// D14: event is derived from the group, never trusted from the client.
	const eventId = group.getString('event');
	e.record.set('event', eventId);
	const event = e.app.findRecordById('events', eventId);
	if (!event.getString('season')) {
		throw new BadRequestError(
			'event_not_in_season: Group athlete assignment requires a season-linked event.'
		);
	}
	// The athlete's team entry must itself be actively assigned to this group.
	const teamInGroup = e.app.findRecordsByFilter(
		'group_teams',
		"group = {:group} && entry = {:entry} && status = 'active'",
		'',
		1,
		0,
		{ group: e.record.getString('group'), entry: e.record.getString('entry') }
	);
	if (teamInGroup.length === 0) {
		throw new BadRequestError(
			'team_not_in_group: Assign the athlete’s team entry to this group first.'
		);
	}
	// Eligibility from Phase 1E rosters + event-scoped substitutions (D14):
	// a substitution OUT for this event blocks a rostered athlete; a
	// substitution IN for this event is the only way a non-rostered (reserve)
	// athlete may appear — and only for this event.
	const subbedOut = e.app.findRecordsByFilter(
		'substitutions',
		'event = {:event} && entry = {:entry} && athleteOut = {:athlete}',
		'',
		1,
		0,
		{ event: eventId, entry: e.record.getString('entry'), athlete: e.record.getString('athlete') }
	);
	if (subbedOut.length > 0) {
		throw new BadRequestError(
			'athlete_substituted_out: A substitution replaced this athlete for this event.'
		);
	}
	const rostered = e.app.findRecordsByFilter(
		'roster_memberships',
		"entry = {:entry} && athlete = {:athlete} && status = 'active'",
		'',
		1,
		0,
		{ entry: e.record.getString('entry'), athlete: e.record.getString('athlete') }
	);
	if (rostered.length === 0) {
		const subbedIn = e.app.findRecordsByFilter(
			'substitutions',
			'event = {:event} && entry = {:entry} && athleteIn = {:athlete}',
			'',
			1,
			0,
			{
				event: eventId,
				entry: e.record.getString('entry'),
				athlete: e.record.getString('athlete')
			}
		);
		if (subbedIn.length === 0) {
			throw new BadRequestError(
				'athlete_not_eligible: Only rostered athletes, or reserves brought in by a substitution for this event, can be assigned.'
			);
		}
	}
	e.next();
}, 'group_athletes');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('events')) {
		throw new BadRequestError(
			'capability_disabled: The Events capability is not enabled for this organization.'
		);
	}
	// Assignment rows are the change record: only `status` may change.
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (
		original &&
		(original.getString('group') !== e.record.getString('group') ||
			original.getString('event') !== e.record.getString('event') ||
			original.getString('entry') !== e.record.getString('entry') ||
			original.getString('athlete') !== e.record.getString('athlete'))
	) {
		throw new BadRequestError(
			'immutable_relation: A group athlete assignment cannot be rewired; archive it and create a new assignment.'
		);
	}
	// Restoring to active re-runs the eligibility check — a substitution may
	// have changed who belongs in this event since the row was archived.
	if (
		original &&
		original.getString('status') === 'archived' &&
		e.record.getString('status') === 'active'
	) {
		const teamInGroup = e.app.findRecordsByFilter(
			'group_teams',
			"group = {:group} && entry = {:entry} && status = 'active'",
			'',
			1,
			0,
			{ group: e.record.getString('group'), entry: e.record.getString('entry') }
		);
		if (teamInGroup.length === 0) {
			throw new BadRequestError(
				'team_not_in_group: Assign the athlete’s team entry to this group first.'
			);
		}
		const subbedOut = e.app.findRecordsByFilter(
			'substitutions',
			'event = {:event} && entry = {:entry} && athleteOut = {:athlete}',
			'',
			1,
			0,
			{
				event: e.record.getString('event'),
				entry: e.record.getString('entry'),
				athlete: e.record.getString('athlete')
			}
		);
		if (subbedOut.length > 0) {
			throw new BadRequestError(
				'athlete_substituted_out: A substitution replaced this athlete for this event.'
			);
		}
		const rostered = e.app.findRecordsByFilter(
			'roster_memberships',
			"entry = {:entry} && athlete = {:athlete} && status = 'active'",
			'',
			1,
			0,
			{ entry: e.record.getString('entry'), athlete: e.record.getString('athlete') }
		);
		if (rostered.length === 0) {
			const subbedIn = e.app.findRecordsByFilter(
				'substitutions',
				'event = {:event} && entry = {:entry} && athleteIn = {:athlete}',
				'',
				1,
				0,
				{
					event: e.record.getString('event'),
					entry: e.record.getString('entry'),
					athlete: e.record.getString('athlete')
				}
			);
			if (subbedIn.length === 0) {
				throw new BadRequestError(
					'athlete_not_eligible: Only rostered athletes, or reserves brought in by a substitution for this event, can be assigned.'
				);
			}
		}
	}
	e.next();
}, 'group_athletes');
