migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('events');
		collection.fields.add(
			new DateField({
				name: 'endsAt',
				required: false
			})
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('events');
		collection.fields.removeByName('endsAt');
		app.save(collection);
	}
);
