/// <reference path="../pb_data/types.d.ts" />

routerAdd(
	'POST',
	'/api/flihub/demo/scorekeepers/{id}/activate',
	(e) => {
		if ($os.getenv('FLIHUB_DEMO_SCOREKEEPERS') !== '1' || !$os.getenv('CODESPACE_NAME')) {
			throw new ForbiddenError('Demo activation is disabled.');
		}

		const orgId = '4ksk16f64guhf21';
		const names = {
			'alex@example.com': 'Alex',
			'jordan@example.com': 'Jordan',
			'sam@example.com': 'Sam',
			'taylor@example.com': 'Taylor',
			'casey@example.com': 'Casey',
			'morgan@example.com': 'Morgan'
		};
		const invitationId = e.request.pathValue('id');

		e.app.runInTransaction((app) => {
			const caller = app.findFirstRecordByFilter(
				'memberships',
				'organization = {:org} && user = {:user}',
				{ org: orgId, user: e.auth.id }
			);
			if (!['owner', 'admin'].includes(caller.getString('role'))) {
				throw new ForbiddenError('Only Owners and Admins can activate demo scorekeepers.');
			}

			const invitation = app.findRecordById('invitations', invitationId);
			const email = invitation.getString('email').trim().toLowerCase();
			if (
				invitation.getString('organization') !== orgId ||
				invitation.getString('role') !== 'scorekeeper' ||
				!Object.prototype.hasOwnProperty.call(names, email)
			) {
				throw new BadRequestError('This invitation is not one of the six demo scorekeepers.');
			}

			const status = invitation.getString('status');
			if (status === 'accepted') return;
			if (status !== 'pending') {
				throw new BadRequestError('Only pending demo invitations can be activated.');
			}
			const expiry = new Date(invitation.getString('expires_at').replace(' ', 'T')).getTime();
			if (!isFinite(expiry) || expiry <= Date.now()) {
				throw new BadRequestError('This invitation has expired. Create a new invitation first.');
			}

			const users = app.findRecordsByFilter('users', 'email = {:email}', '', 2, 0, { email });
			let user = users[0];
			if (!user) {
				user = new Record(app.findCollectionByNameOrId('users'));
				user.set('email', email);
				user.set('name', names[email]);
				user.setPassword($security.randomString(48));
				user.set('verified', true);
				app.save(user);
			} else if (!user.getBool('verified')) {
				throw new BadRequestError(
					'An unverified account already uses this address. Verify it first.'
				);
			}

			if (!user.getBool('emailVisibility')) {
				user.set('emailVisibility', true);
				app.save(user);
			}

			const memberships = app.findRecordsByFilter(
				'memberships',
				'organization = {:org} && user = {:user}',
				'',
				2,
				0,
				{ org: orgId, user: user.id }
			);
			if (memberships.length) {
				if (memberships[0].getString('role') !== 'scorekeeper') {
					throw new BadRequestError('This account already has another organization role.');
				}
			} else {
				const membership = new Record(app.findCollectionByNameOrId('memberships'));
				membership.set('organization', orgId);
				membership.set('user', user.id);
				membership.set('role', 'scorekeeper');
				app.save(membership);
			}

			invitation.set('status', 'accepted');
			invitation.set('accepted_by', user.id);
			invitation.set('accepted_at', new Date().toISOString());
			app.save(invitation);

			const audit = new Record(app.findCollectionByNameOrId('membership_events'));
			audit.set('organization', orgId);
			audit.set('actor', e.auth.id);
			audit.set('action', 'invitation_accepted');
			audit.set('subject_user', user.id);
			audit.set('subject_email', email);
			audit.set(
				'details',
				JSON.stringify({
					role: 'scorekeeper',
					demoActivation: true,
					activatedBy: e.auth.id
				})
			);
			app.save(audit);
		});

		return e.json(200, { activated: true });
	},
	$apis.requireAuth()
);
