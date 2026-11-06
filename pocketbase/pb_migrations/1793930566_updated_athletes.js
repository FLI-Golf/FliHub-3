/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_401194191');

		// remove field
		collection.fields.removeById('text3885137012');

		// remove field
		collection.fields.removeById('text1146066909');

		// remove field
		collection.fields.removeById('text785584882');

		return app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_401194191');

		// add field
		collection.fields.addAt(
			7,
			new Field({
				autogeneratePattern: '',
				help: '',
				hidden: false,
				id: 'text3885137012',
				max: 254,
				min: 0,
				name: 'email',
				pattern: '',
				presentable: false,
				primaryKey: false,
				required: false,
				system: false,
				type: 'text'
			})
		);

		// add field
		collection.fields.addAt(
			8,
			new Field({
				autogeneratePattern: '',
				help: '',
				hidden: false,
				id: 'text1146066909',
				max: 40,
				min: 0,
				name: 'phone',
				pattern: '',
				presentable: false,
				primaryKey: false,
				required: false,
				system: false,
				type: 'text'
			})
		);

		// add field
		collection.fields.addAt(
			9,
			new Field({
				autogeneratePattern: '',
				help: '',
				hidden: false,
				id: 'text785584882',
				max: 2000,
				min: 0,
				name: 'eligibilityNotes',
				pattern: '',
				presentable: false,
				primaryKey: false,
				required: false,
				system: false,
				type: 'text'
			})
		);

		return app.save(collection);
	}
);
