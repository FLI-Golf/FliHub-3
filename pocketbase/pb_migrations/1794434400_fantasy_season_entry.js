migrate((app) => {
 const seasons = app.findCollectionByNameOrId('seasons');
 seasons.fields.add(new BoolField({ name: 'fantasyEnabled' }));
 app.save(seasons);
 const leagues = app.findCollectionByNameOrId('fantasy_leagues');
 leagues.fields.add(new RelationField({ name: 'season', collectionId: seasons.id, maxSelect: 1, required: false, cascadeDelete: false }));
 app.save(leagues);
}, (app) => {
 const leagues = app.findCollectionByNameOrId('fantasy_leagues');
 leagues.fields.removeByName('season');
 app.save(leagues);
 const seasons = app.findCollectionByNameOrId('seasons');
 seasons.fields.removeByName('fantasyEnabled');
 app.save(seasons);
});
