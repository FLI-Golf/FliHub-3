/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phase 1I — public page routes and trusted public-page management.
 *
 * Every byte a visitor can read flows through the shared publication-rule
 * layer (pb_hooks/public_rules.js) — no collection list/view rule is opened
 * to unauthenticated callers, so the direct record API stays members-only
 * while these endpoints expose exactly the whitelisted published fields.
 *
 * - GET  /api/flihub/public/{slug}            — the published page payload.
 *   Unknown, unpublished, and never-published slugs are indistinguishable
 *   404s (Dustin 2026-11-07: hidden, no coming-soon placeholder).
 * - GET  /api/flihub/organizations/{id}/public-preview — the identical
 *   payload for the organization's own members, regardless of the page
 *   publish state (preview shows the page exactly as a visitor will see it).
 * - GET  /api/flihub/organizations/{id}/standings — member standings over
 *   ALL events with a currently published official result (the per-record
 *   public flag gates only the public surfaces).
 * - POST /api/flihub/organizations/{id}/public-page — Owner/Admin-only
 *   slug/branding/publish management. The organizations update rule is
 *   locked, so this validated, audited endpoint is the only write path.
 */

// ---------------------------------------------------------------------------
// GET /api/flihub/public/{slug} — unauthenticated public page payload.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/flihub/public/{slug}', (e) => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
	const rules = require(`${__hooks}/public_rules.js`);
	const slug = String(e.request.pathValue('slug') ?? '');
	// Reject malformed slugs before touching the database; the response is
	// the same 404 an unknown slug gets.
	if (rules.validateSlug(slug) !== null) {
		return e.json(404, { code: 'not_found', message: 'Page not found.' });
	}
	let org = null;
	try {
		org = e.app.findFirstRecordByFilter('organizations', 'publicSlug = {:slug}', { slug });
	} catch (_) {
		org = null;
	}
	if (!org || !org.getBool('publicPublished')) {
		// Unpublished pages are hidden — indistinguishable from unknown slugs.
		return e.json(404, { code: 'not_found', message: 'Page not found.' });
	}
	return e.json(200, rules.buildPublicPage(e.app, org));
});

// ---------------------------------------------------------------------------
// GET /api/flihub/organizations/{id}/public-preview — members only.
// ---------------------------------------------------------------------------
routerAdd(
	'GET',
	'/api/flihub/organizations/{id}/public-preview',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/public_rules.js`);
		const orgId = String(e.request.pathValue('id') ?? '');
		let org = null;
		try {
			org = e.app.findRecordById('organizations', orgId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Organization not found.' });
		}
		let member = null;
		try {
			member = e.app.findFirstRecordByFilter(
				'memberships',
				'organization = {:org} && user = {:user}',
				{ org: orgId, user: e.auth.id }
			);
		} catch (_) {
			member = null;
		}
		if (!member) {
			return e.json(404, { code: 'not_found', message: 'Organization not found.' });
		}
		return e.json(200, {
			preview: {
				published: org.getBool('publicPublished'),
				slug: org.getString('publicSlug')
			},
			page: rules.buildPublicPage(e.app, org)
		});
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// GET /api/flihub/organizations/{id}/standings — members only.
// ---------------------------------------------------------------------------
routerAdd(
	'GET',
	'/api/flihub/organizations/{id}/standings',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/public_rules.js`);
		const orgId = String(e.request.pathValue('id') ?? '');
		let member = null;
		try {
			member = e.app.findFirstRecordByFilter(
				'memberships',
				'organization = {:org} && user = {:user}',
				{ org: orgId, user: e.auth.id }
			);
		} catch (_) {
			member = null;
		}
		if (!member) {
			return e.json(404, { code: 'not_found', message: 'Organization not found.' });
		}
		return e.json(200, { standings: rules.buildMemberStandings(e.app, orgId) });
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/organizations/{id}/public-page
//   { slug?, tagline?, logoUrl?, themePrimary?, themeSecondary?, published? }
// Owner/Admin only. Only provided fields change. Publishing requires a
// reserved slug; only the organization name is otherwise required
// (Dustin 2026-11-07). Every change is audited in membership_events.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/organizations/{id}/public-page',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/public_rules.js`);
		const auth = e.auth;
		const orgId = String(e.request.pathValue('id') ?? '');
		const body = e.requestInfo().body || {};

		let org = null;
		try {
			org = e.app.findRecordById('organizations', orgId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Organization not found.' });
		}

		const findMembership = (txApp) => {
			try {
				return txApp.findFirstRecordByFilter(
					'memberships',
					'organization = {:org} && user = {:user}',
					{ org: orgId, user: auth.id }
				);
			} catch (_) {
				return null;
			}
		};
		const callerEarly = findMembership(e.app);
		const roleEarly = callerEarly ? callerEarly.getString('role') : null;
		if (roleEarly !== 'owner' && roleEarly !== 'admin') {
			return e.json(403, {
				code: 'forbidden_role',
				message: 'Only Owners and Admins can manage the public page.'
			});
		}

		// ---- validate the changeset before touching the database -------------
		const changes = {};
		const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

		if (body.slug !== undefined) {
			const slug = String(body.slug).trim().toLowerCase();
			const problem = rules.validateSlug(slug);
			if (problem) {
				return e.json(400, { code: 'invalid_slug', message: problem });
			}
			let taken = null;
			try {
				taken = e.app.findFirstRecordByFilter(
					'organizations',
					'publicSlug = {:slug} && id != {:id}',
					{ slug, id: orgId }
				);
			} catch (_) {
				taken = null;
			}
			if (taken) {
				return e.json(400, {
					code: 'slug_taken',
					message: 'That slug is already reserved by another organization.'
				});
			}
			changes.publicSlug = slug;
		}

		if (body.tagline !== undefined) {
			const tagline = String(body.tagline).trim();
			if (tagline.length > 160) {
				return e.json(400, { code: 'invalid_tagline', message: 'Taglines max 160 characters.' });
			}
			changes.tagline = tagline;
		}

		if (body.logoUrl !== undefined) {
			const logoUrl = String(body.logoUrl).trim();
			if (logoUrl !== '' && !/^https?:\/\/\S+$/.test(logoUrl)) {
				return e.json(400, {
					code: 'invalid_logo',
					message: 'The logo must be an http(s) URL.'
				});
			}
			if (logoUrl.length > 300) {
				return e.json(400, { code: 'invalid_logo', message: 'Logo URLs max 300 characters.' });
			}
			changes.logoUrl = logoUrl;
		}

		for (const field of ['themePrimary', 'themeSecondary']) {
			if (body[field] !== undefined) {
				const value = String(body[field]).trim();
				if (value !== '' && !HEX_COLOR.test(value)) {
					return e.json(400, {
						code: 'invalid_color',
						message: 'Theme colors must be #RRGGBB hex values.'
					});
				}
				changes[field] = value;
			}
		}

		if (body.published !== undefined) {
			if (typeof body.published !== 'boolean') {
				return e.json(400, { code: 'invalid_input', message: 'published must be a boolean.' });
			}
			const effectiveSlug =
				changes.publicSlug !== undefined ? changes.publicSlug : org.getString('publicSlug');
			if (body.published && !effectiveSlug) {
				return e.json(400, {
					code: 'slug_required',
					message: 'Reserve a public slug before publishing the page.'
				});
			}
			changes.publicPublished = body.published;
		}

		if (Object.keys(changes).length === 0) {
			return e.json(400, { code: 'invalid_input', message: 'Nothing to change.' });
		}

		// ---- apply transactionally with fresh role validation -----------------
		let failure = null;
		let result = null;
		e.app.runInTransaction((txApp) => {
			const caller = findMembership(txApp);
			const role = caller ? caller.getString('role') : null;
			if (role !== 'owner' && role !== 'admin') {
				failure = {
					status: 403,
					code: 'forbidden_role',
					message: 'Only Owners and Admins can manage the public page.'
				};
				return;
			}
			const fresh = txApp.findRecordById('organizations', orgId);
			const before = {
				publicSlug: fresh.getString('publicSlug'),
				publicPublished: fresh.getBool('publicPublished'),
				tagline: fresh.getString('tagline'),
				logoUrl: fresh.getString('logoUrl'),
				themePrimary: fresh.getString('themePrimary'),
				themeSecondary: fresh.getString('themeSecondary')
			};
			for (const key of Object.keys(changes)) {
				fresh.set(key, changes[key]);
			}
			txApp.save(fresh);

			const eventsCollection = txApp.findCollectionByNameOrId('membership_events');
			const audit = new Record(eventsCollection);
			audit.set('organization', orgId);
			audit.set('actor', auth.id);
			audit.set('action', 'public_page_changed');
			audit.set('subject_user', auth.id);
			// JSVM set() comma-joins arrays on JSON fields — serialize explicitly.
			audit.set('details', JSON.stringify({ before, changes }));
			txApp.save(audit);

			result = {
				publicSlug: fresh.getString('publicSlug'),
				publicPublished: fresh.getBool('publicPublished'),
				tagline: fresh.getString('tagline'),
				logoUrl: fresh.getString('logoUrl'),
				themePrimary: fresh.getString('themePrimary'),
				themeSecondary: fresh.getString('themeSecondary')
			};
		});
		if (failure) {
			return e.json(failure.status, { code: failure.code, message: failure.message });
		}
		return e.json(200, result);
	},
	$apis.requireAuth()
);
