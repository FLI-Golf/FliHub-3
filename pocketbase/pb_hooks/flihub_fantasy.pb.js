/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phases 2A–2B — trusted fantasy league and snake draft operations
 * (D18). All fantasy collections lock client writes; these endpoints are
 * the only write path, and the draft board read lives here too so fantasy
 * participation never requires (or grants) organization staff access.
 *
 * Membership lifecycle: owner invites an existing user → invitee accepts
 * (or declines) → owner approves; only approved seats count toward the
 * participant limit. Drafts: one per (league, event), creatable only when
 * every seat is approved; the first-round order is drawn randomly once and
 * persisted; the owner starts the draft manually. Picks and timeouts run in
 * transactions — see pb_hooks/fantasy_rules.js for the shared invariants.
 *
 * Pick clocks: 7, 15, or 30 seconds. A 2-second clock exists ONLY for
 * disposable demo/walkthrough stacks via FLIHUB_FANTASY_DEMO_CLOCK=1 —
 * normal instances reject it.
 */

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/leagues { organization, name, participantLimit? }
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/leagues',
	(e) => {
		const auth = e.auth;
		const body = e.requestInfo().body || {};
		const orgId = String(body.organization ?? '');
		const name = String(body.name ?? '').trim();
		const limit = body.participantLimit === undefined ? 6 : Number(body.participantLimit);
		if (name.length < 2 || name.length > 80) {
			return e.json(400, { code: 'invalid_name', message: 'League names need 2–80 characters.' });
		}
		if (!Number.isInteger(limit) || limit < 2 || limit > 12) {
			return e.json(400, {
				code: 'invalid_limit',
				message: 'Participant limits are 2–12 managers.'
			});
		}
		let org;
		try {
			org = e.app.findRecordById('organizations', orgId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Organization not found.' });
		}
		let caps = [];
		try {
			const parsed = JSON.parse(String(org.get('capabilities') ?? '[]'));
			if (Array.isArray(parsed)) caps = parsed;
		} catch (_) {
			caps = [];
		}
		if (!caps.includes('fantasy')) {
			return e.json(400, {
				code: 'capability_disabled',
				message: 'The Fantasy leagues capability is not enabled for this organization.'
			});
		}
		let created = null;
		e.app.runInTransaction((txApp) => {
			const leagues = txApp.findCollectionByNameOrId('fantasy_leagues');
			const league = new Record(leagues);
			league.set('organization', orgId);
			league.set('name', name);
			league.set('owner', auth.id);
			league.set('participantLimit', limit);
			txApp.save(league);
			const members = txApp.findCollectionByNameOrId('fantasy_members');
			const member = new Record(members);
			member.set('league', league.id);
			member.set('user', auth.id);
			member.set('role', 'owner');
			member.set('status', 'approved');
			member.set('invitedBy', auth.id);
			txApp.save(member);
			created = { id: league.id, name: league.getString('name'), participantLimit: limit };
		});
		return e.json(200, created);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// GET /api/flihub/fantasy/leagues/{id}/lobby — members-only lobby state.
// ---------------------------------------------------------------------------
routerAdd(
	'GET',
	'/api/flihub/fantasy/leagues/{id}/lobby',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/fantasy_rules.js`);
		const leagueId = String(e.request.pathValue('id') ?? '');
		let league;
		try {
			league = e.app.findRecordById('fantasy_leagues', leagueId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'League not found.' });
		}
		const me = rules.memberOf(e.app, leagueId, e.auth.id);
		if (!me || ['declined', 'removed'].includes(me.getString('status'))) {
			return e.json(404, { code: 'not_found', message: 'League not found.' });
		}
		const isOwner = league.getString('owner') === e.auth.id;
		const names = new Map();
		const members = e.app
			.findRecordsByFilter('fantasy_members', 'league = {:league}', 'created', 100, 0, {
				league: leagueId
			})
			.filter((m) => !['declined', 'removed'].includes(m.getString('status')))
			.map((m) => ({
				id: m.id,
				user: m.getString('user'),
				name: rules.userName(e.app, m.getString('user'), names),
				role: m.getString('role'),
				status: m.getString('status')
			}));
		const approvedCount = members.filter((m) => m.status === 'approved').length;
		const drafts = e.app
			.findRecordsByFilter('fantasy_drafts', 'league = {:league}', 'created', 50, 0, {
				league: leagueId
			})
			.map((d) => {
				let eventName = '';
				try {
					eventName = e.app.findRecordById('events', d.getString('event')).getString('name');
				} catch (_) {
					eventName = '';
				}
				return {
					id: d.id,
					event: d.getString('event'),
					eventName,
					status: d.getString('status'),
					resolutionRequired: d.getBool('resolutionRequired'),
					pickSeconds: Number(d.get('pickSeconds')),
					currentPick: Number(d.get('currentPick'))
				};
			});
		// Owners pick the event for the next draft; events come through this
		// trusted read so league owners need no organization membership.
		let events = [];
		if (isOwner) {
			events = e.app
				.findRecordsByFilter(
					'events',
					"organization = {:org} && status != 'archived'",
					'startsAt,name',
					200,
					0,
					{ org: league.getString('organization') }
				)
				.map((ev) => ({ id: ev.id, name: ev.getString('name') }));
		}
		return e.json(200, {
			league: {
				id: league.id,
				name: league.getString('name'),
				owner: league.getString('owner'),
				participantLimit: Number(league.get('participantLimit')),
				organization: league.getString('organization')
			},
			me: { user: e.auth.id, role: me.getString('role'), status: me.getString('status') },
			isOwner,
			members,
			approvedCount,
			seatsFilled: approvedCount >= Number(league.get('participantLimit')),
			drafts,
			events
		});
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/leagues/{id}/invite { email }
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/leagues/{id}/invite',
	(e) => {
		const leagueId = String(e.request.pathValue('id') ?? '');
		const email = String((e.requestInfo().body || {}).email ?? '')
			.trim()
			.toLowerCase();
		let league;
		try {
			league = e.app.findRecordById('fantasy_leagues', leagueId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'League not found.' });
		}
		if (league.getString('owner') !== e.auth.id) {
			return e.json(403, {
				code: 'forbidden_role',
				message: 'Only the league owner can invite managers.'
			});
		}
		let invitee;
		try {
			invitee = e.app.findAuthRecordByEmail('users', email);
		} catch (_) {
			return e.json(400, {
				code: 'unknown_user',
				message: 'No FliHub account exists for that email — fantasy invitations are in-app.'
			});
		}
		let result = null;
		let failure = null;
		e.app.runInTransaction((txApp) => {
			let existing = null;
			try {
				existing = txApp.findFirstRecordByFilter(
					'fantasy_members',
					'league = {:league} && user = {:user}',
					{ league: leagueId, user: invitee.id }
				);
			} catch (_) {
				existing = null;
			}
			if (existing && !['declined', 'removed'].includes(existing.getString('status'))) {
				failure = {
					status: 400,
					code: 'already_member',
					message: 'That user is already invited or seated.'
				};
				return;
			}
			const record = existing ?? new Record(txApp.findCollectionByNameOrId('fantasy_members'));
			record.set('league', leagueId);
			record.set('user', invitee.id);
			record.set('role', 'manager');
			record.set('status', 'invited');
			record.set('invitedBy', e.auth.id);
			txApp.save(record);
			result = { id: record.id, status: 'invited' };
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });
		return e.json(200, result);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/members/{id}/respond { accept }
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/members/{id}/respond',
	(e) => {
		const memberId = String(e.request.pathValue('id') ?? '');
		const accept = (e.requestInfo().body || {}).accept === true;
		let failure = null;
		let result = null;
		e.app.runInTransaction((txApp) => {
			let member;
			try {
				member = txApp.findRecordById('fantasy_members', memberId);
			} catch (_) {
				failure = { status: 404, code: 'not_found', message: 'Invitation not found.' };
				return;
			}
			if (member.getString('user') !== e.auth.id) {
				failure = { status: 403, code: 'forbidden', message: 'This invitation is not yours.' };
				return;
			}
			if (member.getString('status') !== 'invited') {
				failure = {
					status: 400,
					code: 'invalid_state',
					message: 'Only pending invitations can be answered.'
				};
				return;
			}
			member.set('status', accept ? 'accepted' : 'declined');
			txApp.save(member);
			result = { id: member.id, status: member.getString('status') };
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });
		return e.json(200, result);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/members/{id}/approve — owner; limit enforced.
// POST /api/flihub/fantasy/members/{id}/remove — owner; not the owner seat.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/members/{id}/approve',
	(e) => {
		const memberId = String(e.request.pathValue('id') ?? '');
		let failure = null;
		let result = null;
		e.app.runInTransaction((txApp) => {
			let member;
			try {
				member = txApp.findRecordById('fantasy_members', memberId);
			} catch (_) {
				failure = { status: 404, code: 'not_found', message: 'Member not found.' };
				return;
			}
			const league = txApp.findRecordById('fantasy_leagues', member.getString('league'));
			if (league.getString('owner') !== e.auth.id) {
				failure = {
					status: 403,
					code: 'forbidden_role',
					message: 'Only the league owner approves managers.'
				};
				return;
			}
			if (member.getString('status') !== 'accepted') {
				failure = {
					status: 400,
					code: 'invalid_state',
					message: 'Only accepted invitations can be approved.'
				};
				return;
			}
			const approved = txApp.findRecordsByFilter(
				'fantasy_members',
				"league = {:league} && status = 'approved'",
				'',
				100,
				0,
				{ league: league.id }
			);
			if (approved.length >= Number(league.get('participantLimit'))) {
				failure = {
					status: 400,
					code: 'league_full',
					message: 'Every manager seat is already approved.'
				};
				return;
			}
			member.set('status', 'approved');
			txApp.save(member);
			result = { id: member.id, status: 'approved' };
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });
		return e.json(200, result);
	},
	$apis.requireAuth()
);

routerAdd(
	'POST',
	'/api/flihub/fantasy/members/{id}/remove',
	(e) => {
		const memberId = String(e.request.pathValue('id') ?? '');
		let failure = null;
		let result = null;
		e.app.runInTransaction((txApp) => {
			let member;
			try {
				member = txApp.findRecordById('fantasy_members', memberId);
			} catch (_) {
				failure = { status: 404, code: 'not_found', message: 'Member not found.' };
				return;
			}
			const league = txApp.findRecordById('fantasy_leagues', member.getString('league'));
			if (league.getString('owner') !== e.auth.id) {
				failure = {
					status: 403,
					code: 'forbidden_role',
					message: 'Only the league owner removes managers.'
				};
				return;
			}
			if (member.getString('role') === 'owner') {
				failure = {
					status: 400,
					code: 'invalid_state',
					message: 'The owner seat cannot be removed.'
				};
				return;
			}
			member.set('status', 'removed');
			txApp.save(member);
			result = { id: member.id, status: 'removed' };
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });
		return e.json(200, result);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/leagues/{id}/drafts { event, pickSeconds, rankings? }
// Creatable only when every seat is approved; draws and PERSISTS the
// first-round order; a new event gets its own draft and its own order.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/leagues/{id}/drafts',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/fantasy_rules.js`);
		const leagueId = String(e.request.pathValue('id') ?? '');
		const body = e.requestInfo().body || {};
		const eventId = String(body.event ?? '');
		const pickSeconds = Number(body.pickSeconds ?? 30);
		// Normal clocks: 7 / 15 / 30 seconds. The 2-second clock is for
		// disposable demo/walkthrough stacks only (FLIHUB_FANTASY_DEMO_CLOCK=1).
		const allowed = [7, 15, 30];
		if ($os.getenv('FLIHUB_FANTASY_DEMO_CLOCK') === '1') allowed.push(2);
		if (!allowed.includes(pickSeconds)) {
			return e.json(400, {
				code: 'invalid_clock',
				message: 'Pick clocks are 7, 15, or 30 seconds.'
			});
		}
		let league;
		try {
			league = e.app.findRecordById('fantasy_leagues', leagueId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'League not found.' });
		}
		if (league.getString('owner') !== e.auth.id) {
			return e.json(403, {
				code: 'forbidden_role',
				message: 'Only the league owner prepares drafts.'
			});
		}
		let event;
		try {
			event = e.app.findRecordById('events', eventId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Event not found.' });
		}
		if (event.getString('organization') !== league.getString('organization')) {
			return e.json(400, {
				code: 'cross_organization',
				message: 'Drafts can only target events of the league\u2019s organization.'
			});
		}
		const approved = rules.approvedMembers(e.app, leagueId);
		if (approved.length < Number(league.get('participantLimit'))) {
			return e.json(400, {
				code: 'seats_unfilled',
				message: `Drafts open once all ${league.get('participantLimit')} manager seats are approved (${approved.length} so far).`
			});
		}
		const pool = rules.eligiblePool(e.app, eventId);
		const males = pool.filter((p) => p.gender === 'male').length;
		const females = pool.filter((p) => p.gender === 'female').length;
		const needed = approved.length * 2;
		if (males < needed || females < needed) {
			return e.json(400, {
				code: 'pool_too_small',
				message: `The event pool needs at least ${needed} MPO and ${needed} FPO athletes (has ${males}/${females}).`
			});
		}
		// Optional deterministic rankings (tests/demo fixtures). The production
		// ranking source is a recorded open decision (D18) — the default is the
		// deterministic pool order, clearly a placeholder.
		let rankings = pool.map((p) => p.athlete);
		if (body.rankings !== undefined) {
			if (
				!Array.isArray(body.rankings) ||
				new Set(body.rankings).size !== body.rankings.length ||
				!body.rankings.every((id) => pool.some((p) => p.athlete === id))
			) {
				return e.json(400, {
					code: 'invalid_rankings',
					message: 'Rankings must list eligible athlete ids without duplicates.'
				});
			}
			rankings = body.rankings.map(String);
		}
		// Fresh random first-round order, drawn once and persisted.
		const order = approved.map((m) => m.getString('user'));
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		let created = null;
		let failure = null;
		e.app.runInTransaction((txApp) => {
			try {
				txApp.findFirstRecordByFilter('fantasy_drafts', 'league = {:league} && event = {:event}', {
					league: leagueId,
					event: eventId
				});
				failure = {
					status: 400,
					code: 'draft_exists',
					message: 'This event already has a draft for this league.'
				};
				return;
			} catch (_) {
				// No existing draft — proceed.
			}
			const targetEvent = txApp.findRecordById('events', eventId);
			if (
				targetEvent.getString('fantasyCutoffAt') ||
				targetEvent.getString('status') === 'active'
			) {
				throw new BadRequestError(
					'activation_cutoff: Event activation has closed draft preparation.'
				);
			}
			const drafts = txApp.findCollectionByNameOrId('fantasy_drafts');
			const draft = new Record(drafts);
			draft.set('league', leagueId);
			draft.set('organization', league.getString('organization'));
			draft.set('event', eventId);
			draft.set('status', 'ready');
			draft.set('pickSeconds', pickSeconds);
			draft.set('draftOrder', JSON.stringify(order));
			draft.set('rankings', JSON.stringify(rankings));
			draft.set('currentPick', 0);
			draft.set('createdBy', e.auth.id);
			txApp.save(draft);
			created = { id: draft.id, status: 'ready', draftOrder: order };
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });
		return e.json(200, created);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/drafts/{id}/start — owner starts manually.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/drafts/{id}/start',
	(e) => {
		const draftId = String(e.request.pathValue('id') ?? '');
		let failure = null;
		let result = null;
		e.app.runInTransaction((txApp) => {
			let draft;
			try {
				draft = txApp.findRecordById('fantasy_drafts', draftId);
			} catch (_) {
				failure = { status: 404, code: 'not_found', message: 'Draft not found.' };
				return;
			}
			const league = txApp.findRecordById('fantasy_leagues', draft.getString('league'));
			if (league.getString('owner') !== e.auth.id) {
				failure = {
					status: 403,
					code: 'forbidden_role',
					message: 'Only the league owner starts the draft.'
				};
				return;
			}
			if (draft.getString('status') !== 'ready') {
				failure = {
					status: 400,
					code: 'invalid_state',
					message: 'Only a prepared draft can be started.'
				};
				return;
			}
			const now = new Date();
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			require(`${__hooks}/fantasy_rules.js`).assertBeforeCutoff(txApp, draft);
			draft.set('status', 'active');
			draft.set('currentPick', 1);
			draft.set('startedAt', now.toISOString());
			draft.set(
				'deadline',
				new Date(now.getTime() + Number(draft.get('pickSeconds')) * 1000).toISOString()
			);
			txApp.save(draft);
			result = { id: draft.id, status: 'active', deadline: String(draft.get('deadline')) };
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });
		return e.json(200, result);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// GET /api/flihub/fantasy/drafts/{id}/board — the shared, reconnectable state.
// ---------------------------------------------------------------------------
routerAdd(
	'GET',
	'/api/flihub/fantasy/drafts/{id}/board',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/fantasy_rules.js`);
		const draftId = String(e.request.pathValue('id') ?? '');
		let draft;
		try {
			draft = e.app.findRecordById('fantasy_drafts', draftId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Draft not found.' });
		}
		const me = rules.memberOf(e.app, draft.getString('league'), e.auth.id);
		if (!me || me.getString('status') !== 'approved') {
			return e.json(404, { code: 'not_found', message: 'Draft not found.' });
		}
		return e.json(200, rules.buildBoard(e.app, draft, e.auth.id));
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/drafts/{id}/pick { athlete } — transactional; a
// manual pick racing the timeout produces exactly one pick (unique indexes
// back the transaction) and advances the turn once.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/drafts/{id}/pick',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/fantasy_rules.js`);
		const draftId = String(e.request.pathValue('id') ?? '');
		const athleteId = String((e.requestInfo().body || {}).athlete ?? '');
		let draft;
		try {
			draft = e.app.findRecordById('fantasy_drafts', draftId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Draft not found.' });
		}
		const me = rules.memberOf(e.app, draft.getString('league'), e.auth.id);
		if (!me || me.getString('status') !== 'approved') {
			return e.json(404, { code: 'not_found', message: 'Draft not found.' });
		}
		let pick = null;
		e.app.runInTransaction((txApp) => {
			pick = rules.performPick(txApp, draftId, e.auth.id, athleteId, false, new Date());
		});
		return e.json(200, {
			pickNumber: Number(pick.get('pickNumber')),
			round: Number(pick.get('round')),
			athlete: pick.getString('athlete'),
			auto: false
		});
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/drafts/{id}/tick — lazy timeout processing: one
// overdue auto-pick per call (highest-ranked eligible athlete who fits the
// manager's remaining slots). If every manager disconnects, the draft
// pauses at the expired deadline; the first reconnect catches it up.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/drafts/{id}/tick',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/fantasy_rules.js`);
		const draftId = String(e.request.pathValue('id') ?? '');
		let draft;
		try {
			draft = e.app.findRecordById('fantasy_drafts', draftId);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Draft not found.' });
		}
		const me = rules.memberOf(e.app, draft.getString('league'), e.auth.id);
		if (!me || me.getString('status') !== 'approved') {
			return e.json(404, { code: 'not_found', message: 'Draft not found.' });
		}
		let acted = false;
		let autoAthlete = null;
		e.app.runInTransaction((txApp) => {
			const fresh = txApp.findRecordById('fantasy_drafts', draftId);
			rules.assertBeforeCutoff(txApp, fresh);
			if (fresh.getString('status') !== 'active') return;
			const deadline = Date.parse(String(fresh.get('deadline') ?? ''));
			const now = new Date();
			if (!Number.isFinite(deadline) || now.getTime() < deadline) return;
			const order = rules.readJson(fresh, 'draftOrder', []);
			const seat = rules.snakeSeat(order, Number(fresh.get('currentPick')));
			const athleteId = rules.autoPickAthlete(txApp, fresh, seat.manager);
			if (!athleteId) {
				throw new BadRequestError(
					'auto_pick_failed: No eligible athlete remains for the manager on the clock.'
				);
			}
			rules.performPick(txApp, draftId, seat.manager, athleteId, true, now);
			acted = true;
			autoAthlete = athleteId;
		});
		return e.json(200, { acted, athlete: autoAthlete });
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/fantasy/picks/{id}/apply-substitution — the designated
// event substitute (1E substitutions) takes over the fantasy roster slot.
// The original pick is preserved; the substitution is recorded separately.
// Ambiguous cases are REJECTED, not guessed (D18 open decisions): gender/
// division mismatches, substitutes already owned in the draft, and chained
// substitutions all need a product ruling.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/fantasy/picks/{id}/apply-substitution',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM has no ESM; require() is its only module mechanism
		const rules = require(`${__hooks}/fantasy_rules.js`);
		const pickId = String(e.request.pathValue('id') ?? '');
		let failure = null;
		let result = null;
		e.app.runInTransaction((txApp) => {
			let pick;
			try {
				pick = txApp.findRecordById('fantasy_picks', pickId);
			} catch (_) {
				failure = { status: 404, code: 'not_found', message: 'Pick not found.' };
				return;
			}
			const draft = txApp.findRecordById('fantasy_drafts', pick.getString('draft'));
			const league = txApp.findRecordById('fantasy_leagues', draft.getString('league'));
			if (league.getString('owner') !== e.auth.id) {
				failure = {
					status: 403,
					code: 'forbidden_role',
					message: 'Only the league owner applies substitutions.'
				};
				return;
			}
			if (draft.getString('status') !== 'complete') {
				failure = {
					status: 400,
					code: 'invalid_state',
					message: 'Substitutions apply to completed rosters.'
				};
				return;
			}
			if (pick.getString('substituteAthlete')) {
				failure = {
					status: 400,
					code: 'substitution_unresolved',
					message:
						'This slot was already substituted — chained substitutions need a product decision.'
				};
				return;
			}
			let sub = null;
			try {
				const subs = txApp.findRecordsByFilter(
					'substitutions',
					'event = {:event} && athleteOut = {:out}',
					'-created',
					1,
					0,
					{ event: draft.getString('event'), out: pick.getString('athlete') }
				);
				sub = subs[0] ?? null;
			} catch (_) {
				sub = null;
			}
			if (!sub) {
				failure = {
					status: 400,
					code: 'no_substitution',
					message: 'No designated event substitute exists for this athlete.'
				};
				return;
			}
			const original = rules.poolSubstitute(txApp, pick.getString('athlete'));
			const replacement = rules.poolSubstitute(txApp, sub.getString('athleteIn'));
			if (!replacement || !original || replacement.gender !== original.gender) {
				failure = {
					status: 400,
					code: 'substitution_unresolved',
					message:
						'The designated substitute does not match the slot\u2019s division — gender/division rules need a product decision.'
				};
				return;
			}
			const picks = rules.picksOf(txApp, draft.id);
			const owned = picks.some(
				(p) =>
					p.getString('athlete') === sub.getString('athleteIn') ||
					p.getString('substituteAthlete') === sub.getString('athleteIn')
			);
			if (owned) {
				failure = {
					status: 400,
					code: 'substitution_unresolved',
					message:
						'The designated substitute is already on a fantasy roster in this draft — duplicate ownership needs a product decision.'
				};
				return;
			}
			pick.set('substituteAthlete', sub.getString('athleteIn'));
			pick.set('substitution', sub.id);
			pick.set('substitutedAt', new Date().toISOString());
			txApp.save(pick);
			result = {
				id: pick.id,
				athlete: pick.getString('athlete'),
				substituteAthlete: pick.getString('substituteAthlete'),
				substitution: sub.id
			};
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });
		return e.json(200, result);
	},
	$apis.requireAuth()
);
