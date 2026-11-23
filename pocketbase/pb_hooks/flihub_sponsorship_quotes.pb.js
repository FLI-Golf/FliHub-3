onRecordCreateRequest((e) => {
	require(__hooks + '/sponsorship_quote_pricing.js').priceSponsorshipQuote(e);
}, 'sponsorship_quotes');
onRecordUpdateRequest((e) => {
	const [agreement] = e.app.findRecordsByFilter(
		'sponsorship_agreements',
		'quote = {:quote}',
		'',
		1,
		0,
		{ quote: e.record.id }
	);
	if (agreement) throw new BadRequestError('Converted quotes cannot be edited.');
	const original = e.record.original();
	if (
		original.getString('organization') !== e.record.getString('organization') ||
		original.getString('sponsor') !== e.record.getString('sponsor')
	)
		throw new BadRequestError('A quote cannot be moved to another sponsor or organization.');
	require(__hooks + '/sponsorship_quote_pricing.js').priceSponsorshipQuote(e);
}, 'sponsorship_quotes');
