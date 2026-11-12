routerAdd(
	'GET',
	'/api/flihub/fantasy/available-seasons',
	(e) => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase JSVM requires CommonJS.
		const rules = require(`${__hooks}/fantasy_discovery_rules.js`);
		const seasons = e.app.findRecordsByFilter(
			'seasons',
			"fantasyEnabled = true && (status = 'planned' || status = 'active')",
			'name',
			2000,
			0
		);
		const rows = [];
		for (const record of seasons) {
			let value;
			try {
				value = rules.eligible(e.app, record.id);
			} catch (_) {
				continue;
			}
			rows.push({
				id: value.season.id,
				name: value.season.getString('name'),
				startsOn: value.season.getString('startsOn').slice(0, 10),
				endsOn: value.season.getString('endsOn').slice(0, 10),
				sportsLeague: value.league.id,
				sportsLeagueName: value.league.getString('name'),
				organizationSlug: value.org.getString('publicSlug'),
				organization: value.org.id,
				organizationName: value.org.getString('name')
			});
		}
		return e.json(200, { seasons: rows });
	},
	$apis.requireAuth()
);
