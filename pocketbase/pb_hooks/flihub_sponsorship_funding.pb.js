onRecordCreateRequest((e) => {
	const record = e.record;
	const org = record.getString('organization');
	const [membership] = e.app.findRecordsByFilter('memberships',
		'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
		'', 1, 0, { org, user: e.auth?.id ?? '' });
	if (!membership) throw new ForbiddenError('Only Owners and Admins can record sponsorship funding.');
	const organization = e.app.findRecordById('organizations', org);
	if (!JSON.parse(String(organization.get('capabilities') || '[]')).includes('sponsorships'))
		throw new ForbiddenError('Sponsorships must be enabled.');

	const agreement = e.app.findRecordById('sponsorship_agreements', record.getString('agreement'));
	if (agreement.getString('organization') !== org)
		throw new BadRequestError('Choose an agreement in this organization.');

	const date = record.getString('entryDate');
	const parsed = new Date(date + 'T00:00:00Z');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== date)
		throw new BadRequestError('Enter a valid date.');

	if (record.getString('kind') === 'payment' && !record.getString('method'))
		throw new BadRequestError('Choose a payment method.');
	if (record.getString('kind') === 'installment') {
		record.set('method', '');

		const existing = e.app.findRecordsByFilter('sponsorship_funding_entries',
			'agreement = {:agreement} && kind = "installment"', '', 0, 0, { agreement: agreement.id });
		const scheduled = existing.reduce((sum, row) => sum + row.getInt('amountCents'), 0);
		if (scheduled + record.getInt('amountCents') > agreement.getInt('amountCents'))
			throw new BadRequestError('Scheduled installments cannot exceed the agreement total.');
	}
	record.set('recordedBy', e.auth.id);
	e.next();
}, 'sponsorship_funding_entries');
