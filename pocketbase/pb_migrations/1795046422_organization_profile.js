/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('organizations');

		collection.fields.add(
			new Field({
				name: 'profile',
				type: 'select',
				required: false,
				maxSelect: 1,
				values: ['charity-run-walk']
			})
		);

		return app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('organizations');
		collection.fields.removeByName('profile');
		return app.save(collection);
	}
);
