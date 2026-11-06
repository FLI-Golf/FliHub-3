/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_401194191');

		// update collection data
		unmarshal(
			{
				deleteRule: null
			},
			collection
		);

		return app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('pbc_401194191');

		// update collection data
		unmarshal(
			{
				deleteRule:
					"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))"
			},
			collection
		);

		return app.save(collection);
	}
);
