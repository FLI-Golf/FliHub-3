/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phase 1B — organization configuration (capabilities, template,
 * race distances, name).
 *
 * Configuration writes are validated here, transactionally, by a trusted
 * hook — the organizations collection's update rule is locked, so direct
 * record PATCHes (which could bypass capability-ID and dependency
 * validation) are rejected for everyone. Only Owners and Admins of the
 * organization may configure it, re-validated from the database on every
 * call. Capabilities never grant permissions beyond the caller's role, and
 * disabling a capability never deletes records.
 *
 * The capability catalog is the same JSON the SvelteKit app uses
 * (src/lib/capabilities/catalog.json) — required directly, no forked list.
 *
 * Every change is recorded in membership_events with actor, time, and
 * before/after values (action: configuration_changed).
 */

// ---------------------------------------------------------------------------
// POST /api/flihub/organizations/{id}/configure
//   { name?, template?, capabilities?, raceDistances?, completeOnboarding? }
// Only provided fields change. Returns the updated configuration.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/organizations/{id}/configure',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const catalog = require(`${__hooks}/../../src/lib/capabilities/catalog.json`);
		const validCapabilityIds = catalog.capabilities.map((c) => c.id);

		const findMembership = (txApp, orgId, userId) => {
			try {
				return txApp.findFirstRecordByFilter(
					'memberships',
					'organization = {:org} && user = {:user}',
					{ org: orgId, user: userId }
				);
			} catch (_) {
				return null;
			}
		};
		const recordEvent = (txApp, orgId, actorId, action, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			// JSVM set() comma-joins arrays on JSON fields — serialize explicitly.
			record.set('details', JSON.stringify(details));
			txApp.save(record);
		};
		const validateDistances = (value) => {
			if (!Array.isArray(value)) return 'Race distances must be a list.';
			if (value.length > 10) return 'At most 10 distances.';
			for (const d of value) {
				const label = String(d?.label ?? '').trim();
				const distance = Number(d?.distance);
				if (!label || label.length > 60) return 'Each distance needs a label (1–60 characters).';
				if (!Number.isFinite(distance) || distance <= 0 || distance > 2000) {
					return 'Distances must be positive numbers (max 2000).';
				}
				if (!['km', 'mi'].includes(d?.unit)) return 'Distance unit must be km or mi.';
			}
			return null;
		};
		// record.get on JSON fields returns Go []byte, which goja exposes as a
		// byte array (Array.isArray is true but the entries are byte values).
		// String() decodes it to the JSON text; parse that.
		const getJsonList = (rec, field) => {
			const raw = rec.get(field);
			if (raw === null || raw === undefined) return [];
			const text = typeof raw === 'string' ? raw : String(raw);
			if (text.trim() === '' || text.trim() === 'null') return [];
			try {
				const parsed = JSON.parse(text);
				return Array.isArray(parsed) ? parsed : [];
			} catch (_) {
				return [];
			}
		};

		const auth = e.auth;
		const orgId = e.request.pathValue('id');
		const body = e.requestInfo().body || {};

		let org = null;
		try {
			org = e.app.findRecordById('organizations', orgId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Organization not found.' });
		}

		// Role gate BEFORE changeset validation: callers without configuration
		// rights get a uniform denial, not validation feedback.
		const callerEarly = findMembership(e.app, orgId, auth.id);
		const roleEarly = callerEarly ? callerEarly.getString('role') : null;
		if (roleEarly !== 'owner' && roleEarly !== 'admin') {
			return e.json(403, {
				code: 'forbidden_role',
				message: 'Only Owners and Admins can configure this organization.'
			});
		}

		// ---- validate the changeset before touching the database -------------
		const changes = {};

		if (body.name !== undefined) {
			const name = String(body.name).trim();
			if (name.length < 2 || name.length > 120) {
				return e.json(400, {
					code: 'invalid_name',
					message: 'Organization names need 2–120 characters.'
				});
			}
			changes.name = name;
		}

		if (body.template !== undefined) {
			const templateId = body.template === '' ? '' : String(body.template);
			if (templateId !== '' && !catalog.templates.some((t) => t.id === templateId)) {
				return e.json(400, { code: 'unknown_template', message: 'Unknown starter template.' });
			}
			changes.template = templateId;
		}

		if (body.capabilities !== undefined) {
			if (!Array.isArray(body.capabilities)) {
				return e.json(400, {
					code: 'invalid_input',
					message: 'capabilities must be a list of ids.'
				});
			}
			const requested = body.capabilities.map(String);
			const unknown = requested.filter((id) => !validCapabilityIds.includes(id));
			if (unknown.length > 0) {
				return e.json(400, {
					code: 'unknown_capability',
					message: `Unknown capability: ${unknown.join(', ')}`
				});
			}
			const chosen = new Set(requested);
			const missing = [];
			for (const id of chosen) {
				const def = catalog.capabilities.find((c) => c.id === id);
				for (const dep of def?.dependsOn ?? []) {
					if (!chosen.has(dep)) missing.push(`${id} requires ${dep}`);
				}
			}
			if (missing.length > 0) {
				return e.json(400, { code: 'missing_dependency', message: missing.join('; ') });
			}
			changes.capabilities = validCapabilityIds.filter((id) => chosen.has(id));
		}

		if (body.raceDistances !== undefined) {
			const err = validateDistances(body.raceDistances);
			if (err) return e.json(400, { code: 'invalid_distance', message: err });
			changes.race_distances = body.raceDistances;
		}

		// Race distances only make sense for the Race/Event template.
		const effectiveTemplate =
			changes.template !== undefined ? changes.template : org.getString('template');
		const effectiveDistances =
			changes.race_distances !== undefined
				? changes.race_distances
				: getJsonList(org, 'race_distances');
		if (effectiveTemplate !== 'race-event' && effectiveDistances.length > 0) {
			return e.json(400, {
				code: 'invalid_config',
				message: 'Race distances only apply to the Race/Event template.'
			});
		}

		const completeOnboarding = body.completeOnboarding === true || changes.template !== undefined;

		// ---- apply transactionally with fresh role validation -----------------
		let result = null;
		let failure = null;
		e.app.runInTransaction((txApp) => {
			const caller = findMembership(txApp, orgId, auth.id);
			const role = caller ? caller.getString('role') : null;
			if (role !== 'owner' && role !== 'admin') {
				failure = {
					status: 403,
					code: 'forbidden_role',
					message: 'Only Owners and Admins can configure this organization.'
				};
				return;
			}

			const before = {
				name: org.getString('name'),
				template: org.getString('template'),
				capabilities: getJsonList(org, 'capabilities'),
				race_distances: getJsonList(org, 'race_distances'),
				onboarded: org.getBool('onboarded')
			};

			for (const key of ['name', 'template', 'capabilities', 'race_distances']) {
				if (changes[key] !== undefined) {
					const value =
						key === 'capabilities' || key === 'race_distances'
							? JSON.stringify(changes[key])
							: changes[key];
					org.set(key, value);
				}
			}
			if (completeOnboarding && !org.getBool('onboarded')) org.set('onboarded', true);
			txApp.save(org);

			const after = {
				name: org.getString('name'),
				template: org.getString('template'),
				capabilities: getJsonList(org, 'capabilities'),
				race_distances: getJsonList(org, 'race_distances'),
				onboarded: org.getBool('onboarded')
			};
			recordEvent(txApp, orgId, auth.id, 'configuration_changed', { before, after });

			result = after;
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });

		return e.json(200, result);
	},
	$apis.requireAuth()
);
/// <reference path="../pb_data/types.d.ts" />
