/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const events = app.findCollectionByNameOrId('events');
		events.fields.add(new DateField({ name: 'fantasyCutoffAt' }));
		app.save(events);
		const drafts = app.findCollectionByNameOrId('fantasy_drafts');
		drafts.fields.add(new BoolField({ name: 'resolutionRequired' }));
		app.save(drafts);

		// SQLite serializes writers: activation and its flags commit together,
		// and transactional picks observe either the pre- or post-activation state.
		for (const operation of ['INSERT', 'UPDATE OF status']) {
			const suffix = operation === 'INSERT' ? 'insert' : 'update';
			app
				.db()
				.newQuery(
					`CREATE TRIGGER d18_activation_${suffix}
			AFTER ${operation} ON events
			WHEN NEW.status = 'active' AND NEW.fantasyCutoffAt = ''
			BEGIN
				UPDATE events SET fantasyCutoffAt = strftime('%Y-%m-%d %H:%M:%fZ', 'now') WHERE id = NEW.id;
				UPDATE fantasy_drafts SET resolutionRequired = TRUE WHERE event = NEW.id AND status != 'complete';
			END`
				)
				.execute();
		}
		app
			.db()
			.newQuery(
				`CREATE TRIGGER d18_cutoff_immutable
		BEFORE UPDATE OF fantasyCutoffAt ON events
		WHEN OLD.fantasyCutoffAt != '' AND NEW.fantasyCutoffAt != OLD.fantasyCutoffAt
		BEGIN SELECT RAISE(ABORT, 'The activation cutoff is immutable'); END`
			)
			.execute();
		// Existing active/finished events have already crossed the cutoff. Their
		// historical activation time is unknown; record migration time conservatively.
		app
			.db()
			.newQuery(
				`UPDATE events SET fantasyCutoffAt = strftime('%Y-%m-%d %H:%M:%fZ', 'now')
		WHERE status IN ('active', 'completed', 'archived')`
			)
			.execute();
		app
			.db()
			.newQuery(
				`UPDATE fantasy_drafts SET resolutionRequired = TRUE
		WHERE status != 'complete' AND event IN (SELECT id FROM events WHERE fantasyCutoffAt != '')`
			)
			.execute();
	},
	(app) => {
		for (const name of ['d18_activation_insert', 'd18_activation_update', 'd18_cutoff_immutable']) {
			app
				.db()
				.newQuery('DROP TRIGGER IF EXISTS ' + name)
				.execute();
		}
		for (const [collection, field] of [
			['events', 'fantasyCutoffAt'],
			['fantasy_drafts', 'resolutionRequired']
		]) {
			const c = app.findCollectionByNameOrId(collection);
			c.fields.removeByName(field);
			app.save(c);
		}
	}
);
