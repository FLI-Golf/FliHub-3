migrate(
	(app) => {
		const drafts = app.findCollectionByNameOrId('fantasy_drafts');
		drafts.fields.add(new JSONField({ name: 'scoringRoster', maxSize: 100000 }));
		drafts.fields.add(new DateField({ name: 'scoringRosterLockedAt' }));
		app.save(drafts);
	},
	(app) => {
		const locked = app.findRecordsByFilter(
			'fantasy_drafts',
			"scoringRosterLockedAt != ''",
			'',
			1,
			0
		);
		if (locked.length)
			throw new Error(
				'Locked fantasy scoring rosters must be preserved; this migration cannot be rolled back after use.'
			);
		const drafts = app.findCollectionByNameOrId('fantasy_drafts');
		drafts.fields.removeByName('scoringRoster');
		drafts.fields.removeByName('scoringRosterLockedAt');
		app.save(drafts);
	}
);
