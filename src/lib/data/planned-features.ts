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
	/** Optional link text override — e.g. when a card reuses another phase's
	 * video and viewers should know what it covers. */
	walkthroughLabel?: string;
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
		title: 'Season rosters & reserve pools',
		description:
			'Season rosters attached to team entries, separate reserve pools, and append-only event substitutions that never rewrite participation history.',
		milestone: 'Phase 1E',
		status: 'complete',
		progress:
			'Season rosters attached to team entries (one active spot per athlete per season, enforced down to concurrent writes, history preserved through archive), reserve pools with optional gender restriction (pilot configuration) structurally excluded from scheduling, and append-only substitutions that leave rosters intact — managed from the Teams & rosters page. Merged in PR #11 and verified by 11 integration tests, migration upgrade rehearsals, and a 17-assertion browser flow. Narrated walkthrough video available.',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1e',
		narration: 'recorded'
	},
	{
		title: 'Event operations',
		description:
			'Course layouts with holes and labeled positions, ordered event rounds, groups with team and athlete assignments, and per-group scorekeepers.',
		milestone: 'Phase 1F',
		status: 'complete',
		progress:
			'Courses with numbered/named holes and labeled positions (explicit units; venue records remain planned), ordered rounds whose named position must cover every active hole of its course (blank stays valid for planning; the chooser shows incomplete labels with their missing holes), event groups with one scorekeeper each (any member — score-entry permissions arrive in 1G), and group team/athlete assignments resolved from Phase 1E season rosters plus event-scoped substitutions: a reserve is assignable only for the event where the substitution applies, and assignments never change the season roster. Single-round events work with no intermission; the two-round demo format is verified separately. Merged in PR #14 and verified by 9 integration tests plus two browser flows (19 + 21 assertions). Demo counts are pilot configuration. Narrated walkthrough video available.',
		next: 'Mobile scorekeeping — score entry and submission (Phase 1G).',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1f',
		narration: 'recorded'
	},
	{
		title: 'Disc golf demonstration event',
		description:
			'A two-round event on a nine-hole course with red/blue basket positions, six groups, and assigned scorekeepers.',
		milestone: 'Phase 1F',
		status: 'in-progress',
		progress:
			'Phase 1F demo setup is verified end to end and merged (PR #14): one course with nine physical hole records (par 3, red/blue positions within 220–425 ft, hole 8 named with demo placeholder content until final content is decided), a Red round, an intermission, and a Blue round replaying the same nine holes — 18 holes of play — plus six groups of two teams and four athletes with a scorekeeper assigned to each. Phase 1G added the phone scoring view that identifies the round, group, teams, and athletes (merged in PR #17). Official results remain Phase 1H.',
		next: 'Mobile scorekeeping for the two rounds (Phase 1G).',
		// Reuses the approved Phase 1F recording — it covers the event SETUP
		// (course, rounds, groups), not scoring; the label says so.
		walkthroughHref: '/walkthroughs/phase1f',
		walkthroughLabel: 'Watch event setup walkthrough (Phase 1F)'
	},
	{
		title: 'Mobile scorekeeping',
		description:
			'Phone-friendly scoring with per-hole strokes and a Draft → Submitted workflow. Missing scores never become zero.',
		milestone: 'Phase 1G',
		status: 'in-progress',
		progress:
			'Phone-first scorecard resolved from the Phase 1F setup: event, rounds with hole counts derived from their course (the FLI demo shows Round 1 · 9 holes · Red, an intermission, Round 2 · 9 holes · Blue — the second pass displays 10–18 while scores stay keyed by round and physical hole), groups, teams, and athletes. Per-athlete integer strokes with draft save/resume; missing scores are visible, block submission, and are never stored as zero; every change is logged with its author; Submitted locks against silent overwrites with Owner/Admin-only reopen requiring a recorded reason; once scoring starts, a group\u2019s athlete lineup is fixed. Entry requires the Scorekeeper role plus a group assignment in the event (event-wide, per the agreed cross-group rule) — Viewers stay read-only even when listed as a group\u2019s scorekeeper. Merged in PR #17 and verified by 5 integration tests and a 21-assertion phone browser flow. Narrated walkthrough video available.',
		next: 'Official approval, publication, and corrections (Phase 1H).',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1g',
		narration: 'recorded'
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
