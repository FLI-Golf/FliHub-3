/// <reference path="../pb_data/types.d.ts" />
/** Recipient-only DTOs. Never relax invitations collection rules or expose tokens. */
routerAdd(
	'GET',
	'/api/flihub/invitations/pending',
	(e) => {
		e.response.header().set('Cache-Control', 'private, no-store');
		if (!e.auth.getBool('verified'))
			return e.json(403, {
				code: 'email_not_verified',
				message: 'Verify your email address before reviewing invitations.'
			});
		const query = e.requestInfo().query || {};
		const page = Number(query.page || 1);
		const perPage = Number(query.perPage || 20);
		if (
			!Number.isSafeInteger(page) ||
			page < 1 ||
			page > 10000 ||
			!Number.isSafeInteger(perPage) ||
			perPage < 1 ||
			perPage > 20
		)
			return e.json(400, { code: 'invalid_page', message: 'Invalid invitation page.' });
		const email = e.auth.getString('email').trim().toLowerCase();
		if (!email)
			return e.json(403, { code: 'email_not_verified', message: 'A verified email is required.' });
		const now = new Date().toISOString().replace('T', ' ');
		const rows = e.app.findRecordsByFilter(
			'invitations',
			'email = {:email} && status = "pending" && expires_at > {:now}',
			'-created,id',
			perPage + 1,
			(page - 1) * perPage,
			{ email, now }
		);
		const items = rows.slice(0, perPage).map((record) => {
			const organization = e.app.findRecordById('organizations', record.getString('organization'));
			return {
				invitationId: record.id,
				organizationName: organization.getString('name'),
				role: record.getString('role'),
				expiresAt: record.getString('expires_at')
			};
		});
		return e.json(200, { items, page, hasMore: rows.length > perPage });
	},
	$apis.requireAuth()
);
