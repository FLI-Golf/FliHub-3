migrate(
	(app) => {
		const drafts = app.findCollectionByNameOrId('fantasy_drafts');
		const status = drafts.fields.getByName('status');
		const values = Array.from(status.values || []);
		if (!values.includes('paused')) {
			status.values = [...values, 'paused'];
			drafts.fields.add(status);
		}
		drafts.fields.add(
			new NumberField({ name: 'pausedRemainingMs', min: 0, max: 30000, onlyInt: true })
		);
		app.save(drafts);
	},
	(app) => {
		const drafts = app.findCollectionByNameOrId('fantasy_drafts');
		const paused = app.findRecordsByFilter('fantasy_drafts', "status = 'paused'", '', 1, 0);
		if (paused.length) throw new Error('Resume paused drafts before rolling back this migration.');
		const status = drafts.fields.getByName('status');
		status.values = Array.from(status.values || []).filter((value) => value !== 'paused');
		drafts.fields.add(status);
		drafts.fields.removeByName('pausedRemainingMs');
		app.save(drafts);
	}
);
