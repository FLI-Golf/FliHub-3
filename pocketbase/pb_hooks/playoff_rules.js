function podiumTie(teams) {
	const ordered = [...teams].sort((a, b) => a.total - b.total);
	if (ordered.length < 2) return null;
	const start = ordered[0].total === ordered[1].total ? 0 : 1;
	const tied = ordered.slice(start).filter((team) => team.total === ordered[start].total);
	return tied.length >= 2 ? { place: start + 1, teams: tied } : null;
}

function measure(distance, unit) {
	const factors = { feet: 304800, meters: 1000000, yards: 914400 };
	if (!Object.prototype.hasOwnProperty.call(factors, unit) ||
		typeof distance !== 'string' || !/^\d{1,4}(?:\.\d{1,3})?$/.test(distance)) {
		throw new Error('Enter a distance with up to three decimal places and select a unit.');
	}
	const [whole, fraction = ''] = distance.split('.');
	return (Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))) * factors[unit];
}

function playoffBands(tie, attempts) {
	const last = attempts[attempts.length - 1];
	if (Array.isArray(last?.bands)) return last.bands;
	const entries = tie.teams.map((team) => team.entry);
	if (entries.length === 2 && entries.includes(last?.winner)) {
		return [[last.winner], entries.filter((entry) => entry !== last.winner)];
	}
	return [entries];
}

function measureAttempt(tie, athletes, entries, attempts = []) {
	const previousBands = playoffBands(tie, attempts);
	const pending = previousBands.filter((band) => band.length > 1).flat();
	if (!pending.length) throw new Error('The shootout is already resolved.');
	if (!Array.isArray(entries) || entries.length !== pending.length)
		throw new Error('Enter throws for every team that is still tied.');
	const teams = tie.teams.filter((team) => pending.includes(team.entry)).map((team) => {
		const roster = athletes.filter((athlete) => athlete.entry === team.entry);
		const input = entries.find((row) => row?.entry === team.entry);
		if (roster.length !== 2 || new Set(roster.map((row) => row.athlete)).size !== 2 ||
			!Array.isArray(input?.throws) || input.throws.length !== 2)
			throw new Error('Each tied team must have two published athletes and two throws.');
		const throws = roster.map((athlete) => {
			const row = input.throws.find((item) => item?.athlete === athlete.athlete);
			return { athlete: athlete.athlete, distance: row?.distance, unit: row?.unit,
				nanometers: measure(row?.distance, row?.unit) };
		});
		return { entry: team.entry, throws, nanometers: throws[0].nanometers + throws[1].nanometers };
	});
	const distance = new Map(teams.map((team) => [team.entry, team.nanometers]));
	const bands = previousBands.flatMap((band) => {
		if (band.length === 1) return [band];
		const byDistance = new Map();
		for (const entry of [...band].sort((a, b) => distance.get(a) - distance.get(b))) {
			const key = distance.get(entry);
			const tied = byDistance.get(key) ?? [];
			tied.push(entry);
			byDistance.set(key, tied);
		}
		return [...byDistance.values()];
	});
	return {
		place: tie.place,
		teams,
		bands,
		winner: bands.every((band) => band.length === 1) ? bands[0][0] : null
	};
}

module.exports = { podiumTie, playoffBands, measureAttempt };
