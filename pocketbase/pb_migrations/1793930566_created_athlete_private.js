/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const collection = new Collection({
			createRule:
				"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
			deleteRule: null,
			fields: [
				{
					autogeneratePattern: '[a-z0-9]{15}',
					help: '',
					hidden: false,
					id: 'text3208210256',
					max: 15,
					min: 15,
					name: 'id',
					pattern: '^[a-z0-9]+$',
					presentable: false,
					primaryKey: true,
					required: true,
					system: true,
					type: 'text'
				},
				{
					cascadeDelete: true,
					collectionId: 'pbc_401194191',
					help: '',
					hidden: false,
					id: 'relation3225125665',
					maxSelect: 1,
					minSelect: 0,
					name: 'athlete',
					presentable: false,
					required: true,
					system: false,
					type: 'relation'
				},
				{
					cascadeDelete: true,
					collectionId: 'pbc_2873630990',
					help: '',
					hidden: false,
					id: 'relation3253625724',
					maxSelect: 1,
					minSelect: 0,
					name: 'organization',
					presentable: false,
					required: true,
					system: false,
					type: 'relation'
				},
				{
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
				},
				{
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
				},
				{
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
				}
			],
			id: 'pbc_3280486444',
			indexes: ['CREATE UNIQUE INDEX idx_athlete_private_athlete ON athlete_private (athlete)'],
			listRule:
				"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
			name: 'athlete_private',
			system: false,
			type: 'base',
			updateRule:
				"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
			viewRule:
				"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))"
		});

		return app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_3280486444');

		return app.delete(collection);
	}
);
