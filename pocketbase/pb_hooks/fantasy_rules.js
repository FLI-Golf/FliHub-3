/// <reference path="../pb_data/types.d.ts" />
/**
 * Phases 2A–2B — shared fantasy draft logic (D18).
 *
 * Required by the trusted routes in flihub_fantasy.pb.js. The server owns
 * every draft invariant:
 *
 * - Snake order: the first-round manager order is drawn randomly ONCE when
 *   the draft is created (all seats filled) and persisted; direction
 *   reverses every round. Six managers × four rounds = 24 picks.
 * - Eligibility: the pool is the event's ACTIVE group athletes (the real
 *   event lineups), shown with their real event teams. Each completed
 *   fantasy roster holds exactly 2 MPO (male) and 2 FPO (female) athletes;
 *   a pick of a gender the manager already holds twice is rejected, which
 *   also guarantees rounds 3–4 can always complete validly.
 * - One selection per athlete per draft and one pick per turn — validated
 *   here inside a transaction and backstopped by unique indexes, so a
 *   manual pick racing the timeout produces exactly one pick and advances
 *   the turn exactly once.
 * - Timeouts: deadlines are persisted server-side. Expiry is processed
 *   lazily by the `tick` endpoint (any approved manager's poll): one
 *   overdue auto-pick per tick, choosing the highest-ranked AVAILABLE
 *   athlete (draft.rankings order) who fits the manager's remaining slots.
 *   If every manager disconnects, the draft simply pauses at the expired
 *   deadline — the first reconnect triggers the overdue auto-pick and the
 *   clock restarts from that moment. Nothing drafts invisibly off-line.
 *
 * This module is side-effect-free; write helpers expect the caller's
 * transactional app.
 */

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

function memberOf(app, leagueId, userId) {
	try {
		return app.findFirstRecordByFilter('fantasy_members', 'league = {:league} && user = {:user}', {
			league: leagueId,
			user: userId
		});
	} catch (_) {
		return null;
	}
}

function approvedMembers(app, leagueId) {
	return app.findRecordsByFilter(
		'fantasy_members',
		"league = {:league} && status = 'approved'",
		'created',
		100,
		0,
		{
			league: leagueId
		}
	);
}

function userName(app, userId, cache) {
	if (cache && cache.has(userId)) return cache.get(userId);
	let name = userId;
	try {
		const user = app.findRecordById('users', userId);
		name = user.getString('name') || user.getString('email') || userId;
	} catch (_) {
		name = userId;
	}
	if (cache) cache.set(userId, name);
	return name;
}

/**
 * The eligible pool: the event's active group athletes with their real
 * event teams, deterministically ordered (lastName, firstName, id). This
 * default order doubles as the placeholder auto-pick ranking — the
 * production ranking source is a recorded open decision (D18).
 */
function eligiblePool(app, eventId) {
	const assignments = app.findRecordsByFilter(
		'group_athletes',
		"event = {:event} && status = 'active'",
		'',
		2000,
		0,
		{ event: eventId }
	);
	const seen = new Set();
	const entryTeam = new Map();
	const pool = [];
	for (const row of assignments) {
		const athleteId = row.getString('athlete');
		if (seen.has(athleteId)) continue;
		seen.add(athleteId);
		const entryId = row.getString('entry');
		if (!entryTeam.has(entryId)) {
			try {
				const entry = app.findRecordById('season_entries', entryId);
				const team = app.findRecordById('teams', entry.getString('team'));
				entryTeam.set(entryId, team.getString('name'));
			} catch (_) {
				entryTeam.set(entryId, '');
			}
		}
		let athlete;
		try {
			athlete = app.findRecordById('athletes', athleteId);
		} catch (_) {
			continue;
		}
		pool.push({
			athlete: athleteId,
			firstName: athlete.getString('firstName'),
			lastName: athlete.getString('lastName'),
			name:
				athlete.getString('displayName') ||
				(athlete.getString('firstName') + ' ' + athlete.getString('lastName')).trim(),
			gender: athlete.getString('gender'),
			teamName: entryTeam.get(entryId) ?? ''
		});
	}
	pool.sort(
		(a, b) =>
			a.lastName.localeCompare(b.lastName) ||
			a.firstName.localeCompare(b.firstName) ||
			a.athlete.localeCompare(b.athlete)
	);
	return pool;
}

/** Snake position: who is on the clock for 1-based pickNumber. */
function snakeSeat(order, pickNumber) {
	const n = order.length;
	const round = Math.floor((pickNumber - 1) / n) + 1;
	const indexInRound = (pickNumber - 1) % n;
	const index = round % 2 === 1 ? indexInRound : n - 1 - indexInRound;
	return { round, manager: order[index] };
}

function picksOf(app, draftId) {
	return app.findRecordsByFilter('fantasy_picks', 'draft = {:draft}', 'pickNumber', 100, 0, {
		draft: draftId
	});
}

/** Must run inside the same transaction as any draft write. */
function assertBeforeCutoff(txApp, draft) {
	const event = txApp.findRecordById('events', draft.getString('event'));
	if (
		event.getString('fantasyCutoffAt') ||
		event.getString('status') === 'active' ||
		draft.getBool('resolutionRequired')
	) {
		throw new BadRequestError('activation_cutoff: Event activation has closed draft selections.');
	}
}

/**
 * Creates one pick inside the caller's transaction, enforcing turn order,
 * eligibility, the per-gender roster cap, and one-selection-per-athlete.
 * Advances the turn exactly once (new deadline, or completion after the
 * final pick). Throws BadRequestError codes for every violation.
 */
function performPick(txApp, draftId, managerId, athleteId, auto, now) {
	const draft = txApp.findRecordById('fantasy_drafts', draftId);
	assertBeforeCutoff(txApp, draft);
	if (draft.getString('status') !== 'active') {
		throw new BadRequestError('draft_not_active: The draft is not running.');
	}
	const order = readJson(draft, 'draftOrder', []);
	const currentPick = Number(draft.get('currentPick'));
	const totalPicks = order.length * 4;
	const seat = snakeSeat(order, currentPick);
	if (seat.manager !== managerId) {
		throw new BadRequestError('not_your_turn: Another fantasy participant is on the clock.');
	}
	const pool = eligiblePool(txApp, draft.getString('event'));
	const poolEntry = pool.find((p) => p.athlete === athleteId);
	if (!poolEntry) {
		throw new BadRequestError('not_eligible: That athlete is not in this event\u2019s pool.');
	}
	const existing = picksOf(txApp, draftId);
	if (existing.some((p) => p.getString('athlete') === athleteId)) {
		throw new BadRequestError('already_picked: That athlete is already on a roster.');
	}
	const genderById = new Map(pool.map((p) => [p.athlete, p.gender]));
	const mine = existing.filter((p) => p.getString('manager') === managerId);
	const mineOfGender = mine.filter(
		(p) => genderById.get(p.getString('athlete')) === poolEntry.gender
	).length;
	if (mineOfGender >= 2) {
		throw new BadRequestError(
			'roster_full: Your roster already holds two ' +
				(poolEntry.gender === 'male' ? 'MPO' : 'FPO') +
				' athletes.'
		);
	}
	const picksCollection = txApp.findCollectionByNameOrId('fantasy_picks');
	const pick = new Record(picksCollection);
	pick.set('draft', draftId);
	pick.set('league', draft.getString('league'));
	pick.set('organization', draft.getString('organization'));
	pick.set('pickNumber', currentPick);
	pick.set('round', seat.round);
	pick.set('manager', managerId);
	pick.set('athlete', athleteId);
	pick.set('auto', auto);
	txApp.save(pick);

	if (currentPick >= totalPicks) {
		draft.set('status', 'complete');
		draft.set('completedAt', now.toISOString());
		draft.set('deadline', '');
	} else {
		draft.set('currentPick', currentPick + 1);
		draft.set(
			'deadline',
			new Date(now.getTime() + Number(draft.get('pickSeconds')) * 1000).toISOString()
		);
	}
	txApp.save(draft);
	return pick;
}

/**
 * The highest-ranked AVAILABLE athlete who fits the manager's remaining
 * roster slots: draft.rankings order first, then any pool stragglers in
 * deterministic pool order (defensive — rankings normally cover the pool).
 */
function autoPickAthlete(txApp, draft, managerId) {
	const pool = eligiblePool(txApp, draft.getString('event'));
	const byId = new Map(pool.map((p) => [p.athlete, p]));
	const existing = picksOf(txApp, draft.id);
	const taken = new Set(existing.map((p) => p.getString('athlete')));
	const mine = existing.filter((p) => p.getString('manager') === managerId);
	const mineGender = { male: 0, female: 0 };
	for (const p of mine) {
		const entry = byId.get(p.getString('athlete'));
		if (entry) mineGender[entry.gender] += 1;
	}
	const rankings = readJson(draft, 'rankings', []);
	const candidates = rankings.concat(pool.map((p) => p.athlete));
	for (const athleteId of candidates) {
		const entry = byId.get(athleteId);
		if (!entry || taken.has(athleteId)) continue;
		if (mineGender[entry.gender] >= 2) continue;
		return athleteId;
	}
	return null;
}

/** The complete server-owned board every manager polls and reconnects to. */
function buildBoard(app, draft, callerId) {
	const league = app.findRecordById('fantasy_leagues', draft.getString('league'));
	let eventName = '';
	try {
		eventName = app.findRecordById('events', draft.getString('event')).getString('name');
	} catch (_) {
		eventName = '';
	}
	const names = new Map();
	const order = readJson(draft, 'draftOrder', []);
	const pool = eligiblePool(app, draft.getString('event'));
	const poolById = new Map(pool.map((p) => [p.athlete, p]));
	const picks = picksOf(app, draft.id);
	const pickedBy = new Map(picks.map((p) => [p.getString('athlete'), p.getString('manager')]));
	const status = draft.getString('status');
	const currentPick = Number(draft.get('currentPick'));
	const seat = ['active', 'paused'].includes(status) ? snakeSeat(order, currentPick) : null;

	const rosters = order.map((userId) => {
		const minePicks = picks.filter((p) => p.getString('manager') === userId);
		const athletes = minePicks.map((p) => {
			const original = poolById.get(p.getString('athlete'));
			const substituteId = p.getString('substituteAthlete');
			const substitute = substituteId ? poolSubstitute(app, substituteId) : null;
			return {
				pickNumber: Number(p.get('pickNumber')),
				round: Number(p.get('round')),
				auto: p.getBool('auto'),
				athlete: p.getString('athlete'),
				name: original?.name ?? p.getString('athlete'),
				gender: original?.gender ?? '',
				teamName: original?.teamName ?? '',
				substituteAthlete: substituteId || null,
				substituteName: substitute?.name ?? null
			};
		});
		const maleCount = athletes.filter((a) => a.gender === 'male').length;
		const femaleCount = athletes.filter((a) => a.gender === 'female').length;
		return { user: userId, name: userName(app, userId, names), athletes, maleCount, femaleCount };
	});

	// Designated event substitutions awaiting application (complete drafts).
	const pendingSubstitutions = [];
	if (status === 'complete') {
		let subs = [];
		try {
			subs = app.findRecordsByFilter('substitutions', 'event = {:event}', '-created', 200, 0, {
				event: draft.getString('event')
			});
		} catch (_) {
			subs = [];
		}
		const latestByOut = new Map();
		for (const sub of subs) {
			const out = sub.getString('athleteOut');
			if (!latestByOut.has(out)) latestByOut.set(out, sub);
		}
		for (const p of picks) {
			if (p.getString('substituteAthlete')) continue;
			const sub = latestByOut.get(p.getString('athlete'));
			if (!sub) continue;
			pendingSubstitutions.push({
				pick: p.id,
				pickNumber: Number(p.get('pickNumber')),
				manager: p.getString('manager'),
				managerName: userName(app, p.getString('manager'), names),
				athleteOut: sub.getString('athleteOut'),
				athleteOutName: poolById.get(sub.getString('athleteOut'))?.name ?? '',
				athleteIn: sub.getString('athleteIn'),
				athleteInName: poolSubstitute(app, sub.getString('athleteIn'))?.name ?? ''
			});
		}
	}

	return {
		league: { id: league.id, name: league.getString('name'), owner: league.getString('owner') },
		event: { id: draft.getString('event'), name: eventName },
		draft: {
			id: draft.id,
			status,
			resolutionRequired: draft.getBool('resolutionRequired'),
			pickSeconds: Number(draft.get('pickSeconds')),
			currentPick,
			totalPicks: order.length * 4,
			round: seat?.round ?? null,
			onTheClock: seat ? { user: seat.manager, name: userName(app, seat.manager, names) } : null,
			deadline: String(draft.get('deadline') ?? ''),
			pausedRemainingMs: Number(draft.get('pausedRemainingMs') ?? 0),
			startedAt: String(draft.get('startedAt') ?? ''),
			completedAt: String(draft.get('completedAt') ?? '')
		},
		recommendedAthlete:
			status === 'active' && seat ? autoPickAthlete(app, draft, seat.manager) : null,
		order: order.map((userId) => ({ user: userId, name: userName(app, userId, names) })),
		pool: pool.map((p) => ({
			athlete: p.athlete,
			name: p.name,
			gender: p.gender,
			division: p.gender === 'male' ? 'MPO' : 'FPO',
			teamName: p.teamName,
			pickedBy: pickedBy.get(p.athlete) ?? null
		})),
		picks: picks.map((p) => ({
			pickNumber: Number(p.get('pickNumber')),
			round: Number(p.get('round')),
			manager: p.getString('manager'),
			managerName: userName(app, p.getString('manager'), names),
			athlete: p.getString('athlete'),
			athleteName: poolById.get(p.getString('athlete'))?.name ?? '',
			teamName: poolById.get(p.getString('athlete'))?.teamName ?? '',
			auto: p.getBool('auto'),
			substituteAthlete: p.getString('substituteAthlete') || null
		})),
		rosters,
		pendingSubstitutions,
		myTurn: status === 'active' && seat ? seat.manager === callerId : false,
		me: callerId,
		serverNow: new Date().toISOString()
	};
}

/** Athlete lookup for substitutes who may sit outside the event pool. */
function poolSubstitute(app, athleteId) {
	try {
		const athlete = app.findRecordById('athletes', athleteId);
		return {
			name:
				athlete.getString('displayName') ||
				(athlete.getString('firstName') + ' ' + athlete.getString('lastName')).trim(),
			gender: athlete.getString('gender')
		};
	} catch (_) {
		return null;
	}
}

module.exports = {
	readJson,
	memberOf,
	approvedMembers,
	userName,
	eligiblePool,
	snakeSeat,
	picksOf,
	assertBeforeCutoff,
	performPick,
	autoPickAthlete,
	buildBoard,
	poolSubstitute
};
