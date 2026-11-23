/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const member = [
			'@request.auth.id != ""',
			'@collection.memberships.organization.id ?= organization.id',
			'@collection.memberships.user.id ?= @request.auth.id',
			`organization.capabilities ~ '"reimbursements"'`
		].join(' && ');
		const visible =
			member +
			' && (submitter.id = @request.auth.id || @collection.memberships.role ?= "owner" || @collection.memberships.role ?= "admin")';

		return app.save(
			new Collection({
				name: 'expenses',
				type: 'base',
				listRule: visible,
				viewRule: visible,
				createRule: member + ' && submitter.id = @request.auth.id',
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: 'organization',
						type: 'relation',
						collectionId: app.findCollectionByNameOrId('organizations').id,
						maxSelect: 1,
						required: true
					},
					{
						name: 'submitter',
						type: 'relation',
						collectionId: app.findCollectionByNameOrId('users').id,
						maxSelect: 1,
						required: true
					},
					{
						name: 'expenseOn',
						type: 'text',
						required: true,
						max: 10,
						pattern: '^\\d{4}-\\d{2}-\\d{2}$'
					},
					{ name: 'vendor', type: 'text', required: true, max: 120 },
					{ name: 'category', type: 'text', required: true, max: 80 },
					{ name: 'purpose', type: 'text', required: true, max: 1000 },
					{
						name: 'amountCents',
						type: 'number',
						required: true,
						min: 1,
						max: 999999999,
						onlyInt: true
					},
					{
						name: 'receipt',
						type: 'file',
						maxSelect: 1,
						maxSize: 5 * 1024 * 1024,
						mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
						protected: true
					},
					{
						name: 'status',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['submitted', 'approved', 'returned']
					},
					{ name: 'submitterName', type: 'text', max: 255 },
					{ name: 'reviewNote', type: 'text', max: 500 },
					{
						name: 'reviewer',
						type: 'relation',
						collectionId: app.findCollectionByNameOrId('users').id,
						maxSelect: 1
					},
					{ name: 'reviewedAt', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true }
				],
				indexes: ['CREATE INDEX idx_expenses_org_submitter ON expenses (organization, submitter)']
			})
		);
	},
	(app) => app.delete(app.findCollectionByNameOrId('expenses'))
);
