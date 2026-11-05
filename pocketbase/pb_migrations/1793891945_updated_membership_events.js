/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_2968977090');

		// update field
		collection.fields.addAt(
			3,
			new Field({
				help: '',
				hidden: false,
				id: 'select1204587666',
				maxSelect: 1,
				name: 'action',
				presentable: false,
				required: true,
				system: false,
				type: 'select',
				values: [
					'organization_created',
					'invitation_created',
					'invitation_accepted',
					'invitation_revoked',
					'role_changed',
					'member_removed',
					'member_left',
					'ownership_transferred',
					'configuration_changed'
				]
			})
		);

		return app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_2968977090');

		// update field
		collection.fields.addAt(
			3,
			new Field({
				help: '',
				hidden: false,
				id: 'select1204587666',
				maxSelect: 1,
				name: 'action',
				presentable: false,
				required: true,
				system: false,
				type: 'select',
				values: [
					'organization_created',
					'invitation_created',
					'invitation_accepted',
					'invitation_revoked',
					'role_changed',
					'member_removed',
					'member_left',
					'ownership_transferred'
				]
			})
		);

		return app.save(collection);
	}
);
