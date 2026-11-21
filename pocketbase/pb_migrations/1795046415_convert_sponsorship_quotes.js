migrate((app) => {
	const agreements = app.findCollectionByNameOrId('sponsorship_agreements');
	const quotes = app.findCollectionByNameOrId('sponsorship_quotes');
	agreements.fields.add(new RelationField({
		name: 'quote', collectionId: quotes.id, maxSelect: 1
	}));
	agreements.addIndex('idx_sponsorship_agreements_quote', true, 'quote', "quote != ''");
	app.save(agreements);
	app.db().newQuery(`
		CREATE TRIGGER sponsorship_quote_lock_after_conversion
		BEFORE UPDATE ON sponsorship_quotes
		WHEN EXISTS (SELECT 1 FROM sponsorship_agreements WHERE quote = OLD.id)
		BEGIN
			SELECT RAISE(ABORT, 'Converted quotes cannot be edited.');
		END
	`).execute();
	app.db().newQuery(`
		CREATE TRIGGER sponsorship_agreement_current_quote
		BEFORE INSERT ON sponsorship_agreements
		WHEN NEW.quote != '' AND NOT EXISTS (
			SELECT 1 FROM sponsorship_quotes q
			WHERE q.id = NEW.quote AND q.organization = NEW.organization AND q.sponsor = NEW.sponsor
			  AND q.amountCents = NEW.amountCents AND q.currency = NEW.currency AND q.packageName = NEW.title
			  AND NEW.benefits = (SELECT group_concat(json_extract(value, '$.name'), char(10)) FROM json_each(q.benefits))
		)
		BEGIN
			SELECT RAISE(ABORT, 'The quote changed. Review the latest draft and try again.');
		END
	`).execute();
}, (app) => {
	app.db().newQuery('DROP TRIGGER IF EXISTS sponsorship_agreement_current_quote').execute();
	app.db().newQuery('DROP TRIGGER IF EXISTS sponsorship_quote_lock_after_conversion').execute();
	const agreements = app.findCollectionByNameOrId('sponsorship_agreements');
	agreements.removeIndex('idx_sponsorship_agreements_quote');
	agreements.fields.removeByName('quote');
	return app.save(agreements);
});
