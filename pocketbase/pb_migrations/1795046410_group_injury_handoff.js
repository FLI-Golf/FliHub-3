migrate(
	(app) => {
		const groups = app.findCollectionByNameOrId('event_groups');
		groups.fields.add(new JSONField({ name: 'injuryHandoff', maxSize: 8192 }));
		app.save(groups);

		// Enforce the scoring boundary even if a score request checked the
		// lineup just before the handoff transaction committed.
		app.db().newQuery(`
			CREATE TRIGGER trg_score_injury_handoff BEFORE INSERT ON scores
			WHEN EXISTS (
				SELECT 1 FROM event_groups g
				JOIN rounds r ON r.id = NEW.round
				JOIN course_holes h ON h.id = NEW.hole
				WHERE g.id = NEW."group" AND json_type(g.injuryHandoff) = 'object'
				AND CASE
					WHEN r.number > json_extract(g.injuryHandoff, '$.roundNumber')
					  OR (r.number = json_extract(g.injuryHandoff, '$.roundNumber')
					      AND h.number >= json_extract(g.injuryHandoff, '$.holeNumber'))
					THEN NEW.athlete = json_extract(g.injuryHandoff, '$.outgoing')
					ELSE NEW.athlete = json_extract(g.injuryHandoff, '$.reserve')
				END
			)
			BEGIN
				SELECT RAISE(ABORT, 'The injury handoff changed the lineup for this hole. Refresh the scorecard.');
			END
		`).execute();
		app.db().newQuery(`
			CREATE TRIGGER trg_preserve_injury_handoff BEFORE UPDATE ON event_groups
			WHEN json_type(OLD.injuryHandoff) = 'object'
			  AND NEW.injuryHandoff IS NOT OLD.injuryHandoff
			BEGIN
				SELECT RAISE(ABORT, 'An existing injury handoff cannot be overwritten.');
			END
		`).execute();
		app.db().newQuery(`
			CREATE TRIGGER trg_draft_injury_handoff BEFORE UPDATE OF status ON scorecards
			WHEN OLD.status = 'draft' AND NEW.status = 'submitted' AND EXISTS (
				SELECT 1 FROM event_groups
				WHERE id = NEW."group" AND json_type(injuryHandoff) = 'object'
			)
			BEGIN
				SELECT RAISE(ABORT, 'This card has an injury handoff and must stay in draft.');
			END
		`).execute();
	},
	(app) => {
		const groupsWithHandoffs = app.findRecordsByFilter('event_groups', '', '', 0, 0)
			.some((group) => JSON.parse(String(group.get('injuryHandoff') || 'null')));
		if (groupsWithHandoffs) throw new Error('Recorded injury handoffs prevent rolling back this migration.');
		for (const trigger of ['trg_score_injury_handoff', 'trg_preserve_injury_handoff', 'trg_draft_injury_handoff']) {
			app.db().newQuery('DROP TRIGGER IF EXISTS ' + trigger).execute();
		}
		const groups = app.findCollectionByNameOrId('event_groups');
		groups.fields.removeByName('injuryHandoff');
		app.save(groups);
	}
);
