/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const scores = app.findCollectionByNameOrId('scores');
		scores.fields.add(new BoolField({ name: 'seasonDemoGenerated' }));
		app.save(scores);
		const changes = app.findCollectionByNameOrId('score_changes');
		const action = changes.fields.getByName('action');
		action.values = [...action.values, 'demo_undone'];
		return app.save(changes);
	},
	(app) => {
		const changes = app.findCollectionByNameOrId('score_changes');
		const action = changes.fields.getByName('action');
		action.values = action.values.filter((value) => value !== 'demo_undone');
		app.save(changes);
		const scores = app.findCollectionByNameOrId('scores');
		scores.fields.removeByName('seasonDemoGenerated');
		return app.save(scores);
	}
);
