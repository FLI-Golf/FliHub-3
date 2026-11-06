/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const collection = new Collection({
			createRule:
				"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
			deleteRule:
				"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
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
					id: 'text596812118',
					max: 60,
					min: 1,
					name: 'firstName',
					pattern: '',
					presentable: true,
					primaryKey: false,
					required: true,
					system: false,
					type: 'text'
				},
				{
					autogeneratePattern: '',
					help: '',
					hidden: false,
					id: 'text2434144904',
					max: 60,
					min: 1,
					name: 'lastName',
					pattern: '',
					presentable: true,
					primaryKey: false,
					required: true,
					system: false,
					type: 'text'
				},
				{
					autogeneratePattern: '',
					help: '',
					hidden: false,
					id: 'text1731158936',
					max: 120,
					min: 0,
					name: 'displayName',
					pattern: '',
					presentable: false,
					primaryKey: false,
					required: false,
					system: false,
					type: 'text'
				},
				{
					help: '',
					hidden: false,
					id: 'select3343321666',
					maxSelect: 1,
					name: 'gender',
					presentable: false,
					required: false,
					system: false,
					type: 'select',
					values: ['male', 'female', 'other', 'unspecified']
				},
				{
					autogeneratePattern: '',
					help: '',
					hidden: false,
					id: 'text2328202096',
					max: 60,
					min: 0,
					name: 'nationality',
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
				},
				{
					help: '',
					hidden: false,
					id: 'select2063623452',
					maxSelect: 1,
					name: 'status',
					presentable: false,
					required: true,
					system: false,
					type: 'select',
					values: ['active', 'archived']
				}
			],
			id: 'pbc_401194191',
			indexes: ['CREATE INDEX idx_athletes_org_lastname ON athletes (organization, lastName)'],
			listRule:
				'(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id)',
			name: 'athletes',
			system: false,
			type: 'base',
			updateRule:
				"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
			viewRule:
				'(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id)'
		});

		return app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_401194191');

		return app.delete(collection);
	}
);
