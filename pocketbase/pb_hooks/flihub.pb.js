/// <reference path="../pb_data/types.d.ts" />
/**
 * FliHub Phase 1A — trusted backend operations.
 *
 * Membership, role, invitation, and ownership invariants are enforced here,
 * inside PocketBase transactions, NOT as sequences of browser SDK writes.
 * The corresponding collections have locked create/update/delete rules, so
 * ordinary authenticated API requests cannot forge memberships, escalate
 * roles, or transfer ownership.
 *
 * Every handler re-validates the caller's CURRENT membership and role from
 * the database on each call, so removals and demotions take effect on the
 * very next request even while the caller's auth token remains valid.
 *
 * Error contract: expected failures return `{ code, message }` JSON with a
 * 4xx status; `code` is a stable machine-readable string the app maps to
 * user-facing copy. Invitation tokens and passwords are never logged.
 *
 * NOTE: PocketBase's JS runtime (v0.40) executes route handlers isolated
 * from the file's top-level scope, so every handler defines its own helpers
 * inline. The invitation lifetime defaults to 7 days and can be overridden
 * with the FLIHUB_INVITE_TTL_HOURS environment variable.
 */

// ---------------------------------------------------------------------------
// POST /api/flihub/organizations { name }
// Creates the organization and its single Owner membership atomically.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/organizations',
	(e) => {
		const recordEvent = (txApp, orgId, actorId, action, subjectUserId, subjectEmail, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			if (subjectUserId) record.set('subject_user', subjectUserId);
			if (subjectEmail) record.set('subject_email', subjectEmail);
			if (details) record.set('details', details);
			txApp.save(record);
		};

		const auth = e.auth;
		const body = e.requestInfo().body || {};
		const name = String(body.name || '').trim();
		if (name.length < 2 || name.length > 120) {
			return e.json(400, {
				code: 'invalid_name',
				message: 'Organization names need 2–120 characters.'
			});
		}

		let created = null;
		e.app.runInTransaction((txApp) => {
			const orgs = txApp.findCollectionByNameOrId('organizations');
			const org = new Record(orgs);
			org.set('name', name);
			txApp.save(org);

			const memberships = txApp.findCollectionByNameOrId('memberships');
			const membership = new Record(memberships);
			membership.set('organization', org.id);
			membership.set('user', auth.id);
			membership.set('role', 'owner');
			txApp.save(membership);

			recordEvent(txApp, org.id, auth.id, 'organization_created', auth.id, null, null);
			created = { id: org.id, name: org.getString('name') };
		});

		return e.json(200, created);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/invitations { organization, email, role }
// Owner may invite admin/scorekeeper/viewer; Admin may invite only
// scorekeeper/viewer. Stores a sha256 hash of a single-use bearer token and
// returns the plaintext token exactly once for the copy-link workflow.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/invitations',
	(e) => {
		const INVITABLE_ROLES = ['admin', 'scorekeeper', 'viewer'];
		const normalizeEmail = (value) =>
			String(value || '')
				.trim()
				.toLowerCase();
		const parsePbDate = (value) => new Date(String(value || '').replace(' ', 'T')).getTime();
		const inviteTtlHours = () => {
			const raw = parseInt($os.getenv('FLIHUB_INVITE_TTL_HOURS') || '168', 10);
			return isFinite(raw) && raw > 0 ? raw : 168;
		};
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
		const findUserByEmail = (txApp, email) => {
			try {
				return txApp.findFirstRecordByFilter('users', 'email = {:email}', { email });
			} catch (_) {
				return null;
			}
		};
		const recordEvent = (txApp, orgId, actorId, action, subjectUserId, subjectEmail, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			if (subjectUserId) record.set('subject_user', subjectUserId);
			if (subjectEmail) record.set('subject_email', subjectEmail);
			if (details) record.set('details', details);
			txApp.save(record);
		};

		const auth = e.auth;
		const body = e.requestInfo().body || {};
		const orgId = String(body.organization || '');
		const email = normalizeEmail(body.email);
		const role = String(body.role || '');

		if (!orgId || !email || !INVITABLE_ROLES.includes(role)) {
			return e.json(400, {
				code: 'invalid_input',
				message: 'Organization, a valid email, and an invitable role are required.'
			});
		}

		let result = null;
		let failure = null;
		e.app.runInTransaction((txApp) => {
			const caller = findMembership(txApp, orgId, auth.id);
			if (!caller) {
				failure = {
					status: 403,
					code: 'not_member',
					message: 'You are not a member of this organization.'
				};
				return;
			}
			const callerRole = caller.getString('role');
			if (callerRole === 'admin' && role === 'admin') {
				failure = {
					status: 403,
					code: 'admin_cannot_invite_admin',
					message: 'Admins can only invite Scorekeepers or Viewers.'
				};
				return;
			}
			if (callerRole !== 'owner' && callerRole !== 'admin') {
				failure = {
					status: 403,
					code: 'forbidden_role',
					message: 'Only Owners and Admins can manage invitations.'
				};
				return;
			}

			// Reject invitations for people who are already members.
			const invitee = findUserByEmail(txApp, email);
			if (invitee && findMembership(txApp, orgId, invitee.id)) {
				failure = {
					status: 409,
					code: 'already_member',
					message: 'That person is already a member.'
				};
				return;
			}

			// Reject duplicate active (pending, unexpired) invitations.
			const now = Date.now();
			const pending = txApp.findRecordsByFilter(
				'invitations',
				"organization = {:org} && email = {:email} && status = 'pending'",
				'-created',
				10,
				0,
				{ org: orgId, email }
			);
			for (const existing of pending) {
				if (parsePbDate(existing.getString('expires_at')) > now) {
					failure = {
						status: 409,
						code: 'duplicate_invitation',
						message: 'An active invitation for this email already exists.'
					};
					return;
				}
			}

			const token = $security.randomString(48);
			const expiresAt = new Date(now + inviteTtlHours() * 3600 * 1000);

			const invitations = txApp.findCollectionByNameOrId('invitations');
			const invitation = new Record(invitations);
			invitation.set('organization', orgId);
			invitation.set('email', email);
			invitation.set('role', role);
			invitation.set('token_hash', $security.sha256(token));
			invitation.set('status', 'pending');
			invitation.set('expires_at', expiresAt.toISOString());
			invitation.set('invited_by', auth.id);
			txApp.save(invitation);

			recordEvent(txApp, orgId, auth.id, 'invitation_created', null, email, { role });

			// The plaintext token is returned once and never stored or logged.
			result = {
				id: invitation.id,
				email,
				role,
				expiresAt: expiresAt.toISOString(),
				token
			};
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });

		return e.json(200, result);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// GET /api/flihub/invitations/lookup?token=…
// Minimal, safe preview for the accept page. Never returns the recipient's
// email address or token material — only whether the signed-in user matches.
// ---------------------------------------------------------------------------
routerAdd(
	'GET',
	'/api/flihub/invitations/lookup',
	(e) => {
		const normalizeEmail = (value) =>
			String(value || '')
				.trim()
				.toLowerCase();
		const parsePbDate = (value) => new Date(String(value || '').replace(' ', 'T')).getTime();

		const auth = e.auth;
		const token = String((e.requestInfo().query || {}).token || '');
		if (!token) {
			return e.json(400, { code: 'invalid_token', message: 'Missing invitation token.' });
		}

		let invitation = null;
		try {
			invitation = e.app.findFirstRecordByFilter('invitations', 'token_hash = {:hash}', {
				hash: $security.sha256(token)
			});
		} catch (_) {
			return e.json(404, { code: 'invalid_token', message: 'This invitation link is not valid.' });
		}

		let status = invitation.getString('status');
		if (status === 'pending' && parsePbDate(invitation.getString('expires_at')) <= Date.now()) {
			status = 'expired';
		}

		const org = e.app.findRecordById('organizations', invitation.getString('organization'));
		let alreadyMember = false;
		try {
			e.app.findFirstRecordByFilter('memberships', 'organization = {:org} && user = {:user}', {
				org: org.id,
				user: auth.id
			});
			alreadyMember = true;
		} catch (_) {}

		return e.json(200, {
			organizationName: org.getString('name'),
			role: invitation.getString('role'),
			status,
			emailMatches: normalizeEmail(auth.getString('email')) === invitation.getString('email'),
			alreadyMember,
			expiresAt: invitation.getString('expires_at')
		});
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/invitations/accept { token }
// Atomic acceptance: validates recipient, verification, expiry, revocation,
// single use, and duplicate membership inside one transaction.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/invitations/accept',
	(e) => {
		const normalizeEmail = (value) =>
			String(value || '')
				.trim()
				.toLowerCase();
		const parsePbDate = (value) => new Date(String(value || '').replace(' ', 'T')).getTime();
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
		const recordEvent = (txApp, orgId, actorId, action, subjectUserId, subjectEmail, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			if (subjectUserId) record.set('subject_user', subjectUserId);
			if (subjectEmail) record.set('subject_email', subjectEmail);
			if (details) record.set('details', details);
			txApp.save(record);
		};

		const auth = e.auth;
		const body = e.requestInfo().body || {};
		const token = String(body.token || '');
		if (!token) {
			return e.json(400, { code: 'invalid_token', message: 'Missing invitation token.' });
		}
		const hash = $security.sha256(token);

		let result = null;
		let failure = null;
		try {
			e.app.runInTransaction((txApp) => {
				let invitation = null;
				try {
					invitation = txApp.findFirstRecordByFilter('invitations', 'token_hash = {:hash}', {
						hash
					});
				} catch (_) {
					failure = {
						status: 404,
						code: 'invalid_token',
						message: 'This invitation link is not valid.'
					};
					return;
				}

				const status = invitation.getString('status');
				if (status === 'accepted') {
					failure = {
						status: 409,
						code: 'already_accepted',
						message: 'This invitation has already been used.'
					};
					return;
				}
				if (status === 'revoked') {
					failure = {
						status: 409,
						code: 'invitation_revoked',
						message: 'This invitation was revoked.'
					};
					return;
				}
				if (parsePbDate(invitation.getString('expires_at')) <= Date.now()) {
					failure = {
						status: 410,
						code: 'invitation_expired',
						message: 'This invitation has expired.'
					};
					return;
				}
				if (!auth.getBool('verified')) {
					failure = {
						status: 403,
						code: 'email_not_verified',
						message: 'Verify your email address before accepting invitations.'
					};
					return;
				}
				if (normalizeEmail(auth.getString('email')) !== invitation.getString('email')) {
					failure = {
						status: 403,
						code: 'wrong_recipient',
						message: 'This invitation was sent to a different email address.'
					};
					return;
				}

				const orgId = invitation.getString('organization');
				if (findMembership(txApp, orgId, auth.id)) {
					failure = { status: 409, code: 'already_member', message: 'You are already a member.' };
					return;
				}

				const memberships = txApp.findCollectionByNameOrId('memberships');
				const membership = new Record(memberships);
				membership.set('organization', orgId);
				membership.set('user', auth.id);
				membership.set('role', invitation.getString('role'));
				txApp.save(membership);

				invitation.set('status', 'accepted');
				invitation.set('accepted_by', auth.id);
				invitation.set('accepted_at', new Date().toISOString());
				txApp.save(invitation);

				recordEvent(txApp, orgId, auth.id, 'invitation_accepted', auth.id, null, {
					role: membership.getString('role')
				});
				result = { organization: orgId };
			});
		} catch (err) {
			// Unique-index backstop against concurrent acceptance racing.
			failure = { status: 409, code: 'already_member', message: 'You are already a member.' };
		}
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });

		return e.json(200, result);
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/invitations/{id}/revoke
// Owner or Admin of the organization; only pending invitations.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/invitations/{id}/revoke',
	(e) => {
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
		const recordEvent = (txApp, orgId, actorId, action, subjectUserId, subjectEmail, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			if (subjectUserId) record.set('subject_user', subjectUserId);
			if (subjectEmail) record.set('subject_email', subjectEmail);
			if (details) record.set('details', details);
			txApp.save(record);
		};

		const auth = e.auth;
		const id = e.request.pathValue('id');

		let invitation = null;
		try {
			invitation = e.app.findRecordById('invitations', id);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Invitation not found.' });
		}
		const orgId = invitation.getString('organization');

		let failure = null;
		e.app.runInTransaction((txApp) => {
			const caller = findMembership(txApp, orgId, auth.id);
			const role = caller ? caller.getString('role') : null;
			if (role !== 'owner' && role !== 'admin') {
				failure = {
					status: 403,
					code: 'forbidden_role',
					message: 'Only Owners and Admins can revoke invitations.'
				};
				return;
			}
			if (invitation.getString('status') !== 'pending') {
				failure = {
					status: 409,
					code: 'invitation_not_pending',
					message: 'Only pending invitations can be revoked.'
				};
				return;
			}
			invitation.set('status', 'revoked');
			txApp.save(invitation);
			recordEvent(
				txApp,
				orgId,
				auth.id,
				'invitation_revoked',
				null,
				invitation.getString('email'),
				null
			);
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });

		return e.json(200, { revoked: true });
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/memberships/{id}/role { role }
// Owner only. Cannot target the Owner; cannot assign ownership (transfer only).
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/memberships/{id}/role',
	(e) => {
		const ASSIGNABLE_ROLES = ['admin', 'scorekeeper', 'viewer'];
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
		const recordEvent = (txApp, orgId, actorId, action, subjectUserId, subjectEmail, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			if (subjectUserId) record.set('subject_user', subjectUserId);
			if (subjectEmail) record.set('subject_email', subjectEmail);
			if (details) record.set('details', details);
			txApp.save(record);
		};

		const auth = e.auth;
		const id = e.request.pathValue('id');
		const body = e.requestInfo().body || {};
		const newRole = String(body.role || '');

		if (!ASSIGNABLE_ROLES.includes(newRole)) {
			return e.json(400, {
				code: 'invalid_role',
				message: 'Role must be admin, scorekeeper, or viewer.'
			});
		}

		let target = null;
		try {
			target = e.app.findRecordById('memberships', id);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Membership not found.' });
		}
		const orgId = target.getString('organization');

		let failure = null;
		e.app.runInTransaction((txApp) => {
			const caller = findMembership(txApp, orgId, auth.id);
			if (!caller || caller.getString('role') !== 'owner') {
				failure = { status: 403, code: 'not_owner', message: 'Only the Owner can change roles.' };
				return;
			}
			if (target.getString('role') === 'owner') {
				failure = {
					status: 400,
					code: 'cannot_target_owner',
					message: 'Use ownership transfer to change the Owner.'
				};
				return;
			}
			const from = target.getString('role');
			target.set('role', newRole);
			txApp.save(target);
			recordEvent(txApp, orgId, auth.id, 'role_changed', target.getString('user'), null, {
				from,
				to: newRole
			});
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });

		return e.json(200, { updated: true });
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/memberships/{id}/remove
// Owner only. The Owner cannot be removed (transfer ownership first).
// Admins cannot remove accepted members.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/memberships/{id}/remove',
	(e) => {
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
		const recordEvent = (txApp, orgId, actorId, action, subjectUserId, subjectEmail, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			if (subjectUserId) record.set('subject_user', subjectUserId);
			if (subjectEmail) record.set('subject_email', subjectEmail);
			if (details) record.set('details', details);
			txApp.save(record);
		};

		const auth = e.auth;
		const id = e.request.pathValue('id');

		let target = null;
		try {
			target = e.app.findRecordById('memberships', id);
		} catch (_) {
			return e.json(404, { code: 'not_found', message: 'Membership not found.' });
		}
		const orgId = target.getString('organization');

		let failure = null;
		e.app.runInTransaction((txApp) => {
			const caller = findMembership(txApp, orgId, auth.id);
			if (!caller || caller.getString('role') !== 'owner') {
				failure = { status: 403, code: 'not_owner', message: 'Only the Owner can remove members.' };
				return;
			}
			if (target.getString('role') === 'owner') {
				failure = {
					status: 400,
					code: 'cannot_target_owner',
					message: 'The Owner cannot be removed. Transfer ownership first.'
				};
				return;
			}
			const removedUser = target.getString('user');
			const removedRole = target.getString('role');
			txApp.delete(target);
			recordEvent(txApp, orgId, auth.id, 'member_removed', removedUser, null, {
				role: removedRole
			});
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });

		return e.json(200, { removed: true });
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/organizations/{id}/leave
// Any non-Owner member may leave. The Owner must transfer ownership first.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/organizations/{id}/leave',
	(e) => {
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
		const recordEvent = (txApp, orgId, actorId, action, subjectUserId, subjectEmail, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			if (subjectUserId) record.set('subject_user', subjectUserId);
			if (subjectEmail) record.set('subject_email', subjectEmail);
			if (details) record.set('details', details);
			txApp.save(record);
		};

		const auth = e.auth;
		const orgId = e.request.pathValue('id');

		let failure = null;
		e.app.runInTransaction((txApp) => {
			const membership = findMembership(txApp, orgId, auth.id);
			if (!membership) {
				failure = {
					status: 403,
					code: 'not_member',
					message: 'You are not a member of this organization.'
				};
				return;
			}
			if (membership.getString('role') === 'owner') {
				failure = {
					status: 400,
					code: 'owner_cannot_leave',
					message: 'Transfer ownership before leaving the organization.'
				};
				return;
			}
			const role = membership.getString('role');
			txApp.delete(membership);
			recordEvent(txApp, orgId, auth.id, 'member_left', auth.id, null, { role });
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });

		return e.json(200, { left: true });
	},
	$apis.requireAuth()
);

// ---------------------------------------------------------------------------
// POST /api/flihub/organizations/{id}/transfer { membership }
// Atomic ownership transfer: target accepted member becomes Owner, the former
// Owner becomes Admin. Exactly one Owner is preserved at every step.
// ---------------------------------------------------------------------------
routerAdd(
	'POST',
	'/api/flihub/organizations/{id}/transfer',
	(e) => {
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
		const recordEvent = (txApp, orgId, actorId, action, subjectUserId, subjectEmail, details) => {
			const collection = txApp.findCollectionByNameOrId('membership_events');
			const record = new Record(collection);
			record.set('organization', orgId);
			record.set('actor', actorId);
			record.set('action', action);
			if (subjectUserId) record.set('subject_user', subjectUserId);
			if (subjectEmail) record.set('subject_email', subjectEmail);
			if (details) record.set('details', details);
			txApp.save(record);
		};

		const auth = e.auth;
		const orgId = e.request.pathValue('id');
		const body = e.requestInfo().body || {};
		const targetId = String(body.membership || '');

		let failure = null;
		e.app.runInTransaction((txApp) => {
			const caller = findMembership(txApp, orgId, auth.id);
			if (!caller || caller.getString('role') !== 'owner') {
				failure = {
					status: 403,
					code: 'not_owner',
					message: 'Only the Owner can transfer ownership.'
				};
				return;
			}

			let target = null;
			try {
				target = txApp.findRecordById('memberships', targetId);
			} catch (_) {
				failure = { status: 404, code: 'not_found', message: 'Membership not found.' };
				return;
			}
			if (target.getString('organization') !== orgId || target.getString('role') === 'owner') {
				failure = {
					status: 400,
					code: 'invalid_transfer_target',
					message: 'Choose an accepted non-Owner member of this organization.'
				};
				return;
			}

			target.set('role', 'owner');
			txApp.save(target);
			caller.set('role', 'admin');
			txApp.save(caller);
			recordEvent(
				txApp,
				orgId,
				auth.id,
				'ownership_transferred',
				target.getString('user'),
				null,
				null
			);
		});
		if (failure) return e.json(failure.status, { code: failure.code, message: failure.message });

		return e.json(200, { transferred: true });
	},
	$apis.requireAuth()
);
/// <reference path="../pb_data/types.d.ts" />
