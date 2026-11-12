migrate(
	(app) => {
		const seasons = app.findCollectionByNameOrId('seasons');
		seasons.fields.add(
			new NumberField({
				name: 'purseAmountCents',
				required: false,
				min: 0,
				max: 9007199254740991,
				onlyInt: true
			})
		);
		seasons.fields.add(
			new TextField({
				name: 'purseCurrency',
				required: false,
				max: 3,
				pattern: '^(USD)?$'
			})
		);
		app.save(seasons);
	},
	(app) => {
		const seasons = app.findCollectionByNameOrId('seasons');
		seasons.fields.removeByName('purseAmountCents');
		seasons.fields.removeByName('purseCurrency');
		app.save(seasons);
	}
);
