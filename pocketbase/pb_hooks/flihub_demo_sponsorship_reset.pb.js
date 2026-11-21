routerAdd(
	'POST',
	'/api/flihub/demo/sponsorships/{org}/clear',
	(e) => {
		if ($os.getenv('FLIHUB_DEMO_SPONSORSHIPS') !== '1') {
			throw new ForbiddenError('Start local PocketBase with FLIHUB_DEMO_SPONSORSHIPS=1 to clear demo deals.');
		}
		const org = e.request.pathValue('org');
		const { confirm, expectedCount } = e.requestInfo().body || {};
		if (confirm !== 'CLEAR' || !Number.isSafeInteger(expectedCount) || expectedCount < 1) {
			throw new BadRequestError('Confirm the number of seeded agreements to remove.');
		}
		const seedId = (key) => $security.sha256('flihub-sponsorship-demo:' + org + ':' + key).slice(0, 15);
		const sponsor = seedId('sponsor');
		let cleared = 0;
		e.app.runInTransaction((app) => {
			const members = app.findRecordsByFilter('memberships',
				'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
				'', 1, 0, { org, user: e.auth.id });
			if (!members.length) throw new ForbiddenError('Only Owners and Admins can clear demo agreements.');
			const organization = app.findRecordById('organizations', org);
			if (!JSON.parse(String(organization.get('capabilities') || '[]')).includes('sponsorships'))
				throw new ForbiddenError('Sponsorships must be enabled.');

			const seeded = [];
			for (let offset = 0; ; offset += 500) {
				const rows = app.findRecordsByFilter('sponsorship_agreements',
					'organization = {:org} && sponsor = {:sponsor}', 'id', 500, offset, { org, sponsor });
				for (const row of rows) {
					if (row.id === seedId('agreement:' + row.getString('coverage'))) seeded.push(row);
				}
				if (rows.length < 500) break;
			}
			if (seeded.length !== expectedCount) {
				throw new BadRequestError('The number of seeded agreements changed. Review the updated count and try again.');
			}
			for (const agreement of seeded) app.delete(agreement);
			cleared = seeded.length;
		});
		return e.json(200, { cleared });
	},
	$apis.requireAuth('users')
);
