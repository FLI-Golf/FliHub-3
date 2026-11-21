onRecordCreateRequest((e) => {
	const record = e.record;
	const org = record.getString('organization');
	const [membership] = e.app.findRecordsByFilter('memberships',
		'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
		'', 1, 0, { org, user: e.auth?.id ?? '' });
	if (!membership) throw new ForbiddenError('Only Owners and Admins can reverse sponsorship payments.');
	const organization = e.app.findRecordById('organizations', org);
	if (!JSON.parse(String(organization.get('capabilities') || '[]')).includes('sponsorships'))
		throw new ForbiddenError('Sponsorships must be enabled.');
	const payment = e.app.findRecordById('sponsorship_funding_entries', record.getString('payment'));
	if (payment.getString('organization') !== org || payment.getString('kind') !== 'payment')
		throw new BadRequestError('Choose a payment in this organization.');
	const [prior] = e.app.findRecordsByFilter('sponsorship_payment_reversals',
		'payment = {:payment}', '', 1, 0, { payment: payment.id });
	if (prior) throw new BadRequestError('This payment has already been reversed.');
	const reason = record.getString('reason').trim();
	if (!reason) throw new BadRequestError('Enter a reason for reversing the payment.');
	record.set('reason', reason);
	record.set('recordedBy', e.auth.id);
	record.set('recordedByName', e.auth.getString('name').slice(0, 200));
	e.next();
}, 'sponsorship_payment_reversals');
