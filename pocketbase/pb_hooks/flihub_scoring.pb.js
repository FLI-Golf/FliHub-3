/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phase 1G — capability gate + integrity for mobile scorekeeping
 * (scorecards, scores, score_changes). Decisions recorded as D15.
 *
 * The permission matrix lives in the collection API rules (Owner/Admin, or
 * Scorekeeper role WITH an active group assignment in the same event;
 * score writes additionally require the scorecard to be draft; any member
 * reads; deletes locked). These hooks add what rules cannot express:
 *
 * 1. Capability gate: all three collections belong to `scoring-results`.
 *    Writes are rejected when it is disabled, including direct API requests.
 *    Reads stay open: disabling hides the workflow, never the data.
 * 2. Derivation and integrity: a scorecard's event comes from its group and
 *    its round must belong to that same event and reference a course (no
 *    course → no holes to score). A score's event/round/group come from its
 *    scorecard, its entry comes from the athlete's active group assignment,
 *    and its hole must be an active hole of the round's course — all derived
 *    server-side, never trusted from the client. Scores stay keyed by
 *    (round, PHYSICAL hole): a second pass may display holes 10–18 but
 *    nothing here ever renumbers storage.
 * 3. Draft → Submitted: submission is rejected while any (group athlete ×
 *    active course hole) cell is missing — a missing score is an absent row,
 *    never zero. Submitting stamps submittedBy/submittedAt from the caller.
 *    A submitted scorecard cannot be edited in place (`submitted_locked`);
 *    Owners/Admins REOPEN it to draft (rule-restricted), which clears the
 *    submission stamp and touches nothing else — score values and their
 *    recorded authorship are preserved.
 * 4. Authorship and history: `enteredBy` is set from the authenticated
 *    caller on every create and update (client values overwritten), and
 *    every mutation appends a score_changes row (entered / updated with
 *    previous and new strokes / submitted / reopened) written internally
 *    after the save succeeds.
 *
 * JSVM notes (verified on v0.40): handler-first registration; handlers are
 * serialized and re-evaluated per invocation with only `$app` bound — every
 * handler below is fully self-contained. Statements after e.next() run after
 * the save completes, which is where the history rows are written.
 */

// --- scorecards --------------------------------------------------------------
onRecordCreateRequest((e) => {
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
	let group;
	let round;
	try {
		group = e.app.findRecordById('event_groups', e.record.getString('group'));
		round = e.app.findRecordById('rounds', e.record.getString('round'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected group or round does not exist.');
	}
	const orgId = e.record.getString('organization');
	if (group.getString('organization') !== orgId || round.getString('organization') !== orgId) {
		throw new BadRequestError(
			'cross_organization: A scorecard cannot reference records from another organization.'
		);
	}
	// Event is derived from the group, never trusted from the client; the
	// round must belong to that same event and must reference a course.
	const eventId = group.getString('event');
	e.record.set('event', eventId);
	if (round.getString('event') !== eventId) {
		throw new BadRequestError(
			'round_not_in_event: The round must belong to the same event as the group.'
		);
	}
	if (!round.getString('course')) {
		throw new BadRequestError(
			'round_without_course: Scoring needs the round to reference a course — its holes define the scorecard cells.'
		);
	}
	// 1H (D16): once the event has an approved or published official result,
	// no new scorecard can appear — reopen the result first.
	const results = e.app.findRecordsByFilter('event_results', 'event = {:event}', '', 1, 0, {
		event: eventId
	});
	if (results.length > 0 && results[0].getString('status') !== 'correcting') {
		throw new BadRequestError(
			'result_locked: The event has an ' +
				results[0].getString('status') +
				' official result — reopen the result (with a reason) before changing its scoring.'
		);
	}
	// Scorecards always start as drafts with no submission stamp.
	e.record.set('status', 'draft');
	e.record.set('submittedBy', '');
	e.record.set('submittedAt', '');
	e.next();
}, 'scorecards');

onRecordUpdateRequest((e) => {
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
			original.getString('event') !== e.record.getString('event') ||
			original.getString('round') !== e.record.getString('round') ||
			original.getString('group') !== e.record.getString('group'))
	) {
		throw new BadRequestError(
			'immutable_relation: A scorecard cannot be rewired; its organization, event, round, and group are fixed.'
		);
	}
	const prevStatus = original ? original.getString('status') : 'draft';
	const nextStatus = e.record.getString('status');
	let logAction = '';
	let reopenReason = '';
	if (prevStatus === 'draft' && nextStatus === 'submitted') {
		// Submission requires every (group athlete × active course hole) cell.
		const round = e.app.findRecordById('rounds', e.record.getString('round'));
		const holes = e.app.findRecordsByFilter(
			'course_holes',
			"course = {:course} && status = 'active'",
			'number',
			500,
			0,
			{ course: round.getString('course') }
		);
		const athletes = e.app.findRecordsByFilter(
			'group_athletes',
			"group = {:group} && status = 'active'",
			'',
			500,
			0,
			{ group: e.record.getString('group') }
		);
		const existing = e.app.findRecordsByFilter('scores', 'scorecard = {:card}', '', 1000, 0, {
			card: e.record.id
		});
		const filled = new Set(existing.map((s) => s.getString('athlete') + '|' + s.getString('hole')));
		const missing = [];
		for (const athlete of athletes) {
			for (const hole of holes) {
				if (!filled.has(athlete.getString('athlete') + '|' + hole.id)) {
					missing.push('hole ' + String(hole.get('number')));
				}
			}
		}
		if (athletes.length === 0 || holes.length === 0) {
			throw new BadRequestError(
				'missing_scores: There is nothing to submit — the group needs assigned athletes and the course needs active holes.'
			);
		}
		if (missing.length > 0) {
			throw new BadRequestError(
				'missing_scores: ' +
					missing.length +
					' of ' +
					athletes.length * holes.length +
					' score cells are missing (first: ' +
					missing[0] +
					'). Missing scores never count as zero.'
			);
		}
		if (!e.auth || !e.auth.id) {
			throw new BadRequestError('unauthenticated: Submission requires a signed-in caller.');
		}
		e.record.set('submittedBy', e.auth.id);
		e.record.set('submittedAt', new Date().toISOString());
		logAction = 'submitted';
	} else if (prevStatus === 'submitted' && nextStatus === 'draft') {
		// Owner/Admin reopen (the update rule already excludes scorekeepers on
		// non-draft cards). A reason is required — from the UI form and the
		// direct API alike — and is recorded in the change history. Clears the
		// stamp; scores and their authorship are untouched.
		// 1H (D16): while the event's official result is approved or published,
		// scorecards stay locked — the result must be reopened first.
		const results = e.app.findRecordsByFilter('event_results', 'event = {:event}', '', 1, 0, {
			event: e.record.getString('event')
		});
		if (results.length > 0 && results[0].getString('status') !== 'correcting') {
			throw new BadRequestError(
				'result_locked: The event has an ' +
					results[0].getString('status') +
					' official result — reopen the result (with a reason) before reopening a scorecard.'
			);
		}
		const body = e.requestInfo().body || {};
		reopenReason = String(body.reason ?? '').trim();
		if (!reopenReason) {
			throw new BadRequestError(
				'reason_required: Reopening a submitted scorecard requires a reason; it is recorded in the change history.'
			);
		}
		e.record.set('submittedBy', '');
		e.record.set('submittedAt', '');
		logAction = 'reopened';
	} else if (prevStatus === 'submitted' && nextStatus === 'submitted') {
		throw new BadRequestError(
			'submitted_locked: Reopen the scorecard to draft before changing it.'
		);
	} else {
		// draft → draft: nothing else on the card is mutable.
		e.record.set('submittedBy', '');
		e.record.set('submittedAt', '');
	}
	e.next();
	if (logAction) {
		const collection = e.app.findCollectionByNameOrId('score_changes');
		const change = new Record(collection);
		change.set('organization', e.record.getString('organization'));
		change.set('event', e.record.getString('event'));
		change.set('scorecard', e.record.id);
		change.set('action', logAction);
		if (reopenReason) change.set('reason', reopenReason);
		change.set('author', e.auth.id);
		e.app.save(change);
	}
}, 'scorecards');

// --- scores ------------------------------------------------------------------
onRecordCreateRequest((e) => {
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
	let scorecard;
	let hole;
	try {
		scorecard = e.app.findRecordById('scorecards', e.record.getString('scorecard'));
		hole = e.app.findRecordById('course_holes', e.record.getString('hole'));
	} catch (_) {
		throw new BadRequestError('invalid_relation: The selected scorecard or hole does not exist.');
	}
	const orgId = e.record.getString('organization');
	if (scorecard.getString('organization') !== orgId || hole.getString('organization') !== orgId) {
		throw new BadRequestError(
			'cross_organization: A score cannot reference records from another organization.'
		);
	}
	if (scorecard.getString('status') !== 'draft') {
		throw new BadRequestError(
			'submitted_locked: This scorecard is submitted — reopen it to draft before entering scores.'
		);
	}
	// Event, round, and group are derived from the scorecard; the entry is
	// derived from the athlete's active assignment in that group — never
	// trusted from the client.
	e.record.set('event', scorecard.getString('event'));
	e.record.set('round', scorecard.getString('round'));
	e.record.set('group', scorecard.getString('group'));
	const assignment = e.app.findRecordsByFilter(
		'group_athletes',
		"group = {:group} && athlete = {:athlete} && status = 'active'",
		'',
		1,
		0,
		{ group: scorecard.getString('group'), athlete: e.record.getString('athlete') }
	);
	if (assignment.length === 0) {
		throw new BadRequestError(
			'athlete_not_in_group: Scores can only be entered for athletes assigned to this group.'
		);
	}
	e.record.set('entry', assignment[0].getString('entry'));
	// The hole must be an active hole of the round's course: scores stay
	// keyed by the PHYSICAL hole regardless of displayed numbering.
	const round = e.app.findRecordById('rounds', scorecard.getString('round'));
	if (
		hole.getString('course') !== round.getString('course') ||
		hole.getString('status') !== 'active'
	) {
		throw new BadRequestError(
			'hole_not_in_round: The hole must be an active hole of the round\u2019s course.'
		);
	}
	if (!e.auth || !e.auth.id) {
		throw new BadRequestError('unauthenticated: Score entry requires a signed-in caller.');
	}
	e.record.set('enteredBy', e.auth.id);
	e.next();
	const collection = e.app.findCollectionByNameOrId('score_changes');
	const change = new Record(collection);
	change.set('organization', orgId);
	change.set('event', e.record.getString('event'));
	change.set('scorecard', e.record.getString('scorecard'));
	change.set('athlete', e.record.getString('athlete'));
	change.set('hole', e.record.getString('hole'));
	change.set('action', 'entered');
	change.set('newStrokes', e.record.getInt('strokes'));
	change.set('author', e.auth.id);
	e.app.save(change);
}, 'scores');

onRecordUpdateRequest((e) => {
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
			original.getString('scorecard') !== e.record.getString('scorecard') ||
			original.getString('event') !== e.record.getString('event') ||
			original.getString('round') !== e.record.getString('round') ||
			original.getString('group') !== e.record.getString('group') ||
			original.getString('entry') !== e.record.getString('entry') ||
			original.getString('athlete') !== e.record.getString('athlete') ||
			original.getString('hole') !== e.record.getString('hole'))
	) {
		throw new BadRequestError(
			'immutable_relation: A score cannot be rewired; only its strokes can change while the scorecard is draft.'
		);
	}
	const scorecard = e.app.findRecordById('scorecards', e.record.getString('scorecard'));
	if (scorecard.getString('status') !== 'draft') {
		throw new BadRequestError(
			'submitted_locked: This scorecard is submitted — reopen it to draft before changing scores.'
		);
	}
	if (!e.auth || !e.auth.id) {
		throw new BadRequestError('unauthenticated: Score entry requires a signed-in caller.');
	}
	const prevStrokes = original ? original.getInt('strokes') : 0;
	e.record.set('enteredBy', e.auth.id);
	e.next();
	if (e.record.getInt('strokes') !== prevStrokes) {
		const collection = e.app.findCollectionByNameOrId('score_changes');
		const change = new Record(collection);
		change.set('organization', e.record.getString('organization'));
		change.set('event', e.record.getString('event'));
		change.set('scorecard', e.record.getString('scorecard'));
		change.set('athlete', e.record.getString('athlete'));
		change.set('hole', e.record.getString('hole'));
		change.set('action', 'updated');
		change.set('prevStrokes', prevStrokes);
		change.set('newStrokes', e.record.getInt('strokes'));
		change.set('author', e.auth.id);
		e.app.save(change);
	}
}, 'scores');
