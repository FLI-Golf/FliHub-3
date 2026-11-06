/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phase 1E — capability gate + integrity for season rosters, reserve
 * pools, and substitutions (decisions recorded as D13).
 *
 * Role enforcement lives in the collection API rules (Owner/Admin write —
 * substitutions create-only — any member reads, delete locked). These hooks
 * add what rules cannot express:
 *
 * 1. Capability gate: all four collections belong to the `teams` capability
 *    ("Teams & rosters"). Writes are rejected when it is disabled, including
 *    direct API requests. Reads stay open: disabling hides the workflow,
 *    never the data.
 * 2. Organization boundary: every relation target must belong to the same
 *    organization, and a record's organization is immutable on update.
 * 3. D13 decisions: a roster row's `season` is DERIVED from its entry (and a
 *    reserve member's from its pool) — never trusted from the client; an
 *    athlete holds at most one active spot per season across rosters and
 *    reserve pools (partial unique indexes cover each table; the cross-table
 *    check lives here, and SQLite triggers — see the
 *    phase1e_exclusivity_triggers migration — re-run it inside the write
 *    itself so concurrent requests cannot slip past this read-then-write
 *    check); a pool's optional gender restriction is enforced at
 *    join time; parent links (entry, pool, athlete, season) are immutable —
 *    archive and recreate instead, so participation history is never
 *    rewritten.
 * 4. Substitutions: the event must be season-linked to the entry's season
 *    (an independent event has no roster context); athleteOut must hold an
 *    active roster spot on that entry; athleteIn must be an active reserve
 *    member in that season; `recordedBy` is set from the authenticated
 *    caller, overwriting anything client-sent. The record changes nothing
 *    else — rosters and pools are untouched.
 *
 * JSVM notes (verified on v0.40): handler-first registration; handlers are
 * serialized and re-evaluated per invocation with only `$app` bound — every
 * handler below is fully self-contained.
 */

// --- roster_memberships ----------------------------------------------------
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('teams')) {
		throw new BadRequestError(
			'capability_disabled: The Teams & rosters capability is not enabled for this organization.'
		);
	}
	let entry;
	let athlete;
	try {
		entry = e.app.findRecordById('season_entries', e.record.getString('entry'));
		athlete = e.app.findRecordById('athletes', e.record.getString('athlete'));
	} catch (_) {
		throw new BadRequestError(
			'invalid_relation: The selected season entry or athlete does not exist.'
		);
	}
	if (entry.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A roster membership cannot reference a season entry from another organization.'
		);
	}
	if (athlete.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A roster membership cannot reference an athlete from another organization.'
		);
	}
	// D13: season is derived from the entry, never trusted from the client.
	const seasonId = entry.getString('season');
	e.record.set('season', seasonId);
	// D13 exclusivity: not simultaneously in an active reserve pool this season.
	const reserved = e.app.findRecordsByFilter(
		'reserve_members',
		"season = {:season} && athlete = {:athlete} && status = 'active'",
		'',
		1,
		0,
		{ season: seasonId, athlete: e.record.getString('athlete') }
	);
	if (reserved.length > 0) {
		throw new BadRequestError(
			'athlete_unavailable: This athlete is in a reserve pool for this season; remove them from the pool first.'
		);
	}
	e.next();
}, 'roster_memberships');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('teams')) {
		throw new BadRequestError(
			'capability_disabled: The Teams & rosters capability is not enabled for this organization.'
		);
	}
	// D13 integrity: participation history is never rewritten — organization,
	// entry, athlete, and season are immutable; only `status` may change.
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (
		original &&
		(original.getString('entry') !== e.record.getString('entry') ||
			original.getString('athlete') !== e.record.getString('athlete') ||
			original.getString('season') !== e.record.getString('season'))
	) {
		throw new BadRequestError(
			'immutable_relation: A roster membership entry, athlete, and season cannot change; archive it and create a new membership.'
		);
	}
	// Restoring to active re-checks reserve-pool exclusivity (the partial
	// unique index already prevents a second active roster spot).
	if (
		original &&
		original.getString('status') === 'archived' &&
		e.record.getString('status') === 'active'
	) {
		const reserved = e.app.findRecordsByFilter(
			'reserve_members',
			"season = {:season} && athlete = {:athlete} && status = 'active'",
			'',
			1,
			0,
			{ season: e.record.getString('season'), athlete: e.record.getString('athlete') }
		);
		if (reserved.length > 0) {
			throw new BadRequestError(
				'athlete_unavailable: This athlete is in a reserve pool for this season; remove them from the pool first.'
			);
		}
	}
	e.next();
}, 'roster_memberships');

// --- reserve_pools -----------------------------------------------------------
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('teams')) {
		throw new BadRequestError(
			'capability_disabled: The Teams & rosters capability is not enabled for this organization.'
		);
	}
	let season;
	try {
		season = e.app.findRecordById('seasons', e.record.getString('season'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected season does not exist.');
	}
	if (season.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A reserve pool cannot be linked to a season from another organization.'
		);
	}
	e.next();
}, 'reserve_pools');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('teams')) {
		throw new BadRequestError(
			'capability_disabled: The Teams & rosters capability is not enabled for this organization.'
		);
	}
	// D13 integrity: organization and season are immutable; the gender
	// restriction is too — changing it would silently invalidate members
	// admitted under the old restriction. Archive and create a new pool.
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (original && original.getString('season') !== e.record.getString('season')) {
		throw new BadRequestError(
			'immutable_relation: A reserve pool cannot be moved to another season; archive it and create a new pool.'
		);
	}
	if (original && original.getString('gender') !== e.record.getString('gender')) {
		throw new BadRequestError(
			'immutable_restriction: A reserve pool gender restriction cannot change; archive it and create a new pool.'
		);
	}
	e.next();
}, 'reserve_pools');

// --- reserve_members ---------------------------------------------------------
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('teams')) {
		throw new BadRequestError(
			'capability_disabled: The Teams & rosters capability is not enabled for this organization.'
		);
	}
	let pool;
	let athlete;
	try {
		pool = e.app.findRecordById('reserve_pools', e.record.getString('pool'));
		athlete = e.app.findRecordById('athletes', e.record.getString('athlete'));
	} catch (_) {
		throw new BadRequestError(
			'invalid_relation: The selected reserve pool or athlete does not exist.'
		);
	}
	if (pool.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A reserve membership cannot reference a pool from another organization.'
		);
	}
	if (athlete.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A reserve membership cannot reference an athlete from another organization.'
		);
	}
	// D13: season is derived from the pool, never trusted from the client.
	const seasonId = pool.getString('season');
	e.record.set('season', seasonId);
	// Pilot configuration: a pool's optional gender restriction is enforced at
	// join time (no restriction when the pool's gender is empty).
	const restriction = pool.getString('gender');
	if (restriction && athlete.getString('gender') !== restriction) {
		throw new BadRequestError(
			'gender_restricted: This reserve pool is restricted to ' +
				restriction +
				' athletes by its configuration.'
		);
	}
	// D13 exclusivity: not simultaneously on an active roster this season.
	const rostered = e.app.findRecordsByFilter(
		'roster_memberships',
		"season = {:season} && athlete = {:athlete} && status = 'active'",
		'',
		1,
		0,
		{ season: seasonId, athlete: e.record.getString('athlete') }
	);
	if (rostered.length > 0) {
		throw new BadRequestError(
			'athlete_unavailable: This athlete holds an active roster spot this season; remove them from the roster first.'
		);
	}
	e.next();
}, 'reserve_members');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('teams')) {
		throw new BadRequestError(
			'capability_disabled: The Teams & rosters capability is not enabled for this organization.'
		);
	}
	// D13 integrity: organization, pool, athlete, and season are immutable;
	// only `status` may change.
	const original = e.record.original();
	if (original && original.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (
		original &&
		(original.getString('pool') !== e.record.getString('pool') ||
			original.getString('athlete') !== e.record.getString('athlete') ||
			original.getString('season') !== e.record.getString('season'))
	) {
		throw new BadRequestError(
			'immutable_relation: A reserve membership pool, athlete, and season cannot change; archive it and create a new membership.'
		);
	}
	// Restoring to active re-checks roster exclusivity (the partial unique
	// index already prevents a second active reserve spot).
	if (
		original &&
		original.getString('status') === 'archived' &&
		e.record.getString('status') === 'active'
	) {
		const rostered = e.app.findRecordsByFilter(
			'roster_memberships',
			"season = {:season} && athlete = {:athlete} && status = 'active'",
			'',
			1,
			0,
			{ season: e.record.getString('season'), athlete: e.record.getString('athlete') }
		);
		if (rostered.length > 0) {
			throw new BadRequestError(
				'athlete_unavailable: This athlete holds an active roster spot this season; remove them from the roster first.'
			);
		}
	}
	e.next();
}, 'reserve_members');

// --- substitutions (append-only; update/delete locked by collection rules) ---
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('teams')) {
		throw new BadRequestError(
			'capability_disabled: The Teams & rosters capability is not enabled for this organization.'
		);
	}
	let event;
	let entry;
	let athleteOut;
	let athleteIn;
	try {
		event = e.app.findRecordById('events', e.record.getString('event'));
		entry = e.app.findRecordById('season_entries', e.record.getString('entry'));
		athleteOut = e.app.findRecordById('athletes', e.record.getString('athleteOut'));
		athleteIn = e.app.findRecordById('athletes', e.record.getString('athleteIn'));
	} catch (_) {
		throw new BadRequestError(
			'invalid_relation: The selected event, season entry, or athlete does not exist.'
		);
	}
	const orgId = e.record.getString('organization');
	if (
		event.getString('organization') !== orgId ||
		entry.getString('organization') !== orgId ||
		athleteOut.getString('organization') !== orgId ||
		athleteIn.getString('organization') !== orgId
	) {
		throw new BadRequestError(
			'cross_organization: A substitution cannot reference records from another organization.'
		);
	}
	// D13: substitutions only exist where the team competes — the event must
	// be season-linked to the entry's season (independent events have no
	// roster context).
	const seasonId = entry.getString('season');
	if (!event.getString('season') || event.getString('season') !== seasonId) {
		throw new BadRequestError(
			'event_not_in_season: A substitution event must belong to the same season as the team entry.'
		);
	}
	if (e.record.getString('athleteOut') === e.record.getString('athleteIn')) {
		throw new BadRequestError(
			'invalid_substitution: The replacement athlete must differ from the replaced athlete.'
		);
	}
	// The replaced athlete must hold an active roster spot on this entry.
	const rostered = e.app.findRecordsByFilter(
		'roster_memberships',
		"entry = {:entry} && athlete = {:athlete} && status = 'active'",
		'',
		1,
		0,
		{ entry: e.record.getString('entry'), athlete: e.record.getString('athleteOut') }
	);
	if (rostered.length === 0) {
		throw new BadRequestError(
			'athlete_not_rostered: The replaced athlete must hold an active roster spot on this season entry.'
		);
	}
	// The replacement must be an active reserve member in the entry's season.
	const reserved = e.app.findRecordsByFilter(
		'reserve_members',
		"season = {:season} && athlete = {:athlete} && status = 'active'",
		'',
		1,
		0,
		{ season: seasonId, athlete: e.record.getString('athleteIn') }
	);
	if (reserved.length === 0) {
		throw new BadRequestError(
			'athlete_not_reserve: The replacement athlete must be an active reserve-pool member for this season.'
		);
	}
	// Recorded author comes from the authenticated caller — anything the
	// client sent is overwritten. The create rule already requires an
	// Owner/Admin membership, so auth is always present here.
	if (!e.auth || !e.auth.id) {
		throw new BadRequestError('unauthenticated: A substitution requires a signed-in recorder.');
	}
	e.record.set('recordedBy', e.auth.id);
	e.next();
}, 'substitutions');
