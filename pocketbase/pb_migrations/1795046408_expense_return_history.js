migrate(
	(app) => {
		const expenses = app.findCollectionByNameOrId('expenses');
		expenses.fields.add(new JSONField({ name: 'returnHistory', maxSize: 100000 }));
		return app.save(expenses);
	},
	(app) => {
		const expenses = app.findCollectionByNameOrId('expenses');
		expenses.fields.removeByName('returnHistory');
		return app.save(expenses);
	}
);
