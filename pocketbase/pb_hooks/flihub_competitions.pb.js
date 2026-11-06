/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phase 1D — capability gate + relationship integrity for the
 * competition-structure collections (teams, leagues, seasons, divisions,
 * season_entries, events).
 *
 * Role enforcement lives in the collection API rules (Owner/Admin write, any
 * member reads, delete locked). These hooks add what rules cannot express:
 *
 * 1. Capability gate: the organization must have the matching capability
 *    enabled — teams→`teams`, leagues/seasons/divisions/season_entries→
 *    `leagues-seasons`, events→`events` — or the write is rejected, including
 *    direct API requests. Reads stay open: disabling hides the workflow,
 *    never the data.
 * 2. Organization boundary: every relation target must belong to the same
 *    organization as the record being written (cross-org links rejected),
 *    and a record's organization is immutable on update — the persisted
 *    record is the source of truth, so records cannot be relocated into an
 *    organization the actor may not even belong to.
 * 3. D12 decisions: a season entry's optional division must belong to the
 *    entry's season; duplicate entries per (season, team) are prevented by a
 *    unique index; an event's optional season must be same-org.
 *
 * JSVM notes (verified on v0.40): handler-first registration; handlers are
 * serialized and re-evaluated per invocation with only `$app` bound — every
 * handler below is fully self-contained.
 */

// --- teams (capability: teams) — gate only, no relations to check ---
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
	e.next();
}, 'teams');

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
	// Integrity: organization is immutable on update — the persisted record is
	// the source of truth; moving a record cross-org would orphan its links.
	const originalTeam = e.record.original();
	if (
		originalTeam &&
		originalTeam.getString('organization') !== e.record.getString('organization')
	) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	e.next();
}, 'teams');

// --- leagues (capability: leagues-seasons) — gate only ---
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('leagues-seasons')) {
		throw new BadRequestError(
			'capability_disabled: The Leagues & seasons capability is not enabled for this organization.'
		);
	}
	e.next();
}, 'leagues');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('leagues-seasons')) {
		throw new BadRequestError(
			'capability_disabled: The Leagues & seasons capability is not enabled for this organization.'
		);
	}
	const originalLeague = e.record.original();
	if (
		originalLeague &&
		originalLeague.getString('organization') !== e.record.getString('organization')
	) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	e.next();
}, 'leagues');

// --- seasons (capability: leagues-seasons) — league must be same-org; date order ---
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('leagues-seasons')) {
		throw new BadRequestError(
			'capability_disabled: The Leagues & seasons capability is not enabled for this organization.'
		);
	}
	let league;
	try {
		league = e.app.findRecordById('leagues', e.record.getString('league'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected league does not exist.');
	}
	if (league.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A season cannot be linked to a league from another organization.'
		);
	}
	const startsOn = e.record.getString('startsOn');
	const endsOn = e.record.getString('endsOn');
	if (startsOn && endsOn && startsOn > endsOn) {
		throw new BadRequestError('invalid_schedule: The season start must be on or before its end.');
	}
	e.next();
}, 'seasons');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('leagues-seasons')) {
		throw new BadRequestError(
			'capability_disabled: The Leagues & seasons capability is not enabled for this organization.'
		);
	}
	const originalSeason = e.record.original();
	if (
		originalSeason &&
		originalSeason.getString('organization') !== e.record.getString('organization')
	) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	let league;
	try {
		league = e.app.findRecordById('leagues', e.record.getString('league'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected league does not exist.');
	}
	if (league.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A season cannot be linked to a league from another organization.'
		);
	}
	const startsOn = e.record.getString('startsOn');
	const endsOn = e.record.getString('endsOn');
	if (startsOn && endsOn && startsOn > endsOn) {
		throw new BadRequestError('invalid_schedule: The season start must be on or before its end.');
	}
	e.next();
}, 'seasons');

// --- divisions (capability: leagues-seasons) — season must be same-org ---
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('leagues-seasons')) {
		throw new BadRequestError(
			'capability_disabled: The Leagues & seasons capability is not enabled for this organization.'
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
			'cross_organization: A division cannot be linked to a season from another organization.'
		);
	}
	e.next();
}, 'divisions');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('leagues-seasons')) {
		throw new BadRequestError(
			'capability_disabled: The Leagues & seasons capability is not enabled for this organization.'
		);
	}
	// D12 integrity: a division's season is immutable — moving it would
	// silently invalidate existing season entries that reference it.
	// Organization is immutable too (persisted record is the source of truth).
	const originalDivision = e.record.original();
	if (
		originalDivision &&
		originalDivision.getString('organization') !== e.record.getString('organization')
	) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (originalDivision && originalDivision.getString('season') !== e.record.getString('season')) {
		throw new BadRequestError(
			'immutable_relation: A division cannot be moved to another season; archive it and create a new division.'
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
			'cross_organization: A division cannot be linked to a season from another organization.'
		);
	}
	e.next();
}, 'divisions');

// --- season_entries (capability: leagues-seasons) — season + team same-org;
//     optional division must belong to the entry's season (D12) ---
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('leagues-seasons')) {
		throw new BadRequestError(
			'capability_disabled: The Leagues & seasons capability is not enabled for this organization.'
		);
	}
	let season;
	let team;
	try {
		season = e.app.findRecordById('seasons', e.record.getString('season'));
		team = e.app.findRecordById('teams', e.record.getString('team'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected season or team does not exist.');
	}
	if (season.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A season entry cannot reference a season from another organization.'
		);
	}
	if (team.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A season entry cannot reference a team from another organization.'
		);
	}
	const divisionId = e.record.getString('division');
	if (divisionId) {
		let division;
		try {
			division = e.app.findRecordById('divisions', divisionId);
		} catch (_) {
			throw new BadRequestError('invalid_relation: The selected division does not exist.');
		}
		if (division.getString('season') !== e.record.getString('season')) {
			throw new BadRequestError(
				'division_not_in_season: The assigned division must belong to the same season as the entry.'
			);
		}
	}
	e.next();
}, 'season_entries');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('leagues-seasons')) {
		throw new BadRequestError(
			'capability_disabled: The Leagues & seasons capability is not enabled for this organization.'
		);
	}
	// D12 integrity: an entry's season and team are immutable — changing them
	// would bypass the duplicate-entry guarantee and orphan division links.
	// Organization is immutable too (persisted record is the source of truth).
	const originalEntry = e.record.original();
	if (
		originalEntry &&
		originalEntry.getString('organization') !== e.record.getString('organization')
	) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	if (
		originalEntry &&
		(originalEntry.getString('season') !== e.record.getString('season') ||
			originalEntry.getString('team') !== e.record.getString('team'))
	) {
		throw new BadRequestError(
			'immutable_relation: An entry season and team cannot change; withdraw it and create a new entry.'
		);
	}
	let season;
	let team;
	try {
		season = e.app.findRecordById('seasons', e.record.getString('season'));
		team = e.app.findRecordById('teams', e.record.getString('team'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected season or team does not exist.');
	}
	if (season.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A season entry cannot reference a season from another organization.'
		);
	}
	if (team.getString('organization') !== e.record.getString('organization')) {
		throw new BadRequestError(
			'cross_organization: A season entry cannot reference a team from another organization.'
		);
	}
	const divisionId = e.record.getString('division');
	if (divisionId) {
		let division;
		try {
			division = e.app.findRecordById('divisions', divisionId);
		} catch (_) {
			throw new BadRequestError('invalid_relation: The selected division does not exist.');
		}
		if (division.getString('season') !== e.record.getString('season')) {
			throw new BadRequestError(
				'division_not_in_season: The assigned division must belong to the same season as the entry.'
			);
		}
	}
	e.next();
}, 'season_entries');

// --- events (capability: events) — optional season must be same-org (D12) ---
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
	const seasonId = e.record.getString('season');
	if (seasonId) {
		let season;
		try {
			season = e.app.findRecordById('seasons', seasonId);
		} catch (_) {
			throw new BadRequestError('invalid_relation: The selected season does not exist.');
		}
		if (season.getString('organization') !== e.record.getString('organization')) {
			throw new BadRequestError(
				'cross_organization: An event cannot be linked to a season from another organization.'
			);
		}
	}
	e.next();
}, 'events');

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
	const originalEvent = e.record.original();
	if (
		originalEvent &&
		originalEvent.getString('organization') !== e.record.getString('organization')
	) {
		throw new BadRequestError(
			'immutable_relation: A record cannot be moved to another organization.'
		);
	}
	const seasonId = e.record.getString('season');
	if (seasonId) {
		let season;
		try {
			season = e.app.findRecordById('seasons', seasonId);
		} catch (_) {
			throw new BadRequestError('invalid_relation: The selected season does not exist.');
		}
		if (season.getString('organization') !== e.record.getString('organization')) {
			throw new BadRequestError(
				'cross_organization: An event cannot be linked to a season from another organization.'
			);
		}
	}
	e.next();
}, 'events');
