/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1C privacy split — data movement (runs between the automigrated
 * schema steps: created_athlete_private → this → updated_athletes).
 *
 * Up: copies email/phone/eligibilityNotes from each athlete into a 1:1
 * athlete_private record. Down: copies them back (used only between the
 * matching automigrated downs).
 */
migrate(
	(app) => {
		const privateCollection = app.findCollectionByNameOrId('athlete_private');
		const athletes = app.findAllRecords('athletes');
		let moved = 0;
		for (const athlete of athletes) {
			const email = athlete.getString('email');
			const phone = athlete.getString('phone');
			const notes = athlete.getString('eligibilityNotes');
			if (!email && !phone && !notes) continue;
			const record = new Record(privateCollection);
			record.set('athlete', athlete.id);
			record.set('organization', athlete.getString('organization'));
			record.set('email', email);
			record.set('phone', phone);
			record.set('eligibilityNotes', notes);
			app.save(record);
			moved += 1;
		}
	},
	(app) => {
		const athletes = app.findCollectionByNameOrId('athletes');
		const privates = app.findAllRecords('athlete_private');
		for (const priv of privates) {
			try {
				const athlete = app.findRecordById('athletes', priv.getString('athlete'));
				athlete.set('email', priv.getString('email'));
				athlete.set('phone', priv.getString('phone'));
				athlete.set('eligibilityNotes', priv.getString('eligibilityNotes'));
				app.save(athlete);
			} catch (_) {
				// Athlete already gone — nothing to restore.
			}
		}
	}
);
