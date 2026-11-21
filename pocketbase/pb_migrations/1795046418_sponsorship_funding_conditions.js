migrate((app) => {
	const organizations = app.findCollectionByNameOrId('organizations');
	const agreements = app.findCollectionByNameOrId('sponsorship_agreements');
	return app.save(new Collection({
		name: 'sponsorship_funding_conditions',
		type: 'base',
		listRule: agreements.listRule,
		viewRule: agreements.viewRule,
		fields: [
			{ name: 'organization', type: 'relation', collectionId: organizations.id, maxSelect: 1, required: true },
			{ name: 'agreement', type: 'relation', collectionId: agreements.id, maxSelect: 1, required: true, cascadeDelete: true },
			{ name: 'targetCents', type: 'number', onlyInt: true, min: 1, max: 99999999999, required: true },
			{ name: 'percentage', type: 'number', onlyInt: true, min: 1, max: 100, required: true },
			{ name: 'currency', type: 'select', maxSelect: 1, required: true, values: ['USD', 'CAD', 'EUR', 'GBP'] },
			{ name: 'deadline', type: 'text', max: 10, required: true },
			{ name: 'selectedIds', type: 'json', required: true }
		],
		indexes: [
			'CREATE UNIQUE INDEX idx_sponsorship_condition_agreement ON sponsorship_funding_conditions (agreement)',
			'CREATE INDEX idx_sponsorship_condition_org ON sponsorship_funding_conditions (organization)'
		]
	}));
}, (app) => app.delete(app.findCollectionByNameOrId('sponsorship_funding_conditions')));
