// Fan discovery reuses publication boundaries without exposing collection reads.
function eligible(app, seasonId) {
	const season = app.findRecordById('seasons', seasonId);
	const league = app.findRecordById('leagues', season.getString('league'));
	const org = app.findRecordById('organizations', season.getString('organization'));
	let caps = [];
	try {
		caps = JSON.parse(String(org.get('capabilities') ?? '[]'));
	} catch (_) {
		/* closed */
	}
	if (
		!season.getBool('fantasyEnabled') ||
		!['planned', 'active'].includes(season.getString('status')) ||
		league.getString('status') !== 'active' ||
		league.getString('organization') !== org.id ||
		!org.getBool('publicPublished') ||
		!org.getString('publicSlug') ||
		!Array.isArray(caps) ||
		!caps.includes('fantasy')
	) {
		throw new Error('This season is not available for new fantasy leagues.');
	}
	return { season, league, org };
}
module.exports = { eligible };
