/** Validated mapping only; no writes and no fallback for unsupported wizard answers. */
function guidedOrganizationPlan(setup, catalog) {
	if (!setup || typeof setup !== 'object' || Array.isArray(setup)) return null;
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
