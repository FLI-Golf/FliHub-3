/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1F — event operations: courses with holes and labeled positions,
 * rounds, event groups, and group team/athlete assignments (Dustin's
 * decisions, recorded as D14):
 *
 * - Courses only — venue records remain planned, so there is no venue
 *   entity. Courses carry holes (number, name, par); each hole carries
 *   labeled positions (e.g. "red"/"blue") with a positive distance and an
 *   explicit unit, mirroring D10's explicit race-distance units.
 * - Demo numbers (nine holes, par 3, 220–425 ft, six groups, two teams +
 *   four athletes, one scorekeeper) are PILOT CONFIGURATION: the shared
 *   model enforces only generic invariants (positive distances, unique hole
 *   numbers/position labels/round numbers per parent, one group per event
 *   per team and per athlete); the demo counts are verified in the demo
 *   build, never hard-coded here.
 * - Group team/athlete assignment requires a season-linked event: teams
 *   join groups through their season entries, and athlete eligibility is
 *   resolved from Phase 1E rosters and event-scoped substitutions (enforced
 *   in flihub_event_ops.pb.js). `event` on group_teams/group_athletes is
 *   denormalized from the group (hook-derived, never client-trusted) so the
 *   one-group-per-event partial unique indexes can exist.
 * - "Changes to assignments are recorded" via the established lifecycle:
 *   archive-only rows with created/updated autodates; a formal event-ops
 *   audit trail arrives with 1G scoring.
 *
 * Every collection: any organization member reads, only Owners/Admins write,
 * delete is locked (null) — archive/restore lifecycle.
 */
migrate(
	(app) => {
		const ORG = 'pbc_2873630990';
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
		const textField = (id, name, max, required) => ({
			autogeneratePattern: '',
			help: '',
			hidden: false,
			id,
			max,
			min: required ? 1 : 0,
			name,
			pattern: '',
			presentable: name === 'name',
			primaryKey: false,
			required,
			system: false,
			type: 'text'
		});
		const intField = (id, name) => ({
			help: '',
			hidden: false,
			id,
			max: null,
			min: 1,
			name,
			onlyInt: true,
			presentable: false,
			required: true,
			system: false,
			type: 'number'
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

		const courses = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1f_rel_course_org'),
				textField('f1f_txt_course_name', 'name', 120, true),
				statusField('f1f_sel_course_status'),
				createdField('f1f_dat_course_created'),
				updatedField('f1f_dat_course_updated')
			],
			id: 'pbc_910000301',
			indexes: ['CREATE UNIQUE INDEX idx_courses_org_name ON courses (organization, name)'],
			name: 'courses'
		});
		app.save(courses);

		const courseHoles = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1f_rel_hole_org'),
				relField('f1f_rel_hole_course', 'course', 'pbc_910000301', true, true),
				intField('f1f_num_hole_number', 'number'),
				textField('f1f_txt_hole_name', 'name', 120, true),
				intField('f1f_num_hole_par', 'par'),
				statusField('f1f_sel_hole_status'),
				createdField('f1f_dat_hole_created'),
				updatedField('f1f_dat_hole_updated')
			],
			id: 'pbc_910000302',
			indexes: [
				"CREATE UNIQUE INDEX idx_course_holes_active_number ON course_holes (course, number) WHERE status = 'active'"
			],
			name: 'course_holes'
		});
		app.save(courseHoles);

		const holePositions = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1f_rel_pos_org'),
				relField('f1f_rel_pos_hole', 'hole', 'pbc_910000302', true, true),
				textField('f1f_txt_pos_label', 'label', 40, true),
				{
					help: '',
					hidden: false,
					id: 'f1f_num_pos_distance',
					max: null,
					min: 0.000001,
					name: 'distance',
					onlyInt: false,
					presentable: false,
					required: true,
					system: false,
					type: 'number'
				},
				{
					help: '',
					hidden: false,
					id: 'f1f_sel_pos_unit',
					maxSelect: 1,
					name: 'unit',
					presentable: false,
					required: true,
					system: false,
					type: 'select',
					values: ['feet', 'meters', 'yards']
				},
				statusField('f1f_sel_pos_status'),
				createdField('f1f_dat_pos_created'),
				updatedField('f1f_dat_pos_updated')
			],
			id: 'pbc_910000303',
			indexes: [
				"CREATE UNIQUE INDEX idx_hole_positions_active_label ON hole_positions (hole, label) WHERE status = 'active'"
			],
			name: 'hole_positions'
		});
		app.save(holePositions);

		const rounds = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1f_rel_round_org'),
				relField('f1f_rel_round_event', 'event', EVENTS, true, true),
				intField('f1f_num_round_number', 'number'),
				textField('f1f_txt_round_name', 'name', 120, false),
				relField('f1f_rel_round_course', 'course', 'pbc_910000301', false, false),
				textField('f1f_txt_round_poslabel', 'positionLabel', 40, false),
				statusField('f1f_sel_round_status'),
				createdField('f1f_dat_round_created'),
				updatedField('f1f_dat_round_updated')
			],
			id: 'pbc_910000304',
			indexes: [
				"CREATE UNIQUE INDEX idx_rounds_active_event_number ON rounds (event, number) WHERE status = 'active'"
			],
			name: 'rounds'
		});
		app.save(rounds);

		const eventGroups = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1f_rel_group_org'),
				relField('f1f_rel_group_event', 'event', EVENTS, true, true),
				textField('f1f_txt_group_name', 'name', 80, true),
				// One scorekeeper per group (optional until assigned). Must be an
				// organization member; role-based score-entry enforcement is 1G.
				relField('f1f_rel_group_scorekeeper', 'scorekeeper', USERS, false, false),
				statusField('f1f_sel_group_status'),
				createdField('f1f_dat_group_created'),
				updatedField('f1f_dat_group_updated')
			],
			id: 'pbc_910000305',
			indexes: [
				"CREATE UNIQUE INDEX idx_event_groups_active_name ON event_groups (event, name) WHERE status = 'active'"
			],
			name: 'event_groups'
		});
		app.save(eventGroups);

		const groupTeams = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1f_rel_gteam_org'),
				relField('f1f_rel_gteam_group', 'group', 'pbc_910000305', true, true),
				relField('f1f_rel_gteam_event', 'event', EVENTS, true, true),
				relField('f1f_rel_gteam_entry', 'entry', SEASON_ENTRIES, true, true),
				statusField('f1f_sel_gteam_status'),
				createdField('f1f_dat_gteam_created'),
				updatedField('f1f_dat_gteam_updated')
			],
			id: 'pbc_910000306',
			indexes: [
				"CREATE UNIQUE INDEX idx_group_teams_active_event_entry ON group_teams (event, entry) WHERE status = 'active'",
				'CREATE INDEX idx_group_teams_group ON group_teams (`group`)'
			],
			name: 'group_teams'
		});
		app.save(groupTeams);

		const groupAthletes = new Collection({
			...rules,
			fields: [
				idField,
				orgField('f1f_rel_gath_org'),
				relField('f1f_rel_gath_group', 'group', 'pbc_910000305', true, true),
				relField('f1f_rel_gath_event', 'event', EVENTS, true, true),
				relField('f1f_rel_gath_entry', 'entry', SEASON_ENTRIES, true, true),
				relField('f1f_rel_gath_athlete', 'athlete', ATHLETES, true, true),
				statusField('f1f_sel_gath_status'),
				createdField('f1f_dat_gath_created'),
				updatedField('f1f_dat_gath_updated')
			],
			id: 'pbc_910000307',
			indexes: [
				"CREATE UNIQUE INDEX idx_group_athletes_active_event_athlete ON group_athletes (event, athlete) WHERE status = 'active'",
				'CREATE INDEX idx_group_athletes_group ON group_athletes (`group`)'
			],
			name: 'group_athletes'
		});
		app.save(groupAthletes);
	},
	(app) => {
		// Reverse order: dependents first.
		for (const id of [
			'pbc_910000307',
			'pbc_910000306',
			'pbc_910000305',
			'pbc_910000304',
			'pbc_910000303',
			'pbc_910000302',
			'pbc_910000301'
		]) {
			const collection = app.findCollectionByNameOrId(id);
			app.delete(collection);
		}
	}
);
