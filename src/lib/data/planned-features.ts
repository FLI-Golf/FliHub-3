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
	/** Multiple reviewed walkthroughs on one milestone card; each is asset-gated. */
	walkthroughs?: { href: string; label: string }[];
	narration?: NarrationStatus;
}

export const capabilities: Capability[] = [
	{
		title: 'Adaptable organization setup',
		description:
			'Next focus: plan setup around the activity, competition format, entry type, and result method.',
		milestone: 'Multi-event plan · next focus',
		status: 'planned',
		progress:
			'Existing account activities, organization templates, and shared capabilities provide the starting point. The next step is to review those foundations and agree on the first additional workflow before implementation.',
		next: 'Keep golf working while designing clearer choices for sports, races, shows, and other competitions.'
	},
	{
		title: 'Multiple sports and judged events',
		description:
			'Planned support for golf, bowling, pickleball, baseball, basketball, archery, races, dog shows, car shows, and pageants.',
		milestone: 'Multi-event plan · future workflows',
		status: 'planned',
		progress:
			'The plan separates people and teams from entries such as animals, vehicles, and exhibits. Timing, match results, measurements, judging, voting, and awards each need their own validated rules. These workflows are not implemented by selecting an existing template.',
		next: 'Choose one additional activity and deliver its complete entry-to-published-result workflow first.'
	},
	{
		title: 'Fantasy expansion',
		description:
			'Season-wide totals, live provisional scores, and fantasy rules for additional activities.',
		milestone: 'Future fantasy increments',
		status: 'planned',
		progress:
			'Published event fantasy standings already work for the current golf workflow. Season aggregation, live provisional scoring, and audited post-lock roster corrections remain future work. Other activities will need explicit fantasy policies.',
		next: 'Agree on scope and scoring rules before adding new fantasy formats.'
	},
	{
		title: 'Embeds and public API',
		description: 'Share published results on other websites and through a read-only API.',
		milestone: 'Phases 2E–2F',
		status: 'planned',
		progress:
			'Hosted public organization pages are available today. Website embeds and the public API remain planned and must preserve the existing publication and privacy rules.',
		next: 'Extend the shared publication rules when these delivery formats are implemented.'
	},
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
		title: 'Organization templates & capabilities',
		description:
			'Starter templates (League, Race/Event, Custom) with capability-aware navigation that never bypasses role permissions.',
		milestone: 'Phase 1B',
		status: 'complete',
		progress:
			'League, Race/Event, and Custom starter templates with editable capability suggestions; a single shared capability catalog (browser and hooks read the same JSON); validated, audited configuration writes by Owners/Admins; race distances with explicit units; capability-aware navigation with honest planned/upcoming states. Implemented and merged in PR #4. Narrated walkthrough video available.',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1b',
		narration: 'recorded'
	},
	{
		title: 'Account activities & fan fantasy entry',
		description:
			'Choose Play fantasy, manage an organization, or join through an invitation. Fans can create a fantasy league without organization staff membership.',
		milestone: 'Account onboarding · PR #27',
		status: 'complete',
		progress:
			'Merged in PR #27: account activity selection, published-organization entry, sports league and eligible-season selection, and season-linked fantasy league creation. Owners/Admins explicitly allow new fantasy leagues for a season. Fantasy membership remains separate from organization staff roles. Jim created a league through this flow; Bob’s organization controls and Morgan’s scorekeeper access remained available.',
		next: 'Durable activity preferences and broader invitation-through-signup verification remain follow-up work.',
		featureHref: '/account'
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
			'Courses with numbered/named holes and labeled positions with explicit units; ordered course-backed rounds; event groups with team and athlete assignments; and per-group scorekeeper assignments. Eligible athletes come from season rosters plus designated event substitutions. Mobile scoring now enforces score-entry permissions; group assignment alone does not grant a Viewer scoring access. Single-round and two-round event formats are supported. Venue records remain planned. The Phase 1F foundation was merged in PR #14 with its integration and browser walkthrough verification; narrated setup walkthrough available.',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1f',
		narration: 'recorded'
	},
	{
		title: 'Disc golf demonstration event',
		description:
			'A two-round event on a nine-hole course with red/blue basket positions, six groups, and assigned scorekeepers.',
		milestone: 'Phase 1F',
		status: 'complete',
		progress:
			'Verified end to end (2026-11-07, tests/e2e/demo-sixgroup.spec.mjs on a disposable stack): the exact Phase 1F demo fixture — one course with nine par-3 hole records (red/blue positions within 220–425 ft, hole 8 keeping its placeholder demo name), a Red round, an intermission, and a Blue round replaying the same nine holes, 12 teams of one male and one female rostered athlete, separate reserve pools, and six groups of two teams with an assigned scorekeeper — scored by the scorekeeper and taken through submission, official approval, and publication. All 12 scorecards (6 groups × 2 rounds) submitted; all 24 athletes have exactly 9 scores in each nine-hole round (432 scores); every published per-athlete, per-round, and per-team total matches the submitted strokes; and a signed-out browser sees the published result and season standings reflecting the event exactly once with matching totals and shared ranks on equal totals.',
		next: 'Membership, the 24-pick draft, and event fantasy standings are now verified. Correction replacement and roster locks pass integration testing. A consolidated narrated walkthrough of the complete flow remains Phase 2D work.',
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
		status: 'complete',
		progress:
			'Phone-first scorecard resolved from the Phase 1F setup: event, rounds with hole counts derived from their course (the FLI demo shows Round 1 · 9 holes · Red, an intermission, Round 2 · 9 holes · Blue — the second pass displays 10–18 while scores stay keyed by round and physical hole), groups, teams, and athletes. Per-athlete integer strokes with draft save/resume; missing scores are visible, block submission, and are never stored as zero; every change is logged with its author; Submitted locks against silent overwrites with Owner/Admin-only reopen requiring a recorded reason; once scoring starts, a group\u2019s athlete lineup is fixed. Entry requires the Scorekeeper role plus a group assignment in the event (event-wide, per the agreed cross-group rule) — Viewers stay read-only even when listed as a group\u2019s scorekeeper. Merged in PR #17 and verified by 5 integration tests and a 21-assertion phone browser flow. Narrated walkthrough video available.',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1g',
		narration: 'recorded'
	},
	{
		title: 'Official results & corrections',
		description:
			'Approval and publication with versioned corrections that preserve author, time, reason, and previous values.',
		milestone: 'Phase 1H',
		status: 'complete',
		progress:
			'Owners/Admins approve only submitted event scorecards. Approval and reapproval now revalidate required scoring cells and snapshot individual strokes with the corresponding hole pars; missing data never becomes zero. Published versions remain authoritative until a reviewed correction is republished. Previous versions, reasons, authors, and timestamps are preserved, and client writes to version/audit records remain blocked. The Phase 1H foundation was merged in PR #20. Merged through PR #28, the real demo was reapproved and published as v2 with 24 complete athlete snapshots across two nine-hole, par-27 rounds. Event fantasy standings now consume that published version.',
		next: 'The playoff shootout remains documentation-only. Legacy snapshots without saved par require a reviewed new result version for fantasy scoring.',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1h',
		narration: 'recorded'
	},
	{
		title: 'Competition standings',
		description: 'Standings produced only from approved and published official results.',
		milestone: 'Phase 1I',
		status: 'complete',
		progress:
			'Merged in PR #22 (D17): seasons sum total strokes across events with a currently published official result — lowest total leads; a team or athlete is ranked only with a result in every counted event (incomplete participation shows Unranked with its strokes and an event count such as 1 of 2 — missing results never add strokes); equal totals among ranked rows share a position, and scores display relative to par. Pending corrected versions never count; a republished correction replaces the previous contribution exactly once. Members see standings on the Standings capability page; the public page shows them for per-record published events only. Verified by 6 integration tests (78/78 full suite) plus a signed-out browser flow. Narrated walkthrough video available.',
		next: 'Use saved historical par in competition/public relative-to-par displays; those displays currently read course configuration. Event fantasy standings already use saved result pars.',
		featureHref: '/organizations',
		walkthroughHref: '/walkthroughs/phase1i',
		narration: 'recorded'
	},
	{
		title: 'Fantasy league & snake draft',
		description:
			'Private fantasy leagues with configurable participant limits and per-event four-round snake drafts. The six-person demo drafts 24 athletes.',
		milestone: 'Phases 2A–2B',
		status: 'complete',
		progress:
			'Fantasy membership and draft work is merged through PR #27. Invitations follow accept/approve permissions independently of organization staff roles. Each event has a saved randomized first-round order and a four-round snake draft, with server-owned turns, 7/15/30-second clocks, manual picks, and eligible timeout auto-picks. The mobile draft includes compact rosters, tappable athlete selections, separate Quick find results, and commissioner Pause/Resume. Jim’s six-participant draft completed with 24 unique athletes and two MPO plus two FPO per roster. The merged scoring implementation enforces activation/publication roster locks, preserves designated-substitute history, and blocks destructive demo resets after the lock. Existing narrated league/draft walkthroughs cover their recorded scope.',
		next: 'Production auto-pick rankings and equal-rank ordering remain open. Post-lock roster corrections require a separate audited workflow.',
		featureHref: '/account',
		walkthroughs: [
			{
				href: '/walkthroughs/phase2ab-setup',
				label: 'Watch League Setup & Draft Prep'
			},
			{
				href: '/walkthroughs/phase2ab-live',
				label: 'Watch Live Draft & Roster Rules'
			}
		]
	},
	{
		title: 'Event fantasy scoring & explanations',
		description:
			'Golf fantasy scores from published results: strokes minus saved par, with four-athlete explanations. Lowest complete score wins.',
		milestone: 'Phase 2C · event scoring',
		status: 'complete',
		progress:
			'Merged in PR #28 and available in the deployed application. Published result snapshots preserve strokes and corresponding pars. Event standings sum four effective roster athletes across every required round, retain negative/positive golf signs, display even par as E, share equal ranks, and leave incomplete rosters unranked. An approved but unpublished correction does not replace the official result; republication replaces the contribution without duplicating scores. Approved fantasy participants can read their league without staff access. Roster locks preserve participant and athlete mappings, and block late substitutions and demo resets. The 90-test integration suite passed, including real publication, permissions, course edits, and correction replacement. Jim’s live six-participant standings were verified against published demo v2; all roster totals reconcile to the official athlete scores.',
		next: 'Season-wide fantasy aggregation, live provisional scores, audited post-lock roster corrections, and a narrated scoring walkthrough remain pending.',
		featureHref: '/account'
	},
	{
		title: 'Branded public pages',
		description:
			'Hosted public organization pages, followed later by website embeds and a read-only public API.',
		milestone: 'Phases 1I, 2E–2F',
		status: 'complete',
		progress:
			'The hosted page is merged (PR #22): a unique reserved slug at /o/<slug>, organization branding (name, tagline, logo URL, theme colors), capability-gated sections, and explicit per-record publication enforced by a single shared publication-rule layer — unpublished pages are hidden 404s, private athlete contact data is never readable publicly, and corrected results carry a dated Corrected badge. Website embeds (2E) and the read-only public API (2F) will reuse the same rules verbatim and remain planned. Narrated walkthrough video available.',
		next: 'Embeds and the public API reuse the Phase 1I publication rules (Phases 2E–2F).',
		walkthroughHref: '/walkthroughs/phase1i',
		walkthroughLabel: 'Watch walkthrough (shared with Competition standings)',
		narration: 'recorded'
	}
];

export const capabilityStatusMeta: Record<CapabilityStatus, { label: string; badgeClass: string }> =
	{
		planned: {
			label: 'Planned',
			badgeClass: 'border-transparent bg-blue-600 text-white'
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
