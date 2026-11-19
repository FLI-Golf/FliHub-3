migrate(
	(app) => {
		const leagues = app.findCollectionByNameOrId('leagues');
		leagues.fields.add(new BoolField({ name: 'payoutPerTournament' }));
		leagues.fields.add(new TextField({ name: 'payoutEventCurves', max: 20000 }));
		return app.save(leagues);
	},
	(app) => {
		const leagues = app.findCollectionByNameOrId('leagues');
		leagues.fields.removeByName('payoutPerTournament');
		leagues.fields.removeByName('payoutEventCurves');
		return app.save(leagues);
	}
);
