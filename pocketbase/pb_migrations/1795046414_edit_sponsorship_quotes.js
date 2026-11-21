migrate((app) => {
	const quotes = app.findCollectionByNameOrId('sponsorship_quotes');
	quotes.updateRule = quotes.createRule +
		' && @request.body.organization:changed = false && @request.body.sponsor:changed = false';
	app.save(quotes);
}, (app) => {
	const quotes = app.findCollectionByNameOrId('sponsorship_quotes');
	quotes.updateRule = null;
	app.save(quotes);
});
