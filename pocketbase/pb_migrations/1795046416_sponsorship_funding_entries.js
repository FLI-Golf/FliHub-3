migrate((app) => {
	const organizations = app.findCollectionByNameOrId('organizations');
	const agreements = app.findCollectionByNameOrId('sponsorship_agreements');
	const users = app.findCollectionByNameOrId('users');
	app.save(new Collection({
		name: 'sponsorship_funding_entries',
		type: 'base',
		listRule: agreements.listRule,
		viewRule: agreements.viewRule,
		createRule: agreements.createRule,
		updateRule: null,
		deleteRule: null,
		fields: [
			{ name: 'organization', type: 'relation', collectionId: organizations.id, maxSelect: 1, required: true },
			{ name: 'agreement', type: 'relation', collectionId: agreements.id, maxSelect: 1, required: true },
			{ name: 'recordedBy', type: 'relation', collectionId: users.id, maxSelect: 1, required: true },
			{ name: 'kind', type: 'select', maxSelect: 1, required: true, values: ['installment', 'payment'] },
			{ name: 'amountCents', type: 'number', required: true, onlyInt: true, min: 1, max: 99999999999 },
			{ name: 'entryDate', type: 'text', required: true, max: 10 },
			{ name: 'method', type: 'select', maxSelect: 1, values: ['bank-transfer', 'check', 'card', 'cash', 'other'] },
			{ name: 'reference', type: 'text', max: 200 },
			{ name: 'created', type: 'autodate', onCreate: true }
		],
		indexes: ['CREATE INDEX idx_sponsorship_funding_agreement ON sponsorship_funding_entries (agreement, kind)']
	}));
	app.db().newQuery(`
		CREATE TRIGGER sponsorship_installment_total
		BEFORE INSERT ON sponsorship_funding_entries
		WHEN NEW.kind = 'installment' AND NEW.amountCents + COALESCE((
			SELECT SUM(amountCents) FROM sponsorship_funding_entries
			WHERE agreement = NEW.agreement AND kind = 'installment'
		), 0) > (SELECT amountCents FROM sponsorship_agreements WHERE id = NEW.agreement)
		BEGIN
			SELECT RAISE(ABORT, 'Scheduled installments cannot exceed the agreement total.');
		END
	`).execute();
}, (app) => {
	app.db().newQuery('DROP TRIGGER IF EXISTS sponsorship_installment_total').execute();
	return app.delete(app.findCollectionByNameOrId('sponsorship_funding_entries'));
});
