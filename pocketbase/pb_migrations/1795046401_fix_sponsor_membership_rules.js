/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('sponsors');
		const manage = [
			'@request.auth.id != ""',
			'@collection.memberships.organization.id ?= organization.id',
			'@collection.memberships.user.id ?= @request.auth.id',
			'(@collection.memberships.role ?= "owner" || @collection.memberships.role ?= "admin")',
			`organization.capabilities ~ '"sponsorships"'`
		].join(' && ');

		collection.listRule = manage;
		collection.viewRule = manage;
		collection.createRule = manage;
		collection.updateRule = manage + ' && @request.body.organization:changed = false';
		return app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('sponsors');
		const manage = [
			'@request.auth.id != ""',
			'@collection.memberships.organization = organization',
			'@collection.memberships.user = @request.auth.id',
			'(@collection.memberships.role = "owner" || @collection.memberships.role = "admin")',
			`organization.capabilities ~ '"sponsorships"'`
		].join(' && ');

		collection.listRule = manage;
		collection.viewRule = manage;
		collection.createRule = manage;
		collection.updateRule = manage + ' && @request.body.organization:changed = false';
		return app.save(collection);
	}
);
