/// <reference path="../pb_data/types.d.ts" />
/** Optional event-local location details; existing events retain blank values. */
migrate(
	(app) => {
		const events = app.findCollectionByNameOrId('events');
		events.fields.add(new TextField({ name: 'venueName', max: 120 }));
		events.fields.add(new TextField({ name: 'venueAddress', max: 500 }));
		app.save(events);
	},
	(app) => {
		const populated = app.findRecordsByFilter(
			'events',
			'venueName != "" || venueAddress != ""',
			'',
			1,
			0
		);
		if (populated.length)
			throw new Error('Event venue details must be preserved; rollback is blocked after use.');
		const events = app.findCollectionByNameOrId('events');
		events.fields.removeByName('venueName');
		events.fields.removeByName('venueAddress');
		app.save(events);
	}
);
