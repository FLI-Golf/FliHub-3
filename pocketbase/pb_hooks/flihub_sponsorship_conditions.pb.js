routerAdd('POST', '/api/flihub/sponsorships/{org}/funding-condition', (e) => {
	const org = e.request.pathValue('org');
	const { sponsor, agreement, targetCents, percentage, currency, deadline, selectedIds } =
		e.requestInfo().body;
	const validId = (value) => typeof value === 'string' && /^[a-z0-9]{15}$/.test(value);
	const date = new Date(deadline + 'T00:00:00Z');

	if (!validId(sponsor) || !validId(agreement))
		throw new BadRequestError('Choose a dependent agreement.');
	if (!Number.isSafeInteger(targetCents) || targetCents < 1 || targetCents > 99999999999)
		throw new BadRequestError('Enter a valid funding target.');
	if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100)
		throw new BadRequestError('Enter a threshold from 1 to 100 percent.');
	if (!['USD', 'CAD', 'EUR', 'GBP'].includes(currency))
		throw new BadRequestError('Choose a supported currency.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(date.getTime()) ||
		date.toISOString().slice(0, 10) !== deadline)
		throw new BadRequestError('Enter a valid funding deadline.');
	if (!Array.isArray(selectedIds) || !selectedIds.length || !selectedIds.every(validId))
		throw new BadRequestError('Select at least one qualifying signed agreement.');

	const today = new Date().toISOString().slice(0, 10);
	const cutoff = today < deadline ? today : deadline;
	e.app.runInTransaction((app) => {
		const [member] = app.findRecordsByFilter('memberships',
			'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
			'', 1, 0, { org, user: e.auth.id });
		if (!member) throw new ForbiddenError('Only Owners and Admins can save funding conditions.');
		const organization = app.findRecordById('organizations', org);
		if (!JSON.parse(String(organization.get('capabilities') || '[]')).includes('sponsorships'))
			throw new ForbiddenError('Sponsorships must be enabled.');

		const [dependent] = app.findRecordsByFilter('sponsorship_agreements',
			'id = {:agreement} && organization = {:org} && sponsor = {:sponsor}',
			'', 1, 0, { agreement, org, sponsor });
		if (!dependent) throw new NotFoundError('Agreement not found for this sponsor.');

		const qualifyingIds = [...new Set(selectedIds)];
		for (const id of qualifyingIds) {
			const [qualifying] = app.findRecordsByFilter('sponsorship_agreements',
				'id = {:id} && organization = {:org} && currency = {:currency} && signedOn != "" && signedOn <= {:cutoff}',
				'', 1, 0, { id, org, currency, cutoff });
			if (!qualifying) throw new BadRequestError('Choose agreements in this organization signed by the cutoff in the selected currency.');
		}

		const collection = app.findCollectionByNameOrId('sponsorship_funding_conditions');
		const [existing] = app.findRecordsByFilter(collection.name, 'agreement = {:agreement}',
			'', 1, 0, { agreement });
		const condition = existing ?? new Record(collection);
		if (existing?.getString("releasedAt")) throw new BadRequestError("Released funding terms are locked.");
		condition.set('organization', org);
		condition.set('agreement', agreement);
		condition.set('targetCents', targetCents);
		condition.set('percentage', percentage);
		condition.set('currency', currency);
		condition.set('deadline', deadline);
		condition.set('selectedIds', qualifyingIds);
		app.save(condition);
	});

	return e.json(200, { saved: true });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/flihub/sponsorships/{org}/release-installments', (e) => {
	const org = e.request.pathValue('org');
	const { sponsor, agreement } = e.requestInfo().body || {};
	if (!/^[a-z0-9]{15}$/.test(sponsor) || !/^[a-z0-9]{15}$/.test(agreement))
		throw new BadRequestError('Choose a dependent agreement.');

	e.app.runInTransaction((app) => {
		const [member] = app.findRecordsByFilter('memberships',
			'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
			'', 1, 0, { org, user: e.auth.id });
		if (!member) throw new ForbiddenError('Only Owners and Admins can release installments.');
		const organization = app.findRecordById('organizations', org);
		if (!JSON.parse(String(organization.get('capabilities') || '[]')).includes('sponsorships'))
			throw new ForbiddenError('Sponsorships must be enabled.');

		const [dependent] = app.findRecordsByFilter('sponsorship_agreements',
			'id = {:agreement} && organization = {:org} && sponsor = {:sponsor}',
			'', 1, 0, { agreement, org, sponsor });
		if (!dependent) throw new NotFoundError('Agreement not found for this sponsor.');
		if (app.findRecordById('sponsors', sponsor).getBool('archived'))
			throw new BadRequestError('Restore the sponsor before releasing installments.');

		const [condition] = app.findRecordsByFilter('sponsorship_funding_conditions',
			'agreement = {:agreement} && organization = {:org}', '', 1, 0, { agreement, org });
		if (!condition) throw new BadRequestError('Save a funding condition first.');
		if (condition.getString('releasedAt')) return;

		const [installment] = app.findRecordsByFilter('sponsorship_funding_entries',
			'agreement = {:agreement} && organization = {:org} && kind = "installment"',
			'', 1, 0, { agreement, org });
		if (!installment) throw new BadRequestError('Schedule at least one installment before release.');

		const now = new Date().toISOString();
		const today = now.slice(0, 10);
		const deadline = condition.getString('deadline');
		const cutoff = today < deadline ? today : deadline;
		const currency = condition.getString('currency');
		const selectedIds = JSON.parse(String(condition.get('selectedIds')));
		let committedCents = 0;
		for (const id of new Set(selectedIds)) {
			const [qualifying] = app.findRecordsByFilter('sponsorship_agreements',
				'id = {:id} && organization = {:org} && currency = {:currency} && signedOn != "" && signedOn <= {:cutoff}',
				'', 1, 0, { id, org, currency, cutoff });
			if (qualifying) committedCents += qualifying.getInt('amountCents');
		}
		const requiredCents = Math.ceil(condition.getInt('targetCents') * condition.getInt('percentage') / 100);
		if (committedCents < requiredCents)
			throw new BadRequestError('The saved funding condition must be Met before release.');

		condition.set('releasedAt', now);
		condition.set('releasedBy', e.auth.id);
		condition.set('releasedByName', e.auth.getString('name').slice(0, 200));
		condition.set('releasedCommittedCents', committedCents);
		app.save(condition);
	});
	return e.json(200, { released: true });
}, $apis.requireAuth('users'));
