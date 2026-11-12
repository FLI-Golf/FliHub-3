migrate((app) => {
    const collection = app.findCollectionByNameOrId('membership_events');
    const action = collection.fields.getByName('action');
    if (!action) throw new Error('membership_events.action is missing.');

    const values = Array.from(action.values || []);
    if (!values.includes('public_page_changed')) {
        action.values = [...values, 'public_page_changed'];
        collection.fields.add(action);
        app.save(collection);
    }
}, () => {
    // Retain the audit action on rollback so existing history stays valid.
});
