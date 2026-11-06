/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1E — database-level backstop for the D13 one-active-spot rule.
 *
 * The flihub_rosters hook checks roster↔reserve exclusivity, but a hook is a
 * read-then-write: two concurrent direct API requests (e.g. add the same
 * athlete to a roster and a reserve pool in the same season at the same time,
 * or restore one archived row from each table simultaneously) could both pass
 * the check before either write persisted, ending with two active spots
 * (reproduced: 4/20 concurrent creates, 2/20 concurrent restores). The
 * partial unique indexes only cover duplicates within one table.
 *
 * These SQLite triggers re-run the cross-table check inside the INSERT/UPDATE
 * itself, which SQLite serializes under its single-writer lock — so the
 * losing request fails no matter how the hook checks interleave. The hook
 * remains the first line (friendly, coded error messages for the ordinary
 * sequential case); a trigger abort surfaces only in the race window.
 *
 * The down migration is a no-op for the triggers' tables' lifetime concern:
 * dropping a table (phase1e_rosters down) drops its triggers automatically.
 * Explicit drops are still provided so this migration is independently
 * reversible.
 */
migrate(
	(app) => {
		const statements = [
			`CREATE TRIGGER trg_roster_excl_insert
			BEFORE INSERT ON roster_memberships
			WHEN NEW.status = 'active' AND EXISTS (
				SELECT 1 FROM reserve_members
				WHERE season = NEW.season AND athlete = NEW.athlete AND status = 'active'
			)
			BEGIN
				SELECT RAISE(ABORT, 'athlete_unavailable: this athlete already holds an active reserve spot this season');
			END`,
			`CREATE TRIGGER trg_roster_excl_update
			BEFORE UPDATE ON roster_memberships
			WHEN NEW.status = 'active' AND EXISTS (
				SELECT 1 FROM reserve_members
				WHERE season = NEW.season AND athlete = NEW.athlete AND status = 'active'
			)
			BEGIN
				SELECT RAISE(ABORT, 'athlete_unavailable: this athlete already holds an active reserve spot this season');
			END`,
			`CREATE TRIGGER trg_reserve_excl_insert
			BEFORE INSERT ON reserve_members
			WHEN NEW.status = 'active' AND EXISTS (
				SELECT 1 FROM roster_memberships
				WHERE season = NEW.season AND athlete = NEW.athlete AND status = 'active'
			)
			BEGIN
				SELECT RAISE(ABORT, 'athlete_unavailable: this athlete already holds an active roster spot this season');
			END`,
			`CREATE TRIGGER trg_reserve_excl_update
			BEFORE UPDATE ON reserve_members
			WHEN NEW.status = 'active' AND EXISTS (
				SELECT 1 FROM roster_memberships
				WHERE season = NEW.season AND athlete = NEW.athlete AND status = 'active'
			)
			BEGIN
				SELECT RAISE(ABORT, 'athlete_unavailable: this athlete already holds an active roster spot this season');
			END`
		];
		for (const sql of statements) {
			app.db().newQuery(sql).execute();
		}
	},
	(app) => {
		for (const name of [
			'trg_roster_excl_insert',
			'trg_roster_excl_update',
			'trg_reserve_excl_insert',
			'trg_reserve_excl_update'
		]) {
			app
				.db()
				.newQuery('DROP TRIGGER IF EXISTS ' + name)
				.execute();
		}
	}
);
