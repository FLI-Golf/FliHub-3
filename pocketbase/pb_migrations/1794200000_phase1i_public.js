/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1I — organization publishing and public competition standings.
 *
 * - `organizations` gains the public-page fields: a unique public slug
 *   (reserved on first use, validated by the flihub_public hook — the
 *   organizations update rule stays locked, so the trusted endpoint is the
 *   only write path), the explicit publish flag (a page is never public by
 *   default), and the branding fields (tagline, logo URL, theme colors).
 *   Only the organization name is required to publish (Dustin, 2026-11-07).
 * - `events`, `teams`, and `athletes` gain a per-record `publicPublished`
 *   flag (default false — publication is per-record, never blanket).
 *   Owners/Admins toggle it through the existing collection update rules.
 *
 * What a visitor can actually read is decided exclusively by the shared
 * publication-rule layer (pb_hooks/public_rules.js); no collection list or
 * view rule is opened to unauthenticated callers.
 */
migrate(
	(app) => {
		const organizations = app.findCollectionByNameOrId('pbc_2873630990');
		organizations.fields.add(
			new Field({
				autogeneratePattern: '',
				help: '',
				hidden: false,
				id: 'f1i_txt_org_slug',
				max: 50,
				min: 0,
				name: 'publicSlug',
				pattern: '',
				presentable: false,
				primaryKey: false,
				required: false,
				system: false,
				type: 'text'
			})
		);
		organizations.fields.add(
			new Field({
				hidden: false,
				id: 'f1i_bool_org_published',
				name: 'publicPublished',
				presentable: false,
				required: false,
				system: false,
				type: 'bool'
			})
		);
		organizations.fields.add(
			new Field({
				autogeneratePattern: '',
				help: '',
				hidden: false,
				id: 'f1i_txt_org_tagline',
				max: 160,
				min: 0,
				name: 'tagline',
				pattern: '',
				presentable: false,
				primaryKey: false,
				required: false,
				system: false,
				type: 'text'
			})
		);
		organizations.fields.add(
			new Field({
				autogeneratePattern: '',
				help: '',
				hidden: false,
				id: 'f1i_txt_org_logo',
				max: 300,
				min: 0,
				name: 'logoUrl',
				pattern: '',
				presentable: false,
				primaryKey: false,
				required: false,
				system: false,
				type: 'text'
			})
		);
		organizations.fields.add(
			new Field({
				autogeneratePattern: '',
				help: '',
				hidden: false,
				id: 'f1i_txt_org_theme_primary',
				max: 9,
				min: 0,
				name: 'themePrimary',
				pattern: '',
				presentable: false,
				primaryKey: false,
				required: false,
				system: false,
				type: 'text'
			})
		);
		organizations.fields.add(
			new Field({
				autogeneratePattern: '',
				help: '',
				hidden: false,
				id: 'f1i_txt_org_theme_secondary',
				max: 9,
				min: 0,
				name: 'themeSecondary',
				pattern: '',
				presentable: false,
				primaryKey: false,
				required: false,
				system: false,
				type: 'text'
			})
		);
		// Slugs are globally unique once reserved; empty values stay non-unique.
		// (The organizations snapshot has no other indexes.)
		unmarshal(
			{
				indexes: [
					"CREATE UNIQUE INDEX idx_organizations_public_slug ON organizations (publicSlug) WHERE publicSlug != ''"
				]
			},
			organizations
		);
		app.save(organizations);

		const publicFlag = (id) =>
			new Field({
				hidden: false,
				id,
				name: 'publicPublished',
				presentable: false,
				required: false,
				system: false,
				type: 'bool'
			});
		const events = app.findCollectionByNameOrId('pbc_910000106');
		events.fields.add(publicFlag('f1i_bool_event_published'));
		app.save(events);

		const teams = app.findCollectionByNameOrId('pbc_910000101');
		teams.fields.add(publicFlag('f1i_bool_team_published'));
		app.save(teams);

		const athletes = app.findCollectionByNameOrId('pbc_401194191');
		athletes.fields.add(publicFlag('f1i_bool_athlete_published'));
		app.save(athletes);

		// membership_events audit log learns the public-page action.
		const membershipEvents = app.findCollectionByNameOrId('pbc_2968977090');
		membershipEvents.fields.addAt(
			3,
			new Field({
				help: '',
				hidden: false,
				id: 'select1204587666',
				maxSelect: 1,
				name: 'action',
				presentable: false,
				required: true,
				system: false,
				type: 'select',
				values: [
					'organization_created',
					'invitation_created',
					'invitation_accepted',
					'invitation_revoked',
					'role_changed',
					'member_removed',
					'member_left',
					'ownership_transferred',
					'configuration_changed',
					'public_page_changed'
				]
			})
		);
		app.save(membershipEvents);
	},
	(app) => {
		const organizations = app.findCollectionByNameOrId('pbc_2873630990');
		unmarshal({ indexes: [] }, organizations);
		for (const id of [
			'f1i_txt_org_slug',
			'f1i_bool_org_published',
			'f1i_txt_org_tagline',
			'f1i_txt_org_logo',
			'f1i_txt_org_theme_primary',
			'f1i_txt_org_theme_secondary'
		]) {
			organizations.fields.removeById(id);
		}
		app.save(organizations);

		const events = app.findCollectionByNameOrId('pbc_910000106');
		events.fields.removeById('f1i_bool_event_published');
		app.save(events);

		const teams = app.findCollectionByNameOrId('pbc_910000101');
		teams.fields.removeById('f1i_bool_team_published');
		app.save(teams);

		const athletes = app.findCollectionByNameOrId('pbc_401194191');
		athletes.fields.removeById('f1i_bool_athlete_published');
		app.save(athletes);

		const membershipEvents = app.findCollectionByNameOrId('pbc_2968977090');
		membershipEvents.fields.addAt(
			3,
			new Field({
				help: '',
				hidden: false,
				id: 'select1204587666',
				maxSelect: 1,
				name: 'action',
				presentable: false,
				required: true,
				system: false,
				type: 'select',
				values: [
					'organization_created',
					'invitation_created',
					'invitation_accepted',
					'invitation_revoked',
					'role_changed',
					'member_removed',
					'member_left',
					'ownership_transferred',
					'configuration_changed'
				]
			})
		);
		app.save(membershipEvents);
	}
);
