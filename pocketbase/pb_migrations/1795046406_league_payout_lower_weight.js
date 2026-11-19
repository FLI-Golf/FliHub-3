migrate(
	(app) => {
		const leagues = app.findCollectionByNameOrId('leagues');
		leagues.fields.add(
			new NumberField({ name: 'payoutLowerWeight', min: 0, max: 100, onlyInt: true })
		);
		return app.save(leagues);
	},
	(app) => {
		const leagues = app.findCollectionByNameOrId('leagues');
		leagues.fields.removeByName('payoutLowerWeight');
		return app.save(leagues);
	}
);
