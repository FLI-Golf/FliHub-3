migrate(
	(app) => {
		const versions = app.findCollectionByNameOrId('result_versions');
		versions.fields.add(new JSONField({ name: 'playoffAttempts', maxSize: 200000 }));
		return app.save(versions);
	},
	(app) => {
		const versions = app.findCollectionByNameOrId('result_versions');
		versions.fields.removeByName('playoffAttempts');
		return app.save(versions);
	}
);
