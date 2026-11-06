/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1H — official results and corrections (Dustin's decisions, D16):
 *
 * - `event_results`: ONE official result per event (unique index). Status
 *   lifecycle: approved → published → correcting → approved → … Owners and
 *   Admins approve, publish, reopen, and reapprove; the flihub_results hook
 *   enforces the transitions, the submitted-scorecards completeness check,
 *   and the totals snapshot. No unpublish exists: reopening (with a required
 *   reason) marks the result "under correction" while the last published
 *   version stays on record.
 * - `result_versions`: append-only snapshots of per-athlete and per-team
 *   totals at each (re)approval, carrying the correction reason, approver,
 *   timestamps, and publication stamps. All client writes are locked — rows
 *   are written internally by the hook, so published results can never be
 *   silently changed by later score edits.
 * - `result_changes`: append-only audit log (approved / published /
 *   reopened) with author, version, and reason; all client writes locked.
 *
 * Any organization member reads (published results are read-only for
 * ordinary users); delete is locked everywhere.
 */
migrate(
	(app) => {
		const ORG = 'pbc_2873630990';
		const EVENTS = 'pbc_910000106';
		const USERS = '_pb_users_auth_';
		const MEMBER =
			'(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id)';
		// Approve/publish/reopen/reapprove are Owner/Admin only (D16); the hook
		// validates the specific transition.
		const RESULT_WRITE =
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
		const textField = (id, name, max) => ({
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
			required: false,
			system: false,
			type: 'text'
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
		const numberField = (id, name, required) => ({
			help: '',
			hidden: false,
			id,
			max: null,
			min: 1,
			name,
			onlyInt: true,
			presentable: false,
			required,
			system: false,
			type: 'number'
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

		const eventResults = new Collection({
			createRule: RESULT_WRITE,
			updateRule: RESULT_WRITE,
			deleteRule: null,
			listRule: MEMBER,
			viewRule: MEMBER,
			system: false,
			type: 'base',
			fields: [
				idField,
				orgField('f1h_rel_res_org'),
				relField('f1h_rel_res_event', 'event', EVENTS, true, true),
				{
					help: '',
					hidden: false,
					id: 'f1h_sel_res_status',
					maxSelect: 1,
					name: 'status',
					presentable: false,
					required: true,
					system: false,
					type: 'select',
					values: ['approved', 'published', 'correcting']
				},
				numberField('f1h_num_res_version', 'currentVersion', true),
				// The version number of the latest PUBLISHED version (0 before the
				// first publication) — the explicit "official" pointer, maintained
				// by the hook so the direct API never presents an unpublished
				// version as official.
				{
					help: '',
					hidden: false,
					id: 'f1h_num_res_published',
					max: null,
					min: 0,
					name: 'publishedVersion',
					onlyInt: true,
					presentable: false,
					required: false,
					system: false,
					type: 'number'
				},
				// Reason provided at reopen; consumed into the next version at
				// reapproval. Set by the hook, never trusted from the client.
				textField('f1h_txt_res_pending', 'pendingReason', 500),
				createdField('f1h_dat_res_created'),
				updatedField('f1h_dat_res_updated')
			],
			id: 'pbc_910000501',
			indexes: ['CREATE UNIQUE INDEX idx_event_results_event ON event_results (event)'],
			name: 'event_results'
		});
		app.save(eventResults);

		const resultVersions = new Collection({
			createRule: null,
			updateRule: null,
			deleteRule: null,
			listRule: MEMBER,
			viewRule: MEMBER,
			system: false,
			type: 'base',
			fields: [
				idField,
				orgField('f1h_rel_ver_org'),
				relField('f1h_rel_ver_event', 'event', EVENTS, true, true),
				relField('f1h_rel_ver_result', 'result', 'pbc_910000501', true, true),
				numberField('f1h_num_ver_version', 'version', true),
				{
					help: '',
					hidden: false,
					id: 'f1h_jsn_ver_totals',
					maxSize: 200000,
					name: 'totals',
					presentable: false,
					required: true,
					system: false,
					type: 'json'
				},
				textField('f1h_txt_ver_reason', 'reason', 500),
				relField('f1h_rel_ver_approved_by', 'approvedBy', USERS, true, false),
				dateField('f1h_dat_ver_approved_at', 'approvedAt'),
				relField('f1h_rel_ver_published_by', 'publishedBy', USERS, false, false),
				dateField('f1h_dat_ver_published_at', 'publishedAt'),
				createdField('f1h_dat_ver_created')
			],
			id: 'pbc_910000502',
			indexes: [
				'CREATE UNIQUE INDEX idx_result_versions_result_version ON result_versions (result, version)'
			],
			name: 'result_versions'
		});
		app.save(resultVersions);

		const resultChanges = new Collection({
			createRule: null,
			updateRule: null,
			deleteRule: null,
			listRule: MEMBER,
			viewRule: MEMBER,
			system: false,
			type: 'base',
			fields: [
				idField,
				orgField('f1h_rel_chg_org'),
				relField('f1h_rel_chg_event', 'event', EVENTS, true, true),
				relField('f1h_rel_chg_result', 'result', 'pbc_910000501', true, true),
				{
					help: '',
					hidden: false,
					id: 'f1h_sel_chg_action',
					maxSelect: 1,
					name: 'action',
					presentable: false,
					required: true,
					system: false,
					type: 'select',
					values: ['approved', 'published', 'reopened']
				},
				numberField('f1h_num_chg_version', 'version', true),
				textField('f1h_txt_chg_reason', 'reason', 500),
				relField('f1h_rel_chg_author', 'author', USERS, true, false),
				createdField('f1h_dat_chg_created')
			],
			id: 'pbc_910000503',
			indexes: ['CREATE INDEX idx_result_changes_result ON result_changes (result)'],
			name: 'result_changes'
		});
		app.save(resultChanges);
	},
	(app) => {
		// Reverse order: dependents first.
		for (const id of ['pbc_910000503', 'pbc_910000502', 'pbc_910000501']) {
			const collection = app.findCollectionByNameOrId(id);
			app.delete(collection);
		}
	}
);
