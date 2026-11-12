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
 * Handlers load shared approval validation from result_snapshot_rules.js
 * inside their isolated JSVM context. The correction audit helper stays local.
 */

onRecordCreateRequest((e) => {
	// D16: every active round must have a course and every (round × group)
	// scorecard must be Submitted; totals are snapshotted at approval.
	function buildScoringSnapshot(app, eventId) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM requires CommonJS.
		return require(`${__hooks}/result_snapshot_rules.js`).computeEventTotals(app, eventId);
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
	const totals = buildScoringSnapshot(e.app, e.record.getString('event'));
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
	function buildScoringSnapshot(app, eventId) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM requires CommonJS.
		return require(`${__hooks}/result_snapshot_rules.js`).computeEventTotals(app, eventId);
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
		const totals = buildScoringSnapshot(e.app, e.record.getString('event'));
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
