migrate((app) => {
 const collection = app.findCollectionByNameOrId('rounds');
 collection.fields.add(new JSONField({name:'teeSchedule', required:false, maxSize:200000}));
 app.save(collection);
}, (app) => {
 const collection = app.findCollectionByNameOrId('rounds');
 collection.fields.removeByName('teeSchedule');
 app.save(collection);
});
