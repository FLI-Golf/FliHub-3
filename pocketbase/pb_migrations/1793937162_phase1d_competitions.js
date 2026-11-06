/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1D — competition structure: leagues, seasons, divisions, teams,
 * season entries, and events (Dustin's decisions, recorded as D12):
 *
 * - Teams enter a season directly (season_entries); a season entry carries
 *   ONE optional division assignment. Entries can exist before divisions are
 *   finalized and seasons can run division-less. Unique (season, team)
 *   prevents duplicate entries; the flihub_competitions hook rejects division
 *   assignments outside the entry's season.
 * - An event belongs to at most one season (optional relation; empty =
 *   independent event) and stays organization-scoped either way.
 *
 * Every collection: any organization member reads, only Owners/Admins write,
 * delete is locked (null) — archive/restore lifecycle, no permanent delete.
 * Status is a foundation only: no automated transitions in Phase 1D.
 */
migrate(
	(app) => {
		const ORG = 'pbc_2873630990';
		const MEMBER =
			'(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id)';
		const OWNER_OR_ADMIN =
			"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))";

		const idField = {
			autogeneratePattern: '[a-z0-9]{15}',
			help: '',
			hidden: false,
			id: 'text3208210256',
			max: 15,
			min: 15,
			name: 'id',
			pattern: '^[a-z0-9]+$',
			presentable: false,
			primaryKey: true,
			required: true,
			system: true,
			type: 'text'
		};
		const orgField = (id) => ({
			cascadeDelete: true,
			collectionId: ORG,
			help: '',
			hidden: false,
			id,
			maxSelect: 1,
			minSelect: 0,
			name: 'organization',
			presentable: false,
			required: true,
			system: false,
			type: 'relation'
		});
		const relField = (id, name, collectionId, required) => ({
			cascadeDelete: true,
			collectionId,
			help: '',
			hidden: false,
			id,
			maxSelect: 1,
			minSelect: 0,
			name,
			presentable: false,
			required,
			system: false,
			type: 'relation'
		});
		const nameField = (id, max) => ({
			autogeneratePattern: '',
			help: '',
			hidden: false,
			id,
			max,
			min: 1,
			name: 'name',
			pattern: '',
			presentable: true,
			primaryKey: false,
			required: true,
			system: false,
			type: 'text'
		});
		const statusField = (id, values) => ({
			help: '',
			hidden: false,
			id,
			maxSelect: 1,
			name: 'status',
			presentable: false,
			required: true,
			system: false,
			type: 'select',
			values
		});
		const dateField = (id, name) => ({
			help: '',
			hidden: false,
			id,
			max: '',
			min: '',
			name,
			presentable: false,
			required: false,
			system: false,
			type: 'date'
		});
		const lifecycle = ['active', 'archived'];
		const competitionStatus = ['planned', 'active', 'completed', 'archived'];
		const rules = {
			createRule: OWNER_OR_ADMIN,
			deleteRule: null,
			listRule: MEMBER,
			updateRule: OWNER_OR_ADMIN,
			viewRule: MEMBER,
			system: false,
			type: 'base'
		};

		const teams = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1d_rel_team_org'),
				nameField('f1d_txt_team_name', 120),
				statusField('f1d_sel_team_status', lifecycle)
			],
			id: 'pbc_910000101',
			indexes: ['CREATE UNIQUE INDEX idx_teams_org_name ON teams (organization, name)'],
			name: 'teams'
		});
		app.save(teams);

		const leagues = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1d_rel_league_org'),
				nameField('f1d_txt_league_name', 120),
				statusField('f1d_sel_league_status', lifecycle)
			],
			id: 'pbc_910000102',
			indexes: ['CREATE UNIQUE INDEX idx_leagues_org_name ON leagues (organization, name)'],
			name: 'leagues'
		});
		app.save(leagues);

		const seasons = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1d_rel_season_org'),
				relField('f1d_rel_season_league', 'league', 'pbc_910000102', true),
				nameField('f1d_txt_season_name', 120),
				statusField('f1d_sel_season_status', competitionStatus),
				dateField('f1d_dat_season_start', 'startsOn'),
				dateField('f1d_dat_season_end', 'endsOn')
			],
			id: 'pbc_910000103',
			indexes: ['CREATE UNIQUE INDEX idx_seasons_league_name ON seasons (league, name)'],
			name: 'seasons'
		});
		app.save(seasons);

		const divisions = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1d_rel_division_org'),
				relField('f1d_rel_division_season', 'season', 'pbc_910000103', true),
				nameField('f1d_txt_division_name', 80),
				statusField('f1d_sel_division_status', lifecycle)
			],
			id: 'pbc_910000104',
			indexes: ['CREATE UNIQUE INDEX idx_divisions_season_name ON divisions (season, name)'],
			name: 'divisions'
		});
		app.save(divisions);

		const seasonEntries = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1d_rel_entry_org'),
				relField('f1d_rel_entry_season', 'season', 'pbc_910000103', true),
				relField('f1d_rel_entry_team', 'team', 'pbc_910000101', true),
				relField('f1d_rel_entry_division', 'division', 'pbc_910000104', false),
				statusField('f1d_sel_entry_status', lifecycle)
			],
			id: 'pbc_910000105',
			indexes: [
				'CREATE UNIQUE INDEX idx_season_entries_season_team ON season_entries (season, team)',
				'CREATE INDEX idx_season_entries_season ON season_entries (season)'
			],
			name: 'season_entries'
		});
		app.save(seasonEntries);

		const events = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1d_rel_event_org'),
				relField('f1d_rel_event_season', 'season', 'pbc_910000103', false),
				nameField('f1d_txt_event_name', 120),
				statusField('f1d_sel_event_status', competitionStatus),
				dateField('f1d_dat_event_start', 'startsAt')
			],
			id: 'pbc_910000106',
			indexes: ['CREATE INDEX idx_events_season ON events (season)'],
			name: 'events'
		});
		app.save(events);
	},
	(app) => {
		// Reverse order: dependents first.
		for (const id of [
			'pbc_910000106',
			'pbc_910000105',
			'pbc_910000104',
			'pbc_910000103',
			'pbc_910000102',
			'pbc_910000101'
		]) {
			const collection = app.findCollectionByNameOrId(id);
			app.delete(collection);
		}
	}
);
