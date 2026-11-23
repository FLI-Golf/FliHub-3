migrate(
	(app) => {
		app.db().newQuery('DROP TRIGGER IF EXISTS trg_draft_injury_handoff').execute();
	},
	(app) => {
		app
			.db()
			.newQuery(
				`
			CREATE TRIGGER trg_draft_injury_handoff BEFORE UPDATE OF status ON scorecards
			WHEN OLD.status = 'draft' AND NEW.status = 'submitted' AND EXISTS (
				SELECT 1 FROM event_groups
				WHERE id = NEW."group" AND json_type(injuryHandoff) = 'object'
			)
			BEGIN
				SELECT RAISE(ABORT, 'This card has an injury handoff and must stay in draft.');
			END
		`
			)
			.execute();
	}
);
