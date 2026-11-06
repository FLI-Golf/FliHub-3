/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1E — season rosters, reserve pools, and substitutions (Dustin's
 * decisions, recorded as D13):
 *
 * - Roster rows belong to a team's season entry (`roster_memberships`), so
 *   "who played for which team in which season" is modeled directly and
 *   inherits the D12 immutability of the entry's season and team. `season`
 *   is denormalized from the entry (hook-derived, never client-trusted) so
 *   the exclusivity index below can exist.
 * - An athlete holds at most ONE active spot per season: a partial unique
 *   index on (season, athlete) WHERE status = 'active' in both
 *   roster_memberships and reserve_members, plus a cross-table hook check.
 *   Archived rows are exempt — they ARE the preserved participation history.
 * - Reserve pools are first-class records (`reserve_pools` +
 *   `reserve_members`), not flagged teams: pools can never receive season
 *   entries, so exclusion from ordinary scheduling is structural. A pool may
 *   carry an optional gender restriction (pilot configuration — the demo's
 *   separate male/female pools — not a universal rule).
 * - Substitutions are append-only event-scoped records: create-only for
 *   Owners/Admins, update and delete locked for everyone.
 *
 * Every collection: any organization member reads, only Owners/Admins write
 * (substitutions: create only), delete is locked (null). These collections
 * carry created/updated autodate fields (unlike 1C/1D) because substitution
 * and roster history is time-relevant.
 */
migrate(
	(app) => {
		const ORG = 'pbc_2873630990';
		const SEASONS = 'pbc_910000103';
		const SEASON_ENTRIES = 'pbc_910000105';
		const EVENTS = 'pbc_910000106';
		const ATHLETES = 'pbc_401194191';
		const USERS = '_pb_users_auth_';
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
		const relField = (id, name, collectionId, required, cascade) => ({
			cascadeDelete: cascade,
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
		const statusField = (id) => ({
			help: '',
			hidden: false,
			id,
			maxSelect: 1,
			name: 'status',
			presentable: false,
			required: true,
			system: false,
			type: 'select',
			values: ['active', 'archived']
		});
		const createdField = (id) => ({
			hidden: false,
			id,
			name: 'created',
			onCreate: true,
			onUpdate: false,
			presentable: false,
			system: false,
			type: 'autodate'
		});
		const updatedField = (id) => ({
			hidden: false,
			id,
			name: 'updated',
			onCreate: true,
			onUpdate: true,
			presentable: false,
			system: false,
			type: 'autodate'
		});
		const rules = {
			createRule: OWNER_OR_ADMIN,
			deleteRule: null,
			listRule: MEMBER,
			updateRule: OWNER_OR_ADMIN,
			viewRule: MEMBER,
			system: false,
			type: 'base'
		};

		const rosterMemberships = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1e_rel_roster_org'),
				relField('f1e_rel_roster_entry', 'entry', SEASON_ENTRIES, true, true),
				relField('f1e_rel_roster_season', 'season', SEASONS, true, true),
				relField('f1e_rel_roster_athlete', 'athlete', ATHLETES, true, true),
				statusField('f1e_sel_roster_status'),
				createdField('f1e_dat_roster_created'),
				updatedField('f1e_dat_roster_updated')
			],
			id: 'pbc_910000201',
			indexes: [
				"CREATE UNIQUE INDEX idx_roster_active_season_athlete ON roster_memberships (season, athlete) WHERE status = 'active'",
				'CREATE INDEX idx_roster_memberships_entry ON roster_memberships (entry)'
			],
			name: 'roster_memberships'
		});
		app.save(rosterMemberships);

		const reservePools = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1e_rel_pool_org'),
				relField('f1e_rel_pool_season', 'season', SEASONS, true, true),
				{
					autogeneratePattern: '',
					help: '',
					hidden: false,
					id: 'f1e_txt_pool_name',
					max: 120,
					min: 1,
					name: 'name',
					pattern: '',
					presentable: true,
					primaryKey: false,
					required: true,
					system: false,
					type: 'text'
				},
				{
					help: '',
					hidden: false,
					id: 'f1e_sel_pool_gender',
					maxSelect: 1,
					name: 'gender',
					presentable: false,
					required: false,
					system: false,
					type: 'select',
					values: ['male', 'female', 'other']
				},
				statusField('f1e_sel_pool_status'),
				createdField('f1e_dat_pool_created'),
				updatedField('f1e_dat_pool_updated')
			],
			id: 'pbc_910000202',
			indexes: [
				'CREATE UNIQUE INDEX idx_reserve_pools_season_name ON reserve_pools (season, name)'
			],
			name: 'reserve_pools'
		});
		app.save(reservePools);

		const reserveMembers = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1e_rel_rsv_org'),
				relField('f1e_rel_rsv_pool', 'pool', 'pbc_910000202', true, true),
				relField('f1e_rel_rsv_season', 'season', SEASONS, true, true),
				relField('f1e_rel_rsv_athlete', 'athlete', ATHLETES, true, true),
				statusField('f1e_sel_rsv_status'),
				createdField('f1e_dat_rsv_created'),
				updatedField('f1e_dat_rsv_updated')
			],
			id: 'pbc_910000203',
			indexes: [
				"CREATE UNIQUE INDEX idx_reserve_active_season_athlete ON reserve_members (season, athlete) WHERE status = 'active'",
				'CREATE INDEX idx_reserve_members_pool ON reserve_members (pool)'
			],
			name: 'reserve_members'
		});
		app.save(reserveMembers);

		const substitutions = new Collection({
			...rules,
			// Append-only: create for Owners/Admins, update locked for everyone.
			updateRule: null,
			fields: [
				idField,
				orgField('f1e_rel_sub_org'),
				relField('f1e_rel_sub_event', 'event', EVENTS, true, true),
				relField('f1e_rel_sub_entry', 'entry', SEASON_ENTRIES, true, true),
				relField('f1e_rel_sub_out', 'athleteOut', ATHLETES, true, true),
				relField('f1e_rel_sub_in', 'athleteIn', ATHLETES, true, true),
				{
					autogeneratePattern: '',
					help: '',
					hidden: false,
					id: 'f1e_txt_sub_reason',
					max: 500,
					min: 0,
					name: 'reason',
					pattern: '',
					presentable: false,
					primaryKey: false,
					required: false,
					system: false,
					type: 'text'
				},
				// Set by the flihub_rosters hook from the authenticated caller;
				// client-sent values are overwritten. No cascade: substitution
				// history outlives accounts.
				relField('f1e_rel_sub_recorded_by', 'recordedBy', USERS, true, false),
				createdField('f1e_dat_sub_created'),
				updatedField('f1e_dat_sub_updated')
			],
			id: 'pbc_910000204',
			indexes: ['CREATE INDEX idx_substitutions_event ON substitutions (event)'],
			name: 'substitutions'
		});
		app.save(substitutions);
	},
	(app) => {
		// Reverse order: dependents first.
		for (const id of ['pbc_910000204', 'pbc_910000203', 'pbc_910000202', 'pbc_910000201']) {
			const collection = app.findCollectionByNameOrId(id);
			app.delete(collection);
		}
	}
);
