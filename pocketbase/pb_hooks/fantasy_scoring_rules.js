/** Golf fantasy scores come only from published immutable result snapshots. */
function json(record, field, fallback) {
	const raw = record.get(field);
	if (raw === null || raw === undefined || raw === '') return fallback;
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw);
		} catch {
			return fallback;
		}
	}
	try {
		return JSON.parse(String(raw));
	} catch {
		return raw;
	}
}
function resultFor(app, eventId) {
	const rows = app.findRecordsByFilter('event_results', 'event = {:event}', '', 2, 0, {
		event: eventId
	});
	if (rows.length > 1) throw new BadRequestError('invalid_result: Multiple event results exist.');
	return rows[0] ?? null;
}
function isRosterLocked(app, draft) {
	if (draft.getString('scoringRosterLockedAt')) return true;
	const event = app.findRecordById('events', draft.getString('event'));
	if (event.getString('fantasyCutoffAt') || event.getString('status') === 'active') return true;
	const result = resultFor(app, event.id);
	return !!result && Number(result.get('publishedVersion')) > 0;
}
function assertRosterMutable(app, draft) {
	if (isRosterLocked(app, draft))
		throw new BadRequestError(
			'roster_locked: Event activation or publication has locked this fantasy roster.'
		);
}
function allRows(app, table, filter, params) {
	const out = [];
	const seen = new Set();
	for (let offset = 0; ; offset += 500) {
		const page = app.findRecordsByFilter(table, filter, 'id', 500, offset, params);
		for (const r of page) {
			if (seen.has(r.id)) throw new BadRequestError('invalid_data: Repeated records while paging.');
			seen.add(r.id);
			out.push(r);
		}
		if (page.length < 500) return out;
	}
}
function captureRoster(app, draft, orgId) {
	const order = json(draft, 'draftOrder', []);
	const invalid = (message) => ({ valid: false, message, participants: [] });
	if (
		!Array.isArray(order) ||
		order.length < 2 ||
		order.length > 12 ||
		new Set(order).size !== order.length ||
		order.some((id) => typeof id !== 'string' || !id)
	)
		return invalid('The saved draft order needs resolution.');
	const picks = allRows(app, 'fantasy_picks', 'draft = {:draft}', { draft: draft.id });
	if (picks.length !== order.length * 4)
		return invalid('The draft needs four picks for every participant.');
	const users = order.map((user) => {
		const account = app.findRecordById('users', user);
		return { user, name: account.getString('name') || 'Fantasy participant', athletes: [] };
	});
	const byUser = new Map(users.map((u) => [u.user, u]));
	const numbers = new Set();
	const originals = new Set();
	const effective = new Set();
	const substitutions = allRows(app, 'substitutions', 'event = {:event}', {
		event: draft.getString('event')
	});
	for (const pick of picks) {
		const number = pick.get('pickNumber');
		if (!Number.isSafeInteger(number) || number < 1 || number > picks.length || numbers.has(number))
			return invalid('Pick numbering needs resolution.');
		numbers.add(number);
		const round = Math.floor((number - 1) / order.length);
		const seat = (number - 1) % order.length;
		const owner = order[round % 2 === 0 ? seat : order.length - 1 - seat];
		if (
			pick.getString('organization') !== orgId ||
			pick.getString('league') !== draft.getString('league') ||
			pick.getString('manager') !== owner
		)
			return invalid('Pick ownership or league relationships need resolution.');
		const originalId = pick.getString('athlete');
		const replacementId = pick.getString('substituteAthlete');
		const id = replacementId || originalId;
		if (!originalId || originals.has(originalId) || effective.has(id))
			return invalid('Duplicate fantasy athlete ownership needs resolution.');
		originals.add(originalId);
		effective.add(id);
		const original = app.findRecordById('athletes', originalId);
		const athlete = replacementId ? app.findRecordById('athletes', replacementId) : original;
		const gender = athlete.getString('gender');
		if (
			original.getString('organization') !== orgId ||
			athlete.getString('organization') !== orgId ||
			!['male', 'female'].includes(gender) ||
			original.getString('gender') !== gender
		)
			return invalid('Athlete organization or division needs resolution.');
		const pending = substitutions.filter((r) => r.getString('athleteOut') === originalId);
		if (replacementId) {
			const sub = pending.find((r) => r.id === pick.getString('substitution'));
			if (
				pending.length !== 1 ||
				!sub ||
				sub.getString('athleteIn') !== id ||
				sub.getString('organization') !== orgId ||
				!pick.getString('substitutedAt') ||
				substitutions.some((r) => r.getString('athleteOut') === id)
			)
				return invalid('The designated substitution needs resolution.');
		} else if (pending.length || pick.getString('substitution'))
			return invalid('A designated event substitution has not been resolved.');
		byUser.get(owner).athletes.push({
			pick: pick.id,
			pickNumber: number,
			originalAthlete: originalId,
			originalName: (original.getString('firstName') + ' ' + original.getString('lastName')).trim(),
			athlete: id,
			name: (athlete.getString('firstName') + ' ' + athlete.getString('lastName')).trim(),
			gender,
			substituted: !!replacementId
		});
	}
	// A substitute may not already belong to any original roster slot.
	for (const user of users) {
		if (
			user.athletes.length !== 4 ||
			user.athletes.filter((a) => a.gender === 'male').length !== 2 ||
			user.athletes.filter((a) => a.gender === 'female').length !== 2
		)
			return invalid('Every participant needs two MPO and two FPO athletes.');
		for (const a of user.athletes)
			if (a.substituted && originals.has(a.athlete))
				return invalid('A substitute is already drafted elsewhere.');
		user.athletes.sort((a, b) => a.pickNumber - b.pickNumber);
	}
	return { valid: true, message: '', schemaVersion: 1, participants: users };
}
function validNumber(value) {
	return typeof value === 'number' && Number.isSafeInteger(value);
}
function athleteScore(snapshot, athleteId) {
	const matches = snapshot.athletes.filter((a) => a.athlete === athleteId);
	if (matches.length !== 1) return null;
	const a = matches[0];
	let strokes = 0;
	let par = 0;
	const rounds = [];
	if (a.complete !== true) return null;
	for (const r of snapshot.rounds) {
		const total = a.roundTotals?.[r.round];
		const savedPar = a.roundPars?.[r.round];
		const cells = a.roundScores?.[r.round];
		if (
			!validNumber(total) ||
			total < 1 ||
			savedPar !== r.par ||
			!cells ||
			Object.keys(cells).length !== r.holes.length
		)
			return null;
		let cellTotal = 0;
		for (const h of r.holes) {
			const value = cells[h.hole];
			if (!validNumber(value) || value < 1) return null;
			cellTotal += value;
		}
		if (cellTotal !== total || a.roundToPar?.[r.round] !== total - savedPar) return null;
		strokes += total;
		par += savedPar;
		rounds.push({
			number: r.number,
			name: String(r.name || ''),
			strokes: total,
			par: savedPar,
			score: total - savedPar
		});
	}
	if (
		!validNumber(strokes) ||
		!validNumber(par) ||
		a.total !== strokes ||
		a.par !== par ||
		a.scoreToPar !== strokes - par
	)
		return null;
	return {
		name: String(a.athleteName || ''),
		teamName: String(a.teamName || ''),
		strokes,
		par,
		score: strokes - par,
		rounds
	};
}
function validSnapshot(snapshot) {
	if (
		!snapshot ||
		snapshot.schemaVersion !== 2 ||
		snapshot.scoringConvention !== 'strokes-minus-par' ||
		snapshot.complete !== true ||
		!Array.isArray(snapshot.athletes) ||
		!Array.isArray(snapshot.rounds) ||
		!snapshot.rounds.length
	)
		return false;
	const rounds = new Set();
	const numbers = new Set();
	for (const r of snapshot.rounds) {
		if (
			!r.round ||
			rounds.has(r.round) ||
			!validNumber(r.number) ||
			r.number < 1 ||
			numbers.has(r.number) ||
			!Array.isArray(r.holes) ||
			!r.holes.length ||
			r.holeCount !== r.holes.length
		)
			return false;
		rounds.add(r.round);
		numbers.add(r.number);
		const ids = new Set();
		let par = 0;
		for (const h of r.holes) {
			if (!h.hole || ids.has(h.hole) || !validNumber(h.par) || h.par < 1) return false;
			ids.add(h.hole);
			par += h.par;
		}
		if (!validNumber(par) || r.par !== par) return false;
	}
	return true;
}
function buildStandings(app, draft, league, event) {
	const payload = {
		league: { id: league.id, name: league.getString('name') },
		event: { id: event.id, name: event.getString('name') },
		draft: draft.id,
		state: 'awaiting_results',
		message: 'Awaiting published official results.',
		version: null,
		publishedAt: '',
		correctionPending: false,
		rosterLockedAt: '',
		rows: []
	};
	if (draft.getString('status') !== 'complete' || draft.getBool('resolutionRequired'))
		return {
			...payload,
			state: 'roster_incomplete',
			message: 'This draft needs resolution before it can be scored.'
		};
	const result = resultFor(app, event.id);
	if (!result || Number(result.get('publishedVersion')) < 1) return payload;
	if (result.getString('organization') !== league.getString('organization'))
		throw new NotFoundError('Standings not found.');
	const version = Number(result.get('publishedVersion'));
	const versions = app.findRecordsByFilter(
		'result_versions',
		'result = {:result} && version = {:version}',
		'',
		2,
		0,
		{ result: result.id, version }
	);
	if (
		versions.length !== 1 ||
		versions[0].getString('event') !== event.id ||
		versions[0].getString('organization') !== league.getString('organization') ||
		!versions[0].getString('publishedAt')
	)
		return {
			...payload,
			state: 'unavailable',
			message: 'The published result version is unavailable.'
		};
	const snapshot = json(versions[0], 'totals', null);
	const meta = {
		...payload,
		version,
		publishedAt: versions[0].getString('publishedAt'),
		correctionPending:
			Number(result.get('currentVersion')) !== version ||
			result.getString('status') === 'correcting'
	};
	if (!validSnapshot(snapshot))
		return {
			...meta,
			state: 'legacy_snapshot',
			message:
				'This published version has no complete saved par snapshot. An organization owner must review and publish a new result version.'
		};
	let roster = json(draft, 'scoringRoster', null);
	if (draft.getString('scoringRosterLockedAt')) {
		if (
			!roster ||
			roster.schemaVersion !== 1 ||
			roster.valid !== true ||
			!Array.isArray(roster.participants) ||
			roster.participants.length < 2
		)
			return { ...meta, state: 'roster_incomplete', message: 'The locked roster needs review.' };
	} else {
		roster = captureRoster(app, draft, league.getString('organization'));
		if (!roster.valid) return { ...meta, state: 'roster_incomplete', message: roster.message };
		draft.set('scoringRoster', roster);
		draft.set('scoringRosterLockedAt', new Date().toISOString());
		app.save(draft);
	}
	const rows = roster.participants.map((participant) => {
		const athletes = participant.athletes.map((slot) => {
			const score = athleteScore(snapshot, slot.athlete);
			return {
				athlete: slot.athlete,
				name: score?.name || slot.name,
				originalName: slot.substituted ? slot.originalName : null,
				division: slot.gender === 'male' ? 'MPO' : 'FPO',
				teamName: score?.teamName || '',
				score: score?.score ?? null,
				strokes: score?.strokes ?? null,
				par: score?.par ?? null,
				rounds: score?.rounds ?? []
			};
		});
		let complete = athletes.length === 4 && athletes.every((a) => a.score !== null);
		let total = complete ? athletes.reduce((sum, a) => sum + a.score, 0) : null;
		if (total !== null && !Number.isSafeInteger(total)) {
			complete = false;
			total = null;
		}
		return {
			user: participant.user,
			name: participant.name,
			complete,
			scoredAthletes: athletes.filter((a) => a.score !== null).length,
			score: total,
			rank: null,
			athletes
		};
	});
	rows.sort(
		(a, b) =>
			Number(b.complete) - Number(a.complete) ||
			(a.score ?? 0) - (b.score ?? 0) ||
			a.name.localeCompare(b.name) ||
			a.user.localeCompare(b.user)
	);
	let previousScore = null;
	let previousRank = null;
	rows.forEach((row, index) => {
		if (!row.complete) return;
		row.rank = row.score === previousScore ? previousRank : index + 1;
		previousRank = row.rank;
		previousScore = row.score;
	});
	return {
		...meta,
		state: 'published',
		message: '',
		rosterLockedAt: draft.getString('scoringRosterLockedAt'),
		rows
	};
}
module.exports = {
	buildStandings,
	assertRosterMutable,
	isRosterLocked,
	captureRoster,
	athleteScore,
	validSnapshot
};
