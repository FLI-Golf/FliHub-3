migrate((app) => {
	const collection = app.findCollectionByNameOrId('sponsorship_funding_conditions');
	collection.fields.add(new DateField({ name: 'releasedAt' }));
	collection.fields.add(new TextField({ name: 'releasedBy', max: 15 }));
	collection.fields.add(new TextField({ name: 'releasedByName', max: 200 }));
	collection.fields.add(new NumberField({ name: 'releasedCommittedCents', onlyInt: true, min: 0 }));
	return app.save(collection);
}, (app) => {
	const collection = app.findCollectionByNameOrId('sponsorship_funding_conditions');
	for (const name of ['releasedAt', 'releasedBy', 'releasedByName', 'releasedCommittedCents'])
		collection.fields.removeByName(name);
	return app.save(collection);
});
