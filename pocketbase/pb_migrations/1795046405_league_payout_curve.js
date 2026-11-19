migrate(
	(app) => {
		const leagues = app.findCollectionByNameOrId('leagues');
		leagues.fields.add(
			new NumberField({ name: 'payoutTopWeight', min: 0, max: 100, onlyInt: true })
		);
		return app.save(leagues);
	},
	(app) => {
		const leagues = app.findCollectionByNameOrId('leagues');
		leagues.fields.removeByName('payoutTopWeight');
		return app.save(leagues);
	}
);
