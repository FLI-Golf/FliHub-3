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
		status: 'complete',
		progress:
			'League, Race/Event, and Custom starter templates with editable capability suggestions; a single shared capability catalog (browser and hooks read the same JSON); validated, audited configuration writes by Owners/Admins; race distances with explicit units; capability-aware navigation with honest planned/upcoming states. Implemented and merged in PR #4. Narrated walkthrough video available.',
		next: 'Capability workflows land in later phases (1C+).',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1b',
		narration: 'recorded'
	},
	{
		title: 'Athlete identity',
		description:
			'Sport-neutral athlete records with organization-scoped identity, CSV import, and role-based management. Athletes are records, not accounts.',
		milestone: 'Phase 1C',
		status: 'complete',
		progress:
			'Create, edit, archive/restore, and CSV-import sport-neutral athletes from the organization navigation (Athletes capability). Private contact and eligibility fields (email, phone, eligibility notes) are managed and visible only to Owners/Admins; Scorekeepers/Viewers receive identity only. Direct API writes are capability-gated; disabling preserves records. Merged in PR #6; PR #7 prevents cross-organization reassignment of athlete records. Narrated walkthrough video available.',
		next: 'Identity matching rules for duplicate imports (open product decision); cross-organization athlete participation.',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1c',
		narration: 'recorded'
	},
	{
		title: 'Competition structure',
		description:
			'Leagues, seasons, divisions, team entries, and events with organization-scoped relationships. Teams enter seasons directly; events belong to one season or run independently.',
		milestone: 'Phase 1D',
		status: 'complete',
		progress:
			'Leagues, seasons (optional schedule dates), divisions, direct season team entries with an optional division assignment, and independent or season-linked events — managed from the organization navigation. Owner/Admin manage; Scorekeeper/Viewer read-only; capability-gated writes; cross-organization links and record reassignment rejected; duplicate season entries prevented; parent links immutable; archive/restore only. Merged in PR #9 and verified by 10 integration tests plus a browser acceptance flow. Narrated walkthrough video available.',
		next: 'Season rosters and reserve pools (Phase 1E); venues/courses, rounds, and group assignments (Phase 1F).',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1d',
		narration: 'recorded'
	},
	{
		title: 'Season rosters & event operations',
		description:
			'Season rosters, reserve pools, substitutions, venues/courses, rounds, and group assignments.',
		milestone: 'Phases 1E–1F',
		status: 'planned',
		progress: 'Not started.',
		next: 'Season rosters and reserve pools (Phase 1E).'
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
