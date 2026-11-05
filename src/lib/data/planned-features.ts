/**
 * Central capability progress source for FliHub, derived from Milestones.md
 * and docs/ROADMAP.md.
 *
 * The welcome page renders these cards so the team can see what works, what
 * is being built, and what is planned. Statuses are honest: a capability is
 * `complete` only after its user-visible workflow and access-control behavior
 * are verified end to end. No invented completion percentages.
 */

export type CapabilityStatus = 'planned' | 'in-progress' | 'ready-to-verify' | 'complete';

/** Narration readiness for a capability's walkthrough — tracked separately
 * from feature completion. */
export type NarrationStatus = 'not-started' | 'scripted' | 'recorded';

export interface Capability {
	title: string;
	description: string;
	/** Phase reference from Milestones.md, e.g. "Phase 1A". */
	milestone: string;
	status: CapabilityStatus;
	/** Short progress summary describing what is true today. */
	progress: string;
	/** Remaining or next work, when known. */
	next?: string;
	/** Link to the working feature inside the app (only when usable). */
	featureHref?: string;
	/** Walkthrough route; rendered as a link only when the video asset exists
	 * (see src/routes/+page.server.ts), otherwise "Walkthrough coming soon". */
	walkthroughHref?: string;
	narration?: NarrationStatus;
}

export const capabilities: Capability[] = [
	{
		title: 'Organizations, invitations & roles',
		description:
			'Multi-organization membership with invitation-based access and Owner, Admin, Scorekeeper, and Viewer roles. Creating an account grants no organization access.',
		milestone: 'Phase 1A',
		status: 'complete',
		progress:
			'Registration, email verification, and server-validated sessions; organization creation and switching; copy-link invitations with verified-recipient acceptance; Owner/Admin/Scorekeeper/Viewer enforcement with atomic ownership transfer and an audit trail. Merged in PR #2 and verified by 15 integration tests plus a 9-step browser flow. Narrated walkthrough video available.',
		next: 'Invitation email delivery (copy-link only today).',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1a',
		narration: 'recorded'
	},
	{
		title: 'Configurable onboarding',
		description:
			'Starter templates (League, Race/Event, Custom) with capability-aware navigation that never bypasses role permissions.',
		milestone: 'Phase 1B',
		status: 'planned',
		progress: 'Not started.',
		next: 'Organization onboarding templates and capability selection.'
	},
	{
		title: 'Athletes, teams, leagues & seasons',
		description:
			'Sport-neutral athlete records, season rosters, reserve pools, divisions, and event relationships.',
		milestone: 'Phases 1C–1F',
		status: 'planned',
		progress: 'Not started.'
	},
	{
		title: 'Disc golf demonstration event',
		description:
			'A two-round event on a nine-hole course with red/blue basket positions, six groups, and assigned scorekeepers.',
		milestone: 'Phase 1F',
		status: 'planned',
		progress: 'Not started.'
	},
	{
		title: 'Mobile scorekeeping',
		description:
			'Phone-friendly scoring with per-hole strokes and a Draft → Submitted workflow. Missing scores never become zero.',
		milestone: 'Phase 1G',
		status: 'planned',
		progress: 'Not started.',
		next: 'Scorekeeper event permissions arrive with this phase.'
	},
	{
		title: 'Official results & corrections',
		description:
			'Approval and publication with versioned corrections that preserve author, time, reason, and previous values.',
		milestone: 'Phase 1H',
		status: 'planned',
		progress: 'Not started.'
	},
	{
		title: 'Competition standings',
		description: 'Standings produced only from approved and published official results.',
		milestone: 'Phase 1I',
		status: 'planned',
		progress: 'Not started.'
	},
	{
		title: 'Fantasy league & snake draft',
		description:
			'A six-person fantasy league with per-event, eligibility-aware four-round snake drafts and a configurable pick timer.',
		milestone: 'Phases 2A–2B',
		status: 'planned',
		progress: 'Not started.'
	},
	{
		title: 'Fantasy scoring & explanations',
		description:
			'Versioned fantasy points from published results, with visible calculations and correction-safe reprocessing that never duplicates points.',
		milestone: 'Phase 2C',
		status: 'planned',
		progress: 'Not started.'
	},
	{
		title: 'Branded public pages',
		description:
			'Hosted public organization pages, followed later by website embeds and a read-only public API.',
		milestone: 'Phases 1I, 2E–2F',
		status: 'planned',
		progress: 'Not started.'
	}
];

export const capabilityStatusMeta: Record<CapabilityStatus, { label: string; badgeClass: string }> =
	{
		planned: {
			label: 'Planned',
			badgeClass: ''
		},
		'in-progress': {
			label: 'In progress',
			badgeClass: 'border-transparent bg-blue-600 text-white'
		},
		'ready-to-verify': {
			label: 'Ready to verify',
			badgeClass: 'border-transparent bg-amber-500 text-white'
		},
		complete: {
			label: 'Complete',
			badgeClass: 'border-transparent bg-green-600 text-white'
		}
	};
