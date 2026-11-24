function fundingValidDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(value + 'T00:00:00Z');
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function fundingAuthorize(e) {
	const org = e.record.getString('organization');
	const user = e.auth?.id ?? '';

	const [membership] = e.app.findRecordsByFilter(
		'memberships',
		'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
		'',
		1,
		0,
		{ org, user }
	);

	if (!membership)
		throw new ForbiddenError('Only Owners and Admins can manage donations and pledges.');

	const organization = e.app.findRecordById('organizations', org);
	const capabilities = JSON.parse(String(organization.get('capabilities') || '[]'));

	if (!capabilities.includes('donations-pledges'))
		throw new ForbiddenError('Donations and pledges must be enabled.');

	return org;
}

function fundingValidateEvent(e, org) {
	const eventId = e.record.getString('event');
	if (!eventId) return;

	const event = e.app.findRecordById('events', eventId);

	if (event.getString('organization') !== org)
		throw new BadRequestError('Choose an event in this organization.');
}

function fundingValidateAmount(record) {
	const amount = record.getInt('amountCents');

	if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 99999999999)
		throw new BadRequestError('Enter a valid positive amount.');
}

function fundingValidateContributor(record) {
	const contributor = record.getString('contributor').trim();

	if (!contributor) throw new BadRequestError('Enter a contributor name.');

	record.set('contributor', contributor);
}

function fundingValidatePaymentMethod(record) {
	if (!record.getString('method')) throw new BadRequestError('Choose a payment method.');
}

module.exports = {
	fundingValidDate,
	fundingAuthorize,
	fundingValidateEvent,
	fundingValidateAmount,
	fundingValidateContributor,
	fundingValidatePaymentMethod
};
