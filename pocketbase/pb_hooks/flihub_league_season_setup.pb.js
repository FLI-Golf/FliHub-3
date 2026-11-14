/// <reference path="../pb_data/types.d.ts" />
/** One submission, one transaction. Internal saves bypass request hooks, so all
 * permission, capability, relation, date and purse invariants are checked here.
 * Collection validation and unique indexes still apply to each save.
 */
routerAdd(
	'POST',
	'/api/flihub/organizations/{id}/league-season-setup',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM uses require
		const { validateLeagueSeasonSetup } = require(`${__hooks}/league_season_setup_rules.js`);
		const orgId = e.request.pathValue('id');
		if (!/^[a-z0-9]{15}$/.test(orgId)) throw new NotFoundError('Organization not found.');
		const body = e.requestInfo().body || {};
		let result;
		e.app.runInTransaction((txApp) => {
			let membership;
			try {
				membership = txApp.findFirstRecordByFilter(
					'memberships',
					'organization = {:org} && user = {:user}',
					{ org: orgId, user: e.auth.id }
				);
			} catch {
				throw new NotFoundError('Organization not found.');
			}
			if (!['owner', 'admin'].includes(membership.getString('role')))
				throw new ForbiddenError('Only Owners and Admins can set up leagues and seasons.');
			const organization = txApp.findRecordById('organizations', orgId);
			let capabilities = [];
			try {
				capabilities = JSON.parse(String(organization.get('capabilities') ?? '[]'));
			} catch {
				/* Invalid configuration grants no capability. */
			}
			if (!Array.isArray(capabilities) || !capabilities.includes('leagues-seasons'))
				throw new BadRequestError('The Leagues & seasons capability is not enabled.');
			const validated = validateLeagueSeasonSetup(body);
			if (!validated.ok) throw new BadRequestError(validated.message);
			const input = validated.value;
			let league;
			if (input.mode === 'existing') {
				try {
					league = txApp.findRecordById('leagues', input.leagueId);
				} catch {
					throw new BadRequestError('Choose an available league in this organization.');
				}
				if (league.getString('organization') !== orgId || league.getString('status') !== 'active')
					throw new BadRequestError('Choose an active league in this organization.');
			} else {
				league = new Record(txApp.findCollectionByNameOrId('leagues'));
				league.set('organization', orgId);
				league.set('name', input.leagueName);
				league.set('status', 'active');
				txApp.save(league);
			}
			const season = new Record(txApp.findCollectionByNameOrId('seasons'));
			season.set('organization', orgId);
			season.set('league', league.id);
			season.set('name', input.seasonName);
			season.set('status', 'planned');
			season.set('startsOn', input.startsOn ? input.startsOn + ' 00:00:00.000Z' : '');
			season.set('endsOn', input.endsOn ? input.endsOn + ' 00:00:00.000Z' : '');
			season.set('purseAmountCents', input.purseAmountCents);
			season.set('purseCurrency', input.purseCurrency);
			season.set('fantasyEnabled', false);
			txApp.save(season);
			result = {
				leagueId: league.id,
				leagueName: league.getString('name'),
				seasonId: season.id,
				seasonName: season.getString('name'),
				createdLeague: input.mode === 'new'
			};
		});
		return e.json(200, result);
	},
	$apis.requireAuth()
);
