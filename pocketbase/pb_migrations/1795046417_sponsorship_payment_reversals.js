migrate((app) => {
	const entries = app.findCollectionByNameOrId('sponsorship_funding_entries');
	const organizations = app.findCollectionByNameOrId('organizations');
	const users = app.findCollectionByNameOrId('users');
	return app.save(new Collection({
		name: 'sponsorship_payment_reversals',
		type: 'base',
		listRule: entries.listRule,
		viewRule: entries.viewRule,
		createRule: entries.createRule,
		updateRule: null,
		deleteRule: null,
		fields: [
			{ name: 'organization', type: 'relation', collectionId: organizations.id, maxSelect: 1, required: true },
			{ name: 'payment', type: 'relation', collectionId: entries.id, maxSelect: 1, required: true },
			{ name: 'recordedBy', type: 'relation', collectionId: users.id, maxSelect: 1, required: true },
			{ name: 'recordedByName', type: 'text', max: 200 },
			{ name: 'reason', type: 'text', required: true, max: 500 },
			{ name: 'created', type: 'autodate', onCreate: true }
		],
		indexes: ['CREATE UNIQUE INDEX idx_sponsorship_payment_single_reversal ON sponsorship_payment_reversals (payment)']
	}));
}, (app) => app.delete(app.findCollectionByNameOrId('sponsorship_payment_reversals')));
