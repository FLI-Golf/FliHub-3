/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const organizations = app.findCollectionByNameOrId('organizations');
		const manage = [
			'@request.auth.id != ""',
			'@collection.memberships.organization = organization',
			'@collection.memberships.user = @request.auth.id',
			'(@collection.memberships.role = "owner" || @collection.memberships.role = "admin")',
			`organization.capabilities ~ '"sponsorships"'`
		].join(' && ');

		return app.save(
			new Collection({
				name: 'sponsors',
				type: 'base',
				listRule: manage,
				viewRule: manage,
				createRule: manage,
				updateRule: manage + ' && @request.body.organization:changed = false',
				deleteRule: null,
				fields: [
					{
						name: 'organization',
						type: 'relation',
						collectionId: organizations.id,
						maxSelect: 1,
						required: true
					},
					{ name: 'name', type: 'text', required: true, max: 120 },
					{ name: 'contactName', type: 'text', max: 120 },
					{ name: 'contactEmail', type: 'email' },
					{
						name: 'stage',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: [
							'prospect',
							'in-discussion',
							'proposal-sent',
							'signed',
							'closed'
						]
					},
					{
						name: 'followUpOn',
						type: 'text',
						max: 10,
						pattern: '^\\d{4}-\\d{2}-\\d{2}$'
					},
					{ name: 'nextAction', type: 'text', max: 240 },
					{ name: 'notes', type: 'text', max: 2000 },
					{ name: 'archived', type: 'bool' }
				],
				indexes: [
					'CREATE INDEX idx_sponsors_organization_name ON sponsors (organization, name)'
				]
			})
		);
	},
	(app) => app.delete(app.findCollectionByNameOrId('sponsors'))
);
