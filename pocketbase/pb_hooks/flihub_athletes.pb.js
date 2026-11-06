/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phase 1C — capability gate for athlete writes.
 *
 * Role enforcement lives in the athletes collection API rules (Owner/Admin
 * write, any member reads). These hooks add the orthogonal capability gate:
 * the organization must have the `athletes` capability enabled, or the write
 * is rejected — including direct API requests. Reads of preserved records are
 * not blocked: disabling a capability hides the workflow, never the data.
 *
 * PocketBase v0.40 JSVM notes (verified empirically):
 * - Hook registration is handler-first: onRecordCreateRequest(fn, 'athletes').
 * - Handlers are serialized and re-evaluated per invocation with only `$app`
 *   bound — every handler must be fully self-contained (no shared helpers).
 * - JSON field values read as types.JSONRaw: String(raw) yields the JSON text.
 */
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(e.app ? org.get('capabilities') : '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('athletes')) {
		throw new BadRequestError(
			'capability_disabled: The Athletes capability is not enabled for this organization.'
		);
	}
	e.next();
}, 'athletes');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('athletes')) {
		throw new BadRequestError(
			'capability_disabled: The Athletes capability is not enabled for this organization.'
		);
	}
	e.next();
}, 'athletes');

onRecordDeleteRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('athletes')) {
		throw new BadRequestError(
			'capability_disabled: The Athletes capability is not enabled for this organization.'
		);
	}
	e.next();
}, 'athletes');
/// <reference path="../pb_data/types.d.ts" />

// The same capability gate covers the private companion collection.
// (athlete_private delete is locked by its collection rule — archive-only
// lifecycle, matching athletes.)
onRecordCreateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('athletes')) {
		throw new BadRequestError(
			'capability_disabled: The Athletes capability is not enabled for this organization.'
		);
	}
	e.next();
}, 'athlete_private');

onRecordUpdateRequest((e) => {
	const org = e.app.findRecordById('organizations', e.record.getString('organization'));
	let caps = [];
	try {
		const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
		if (Array.isArray(parsed)) caps = parsed;
	} catch (_) {
		caps = [];
	}
	if (!caps.includes('athletes')) {
		throw new BadRequestError(
			'capability_disabled: The Athletes capability is not enabled for this organization.'
		);
	}
	e.next();
}, 'athlete_private');
