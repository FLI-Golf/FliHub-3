migrate((app) => {
	const organization = app.findCollectionByNameOrId('organizations');
	const sponsors = app.findCollectionByNameOrId('sponsors');
	const manage = [
		'@request.auth.id != ""',
		'@collection.memberships.organization.id ?= organization.id',
		'@collection.memberships.user.id ?= @request.auth.id',
		'(@collection.memberships.role ?= "owner" || @collection.memberships.role ?= "admin")',
		"organization.capabilities ~ '\"sponsorships\"'"
	].join(' && ');
	app.save(new Collection({
		name: 'sponsorship_agreements',
		type: 'base',
		listRule: manage,
		viewRule: manage,
		createRule: manage,
		updateRule: null,
		deleteRule: null,
		fields: [
			{ name: 'organization', type: 'relation', collectionId: organization.id, maxSelect: 1, required: true },
			{ name: 'sponsor', type: 'relation', collectionId: sponsors.id, maxSelect: 1, required: true },
			{ name: 'title', type: 'text', required: true, max: 120 },
			{ name: 'coverage', type: 'text', required: true, max: 60 },
			{ name: 'coverageLabel', type: 'text', max: 600 },
			{ name: 'amountCents', type: 'number', required: true, onlyInt: true, min: 1, max: 99999999999 },
			{ name: 'currency', type: 'select', required: true, maxSelect: 1, values: ['USD', 'CAD', 'EUR', 'GBP'] },
			{ name: 'signedOn', type: 'text', required: true, max: 10 },
			{ name: 'dueOn', type: 'text', max: 10 },
			{ name: 'benefits', type: 'text', max: 2000 }
		],
		indexes: ['CREATE INDEX idx_agreements_org_sponsor ON sponsorship_agreements (organization, sponsor)']
	}));
}, (app) => app.delete(app.findCollectionByNameOrId('sponsorship_agreements')));
