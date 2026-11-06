/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1G — mobile scorekeeping: scorecards, per-athlete per-hole scores,
 * and an append-only score change log (Dustin's decisions, recorded as D15):
 *
 * - One scorecard per (round, group) with a Draft → Submitted lifecycle.
 *   Submitted scorecards are immutable through the rules below: every score
 *   write requires `scorecard.status = 'draft'`, and only Owners/Admins can
 *   update a non-draft scorecard (the reopen path).
 * - Scoring permission matrix: ordinary entry requires BOTH the Scorekeeper
 *   role AND an active assignment as a group's scorekeeper in at least one
 *   active group of the event — granting entry across all of that event's
 *   groups (§4.3) and nothing in any other event. Owners/Admins may also
 *   enter and correct draft scores. Viewers remain read-only even when
 *   listed as a group's scorekeeper (the role check fails). The rules join
 *   memberships and event_groups per request, so reassignment takes effect
 *   immediately.
 * - Scores are positive integers keyed by (round, athlete, PHYSICAL hole):
 *   a missing value is an absent row — never zero — and the unique index
 *   keeps each round's scores separate even when a second pass displays
 *   holes 10–18.
 * - `score_changes` is append-only history written internally by the
 *   flihub_scoring hook; all its API write rules are locked.
 *
 * Any organization member reads; delete is locked everywhere.
 */
migrate(
	(app) => {
		const ORG = 'pbc_2873630990';
		const EVENTS = 'pbc_910000106';
		const SEASON_ENTRIES = 'pbc_910000105';
		const ATHLETES = 'pbc_401194191';
		const COURSE_HOLES = 'pbc_910000302';
		const ROUNDS = 'pbc_910000304';
		const EVENT_GROUPS = 'pbc_910000305';
		const USERS = '_pb_users_auth_';
		const MEMBER =
			'(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id)';
		const SCORECARD_CREATE =
			"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin' || (@collection.memberships.role ?= 'scorekeeper' && @collection.event_groups.event ?= group.event && @collection.event_groups.scorekeeper ?= @request.auth.id && @collection.event_groups.status ?= 'active')))";
		const SCORECARD_UPDATE =
			"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin' || (@collection.memberships.role ?= 'scorekeeper' && @collection.event_groups.event ?= event && @collection.event_groups.scorekeeper ?= @request.auth.id && @collection.event_groups.status ?= 'active' && status = 'draft')))";
		const SCORE_WRITE =
			"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin' || (@collection.memberships.role ?= 'scorekeeper' && @collection.event_groups.event ?= scorecard.event && @collection.event_groups.scorekeeper ?= @request.auth.id && @collection.event_groups.status ?= 'active'))) && scorecard.status = 'draft'";

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

		const scorecards = new Collection({
			createRule: SCORECARD_CREATE,
			updateRule: SCORECARD_UPDATE,
			deleteRule: null,
			listRule: MEMBER,
			viewRule: MEMBER,
			system: false,
			type: 'base',
			fields: [
				idField,
				orgField('f1g_rel_card_org'),
				relField('f1g_rel_card_event', 'event', EVENTS, true, true),
				relField('f1g_rel_card_round', 'round', ROUNDS, true, true),
				relField('f1g_rel_card_group', 'group', EVENT_GROUPS, true, true),
				{
					help: '',
					hidden: false,
					id: 'f1g_sel_card_status',
					maxSelect: 1,
					name: 'status',
					presentable: false,
					required: true,
					system: false,
					type: 'select',
					values: ['draft', 'submitted']
				},
				relField('f1g_rel_card_submitted_by', 'submittedBy', USERS, false, false),
				{
					help: '',
					hidden: false,
					id: 'f1g_dat_card_submitted_at',
					max: '',
					min: '',
					name: 'submittedAt',
					presentable: false,
					required: false,
					system: false,
					type: 'date'
				},
				createdField('f1g_dat_card_created'),
				updatedField('f1g_dat_card_updated')
			],
			id: 'pbc_910000401',
			indexes: ['CREATE UNIQUE INDEX idx_scorecards_round_group ON scorecards (round, `group`)'],
			name: 'scorecards'
		});
		app.save(scorecards);

		const scores = new Collection({
			createRule: SCORE_WRITE,
			updateRule: SCORE_WRITE,
			deleteRule: null,
			listRule: MEMBER,
			viewRule: MEMBER,
			system: false,
			type: 'base',
			fields: [
				idField,
				orgField('f1g_rel_score_org'),
				relField('f1g_rel_score_card', 'scorecard', 'pbc_910000401', true, true),
				relField('f1g_rel_score_event', 'event', EVENTS, true, true),
				relField('f1g_rel_score_round', 'round', ROUNDS, true, true),
				relField('f1g_rel_score_group', 'group', EVENT_GROUPS, true, true),
				relField('f1g_rel_score_entry', 'entry', SEASON_ENTRIES, true, true),
				relField('f1g_rel_score_athlete', 'athlete', ATHLETES, true, true),
				relField('f1g_rel_score_hole', 'hole', COURSE_HOLES, true, true),
				{
					help: '',
					hidden: false,
					id: 'f1g_num_score_strokes',
					max: null,
					min: 1,
					name: 'strokes',
					onlyInt: true,
					presentable: false,
					required: true,
					system: false,
					type: 'number'
				},
				// Set by the flihub_scoring hook from the authenticated caller;
				// client-sent values are overwritten on create and update.
				relField('f1g_rel_score_entered_by', 'enteredBy', USERS, true, false),
				createdField('f1g_dat_score_created'),
				updatedField('f1g_dat_score_updated')
			],
			id: 'pbc_910000402',
			indexes: [
				'CREATE UNIQUE INDEX idx_scores_round_athlete_hole ON scores (round, athlete, hole)',
				'CREATE INDEX idx_scores_scorecard ON scores (scorecard)'
			],
			name: 'scores'
		});
		app.save(scores);

		const scoreChanges = new Collection({
			createRule: null,
			updateRule: null,
			deleteRule: null,
			listRule: MEMBER,
			viewRule: MEMBER,
			system: false,
			type: 'base',
			fields: [
				idField,
				orgField('f1g_rel_chg_org'),
				relField('f1g_rel_chg_event', 'event', EVENTS, true, true),
				relField('f1g_rel_chg_card', 'scorecard', 'pbc_910000401', true, true),
				relField('f1g_rel_chg_athlete', 'athlete', ATHLETES, false, true),
				relField('f1g_rel_chg_hole', 'hole', COURSE_HOLES, false, true),
				{
					help: '',
					hidden: false,
					id: 'f1g_sel_chg_action',
					maxSelect: 1,
					name: 'action',
					presentable: false,
					required: true,
					system: false,
					type: 'select',
					values: ['entered', 'updated', 'submitted', 'reopened']
				},
				{
					help: '',
					hidden: false,
					id: 'f1g_num_chg_prev',
					max: null,
					min: 1,
					name: 'prevStrokes',
					onlyInt: true,
					presentable: false,
					required: false,
					system: false,
					type: 'number'
				},
				{
					help: '',
					hidden: false,
					id: 'f1g_num_chg_new',
					max: null,
					min: 1,
					name: 'newStrokes',
					onlyInt: true,
					presentable: false,
					required: false,
					system: false,
					type: 'number'
				},
				// Required by the scoring hook when action = 'reopened'; empty otherwise.
				{
					autogeneratePattern: '',
					help: '',
					hidden: false,
					id: 'f1g_txt_chg_reason',
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
				relField('f1g_rel_chg_author', 'author', USERS, true, false),
				createdField('f1g_dat_chg_created')
			],
			id: 'pbc_910000403',
			indexes: ['CREATE INDEX idx_score_changes_card ON score_changes (scorecard)'],
			name: 'score_changes'
		});
		app.save(scoreChanges);
	},
	(app) => {
		// Reverse order: dependents first.
		for (const id of ['pbc_910000403', 'pbc_910000402', 'pbc_910000401']) {
			const collection = app.findCollectionByNameOrId(id);
			app.delete(collection);
		}
	}
);
