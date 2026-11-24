onRecordCreateRequest((e) => {
	const {
		fundingValidDate,
		fundingAuthorize,
		fundingValidateEvent,
		fundingValidateAmount,
		fundingValidateContributor,
		fundingValidatePaymentMethod
	} = require(`${__hooks}/funding_donation_rules.js`);
	const org = fundingAuthorize(e);
	const record = e.record;

	fundingValidateEvent(e, org);
	fundingValidateAmount(record);
	fundingValidateContributor(record);
	fundingValidatePaymentMethod(record);

	if (!fundingValidDate(record.getString('receivedOn')))
		throw new BadRequestError('Enter a valid donation receipt date.');

	record.set('recordedBy', e.auth.id);
	e.next();
}, 'funding_donations');

onRecordCreateRequest((e) => {
	const {
		fundingValidDate,
		fundingAuthorize,
		fundingValidateEvent,
		fundingValidateAmount,
		fundingValidateContributor
	} = require(`${__hooks}/funding_donation_rules.js`);
	const org = fundingAuthorize(e);
	const record = e.record;

	fundingValidateEvent(e, org);
	fundingValidateAmount(record);
	fundingValidateContributor(record);

	const pledgedOn = record.getString('pledgedOn');
	const dueOn = record.getString('dueOn');

	if (!fundingValidDate(pledgedOn)) throw new BadRequestError('Enter a valid pledge date.');

	if (dueOn && (!fundingValidDate(dueOn) || dueOn < pledgedOn))
		throw new BadRequestError('Enter a valid due date on or after the pledge date.');

	record.set('recordedBy', e.auth.id);
	e.next();
}, 'funding_pledges');

onRecordCreateRequest((e) => {
	const {
		fundingValidDate,
		fundingAuthorize,
		fundingValidateAmount,
		fundingValidatePaymentMethod
	} = require(`${__hooks}/funding_donation_rules.js`);
	const org = fundingAuthorize(e);
	const record = e.record;

	fundingValidateAmount(record);
	fundingValidatePaymentMethod(record);

	const pledge = e.app.findRecordById('funding_pledges', record.getString('pledge'));

	if (pledge.getString('organization') !== org)
		throw new BadRequestError('Choose a pledge in this organization.');

	if (!fundingValidDate(record.getString('receivedOn')))
		throw new BadRequestError('Enter a valid payment receipt date.');

	const existing = e.app.findRecordsByFilter(
		'funding_pledge_payments',
		'pledge = {:pledge}',
		'',
		0,
		0,
		{ pledge: pledge.id }
	);

	const received = existing.reduce((sum, payment) => sum + payment.getInt('amountCents'), 0);

	if (received + record.getInt('amountCents') > pledge.getInt('amountCents'))
		throw new BadRequestError('Pledge payments cannot exceed the pledged amount.');

	record.set('recordedBy', e.auth.id);
	e.next();
}, 'funding_pledge_payments');
