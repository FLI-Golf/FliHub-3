migrate(
	(app) => {
		const sponsors = app.findCollectionByNameOrId('sponsors');
		const organizations = app.findCollectionByNameOrId('organizations');
		app.save(
			new Collection({
				name: 'sponsorship_quotes',
				type: 'base',
				listRule: sponsors.listRule,
				viewRule: sponsors.viewRule,
				createRule: sponsors.createRule,
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: 'organization',
						type: 'relation',
						collectionId: organizations.id,
						maxSelect: 1,
						required: true
					},
					{
						name: 'sponsor',
						type: 'relation',
						collectionId: sponsors.id,
						maxSelect: 1,
						required: true
					},
					{ name: 'packageName', type: 'text', max: 120 },
					{ name: 'currency', type: 'text', max: 3 },
					{ name: 'amountCents', type: 'number', onlyInt: true },
					{ name: 'benefits', type: 'json', maxSize: 12000 },
					{ name: 'selectedBenefits', type: 'json', maxSize: 1000 },
					{ name: 'created', type: 'autodate', onCreate: true }
				],
				indexes: [
					'CREATE INDEX idx_quotes_org_sponsor ON sponsorship_quotes (organization, sponsor)'
				]
			})
		);
	},
	(app) => app.delete(app.findCollectionByNameOrId('sponsorship_quotes'))
);
