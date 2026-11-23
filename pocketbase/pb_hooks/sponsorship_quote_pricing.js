function priceSponsorshipQuote(e) {
	const record = e.record;
	const org = record.getString('organization');
	const [membership] = e.app.findRecordsByFilter(
		'memberships',
		'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
		'',
		1,
		0,
		{ org, user: e.auth?.id ?? '' }
	);
	if (!membership) throw new ForbiddenError('Only Owners and Admins can save sponsorship quotes.');
	const organization = e.app.findRecordById('organizations', org);
	if (!JSON.parse(String(organization.get('capabilities') || '[]')).includes('sponsorships'))
		throw new ForbiddenError('Sponsorships must be enabled.');
	const sponsor = e.app.findRecordById('sponsors', record.getString('sponsor'));
	if (sponsor.getString('organization') !== org || sponsor.getBool('archived'))
		throw new BadRequestError('Choose an active sponsor in this organization.');

	const packages = require(__hooks + '/title_sponsor_pilot.json');
	const name = record.getString('packageName') || 'Title Sponsor';
	const pkg = packages.find((item) => item.name === name);
	if (!pkg) throw new BadRequestError('Choose an available sponsorship package.');
	const selected = JSON.parse(String(record.get('selectedBenefits') || '[]'));
	if (
		!Array.isArray(selected) ||
		new Set(selected).size !== selected.length ||
		selected.some((id) => !pkg.benefits.some((benefit) => benefit.id === id))
	) {
		throw new BadRequestError('Choose benefits from the selected sponsorship package.');
	}
	const benefits = pkg.benefits.filter(
		(benefit) => benefit.required || selected.includes(benefit.id)
	);
	record.set('packageName', pkg.name);
	record.set('currency', pkg.currency);
	record.set('benefits', benefits);
	record.set(
		'amountCents',
		benefits.reduce((sum, benefit) => sum + benefit.amountCents, 0)
	);
	e.next();
}

module.exports = { priceSponsorshipQuote };
