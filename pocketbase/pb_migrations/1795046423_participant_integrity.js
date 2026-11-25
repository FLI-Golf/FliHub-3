/**
 * CE-3B — Shared participant relationship integrity.
 *
 * Protects participant records from invalid internal writes,
 * including writes that bypass ordinary API request hooks.
 *
 * Existing collection rules, indexes and records are preserved.
 */
migrate(
	(app) => {
		app
			.db()
			.newQuery(
				`
				CREATE TRIGGER trg_participant_identity_insert
				BEFORE INSERT ON athletes
				BEGIN
					SELECT RAISE(ABORT, 'Participant organization does not exist.')
					WHERE NOT EXISTS (
						SELECT 1 FROM organizations
						WHERE id = NEW.organization
					);

					SELECT RAISE(ABORT, 'Invalid participant status.')
					WHERE NEW.status NOT IN ('active', 'archived');

					SELECT RAISE(ABORT, 'Charity participants cannot be publicly published.')
					WHERE NEW.publicPublished != 0
						AND EXISTS (
							SELECT 1 FROM organizations
							WHERE id = NEW.organization
								AND profile = 'charity-run-walk'
						);
				END
				`
			)
			.execute();

		app
			.db()
			.newQuery(
				`
				CREATE TRIGGER trg_participant_identity_update
				BEFORE UPDATE ON athletes
				BEGIN
					SELECT RAISE(ABORT, 'Participant organization is immutable.')
					WHERE NEW.organization IS NOT OLD.organization;

					SELECT RAISE(ABORT, 'Participant organization does not exist.')
					WHERE NOT EXISTS (
						SELECT 1 FROM organizations
						WHERE id = NEW.organization
					);

					SELECT RAISE(ABORT, 'Invalid participant status.')
					WHERE NEW.status NOT IN ('active', 'archived');

					SELECT RAISE(ABORT, 'Charity participants cannot be publicly published.')
					WHERE NEW.publicPublished != 0
						AND EXISTS (
							SELECT 1 FROM organizations
							WHERE id = NEW.organization
								AND profile = 'charity-run-walk'
						);
				END
				`
			)
			.execute();

		app
			.db()
			.newQuery(
				`
				CREATE TRIGGER trg_participant_private_insert
				BEFORE INSERT ON athlete_private
				BEGIN
					SELECT RAISE(ABORT, 'Private participant organization does not exist.')
					WHERE NOT EXISTS (
						SELECT 1 FROM organizations
						WHERE id = NEW.organization
					);

					SELECT RAISE(ABORT, 'Invalid private participant relationship.')
					WHERE NOT EXISTS (
						SELECT 1 FROM athletes
						WHERE id = NEW.athlete
							AND organization = NEW.organization
					);
				END
				`
			)
			.execute();

		app
			.db()
			.newQuery(
				`
				CREATE TRIGGER trg_participant_private_update
				BEFORE UPDATE ON athlete_private
				BEGIN
					SELECT RAISE(ABORT, 'Private participant organization is immutable.')
					WHERE NEW.organization IS NOT OLD.organization;

					SELECT RAISE(ABORT, 'Private participant identity is immutable.')
					WHERE NEW.athlete IS NOT OLD.athlete;

					SELECT RAISE(ABORT, 'Private participant organization does not exist.')
					WHERE NOT EXISTS (
						SELECT 1 FROM organizations
						WHERE id = NEW.organization
					);

					SELECT RAISE(ABORT, 'Invalid private participant relationship.')
					WHERE NOT EXISTS (
						SELECT 1 FROM athletes
						WHERE id = NEW.athlete
							AND organization = NEW.organization
					);
				END
				`
			)
			.execute();
	},
	(app) => {
		for (const trigger of [
			'trg_participant_identity_insert',
			'trg_participant_identity_update',
			'trg_participant_private_insert',
			'trg_participant_private_update'
		]) {
			app
				.db()
				.newQuery('DROP TRIGGER IF EXISTS ' + trigger)
				.execute();
		}
	}
);
