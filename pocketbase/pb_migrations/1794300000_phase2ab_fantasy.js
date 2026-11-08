/// <reference path="../pb_data/types.d.ts" />
/**
 * Phases 2A–2B — fantasy leagues and per-event snake drafts (D18).
 *
 * - `fantasy_leagues`: private leagues scoped to one organization. Fantasy
 *   membership is fully independent of organization staff roles: all writes
 *   go through the trusted flihub_fantasy hook (create/update/delete rules
 *   locked), and reads require a fantasy membership row — organization
 *   staff see nothing without one.
 * - `fantasy_members`: owner/manager seats with the invitation lifecycle
 *   (invited → accepted → approved; declined/removed). Unique (league,
 *   user). Only approved seats count toward the participant limit.
 * - `fantasy_drafts`: ONE draft per (league, event) — a new event gets its
 *   own draft with its own independently randomized, persisted first-round
 *   order. The server owns the board: status, order, rankings (auto-pick
 *   list), currentPick, and the pick deadline live here so every manager
 *   sees the same state and can reconnect.
 * - `fantasy_picks`: append-only picks. Unique (draft, pickNumber) and
 *   unique (draft, athlete) make "exactly one pick per turn / one selection
 *   per athlete" database guarantees even under a manual-pick/timeout race.
 *   A designated event substitution is recorded separately on the pick
 *   (substituteAthlete + the 1E substitution row) — the original pick is
 *   preserved.
 *
 * Reads: fantasy_leagues are visible to anyone holding a membership row of
 * any status (invitees must see what they were invited to); drafts and
 * picks require an approved seat (or the owner). Multiple conditions on the
 * same @collection reference resolve to the same joined row in PocketBase.
 */
migrate(
	(app) => {
		const ORG = 'pbc_2873630990';
		const USERS = '_pb_users_auth_';
		const ATHLETES = 'pbc_401194191';
		const EVENTS = 'pbc_910000106';
		const SUBSTITUTIONS = 'pbc_910000204';
		const LEAGUES = 'pbc_920000101';

		const ANY_MEMBER =
			'(@collection.fantasy_members.league.id ?= id && @collection.fantasy_members.user.id ?= @request.auth.id)';
		const APPROVED_MEMBER =
			"(@collection.fantasy_members.league.id ?= league.id && @collection.fantasy_members.user.id ?= @request.auth.id && (@collection.fantasy_members.status ?= 'approved'))";

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
		const textField = (id, name, max, required = false) => ({
			autogeneratePattern: '',
			help: '',
			hidden: false,
			id,
			max,
			min: 0,
			name,
			pattern: '',
			presentable: false,
			primaryKey: false,
			required,
			system: false,
			type: 'text'
		});
		const numberField = (id, name, required, min = 0) => ({
			help: '',
			hidden: false,
			id,
			max: null,
			min,
			name,
			onlyInt: true,
			presentable: false,
			required,
			system: false,
			type: 'number'
		});
		const selectField = (id, name, values, required = true) => ({
			help: '',
			hidden: false,
			id,
			maxSelect: 1,
			name,
			presentable: false,
			required,
			system: false,
			type: 'select',
			values
		});
		const jsonField = (id, name, maxSize = 100000) => ({
			help: '',
			hidden: false,
			id,
			maxSize,
			name,
			presentable: false,
			required: false,
			system: false,
			type: 'json'
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
		const boolField = (id, name) => ({
			hidden: false,
			id,
			name,
			presentable: false,
			required: false,
			system: false,
			type: 'bool'
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

		const leagues = new Collection({
			createRule: null,
			updateRule: null,
			deleteRule: null,
			// Membership-based rules are attached AFTER fantasy_members exists —
			// a rule cannot reference a collection that has not been created yet.
			listRule: null,
			viewRule: null,
			system: false,
			type: 'base',
			fields: [
				idField,
				relField('f2a_rel_lg_org', 'organization', ORG, true, true),
				textField('f2a_txt_lg_name', 'name', 80, true),
				relField('f2a_rel_lg_owner', 'owner', USERS, true, false),
				numberField('f2a_num_lg_limit', 'participantLimit', true, 2),
				createdField('f2a_dat_lg_created'),
				updatedField('f2a_dat_lg_updated')
			],
			id: 'pbc_920000101',
			indexes: [],
			name: 'fantasy_leagues'
		});
		app.save(leagues);

		const members = new Collection({
			createRule: null,
			updateRule: null,
			deleteRule: null,
			// Self-referencing rules are attached after creation (below).
			listRule: null,
			viewRule: null,
			system: false,
			type: 'base',
			fields: [
				idField,
				relField('f2a_rel_mem_league', 'league', LEAGUES, true, true),
				relField('f2a_rel_mem_user', 'user', USERS, true, true),
				selectField('f2a_sel_mem_role', 'role', ['owner', 'manager']),
				selectField('f2a_sel_mem_status', 'status', [
					'invited',
					'accepted',
					'approved',
					'declined',
					'removed'
				]),
				relField('f2a_rel_mem_invited_by', 'invitedBy', USERS, false, false),
				createdField('f2a_dat_mem_created'),
				updatedField('f2a_dat_mem_updated')
			],
			id: 'pbc_920000102',
			indexes: [
				'CREATE UNIQUE INDEX idx_fantasy_members_league_user ON fantasy_members (league, user)'
			],
			name: 'fantasy_members'
		});
		app.save(members);

		// Now that both collections exist, attach the membership-based rules —
		// on FRESH copies (re-saving the stale constructor objects can drop
		// the just-created fields).
		const leaguesFresh = app.findCollectionByNameOrId('fantasy_leagues');
		unmarshal({ listRule: ANY_MEMBER, viewRule: ANY_MEMBER }, leaguesFresh);
		app.save(leaguesFresh);
		const membersFresh = app.findCollectionByNameOrId('fantasy_members');
		unmarshal(
			{
				listRule: `(user = @request.auth.id || ${APPROVED_MEMBER})`,
				viewRule: `(user = @request.auth.id || ${APPROVED_MEMBER})`
			},
			membersFresh
		);
		app.save(membersFresh);

		const drafts = new Collection({
			createRule: null,
			updateRule: null,
			deleteRule: null,
			listRule: APPROVED_MEMBER,
			viewRule: APPROVED_MEMBER,
			system: false,
			type: 'base',
			fields: [
				idField,
				relField('f2b_rel_dr_league', 'league', LEAGUES, true, true),
				relField('f2b_rel_dr_org', 'organization', ORG, true, true),
				relField('f2b_rel_dr_event', 'event', EVENTS, true, true),
				selectField('f2b_sel_dr_status', 'status', ['ready', 'active', 'complete']),
				numberField('f2b_num_dr_seconds', 'pickSeconds', true, 2),
				jsonField('f2b_jsn_dr_order', 'draftOrder', 20000),
				jsonField('f2b_jsn_dr_rankings', 'rankings', 100000),
				numberField('f2b_num_dr_current', 'currentPick', false, 0),
				dateField('f2b_dat_dr_deadline', 'deadline'),
				dateField('f2b_dat_dr_started', 'startedAt'),
				dateField('f2b_dat_dr_completed', 'completedAt'),
				relField('f2b_rel_dr_created_by', 'createdBy', USERS, true, false),
				createdField('f2b_dat_dr_created'),
				updatedField('f2b_dat_dr_updated')
			],
			id: 'pbc_920000103',
			indexes: [
				'CREATE UNIQUE INDEX idx_fantasy_drafts_league_event ON fantasy_drafts (league, event)'
			],
			name: 'fantasy_drafts'
		});
		app.save(drafts);

		const picks = new Collection({
			createRule: null,
			updateRule: null,
			deleteRule: null,
			listRule: APPROVED_MEMBER,
			viewRule: APPROVED_MEMBER,
			system: false,
			type: 'base',
			fields: [
				idField,
				relField('f2b_rel_pk_draft', 'draft', 'pbc_920000103', true, true),
				relField('f2b_rel_pk_league', 'league', LEAGUES, true, true),
				relField('f2b_rel_pk_org', 'organization', ORG, true, true),
				numberField('f2b_num_pk_number', 'pickNumber', true, 1),
				numberField('f2b_num_pk_round', 'round', true, 1),
				relField('f2b_rel_pk_manager', 'manager', USERS, true, false),
				relField('f2b_rel_pk_athlete', 'athlete', ATHLETES, true, false),
				boolField('f2b_bool_pk_auto', 'auto'),
				// Designated event substitution, recorded separately — the
				// original pick (athlete) is preserved.
				relField('f2b_rel_pk_sub_athlete', 'substituteAthlete', ATHLETES, false, false),
				relField('f2b_rel_pk_substitution', 'substitution', SUBSTITUTIONS, false, false),
				dateField('f2b_dat_pk_substituted', 'substitutedAt'),
				createdField('f2b_dat_pk_created')
			],
			id: 'pbc_920000104',
			indexes: [
				'CREATE UNIQUE INDEX idx_fantasy_picks_draft_number ON fantasy_picks (draft, pickNumber)',
				'CREATE UNIQUE INDEX idx_fantasy_picks_draft_athlete ON fantasy_picks (draft, athlete)'
			],
			name: 'fantasy_picks'
		});
		app.save(picks);
	},
	(app) => {
		// Reverse order: dependents first.
		for (const id of ['pbc_920000104', 'pbc_920000103', 'pbc_920000102', 'pbc_920000101']) {
			const collection = app.findCollectionByNameOrId(id);
			app.delete(collection);
		}
	}
);
