/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1I — shared publication-rule layer.
 *
 * THE single source of truth for what FliHub exposes publicly. The hosted
 * public page (/o/<slug>, Phase 1I) consumes it through
 * pb_hooks/flihub_public.pb.js; the later website embeds (Phase 2E) and the
 * read-only public API (Phase 2F) must reuse these exact functions — never
 * fork the field whitelists or eligibility filters.
 *
 * Rules enforced here (Milestones.md Phase 1I + D16 + Dustin 2026-11-07):
 *
 * - A page is public only after an explicit publish (org.publicPublished)
 *   with a reserved slug. Publication is per-record: events, teams, and
 *   athletes appear only when their own publicPublished flag is set.
 * - Athlete public display fields are exactly the D11 set (display name,
 *   gender, nationality). Private athlete data lives in athlete_private and
 *   is never read here.
 * - Results and standings use ONLY the currently PUBLISHED official result
 *   version of each publicly published event (event_results.publishedVersion,
 *   D16). Approved-but-unpublished corrections never leak: until
 *   republication the previously published version keeps counting, and a
 *   republished correction replaces it exactly once.
 * - Standings aggregate by summing total strokes across the season's
 *   eligible events (lowest total leads); a row is RANKED only when it has a
 *   result in every counted event of that view — incomplete participation is
 *   shown Unranked with its strokes and "played of counted" (missing results
 *   never add strokes). Events without a season would stand alone. Equal
 *   totals among ranked rows share a position (competition ranking, e.g.
 *   1-1-3) — no invented tie-break; a needed winner is resolved after the
 *   round where the tie occurs (recorded future work, not Phase 1I). Par
 *   totals are included so scores render relative to par (under par red,
 *   exactly par blue, over par black) — a display preference that never
 *   affects ranking.
 * - Corrected results carry a "corrected" indicator with the republication
 *   date (publishedVersion > 1); correction reasons stay private.
 *
 * This module is require()d by hook handlers; it must stay dependency-free
 * and side-effect-free.
 */

const RESERVED_SLUGS = [
	'about',
	'admin',
	'api',
	'app',
	'flihub',
	'help',
	'invitations',
	'login',
	'logout',
	'o',
	'organizations',
	'register',
	'settings',
	'verify-email',
	'walkthroughs'
];

/** Lowercase a–z/0–9 with single interior hyphens, 3–50 chars. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Returns null when valid, otherwise a user-facing problem description. */
function validateSlug(slug) {
	if (typeof slug !== 'string' || slug.length < 3 || slug.length > 50) {
		return 'Slugs need 3\u201350 characters.';
	}
	if (!SLUG_PATTERN.test(slug)) {
		return 'Slugs may only use lowercase letters, digits, and single hyphens (no leading, trailing, or double hyphens).';
	}
	if (RESERVED_SLUGS.includes(slug)) {
		return 'That slug is reserved.';
	}
	return null;
}

/** goja exposes PocketBase JSON fields as byte arrays — decode defensively. */
function readJson(record, field, fallback) {
	const raw = record.get(field);
	if (raw === null || raw === undefined) return fallback;
	const text = typeof raw === 'string' ? raw : String(raw);
	if (text.trim() === '' || text.trim() === 'null') return fallback;
	try {
		return JSON.parse(text);
	} catch (_) {
		return fallback;
	}
}

function capabilitiesOf(org) {
	const parsed = readJson(org, 'capabilities', []);
	return Array.isArray(parsed) ? parsed.map(String) : [];
}

/** Competition ranking with shared tied positions (1, 1, 3, …). */
function rankRows(rows) {
	const ranked = rows.slice().sort((a, b) => a.total - b.total);
	for (let i = 0; i < ranked.length; i++) {
		ranked[i].rank = i > 0 && ranked[i].total === ranked[i - 1].total ? ranked[i - 1].rank : i + 1;
	}
	return ranked;
}

/**
 * Par for one regulation pass of a round's course (sum of active hole pars),
 * or null when the course configuration is unavailable. Par comes from the
 * CURRENT course configuration — totals are snapshots, par is display-only.
 */
function roundPar(app, roundId, cache) {
	if (cache.has(roundId)) return cache.get(roundId);
	let par = null;
	try {
		const round = app.findRecordById('rounds', roundId);
		const courseId = round.getString('course');
		if (courseId) {
			const holes = app.findRecordsByFilter(
				'course_holes',
				"course = {:course} && status = 'active'",
				'number',
				500,
				0,
				{ course: courseId }
			);
			par = 0;
			for (const hole of holes) par += Number(hole.get('par') ?? 0);
		}
	} catch (_) {
		par = null;
	}
	cache.set(roundId, par);
	return par;
}

/**
 * The currently published official result version for an event, or null.
 * Pending (approved-but-unpublished) versions are deliberately invisible.
 */
function publishedVersionFor(app, orgId, eventId) {
	let result;
	try {
		result = app.findFirstRecordByFilter(
			'event_results',
			'organization = {:org} && event = {:event}',
			{ org: orgId, event: eventId }
		);
	} catch (_) {
		return null;
	}
	const publishedVersion = Number(result.get('publishedVersion') ?? 0);
	if (publishedVersion < 1) return null;
	let version;
	try {
		version = app.findFirstRecordByFilter(
			'result_versions',
			'result = {:result} && version = {:version}',
			{ result: result.id, version: publishedVersion }
		);
	} catch (_) {
		return null;
	}
	return {
		version: publishedVersion,
		corrected: publishedVersion > 1,
		publishedAt: String(version.get('publishedAt') ?? ''),
		totals: readJson(version, 'totals', null)
	};
}

/**
 * One event's published result as a public DTO (whitelisted fields only),
 * with par totals attached, or null when the event has no published result.
 */
function publicEventResult(app, orgId, event, parCache) {
	const published = publishedVersionFor(app, orgId, event.id);
	if (!published || !published.totals) return null;
	const totals = published.totals;
	const rounds = Array.isArray(totals.rounds) ? totals.rounds : [];
	let eventPar = 0;
	let parKnown = true;
	for (const r of rounds) {
		const par = roundPar(app, String(r.round), parCache);
		if (par === null) {
			parKnown = false;
			break;
		}
		eventPar += par;
	}
	const athletes = (Array.isArray(totals.athletes) ? totals.athletes : []).map((a) => ({
		athleteName: String(a.athleteName ?? ''),
		teamName: String(a.teamName ?? ''),
		entry: String(a.entry ?? ''),
		athlete: String(a.athlete ?? ''),
		total: Number(a.total ?? 0),
		par: parKnown ? eventPar : null
	}));
	const athleteCountByEntry = new Map();
	for (const a of athletes) {
		athleteCountByEntry.set(a.entry, (athleteCountByEntry.get(a.entry) ?? 0) + 1);
	}
	const teams = (Array.isArray(totals.teams) ? totals.teams : []).map((t) => ({
		teamName: String(t.teamName ?? ''),
		entry: String(t.entry ?? ''),
		total: Number(t.total ?? 0),
		par: parKnown ? eventPar * (athleteCountByEntry.get(String(t.entry ?? '')) ?? 0) : null
	}));
	return {
		event: event.id,
		eventName: event.getString('name'),
		startsAt: String(event.get('startsAt') ?? ''),
		season: event.getString('season') || null,
		corrected: published.corrected,
		correctedAt: published.corrected ? published.publishedAt : null,
		publishedAt: published.publishedAt,
		teams: rankRows(teams),
		athletes: rankRows(athletes)
	};
}

/**
 * Standings for the given events (already filtered for eligibility by the
 * caller): per-season aggregation by summed strokes plus standalone-event
 * tables. Only events with a currently published official result count.
 */
function buildStandings(app, orgId, events, parCache) {
	const seasonName = new Map();
	const resolveSeasonName = (seasonId) => {
		if (!seasonName.has(seasonId)) {
			try {
				seasonName.set(seasonId, app.findRecordById('seasons', seasonId).getString('name'));
			} catch (_) {
				seasonName.set(seasonId, '');
			}
		}
		return seasonName.get(seasonId);
	};

	const bySeason = new Map();
	const standalone = [];
	for (const event of events) {
		const result = publicEventResult(app, orgId, event, parCache);
		if (!result) continue;
		if (result.season) {
			if (!bySeason.has(result.season)) bySeason.set(result.season, []);
			bySeason.get(result.season).push(result);
		} else {
			standalone.push(result);
		}
	}

	const aggregate = (results, key, label) => {
		// Every event with a currently published official result in THIS view
		// is a counted event; a row is ranked only with complete participation.
		const counted = results.length;
		const rows = new Map();
		for (const result of results) {
			for (const row of result[key === 'entry' ? 'teams' : 'athletes']) {
				const id = key === 'entry' ? row.entry : row.athlete;
				if (!rows.has(id)) {
					rows.set(id, {
						name: key === 'entry' ? row.teamName : row[label],
						played: 0,
						total: 0,
						par: 0,
						parKnown: true
					});
				}
				const bucket = rows.get(id);
				bucket.played += 1;
				bucket.total += row.total;
				if (row.par === null) bucket.parKnown = false;
				else bucket.par += row.par;
			}
		}
		const toRow = (r) => ({
			name: r.name,
			played: r.played,
			eventsCounted: counted,
			total: r.total,
			par: r.parKnown ? r.par : null,
			diff: r.parKnown ? r.total - r.par : null
		});
		// D17: lowest summed strokes ranks only rows with a result in every
		// counted event (missing results never add strokes — they make the row
		// Unranked instead); equal totals among ranked rows share a rank.
		// Unranked rows follow, with their strokes and "played of counted".
		const all = Array.from(rows.values());
		const ranked = rankRows(all.filter((r) => r.played === counted).map(toRow));
		const unranked = all
			.filter((r) => r.played < counted)
			.map((r) => ({ ...toRow(r), rank: null }))
			.sort((a, b) => a.total - b.total);
		return ranked.concat(unranked);
	};

	const tables = [];
	for (const [seasonId, results] of bySeason) {
		results.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
		tables.push({
			scope: 'season',
			season: seasonId,
			seasonName: resolveSeasonName(seasonId),
			events: results.map((r) => ({ event: r.event, eventName: r.eventName })),
			teams: aggregate(results, 'entry', 'teamName'),
			athletes: aggregate(results, 'athlete', 'athleteName')
		});
	}
	for (const result of standalone) {
		tables.push({
			scope: 'event',
			event: result.event,
			eventName: result.eventName,
			events: [{ event: result.event, eventName: result.eventName }],
			teams: aggregate([result], 'entry', 'teamName'),
			athletes: aggregate([result], 'athlete', 'athleteName')
		});
	}
	tables.sort((a, b) =>
		String(a.seasonName ?? a.eventName).localeCompare(String(b.seasonName ?? b.eventName))
	);
	return tables;
}

/** Eligible events for PUBLIC consumption: explicitly published records. */
function publicEvents(app, orgId) {
	return app.findRecordsByFilter(
		'events',
		"organization = {:org} && publicPublished = true && status != 'archived'",
		'startsAt,name',
		500,
		0,
		{ org: orgId }
	);
}

/**
 * The complete public page payload for one organization — every field a
 * visitor (or embed, or public API client) may see, and nothing else.
 * Returns the identical document for preview; `preview` only controls
 * whether the caller was allowed to see an unpublished page.
 */
function buildPublicPage(app, org) {
	const caps = capabilitiesOf(org);
	const sections = [];
	if (caps.includes('events')) sections.push('schedule');
	if (caps.includes('teams')) sections.push('teams');
	if (caps.includes('athletes')) sections.push('athletes');
	if (caps.includes('scoring-results')) sections.push('results');
	if (caps.includes('standings')) sections.push('standings');

	const payload = {
		organization: {
			name: org.getString('name'),
			tagline: org.getString('tagline'),
			logoUrl: org.getString('logoUrl'),
			themePrimary: org.getString('themePrimary'),
			themeSecondary: org.getString('themeSecondary'),
			slug: org.getString('publicSlug')
		},
		sections
	};

	const parCache = new Map();
	const events = sections.length > 0 ? publicEvents(app, org.id) : [];
	const seasonName = new Map();
	const resolveSeasonName = (seasonId) => {
		if (!seasonId) return null;
		if (!seasonName.has(seasonId)) {
			try {
				seasonName.set(seasonId, app.findRecordById('seasons', seasonId).getString('name'));
			} catch (_) {
				seasonName.set(seasonId, '');
			}
		}
		return seasonName.get(seasonId);
	};

	if (sections.includes('schedule')) {
		payload.schedule = events.map((ev) => ({
			event: ev.id,
			name: ev.getString('name'),
			status: ev.getString('status'),
			startsAt: String(ev.get('startsAt') ?? ''),
			seasonName: resolveSeasonName(ev.getString('season') || null)
		}));
	}
	if (sections.includes('teams')) {
		payload.teams = app
			.findRecordsByFilter(
				'teams',
				"organization = {:org} && publicPublished = true && status = 'active'",
				'name',
				500,
				0,
				{ org: org.id }
			)
			.map((t) => ({ name: t.getString('name') }));
	}
	if (sections.includes('athletes')) {
		payload.athletes = app
			.findRecordsByFilter(
				'athletes',
				"organization = {:org} && publicPublished = true && status = 'active'",
				'lastName,firstName',
				1000,
				0,
				{ org: org.id }
			)
			.map((a) => ({
				// D11 public display fields only — athlete_private is never read.
				displayName:
					a.getString('displayName') ||
					(a.getString('firstName') + ' ' + a.getString('lastName')).trim(),
				gender: a.getString('gender'),
				nationality: a.getString('nationality')
			}));
	}
	if (sections.includes('results')) {
		payload.results = [];
		for (const ev of events) {
			const result = publicEventResult(app, org.id, ev, parCache);
			if (result) payload.results.push(result);
		}
	}
	if (sections.includes('standings')) {
		payload.standings = buildStandings(app, org.id, events, parCache);
	}
	return payload;
}

/**
 * Member-facing standings input (cap/standings): ALL of the organization's
 * events with a currently published official result — the per-record public
 * flag only gates the PUBLIC surfaces (D16: published version totals are the
 * standings input; members already read official results).
 */
function buildMemberStandings(app, orgId) {
	const events = app.findRecordsByFilter(
		'events',
		"organization = {:org} && status != 'archived'",
		'startsAt,name',
		500,
		0,
		{ org: orgId }
	);
	return buildStandings(app, orgId, events, new Map());
}

module.exports = {
	RESERVED_SLUGS,
	validateSlug,
	buildPublicPage,
	buildMemberStandings
};
