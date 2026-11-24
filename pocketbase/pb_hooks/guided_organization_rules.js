/** Validated mapping only; no writes and no fallback for unsupported wizard answers. */
function guidedOrganizationPlan(setup, catalog) {
	if (!setup || typeof setup !== 'object' || Array.isArray(setup)) return null;
	const charity = {
		version: 1,
		activity: 'charity-run-walk',
		format: 'single',
		competitors: 'individual',
		result: 'participation'
	};

	if (
		Object.keys(setup).length === Object.keys(charity).length &&
		Object.keys(charity).every((key) => setup[key] === charity[key])
	) {
		if (!catalog.templates.some((item) => item.id === 'race-event')) return null;

		return {
			template: 'race-event',
			profile: 'charity-run-walk',
			capabilities: [],
			raceDistances: [{ key: '5k', label: '5K', distance: 5, unit: 'km' }]
		};
	}

	const expected = {
		version: 1,
		activity: 'disc-golf',
		format: 'league',
		competitors: 'team',
		result: 'strokes'
	};
	if (Object.keys(setup).length !== Object.keys(expected).length) return null;
	if (!Object.keys(expected).every((key) => setup[key] === expected[key])) return null;
	const capabilities = [
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'events',
		'scoring-results',
		'standings'
	];
	if (!catalog.templates.some((item) => item.id === 'league')) return null;
	if (
		!capabilities.every((id) =>
			catalog.capabilities.some((item) => item.id === id && item.availability === 'available')
		)
	)
		return null;
	return { template: 'league', capabilities, raceDistances: [] };
}
module.exports = { guidedOrganizationPlan };
