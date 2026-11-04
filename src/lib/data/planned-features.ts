/**
 * Planned capabilities for FliHub, derived from Milestones.md.
 *
 * Everything listed here is planned work — none of it is implemented yet.
 * The welcome page renders this list so visitors see an honest picture of
 * the project's current state.
 */
export interface PlannedFeature {
	title: string;
	description: string;
	/** Phase reference from Milestones.md, e.g. "Phase 1A". */
	milestone: string;
}

export const plannedFeatures: PlannedFeature[] = [
	{
		title: 'Organizations, invitations & roles',
		description:
			'Multi-organization membership with invitation-based access and Owner, Admin, Scorekeeper, and Viewer roles. Creating an account grants no organization access.',
		milestone: 'Phase 1A'
	},
	{
		title: 'Configurable onboarding',
		description:
			'Starter templates (League, Race/Event, Custom) with capability-aware navigation that never bypasses role permissions.',
		milestone: 'Phase 1B'
	},
	{
		title: 'Athletes, teams, leagues & seasons',
		description:
			'Sport-neutral athlete records, season rosters, reserve pools, divisions, and event relationships.',
		milestone: 'Phases 1C–1F'
	},
	{
		title: 'Disc golf demonstration event',
		description:
			'A two-round event on a nine-hole course with red/blue basket positions, six groups, and assigned scorekeepers.',
		milestone: 'Phase 1F'
	},
	{
		title: 'Mobile scorekeeping',
		description:
			'Phone-friendly scoring with per-hole strokes and a Draft → Submitted workflow. Missing scores never become zero.',
		milestone: 'Phase 1G'
	},
	{
		title: 'Official results & corrections',
		description:
			'Approval and publication with versioned corrections that preserve author, time, reason, and previous values.',
		milestone: 'Phase 1H'
	},
	{
		title: 'Competition standings',
		description: 'Standings produced only from approved and published official results.',
		milestone: 'Phase 1I'
	},
	{
		title: 'Fantasy league & snake draft',
		description:
			'A six-person fantasy league with per-event, eligibility-aware four-round snake drafts and a configurable pick timer.',
		milestone: 'Phases 2A–2B'
	},
	{
		title: 'Fantasy scoring & explanations',
		description:
			'Versioned fantasy points from published results, with visible calculations and correction-safe reprocessing that never duplicates points.',
		milestone: 'Phase 2C'
	},
	{
		title: 'Branded public pages',
		description:
			'Hosted public organization pages, followed later by website embeds and a read-only public API.',
		milestone: 'Phases 1I, 2E–2F'
	}
];
