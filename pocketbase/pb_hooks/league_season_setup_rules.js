/** Input rules for the combined workflow. No writes or permission assumptions. */
function validateLeagueSeasonSetup(body) {
	const invalid = (message) => ({ ok: false, message });
	if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Invalid setup.');
	if (!['new', 'existing'].includes(body.mode)) return invalid('Choose a new or existing league.');
	for (const key of ['leagueName', 'leagueId', 'seasonName', 'startsOn', 'endsOn', 'purseAmount']) {
		if (body[key] !== undefined && typeof body[key] !== 'string')
			return invalid('Setup fields must be text values.');
	}
	const read = (key) => (typeof body[key] === 'string' ? body[key].trim() : '');
	const mode = body.mode;
	const leagueName = read('leagueName');
	const leagueId = read('leagueId');
	const seasonName = read('seasonName');
	if (mode === 'new' && (leagueName.length < 3 || leagueName.length > 120))
		return invalid('League names need 3–120 characters.');
	if (mode === 'existing' && !/^[a-z0-9]{15}$/.test(leagueId))
		return invalid('Choose an existing league.');
	if (!seasonName || seasonName.length > 120) return invalid('Season names need 1–120 characters.');
	const startsOn = read('startsOn');
	const endsOn = read('endsOn');
	for (const date of [startsOn, endsOn]) {
		if (!date) continue;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid('Enter valid season dates.');
		const parsed = new Date(date + 'T00:00:00.000Z');
		if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
			return invalid('Enter valid season dates.');
	}
	if (startsOn && endsOn && startsOn > endsOn)
		return invalid('The season start must be on or before its end.');
	const purse = read('purseAmount');
	let purseAmountCents = 0;
	if (purse) {
		if (purse.length > 32 || !/^\d+(?:\.\d{1,2})?$/.test(purse))
			return invalid('Enter a nonnegative USD purse with up to two decimals, without commas.');
		const parts = purse.split('.');
		purseAmountCents = Number(parts[0] + (parts[1] || '').padEnd(2, '0'));
		if (!Number.isSafeInteger(purseAmountCents)) return invalid('The purse amount is too large.');
	}
	return {
		ok: true,
		value: {
			mode,
			leagueName,
			leagueId,
			seasonName,
			startsOn,
			endsOn,
			purseAmountCents,
			purseCurrency: purse ? 'USD' : ''
		}
	};
}
module.exports = { validateLeagueSeasonSetup };
