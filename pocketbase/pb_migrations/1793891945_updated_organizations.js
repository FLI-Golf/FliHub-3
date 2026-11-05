/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_2873630990');

		// update collection data
		unmarshal(
			{
				updateRule: null
			},
			collection
		);

		// add field
		collection.fields.addAt(
			4,
			new Field({
				help: '',
				hidden: false,
				id: 'select2539659139',
				maxSelect: 1,
				name: 'template',
				presentable: false,
				required: false,
				system: false,
				type: 'select',
				values: ['league', 'race-event', 'custom']
			})
		);

		// add field
		collection.fields.addAt(
			5,
			new Field({
				help: '',
				hidden: false,
				id: 'json490417661',
				maxSize: 20000,
				name: 'capabilities',
				presentable: false,
				required: false,
				system: false,
				type: 'json'
			})
		);

		// add field
		collection.fields.addAt(
			6,
			new Field({
				help: '',
				hidden: false,
				id: 'bool1037461412',
				name: 'onboarded',
				presentable: false,
				required: false,
				system: false,
				type: 'bool'
			})
		);

		// add field
		collection.fields.addAt(
			7,
			new Field({
				help: '',
				hidden: false,
				id: 'json1479257658',
				maxSize: 20000,
				name: 'race_distances',
				presentable: false,
				required: false,
				system: false,
				type: 'json'
			})
		);

		return app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_2873630990');

		// update collection data
		unmarshal(
			{
				updateRule:
					"(@collection.memberships.organization.id ?= id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))"
			},
			collection
		);

		// remove field
		collection.fields.removeById('select2539659139');

		// remove field
		collection.fields.removeById('json490417661');

		// remove field
		collection.fields.removeById('bool1037461412');

		// remove field
		collection.fields.removeById('json1479257658');

		return app.save(collection);
	}
);
