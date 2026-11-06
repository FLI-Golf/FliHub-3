# FliHub Milestones

**Planning status:** Discovery and milestone planning only. This document does not authorize feature implementation, database migrations, deployment, pricing, or a fixed delivery schedule.

**Last reviewed:** 2026-11-04

## 1. Product purpose and prototype boundary

FliHub is intended to become a configurable sports and organization operating system with a connected fantasy product.

Organizations may operate leagues, races, events, programs, and multiple sports. During onboarding, an organization selects starter capabilities and may adjust them later. FliHub is the authoritative source for official competition results. Fantasy consumes approved and published results and applies versioned fantasy scoring rules.

The immediate prototype boundary is one complete, demonstrable disc golf workflow:

1. A user creates an organization and invites another user.
2. The organization assigns roles and keeps private data isolated.
3. Athletes, teams, season rosters, venues, courses, and events are configured.
4. A two-round disc golf event is scored on a nine-hole course.
5. Scorekeepers submit scores and owners or administrators approve and publish results.
6. Competition standings are produced from official results.
7. A six-person fantasy league completes an event draft.
8. Fantasy standings use the approved results and explain their calculations.
9. A corrected official result updates competition and fantasy standings with visible history and no duplicate points.

Broader sports, race formats, registration, sponsorship sales, expenses, reimbursements, youth workflows, payments, prizes, media, training, credentials, advanced automation, and external integrations remain separately scoped roadmap work unless explicitly approved.

## 2. Planning principles

- Preserve the current screens and demo data while expanding the product incrementally.
- Treat the database as authoritative for organization isolation, roles, result status, audit history, and versioning.
- Do not make disc golf's one-male/one-female team pairing a universal team model.
- Keep organization staff permissions separate from fantasy membership and commissioner permissions.
- Treat approved and published competition results as the only input to fantasy scoring.
- Never silently turn missing scores into zero.
- Preserve the history of corrections, including the author, time, reason, previous value, and new value.
- Keep proposed defaults clearly labeled until management and competition leads approve them.
- Do not invent pricing, prize obligations, integrations, playoff rules, or release dates.
- Mark a capability complete only after its user-visible workflow and access-control behavior are verified end to end.

## 3. Verified current-state inventory

This section records what was inspected in the current project. A database table is not treated as a completed workflow merely because it exists.

### 3.1 Current application foundation

Verified in the current project:

- React and TypeScript web application with Supabase client integration.
- Email/password authentication screen and signed-in application shell.
- Organization list, organization creation, organization opening, and organization deletion.
- Organization workspace navigation with Venues & courses, Players, Teams, and Leagues & seasons sections.
- Organization access currently follows the signed-in user who owns the organization.
- The project includes a demo-data loader for example players and teams.
- The current shell does not yet expose event, scoring, fantasy, membership, roles, public results, standings, or a system map screen.

Relevant current code references:

- `src/App.tsx` — authentication gate, application shell, organization switching.
- `src/hooks/useAuth.ts` — current session state handling.
- `src/components/organizations/OrganizationsPage.tsx` — organization list and creation flow.
- `src/components/organizations/OrganizationShell.tsx` — current organization sections.
- `src/lib/organizations.ts` — organization reads, creation, and deletion.
- `src/lib/demoSeed.ts` and `src/lib/demoData.ts` — demo roster and team data.

### 3.2 Current database tables

The live database and applied migrations currently contain these relevant records:

- `organizations` — organization name, sport, and owner user ID.
- `venues` — organization-owned physical locations.
- `courses` — organization-owned courses attached to venues.
- `holes` — course holes with par, distance, and optional name.
- `players` — organization-owned roster people with gender, division, profile, and nationality fields.
- `teams` — organization-owned teams with optional branding, reserve flag, and current player references.
- `leagues` — organization-owned leagues.
- `seasons` — seasons attached to leagues.
- `events` — events attached to courses.
- `event_rounds` — rounds attached to events.
- `event_groups` — groups attached to rounds.
- `event_group_teams` — team assignments to groups.
- `event_scores` — player strokes by hole within an event group.

The current database does not yet contain the structures required for:

- Organization memberships or invitations.
- Organization roles beyond the single owner field.
- Season rosters or historical team participation.
- Divisions.
- Substitution records.
- Scorekeeper assignments.
- Score submission or approval states.
- Published official result records.
- Result versions, correction reasons, or audit history.
- Competition standings.
- Fantasy leagues, participants, drafts, picks, rosters, scoring rules, points, or standings.
- Public/private publication controls.
- Sponsorships, expenses, reimbursements, or receipts.

### 3.3 Current relationships and workflow limits

The existing relationships are approximately:

```text
Organization
├── Venues
│   └── Courses
│       └── Holes
├── Players
├── Teams
│   ├── Men's player reference
│   └── Women's player reference
├── Leagues
│   └── Seasons
└── Events
    └── Event rounds
        └── Event groups
            ├── Team assignments
            └── Player scores by hole
```

The current schema intentionally repeats `organization_id` on child records and uses same-organization foreign-key relationships. Current row-level policies check that the signed-in user owns the attached organization. There is no membership-based access yet.

The current database supports event groups and raw scores, but there is no end-to-end screen or official-results lifecycle. Events are not yet attached to seasons or leagues. Teams are not yet assigned to seasons or divisions. The current player/team model is disc-golf-specific and must not become the shared model for other sports.

### 3.4 Supplied reference review

The supplied GitHub repository was accessible at the provided URL. Its README describes a broader TypeScript monorepo with web, API, core, league, business, fantasy, persistence, and workflow areas. It describes the project as a domain-first prototype moving toward persisted, authenticated, organization-scoped workflows.

The supplied live example at `https://fli2.netlify.app/` could not be fetched through the available reference tool. No behavior from that site is assumed in this plan.

The closest-to-the-basket playoff workflow was not verified from the supplied repository or live example through the available reference access. The local project also contains no verified playoff screen or playoff table. The playoff remains an open design item; this plan does not assume who throws, measurement units or precision, equal-distance handling, or whether a playoff affects fantasy ties.

## 4. Agreed decisions, proposed defaults, and unresolved questions

### 4.1 Agreed product and organization decisions

The following decisions are treated as the working direction for milestone planning:

- An organization represents a business, club, or operator managing multiple leagues, sports, and events.
- Users may belong to multiple organizations.
- Organizations need an organization switcher and private data isolation.
- Each organization has one primary owner and may have multiple administrators.
- Initial organization roles are Owner, Admin, Scorekeeper, and Viewer.
- Owners manage ownership and administrators.
- Admins manage competitions and approve results.
- Scorekeepers enter and submit scores.
- Viewers have read access.
- Membership is invitation-based. Creating an account alone grants no organization access.
- Published schedules, teams, athlete display profiles, standings, and results may be public.
- Contact details and operational information remain private.
- Onboarding offers League, Race/Event, and Custom starter templates.
- Templates suggest capabilities that an organization can adjust and add later.
- Navigation reflects enabled capabilities.
- Enabling a capability must not bypass role permissions.
- Athletes can be imported or created without accounts, with optional account linking later.
- Athletes may participate across organizations and teams; each organization controls its own registration and eligibility.
- Rosters are assigned by season so historical participation is preserved.
- Organizations operate leagues; leagues contain seasons; seasons may contain divisions.
- Teams enter a season or division.
- Events may belong to seasons or operate independently under an organization.
- Shared models must support multiple sports; roster and scoring rules are sport/format-specific.
- Sponsorships and reimbursements are future capabilities and must be labeled as upcoming wherever shown.

### 4.2 Disc golf demonstration decisions

- Twelve competing teams participate.
- Each competing team contains one male and one female athlete for the demonstration only.
- Male and female reserve pools are separate and retain existing branding where available.
- Reserve pools are excluded from ordinary competition scheduling.
- Substitutions must record who replaced whom and for which event.
- Existing CSV-derived branding, logos, player photos, and flags should be reused where available.
- Each event has six groups.
- Each group contains two teams and four athletes.
- The demonstration uses one nine-hole course.
- Every hole is initially par 3.
- Hole distances are configured within the requested 220–425-foot range.
- Each hole has a number and name.
- The adult-themed hole-eight naming requirement remains a content detail to confirm before publication.
- Round one uses red basket positions.
- After intermission, the same nine holes use blue basket positions.
- Distances may differ by basket position.
- FLI demo setup note (2026-11-06): the second pass reuses physical holes 1–9
  (displayed as 10–18 on a future scorecard). Red and Blue distances may be
  equal when a basket moves laterally, and a typical FLI setup may differ by
  only 10–12 ft. This is setup guidance, not a limit; scorecard
  implementation is Phase 1G.

### 4.3 Scoring and official-results decisions

- One scorekeeper is assigned to each group.
- Scorekeeping must work on phones.
- Authorized scorekeepers may enter and submit scores across all groups in their assigned event, not only their own assigned group.
- Every score change records its author.
- Individual strokes are stored by hole.
- Demo team score is the sum of both athletes' strokes; lower score wins.
- Result lifecycle is Draft → Submitted → Approved → Published.
- Scorekeepers enter and submit scores.
- Owners and Admins review and approve results.
- Only approved and published results feed fantasy.
- Approved scores are protected from ordinary edits.
- Owners and Admins may reopen results with a required correction reason.
- Previous values and result versions are preserved with who changed what and when.
- Corrections require reapproval before competition and fantasy standings update.
- Reprocessing must not duplicate results or fantasy points.
- Missing scores are never treated as zero and block final approval until resolved.
- Clearly labeled demo controls may generate sample scores and demonstrate corrections.

### 4.4 Fantasy prototype decisions

- The initial fantasy league has one owner plus five approved participants, six total.
- The participant limit is configurable rather than permanently fixed at six.
- Fantasy membership and commissioner permissions are separate from organization staff permissions.
- The fantasy prototype supports invitations, approval, and a participant room.
- A separate draft is prepared for each selected event after six participants are approved.
- Each event stores its own independently randomized draft order.
- Draft format is a four-round snake draft.
- The demo athlete pool contains 24 active competing athletes.
- An athlete can be drafted only once within that event's fantasy league.
- Each participant finishes with two male and two female athletes.
- Rounds one and two allow any available athlete.
- From round three, displayed, saved, and automatic choices must preserve the ability to finish with two males and two females.
- Round four offers only the gender needed to complete the roster.
- Owners can schedule, reschedule, and manually start drafts within an allowed window.
- Scheduled time coordinates attendance and notifications; it does not automatically start the draft.
- Pick timer defaults to 60 seconds and is configurable.
- Timeout selections use saved participant preferences or an explicitly labeled demo ranking while respecting eligibility.
- Completed draft results are displayed.
- Completed fantasy rosters lock when the event starts.
- Trades and waivers are deferred.
- Fantasy points per athlete equal par minus strokes across both regulation nine-hole rounds of the event.
- A fantasy roster total is the sum of its four athletes' points; higher totals win.
- Standings show the approved underlying result, scoring-rule version, and point calculation.
- Corrected official results update fantasy standings without duplicate points.
- Shared fantasy rankings are acceptable for the initial prototype: tied positions are allowed; participant visibility is a separate concern for later confirmation.
- The prototype is free; payments and prizes are future scope.

### 4.5 Proposed defaults that are not final decisions

These items are useful for planning but must remain visibly labeled as proposed:

- Draft preparation opens when all six participants are approved.
- Drafting must finish before event roster lock.
- An incomplete draft at roster lock is flagged for resolution rather than silently completed.
- The exact preparation and completion window is not final.
- Timeout ranking behavior is only a demo default until product rules are approved.
- The event's team score formula is a demonstration rule, not a universal sports rule.
- Fantasy rankings may be shared initially, but privacy and participant visibility need confirmation.

### 4.6 Unresolved questions that block later phases

- What exact organization invitation and acceptance experience is required?
- Can an owner transfer ownership, and what happens when the owner leaves?
- Are administrators allowed to invite other administrators or only the owner?
- Which published fields are public by default, and can organizations restrict them?
- How are account-linked athletes matched to imported athletes?
- Can one athlete have different eligibility or display information in different organizations?
- What is the exact season, division, roster, team, and event relationship?
- Can an event count toward multiple seasons or competitions?
- How are race distances, annual races, and custom activities represented?
- What is the exact substitution identity and fantasy ownership behavior when a reserve athlete replaces a drafted athlete?
- Which scorekeeper can edit a submitted score before approval?
- How are scores locked during a live event?
- What constitutes an official result version?
- How are standings recalculated after a correction?
- Who can see draft picks while a draft is active?
- What happens if a participant leaves a fantasy league mid-draft?
- What happens to an incomplete fantasy draft at roster lock?
- What are the exact playoff measurement precision and equal-distance rules? (The shootout format itself is now recorded in Section 4.8: one throw per teammate, measured distance to the basket with an explicit unit, converted to a common unit and summed, lowest team total wins. Equal-total tiebreaking and measurement precision remain open before playoff implementation.)
- Does the playoff affect competition standings only, fantasy standings, or neither?
- What is the final name and relationship between FLI Golf Fantasy and FLI Fantasy Gaming?

### 4.7 Resolved during milestone revision

The following were previously listed as unresolved questions and are now recorded as agreed decisions above:

- Scorekeepers may score all groups in their assigned event (Section 4.3).
- Fantasy scoring covers both regulation nine-hole rounds (Section 4.4).
- Shared fantasy rankings mean tied positions are allowed; visibility is a separate future concern (Section 4.4).
- The playoff uses shortest remaining throw-to-basket distance as the general principle; the team shootout format is recorded in Section 4.8, with equal-total tiebreaking and precision still to be verified before implementation (Section 4.6).

### 4.8 Future playoff shootout (recorded 2026-11-06 — documentation only)

The tie-breaking shootout format for the disc golf demonstration, recorded
ahead of its Phase 1H implementation:

- Each of the two teammates throws once.
- The distance from each disc's resting position to the basket is recorded
  with an explicit unit.
- Both distances are converted to a common unit and added together.
- The lowest team total wins.
- Two tied teams therefore produce four measured throws.
- Equal-total tiebreaking remains an open decision (Section 4.6), as does
  measurement precision.

Boundaries: the shootout may reference an existing course hole and basket
position; it adds no physical hole record and does not affect regular round
stroke scores. Playoff implementation, playoff score entry, and live
scorekeeper reassignment stay outside Phase 1F — this subsection is
documentation only.

## 6. Milestone summary

| Phase    | Name                                                     | Status      | Primary outcome                                                                                                                |
| -------- | -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0A       | Current-state audit and decision register                | In progress | Verified inventory, decisions, dependencies, and acceptance map                                                                |
| 0B       | Early recording foundation                               | Not started | Playwright verification, safe demo setup, repeatable browser recording, and artifact download                                  |
| 0C       | Narration and assembly                                   | Not started | Manually generated ElevenLabs narration, synchronized footage, captions, and downloadable final video                          |
| 1A       | Organization memberships, roles, and data isolation      | In progress | Invitation-based organization access with Owner, Admin, Scorekeeper, and Viewer roles                                          |
| 1B       | Configurable onboarding and capability-aware navigation  | Not started | Starter templates and role-aware navigation without permission bypasses                                                        |
| 1C       | Athlete identity                                         | Not started | Sport-neutral athlete records and organization-scoped identity                                                                 |
| 1D       | League, season, division, and event relationships        | Not started | Competition structure connecting teams, seasons, divisions, and events                                                         |
| 1E       | Season rosters, reserve pools, and substitutions         | Not started | Historical roster assignments and disc golf reserve handling                                                                   |
| 1F       | Course layouts, rounds, groups, and assignments          | Not started | Two-round, red/blue basket event setup with six groups and scorekeepers                                                        |
| 1G       | Mobile scorekeeping and submission                       | Not started | Phone-friendly group scoring and Draft-to-Submitted workflow                                                                   |
| 1H       | Official approval, publication, playoff, and corrections | Not started | Approved and published results with versioned corrections                                                                      |
| 1I       | Organization publishing and public competition standings | Not started | Branded hosted public page with unique slug, preview/publish controls, capability-based sections, and shared publication rules |
| 2A       | Fantasy membership and event draft preparation           | Not started | Six-person fantasy membership and per-event draft preparation                                                                  |
| 2B       | Owner-controlled live snake draft                        | Not started | Four-round, eligibility-aware, manually started draft                                                                          |
| 2C       | Fantasy scoring, explanations, and correction processing | Not started | Versioned fantasy points from approved results with safe reprocessing                                                          |
| 2D       | End-to-end demo and System Map                           | Not started | Authorized demonstration of the full FliHub-to-fantasy path                                                                    |
| 2E       | Website embeds                                           | Not started | Embeddable public widgets reusing the Phase 1I publication rules                                                               |
| 2F       | Read-only public API                                     | Not started | Documented read-only public API reusing the Phase 1I publication rules                                                         |
| 3 onward | Separately scoped business capabilities and expansion    | Not started | Sponsorships, expenses, reimbursements, other sports, youth, media, payments, and expansion                                    |

## 7. Detailed milestone checklists

## Phase 0A — Current-state audit and decision register

**Status:** In progress

### Goal and user-visible outcome

Produce a verified map of what exists, what is only represented in the database, and what must be built for the disc golf pilot. Management and the implementation team can review one shared requirement register before feature work begins.

### Dependencies

- Access to the current project and database.
- Management confirmation of the unresolved questions listed above.
- Verified review of the supplied FliHub-2 reference repository.

### In scope

- Current UI, data helper, migration, authentication, and access-policy inventory.
- Requirement register with identifiers, priorities, dependencies, acceptance criteria, and phase assignment.
- Decision register separating agreed decisions, proposed defaults, and unresolved choices.
- Initial data-flow map from roster and event scores through official results into fantasy.
- Reference review and documentation of unavailable references.
- Pilot data and demo-script definition.

### Explicit exclusions

- No feature implementation.
- No migrations or policy changes.
- No deployment or production configuration.
- No final pricing, prize, integration, or delivery-date commitments.

### Deliverables

- This milestone document.
- Verified current-state inventory.
- Phase dependency map.
- Pilot acceptance checklist.
- End-to-end demo script.

### Acceptance checklist

- [ ] Current screens are distinguished from database-only functionality.
- [ ] Organization owner-only access is distinguished from future memberships.
- [ ] Existing demo data and branding sources are identified for reuse.
- [ ] Official-result and fantasy-result boundaries are documented.
- [ ] All unresolved questions are assigned to the phase where they block progress.
- [ ] No unverified playoff behavior is presented as fact.

### Access-control and data-integrity checks

- [ ] Verify the current owner-scoped policies and identify every place membership policies will be required.
- [ ] Confirm that one organization cannot access another organization's private rows.
- [ ] Record which current operations delete data and which future operations must preserve history.

### Demo steps

1. Open the current application.
2. Sign in.
3. Create or open an organization.
4. Inspect the current Venues, Players, Teams, and Leagues sections.
5. Compare visible workflows with the database-only event tables.
6. Review this document with product and competition leads.

### Open decisions blocking this phase

- Final pilot organization and pilot users.
- Final product naming relationship for FLI Golf Fantasy and FLI Fantasy Gaming.
- Confirmation that the supplied FliHub-2 repository is the intended comparison source.

## Phase 0B — Early recording foundation

**Status:** Not started

### Goal and user-visible outcome

Create the first repeatable browser-recording foundation for completed workflows without making narration, video hosting, or final editing a prerequisite for core application work.

### Current tooling availability

The current project was inspected before planning this milestone:

- Playwright is not listed in `package.json`.
- The Playwright CLI is not installed in `node_modules`.
- No Playwright configuration was found.
- No browser test files were found.
- No demo, recording, screenshot, video, or ElevenLabs scripts were found.
- No ElevenLabs integration is present.
- Chromium is installed in the environment, but Playwright is not available to control it.
- FFmpeg and FFprobe are not installed, so browser footage and narration cannot currently be combined here.
- The project has no current recording artifact or download workflow.

Therefore, this environment cannot currently generate Playwright recordings or a final narrated video. The installed Chromium binary is a useful prerequisite, but it does not by itself provide repeatable browser capture, video artifacts, captions, or audio mixing.

The supplied live example could not be fetched during the earlier reference review. No recording behavior or demo flow from that site is assumed. The supplied GitHub repository was accessible, but its broader monorepo structure is not treated as installed tooling in this project.

### Recording foundation outcome

Create a repeatable walkthrough system that produces safe browser recordings for each completed phase and makes the raw browser artifacts downloadable for later narration and assembly.

### Recommended setup

Add the tooling only when implementation of this milestone is approved:

- Playwright Test with a checked-in configuration for the supported browser and viewport sizes.
- A separate presentation-recording project or test directory, distinct from automated verification tests.
- Dedicated demo accounts for owner, admin, scorekeeper, viewer, fantasy owner, and fantasy participants.
- Predictable demo data with a reset or seed process that never uses real customer records.
- Recording scripts with stable labels, test IDs, URLs, waits, and reset steps.
- Playwright video capture stored as test artifacts with deterministic filenames.
- A documented artifact download process for local runs and CI runs.
- A supported browser launch path in the local and/or CI environment.

Narration, final assembly, and help-video publishing are separate milestones. They may run outside this environment and must not block core application development.

### Separate verification from presentation recordings

Automated verification and presentation recordings serve different purposes:

- Verification tests should be fast, isolated, assertion-heavy, and safe to run repeatedly.
- Presentation recordings should be slower, intentionally paced, visually clean, and written for a human audience.
- Presentation recordings must not depend on fragile test assertions or expose test-only controls to users.
- Both may reuse login, reset, seed, navigation, and domain workflow helpers where practical.
- A passing verification test does not automatically mean a recording is publishable.
- A successful recording does not replace access-control, data-integrity, or regression tests.

### Recording safety requirements

- [ ] Use dedicated demo accounts that cannot access production customer data.
- [ ] Use predictable, resettable demo data with recognizable but fictional names.
- [ ] Keep passwords, tokens, email addresses, contact details, private organization data, and secrets out of footage, narration, logs, and captions.
- [ ] Mask or avoid browser chrome, account menus, raw URLs containing secrets, and developer tools.
- [ ] Do not record real invitations, payment details, private messages, or customer records.
- [ ] Reset the demo workspace before every recording.
- [ ] Verify that the recording contains only the intended organization and users.
- [ ] Review the entire video, audio, captions, and artifact directory before sharing.

### Recording coverage

Each recording should have stable scene identifiers, a predictable demo reset, and a checked-in recording instruction. Presentation recordings are intentionally separate from automated verification, although they may reuse safe login, reset, seed, navigation, and domain workflow helpers.

The first recording deliverable is one repeatable browser recording for an already completed workflow. It does not require narration, captions, final editing, or hosting.

### Early deliverables

- [ ] Playwright verification configuration and supported browser launch path.
- [ ] Dedicated demo accounts and predictable resettable demo data.
- [ ] Separate automated verification and presentation-recording structure.
- [ ] Reusable reset, seed, login, and navigation helpers.
- [ ] One repeatable browser recording for a completed workflow.
- [ ] Recording instructions and deterministic artifact naming.
- [ ] Documented local and CI artifact download steps.

### Early acceptance checklist

- [ ] A clean demo account can be reset and recorded repeatedly.
- [ ] Automated verification runs separately from presentation capture.
- [ ] Browser footage is captured at the agreed viewport without secrets or private customer data.
- [ ] The recorded workflow is marked complete in its owning application phase.
- [ ] The recording artifact can be downloaded from a local run or CI artifact store.
- [ ] Demo reset and seed operations cannot delete or modify customer data.

### Open decisions blocking this phase

- Whether Playwright runs locally, in CI, or both.
- Supported browser, viewport, operating system, and video format.
- Where raw recording artifacts are stored and how they are downloaded.

## Phase 0C — Narration and assembly

**Status:** Not started

### Goal and user-visible outcome

Turn an approved browser recording into a reviewed, captioned, downloadable walkthrough using manually generated ElevenLabs audio. This milestone may be completed outside this environment.

### Dependencies

- Phase 0B raw browser recording and downloadable artifact.
- A completed application workflow with an approved presentation script.
- Approved voice and media-review process.

### In scope

- Narration script and matching scene/timing outline.
- Manually generated ElevenLabs audio.
- Synchronized browser footage and narration.
- WebVTT/SRT captions.
- Final video assembly and download.
- Repository instructions for regeneration.

### Explicit exclusions

- ElevenLabs API integration.
- Help-video hosting or in-app publishing; that belongs to the relevant application phase or Phase 2D.
- Recording workflows that are not yet marked complete.

### Narration script and scene outline

Each walkthrough should have a checked-in script with stable identifiers shared by the recording and captions:

```text
Scene ID | Product phase | Screen/action | Narration | Visual checkpoint | Approx. duration
```

The narration should explain the user's goal and visible outcome rather than implementation details. Timing should be measured after the ElevenLabs draft is generated.

### Manual ElevenLabs and assembly workflow

1. Write and review the narration script.
2. Generate audio manually in ElevenLabs using the approved voice and pronunciation guidance.
3. Keep restricted source audio outside the application repository; retain only approved assets in repository or approved media storage.
4. Combine the browser recording and narration with FFmpeg or an approved editor outside this environment if needed.
5. Generate captions from the approved narration and verify timing and terminology.
6. Review the final video and make the finished file downloadable.
7. Keep the scene manifest, narration source, caption source, and regeneration instructions with the walkthrough assets.

An ElevenLabs API integration is optional later and must not be a prerequisite for this milestone.

### Acceptance checklist

- [ ] Narration matches the scene order and visible actions.
- [ ] Browser footage and audio are synchronized.
- [ ] Captions match the approved narration and remain readable.
- [ ] The final video can be downloaded and regenerated from documented inputs.
- [ ] The final review contains no credentials, private customer data, or hidden operational information.

### Open decisions blocking this phase

- Approved ElevenLabs voice, account, licensing, and pronunciation guide.
- Approved assembly tool or editor.
- Caption format and final downloadable video format.

### Walkthrough coverage by application phase

Every completed application phase should have a short walkthrough or be explicitly marked as not user-visible. The owning application phase owns the workflow content; Phase 0B owns raw capture and Phase 0C owns narration and assembly.

- Phase 1A — invitation, acceptance, organization switching, and role boundaries.
- Phase 1B — starter template, capability selection, and capability-aware navigation.
- Phase 1C — athlete creation or import and organization-scoped identity.
- Phase 1D — league, season, division, and event relationships.
- Phase 1E — season roster, reserve pool, and substitution handling.
- Phase 1F — course positions, groups, teams, and scorekeepers.
- Phase 1G — phone score entry and submission.
- Phase 1H — approval, publication, reopening, correction, and reapproval.
- Phase 1I — branded public page, preview/publish, capability-based sections, and public standings.
- Phase 2A — fantasy membership and event draft preparation.
- Phase 2B — owner-controlled four-round snake draft.
- Phase 2C — fantasy points, explanations, and safe correction processing.
- Phase 2D — authorized System Map and complete demo.
- Phase 2E — website embeds reusing Phase 1I publication rules.
- Phase 2F — read-only public API reusing Phase 1I publication rules.

### Open decisions not blocking core application development

- Whether a future ElevenLabs API integration is worthwhile.
- Whether final help videos use application storage, a private video host, or a documentation platform.
- Whether a burned-in-caption version is also needed.

## Phase 1A — Organization memberships, roles, and data isolation

**Status:** In progress

### Goal and user-visible outcome

An organization owner can invite another signed-in user, assign an approved role, and safely collaborate without exposing private data from another organization.

### Dependencies

- Phase 0A decision register.
- Final role definitions and invitation behavior.
- Existing authentication flow.

### Approved decision register updates (Phase 1A)

The following rules were approved and implemented during Phase 1A:

- Each organization has exactly one primary Owner, enforced by a partial unique index on `org_memberships(organization_id) WHERE role = 'owner'`.
- The Owner may transfer ownership to an existing accepted member. Transfer is atomic: the recipient becomes Owner and the previous Owner becomes Admin.
- The sole Owner cannot leave or be removed before transferring ownership. The `remove_member` function rejects this.
- Admins may invite Scorekeepers and Viewers. The invitation INSERT policy enforces this at the database level: `can_administer_org OR role IN ('scorekeeper', 'viewer')`.
- Only the Owner may appoint Admins or change member roles. The `change_member_role` function verifies `can_administer_org`.
- Admins cannot promote themselves or grant ownership through invitations. The invitation table CHECK constraint excludes 'owner' from the role column.
- Owner may remove any non-owner member. Admin may revoke invitations but may not remove accepted members. Non-owner members may leave voluntarily.

### In scope

- Organization membership records.
- Invitation creation, acceptance, expiration, and revocation.
- Owner, Admin, Scorekeeper, and Viewer roles.
- Organization switcher for users in multiple organizations.
- Role-aware reads and writes.
- Private organization data isolation.
- Public versus private publication boundaries for approved data.

### Explicit exclusions

- Coaches, team managers, guardians, youth workflows, and custom role builders.
- Public discovery of organizations.
- Athlete account linking beyond the minimum needed for invitation testing.

### Deliverables

- Membership and invitation workflow.
- Organization switcher.
- Role-aware organization shell.
- Access-control tests for two organizations and all four roles.

### Implementation summary

**Migrations applied to development database:**

1. `20261104040000_create_memberships_invitations_and_role_based_rls.sql` — Created `org_memberships` and `org_invitations` tables, 6 SECURITY DEFINER functions (`create_organization_with_owner`, `accept_invitation`, `transfer_ownership`, `change_member_role`, `remove_member`, `revoke_invitation`), 4 SECURITY INVOKER helper functions (`role_rank`, `is_org_member`, `can_manage_org`, `can_administer_org`), backfilled existing organization owners into memberships, and replaced all RLS policies on 14 tables to use membership-based access control.
2. `20261104041000_fix_search_path_on_helper_functions.sql` — Added `SET search_path = public` to the 4 helper functions to resolve security advisor warnings.

**Backfill performed:**

- The existing "FLI Golf" organization's owner was backfilled into `org_memberships` with role 'owner' and `accepted_at` set to the organization's creation timestamp. Verified: 1 membership row exists for 1 organization.

**Frontend changes:**

- `src/types/league.ts` — Added `OrganizationRole`, `OrgMembership`, `OrgInvitation`, `OrganizationWithRole`, `InvitationStatus` types.
- `src/lib/memberships.ts` — New library with `listMembers`, `listInvitations`, `createInvitation`, `revokeInvitation`, `acceptInvitation`, `transferOwnership`, `changeMemberRole`, `removeMember`, `leaveOrganization`, and display helpers.
- `src/lib/organizations.ts` — Updated `listOrganizations` to query memberships instead of `user_id`; `createOrganization` now calls `create_organization_with_owner` RPC; added `getCurrentUserRole`.
- `src/hooks/useOrgRole.ts` — New hook for fetching the current user's role in an organization, plus `canEdit` and `canAdminister` helpers.
- `src/components/organizations/MembersSection.tsx` — New members management UI with invite, accept-link copy, revoke, role change, transfer ownership, remove member, and leave.
- `src/components/organizations/OrganizationShell.tsx` — Added Members section to navigation, passes role to sections, shows role badge and read-only notice.
- `src/components/organizations/OrganizationsPage.tsx` — Shows role badge per organization, delete only for owners.
- `src/App.tsx` — Handles invitation acceptance from URL params, passes role to OrganizationShell.
- `src/components/venues/VenuesSection.tsx`, `VenueDetail.tsx`, `CourseDetail.tsx` — Accept `canEdit` prop, hide add/delete/edit controls when read-only.
- `src/components/players/PlayersSection.tsx` — Accept `canEdit` prop, hide add/delete when read-only.
- `src/components/teams/TeamsSection.tsx` — Accept `canEdit` prop, hide add/delete/demo-data when read-only.
- `src/components/leagues/LeaguesSection.tsx`, `LeagueDetail.tsx` — Accept `canEdit` prop, hide add/delete when read-only.

### Acceptance checklist

- [x] Account creation alone grants no organization access — new users have no memberships; RLS blocks all reads.
- [x] Owner can invite another user — invitation UI creates scoped, expiring, single-use token invitations.
- [x] Invited user can accept and see only the invited organization — `accept_invitation` verifies email match, creates membership, marks token used.
- [x] Owner can manage administrators — `change_member_role` function (owner-only) enforces this server-side.
- [ ] Admin can manage competitions and approve results — competition management RLS is in place; approval workflow is Phase 1H.
- [x] Scorekeeper cannot administer organization membership — RLS policies require `can_administer_org` for membership mutations.
- [x] Viewer can read permitted data but cannot modify it — RLS allows SELECT for `is_org_member(viewer)` but INSERT/UPDATE/DELETE require `can_manage_org` (admin+).
- [x] A user in Organization A cannot read or change Organization B's private data — all table policies check membership of the specific `organization_id`.
- [x] Organization switcher shows only organizations where the user has membership — `listOrganizations` queries `org_memberships` for the current user.

### Access-control and data-integrity checks

- [x] Membership checks are enforced in database policies, not only hidden in the UI — all 14 table RLS policies use `is_org_member` or `can_manage_org`.
- [x] Role changes take effect on both reads and writes — role is checked per-request via `org_memberships` lookup in RLS functions.
- [x] Invitation tokens are single-use, scoped, and expire — `accept_invitation` checks status, token match, expiry, and marks as accepted; unique index prevents duplicate pending invitations.
- [x] Removing membership immediately removes access — `remove_member` deletes the membership row; RLS policies check membership on every request.
- [x] Owner transfer and last-owner behavior are resolved — `transfer_ownership` is atomic; `remove_member` blocks owner from leaving; partial unique index enforces exactly one owner.

### Database verification evidence

- **Backfill verified:** 1 membership row exists for the existing "FLI Golf" organization with role 'owner'.
- **One-owner constraint:** Partial unique index `org_memberships_one_owner_per_org` on `(organization_id) WHERE role = 'owner'` prevents a second owner.
- **One-pending-invitation constraint:** Partial unique index `org_invitations_one_pending_per_email` on `(organization_id, email) WHERE status = 'pending'` prevents duplicate active invitations.
- **SECURITY DEFINER function access:** Verified via `has_function_privilege` — `anon` cannot execute any SECURITY DEFINER function; `authenticated` can execute all 6.
- **RLS policy replacement:** All 14 existing tables had their old `*_own_*` policies dropped and replaced with `*_member_*` or `*_manage_*` policies.
- **Security advisor:** Initial run found `function_search_path_mutable` warnings on 4 helper functions; fixed in second migration by adding `SET search_path = public`.
- **New table RLS:** `org_memberships` has SELECT-only policy (mutations via functions); `org_invitations` has SELECT for members, INSERT/UPDATE/DELETE for owner or admin.
- **Invitation INSERT policy:** Enforces `can_manage_org AND (can_administer_org OR role IN ('scorekeeper', 'viewer'))` — admins cannot invite admins.
- **Build verification:** `npm run build` and `npm run typecheck` both pass.

### Browser verification status

Browser automation (Playwright) is not available in this environment. The following UI behaviors are **unverified** and require manual testing:

- Invitation acceptance flow via URL parameters.
- Organization switcher showing only accessible organizations.
- Members section UI rendering and interaction.
- Role-aware UI hiding edit controls for Scorekeeper and Viewer.
- Transfer ownership UI flow.
- Role change dropdown behavior.
- Leave and remove member flows.

### Limitations and remaining acceptance checks

1. **Email delivery is not available.** The invitation UI generates a copy-link for the inviter to share manually. The UI explicitly states "Email delivery is not available yet" and does not claim email was sent.
2. **Score entry and official-result approval permissions** are documented for later phases (1G, 1H). The current `can_manage_org` check for event_scores may need refinement when scorekeeper-specific access is implemented.
3. **Member email display** — the `org_memberships` table does not join to `auth.users` for email display. The UI shows "Member" for non-current users. A future improvement could use a profiles table or edge function to display emails.
4. **Browser testing** — all UI flows need manual verification as described above.
5. **Cross-organization test with two real users** — requires creating a second auth account and inviting it to verify end-to-end invitation acceptance.

### Demo steps

1. Create Organization A and Organization B with separate users.
2. Invite a second user to Organization A as Viewer.
3. Verify the Viewer can read permitted Organization A data.
4. Verify the Viewer cannot create or edit protected records.
5. Verify the same user cannot see Organization B.
6. Promote the user to Admin and demonstrate the new permissions.

### Manual walkthrough for verification

1. **Sign in** with the existing owner account.
2. **Open the organization list** — you should see "FLI Golf" with an "Owner" role badge. Only organizations where you have membership appear.
3. **Open FLI Golf** — the navigation should show Venues, Players, Teams, Leagues, and Members sections. Your role badge should say "Owner". All add/edit/delete controls should be visible.
4. **Click Members** — you should see yourself as the sole Owner. Click "Invite people" to open the invitation dialog.
5. **Create an invitation** — enter an email address, select a role (Viewer or Scorekeeper as Owner), and click "Create invitation". A copy-link should appear (email delivery is not available). Copy the link.
6. **Sign out and create a new account** with the email you invited.
7. **Sign in as the new user** — the organization list should be empty (account creation alone grants no access).
8. **Open the invitation link** in the browser — you should see "Accepting invitation..." then "Invitation accepted!" The organization should appear in your list.
9. **Open the organization** as Viewer — you should see all data but no add/edit/delete buttons. A "read-only access" notice should appear.
10. **Sign back in as Owner** — go to Members, change the new user's role to Admin. Sign in as that user and verify edit controls are now visible.
11. **Test transfer ownership** — as Owner, select the Admin member and transfer ownership. Verify you become Admin and they become Owner. Verify exactly one Owner exists.
12. **Test leave/remove** — as the new Owner, remove the old Owner (now Admin). Sign in as the removed user and verify the organization no longer appears.

### Behavioral database verification (2026-11-04)

Verification was performed against the live Supabase database using disposable test organizations (VerOrgA, VerOrgB) and 6 disposable test accounts. The existing FLI Golf organization was not modified. Each test simulated an authenticated session by setting `request.jwt.claims` to the test user's ID and switching to the `authenticated` role, then issuing the same INSERT/UPDATE/DELETE/SELECT/RPC calls the Supabase Data API would receive.

**Issues found and fixed during verification:**

1. **Infinite recursion in RLS policies (fixed).** The helper functions `is_org_member`, `can_manage_org`, and `can_administer_org` were SECURITY INVOKER, causing infinite recursion when RLS policies on operational tables called them — the function's inner SELECT on `org_memberships` triggered `select_own_memberships`, whose self-referential EXISTS subquery re-entered the same policy. Fixed by making all three functions SECURITY DEFINER (migration `20261104043000`). The `select_own_memberships` policy was also rewritten to call `is_org_member()` instead of a self-referential EXISTS (migration `20261104043500`).

2. **Invitation tokens visible to all members (fixed).** The `select_org_invitations` policy used `is_org_member(org, 'viewer')`, which let Viewers and Scorekeepers read the `token` column — a single-use credential. Fixed by changing the policy to `can_manage_org(organization_id)` (owner/admin only) and revoking all `anon` privileges on `org_invitations` (migration `20261104044000`).

3. **SECURITY DEFINER helper functions callable by anon (fixed).** The advisor flagged that `is_org_member`, `can_manage_org`, and `can_administer_org` were executable by the `anon` role. Fixed by revoking EXECUTE from PUBLIC and anon, granting only to `authenticated` (migration `20261104044500`).

**Test results:**

| Test | Description                                                                                                                                                                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1   | Viewer and Scorekeeper cannot INSERT/UPDATE/DELETE operational records (venues) via direct API; Viewer can SELECT                                                                                      | Pass — Viewer/Scorekeeper INSERT rejected with 42501; UPDATE/DELETE silently blocked (0 rows); SELECT returns rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T2   | Non-member cannot read or modify another org's private records (venues, memberships, invitations)                                                                                                      | Pass — Owner B reads VerOrgA venues → 0 rows; INSERT → 42501; UPDATE/DELETE → 0 rows; memberships → 0 rows; invitations → 0 rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| T3   | Cross-organization foreign-key assignments rejected                                                                                                                                                    | Pass — Admin A inserting venue/player into VerOrgB → 42501                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| T4   | Admin can invite only Scorekeeper/Viewer, cannot change roles, cannot remove accepted members, cannot transfer ownership; Admin can revoke invitations                                                 | Pass — Admin invites viewer/scorekeeper → success; Admin invites admin → 42501; change_role → "Only the owner"; remove_member → "Only the owner"; transfer → "Only the owner"; revoke → success                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T5   | Invitation acceptance rejects wrong-account, expired, revoked, reused, and invalid-token attempts; pending invitations grant no membership; successful acceptance creates membership with correct role | Pass — wrong account → "different email address"; expired → "has expired"; revoked/accepted reuse → "already been used or revoked"; invalid token → "not found or token is invalid"; already member → "already a member"; pending user sees 0 venues; after acceptance sees 2 venues and role=scorekeeper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| T6   | Invitation tokens unreadable by unauthorized users or ordinary members                                                                                                                                 | Pass — non-member → 0 rows; viewer → 0 rows (after fix); scorekeeper → 0 rows; anon → 0 rows; owner → 8 rows; admin → 8 rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| T7   | Ownership transfer is atomic, leaves exactly one Owner, makes previous Owner Admin                                                                                                                     | Pass — after transfer: Admin A is owner, Owner A is admin, owner_count=1; previous owner cannot administer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| T8   | Owner cannot leave, be removed, or be demoted except through authorized transfer                                                                                                                       | Pass — owner leave → "cannot leave without transferring"; admin removes owner → "Only the owner can remove"; owner demotes self → "cannot change your own role"; owner promotes via change_role → "Invalid role. Use transfer ownership"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| T9   | Direct table writes cannot bypass SECURITY DEFINER functions or change organization ownership                                                                                                          | Pass — Admin UPDATE own role to owner → 0 rows (no UPDATE policy); Viewer UPDATE role → 0 rows; INSERT second owner → 42501 (no INSERT policy); DELETE owner membership → 0 rows (no DELETE policy); role confirmed unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T10  | Role changes and membership removal affect subsequent requests from already signed-in session                                                                                                          | Pass — after demotion admin→viewer: INSERT immediately blocked (42501), SELECT still works; after removal: SELECT immediately returns 0 rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| T11  | Membership-check helper functions do not cause recursive RLS failures                                                                                                                                  | Pass — Viewer SELECT venues, Owner SELECT memberships/invitations, Admin INSERT venue, direct helper calls for Owner and Viewer — all succeed with no recursion (after fix)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| T12  | Organization creation and owner backfill preserve access and existing data                                                                                                                             | Pass — FLI Golf org and owner membership unchanged; new org created via RPC with correct owner; Owner B sees both orgs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| T13  | Unique owner index proves at most one Owner; mutation paths prevent zero Owners                                                                                                                        | Pass — second owner INSERT → duplicate key violation on `org_memberships_one_owner_per_org`; transfer to non-member → rejected, owner_count remains 1; index confirmed as partial unique on `organization_id WHERE role = 'owner'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T14  | Members UI follows approved permission matrix (code review)                                                                                                                                            | Pass — only Owner sees role-change, ownership-transfer, and accepted-member-removal controls; Admin sees only Scorekeeper/Viewer invitation options and revoke; Viewer/Scorekeeper see no management controls; Leave button hidden for Owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| T15  | Cross-organization parent/child relationships are rejected by composite FK constraints                                                                                                                 | Pass — user who administers both Org A and Org B cannot create A course referencing B venue (FK violation on composite `(organization_id, venue_id)`); same for team→player, season→league, event→course; same-org references succeed (positive control)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| T16  | Neither Owner nor Admin can create an invitation with role=owner                                                                                                                                       | Pass — `org_invitations_role_check` CHECK constraint rejects `role='owner'` at the database level regardless of user role (Owner attempt → `23514: violates check constraint "org_invitations_role_check"`); Admin attempt also rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| T17  | Admin cannot UPDATE an existing invitation to escalate role, change organization, or bypass invitation restrictions                                                                                    | Pass (after fix) — **Bug found and fixed**: `update_org_invitations` policy's WITH CHECK only checked `can_manage_org`, missing the role restriction from INSERT policy. Admin successfully escalated viewer→admin via direct UPDATE. Fixed in migration `20261104045000` by adding `(can_administer_org(organization_id) OR role = ANY(ARRAY['scorekeeper','viewer']))` to WITH CHECK. Post-fix: Admin UPDATE viewer→admin → `42501` RLS rejection; Admin UPDATE role→owner → `42501` RLS rejection; Owner UPDATE role→owner → `23514` CHECK constraint rejection; Admin UPDATE organization_id to different org → `42501` RLS rejection; Admin UPDATE viewer→scorekeeper (legitimate) → succeeds                                                                                                                                                                                                                                                                                                                                                                 |
| T18  | Ownership only transfers through the approved `transfer_ownership` function                                                                                                                            | Pass — direct UPDATE on `org_memberships` to set role=owner → silently 0 rows (no UPDATE policy); direct INSERT into `org_memberships` with role=owner → `42501` RLS rejection; `change_member_role` RPC with role=owner as Admin → `P0001: Only the owner can change member roles`; `change_member_role` RPC with role=owner as Owner → `P0001: Invalid role. Use transfer ownership to change the owner`; `accept_invitation` cannot create owner membership because `org_invitations_role_check` prevents role=owner in invitations (inherited safety); Admin calling `transfer_ownership` → `P0001: Only the owner can transfer ownership`; Owner calling `transfer_ownership` → succeeds, exactly one owner after transfer (positive control)                                                                                                                                                                                                                                                                                                                 |
| T19  | Invitation organization_id, email, token, and invited_by are immutable through ordinary UPDATE — even when the caller administers both organizations                                                   | Pass (after fix) — **Bug found and fixed**: table-level UPDATE grant allowed any authenticated user with RLS access to change `organization_id`, `email`, `token`, and `invited_by`. Fixed in migration `20261104045500` with three layers: (1) column-level UPDATE grant on only `role` — Admin UPDATE organization_id → `42501: permission denied for table`; Admin UPDATE email → `42501`; Admin UPDATE token → `42501`; Admin UPDATE invited_by → `42501`; Owner UPDATE organization_id → `42501` (column grant blocks all roles). (2) BEFORE UPDATE trigger `prevent_invitation_field_mutation()` as defense-in-depth — superuser UPDATE organization_id → `P0001: Cannot change invitation organization`; superuser UPDATE email → `P0001: Cannot change invitation email`; superuser UPDATE token → `P0001: Cannot change invitation token`; superuser UPDATE invited_by → `P0001: Cannot change invitation creator`. (3) Positive control: Owner UPDATE role admin→scorekeeper → succeeds; `revoke_invitation` still updates `status` via SECURITY DEFINER |
| T20  | Admin cannot downgrade an Owner-created Admin invitation and then manipulate it                                                                                                                        | Pass — Admin UPDATE admin-invitation role to scorekeeper → 0 rows updated (USING clause `can_administer_org OR role <> 'admin'` filters admin-role invitations from non-owners); Admin UPDATE admin-invitation role to viewer → 0 rows updated; Admin UPDATE admin-invitation email → `42501` (column grant); role remained `admin` after all Admin attempts; Owner UPDATE admin-invitation role to scorekeeper → succeeds (positive control); trigger blocks immutable field changes even at superuser level                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Members UI matrix (code review of MembersSection.tsx):**

- Owner: sees Invite people, Change role (admin/scorekeeper/viewer), Transfer ownership, Remove member, Revoke invitation. No Leave button.
- Admin: sees Invite people (Scorekeeper/Viewer only), Revoke invitation. No Change role, Transfer, or Remove controls. Leave button visible.
- Scorekeeper/Viewer: sees member list only. No management controls. Leave button visible.

**Migrations applied during verification:**

- `20261104043000_fix_recursive_rls_on_membership_helpers` — Made `is_org_member`, `can_manage_org`, `can_administer_org` SECURITY DEFINER.
- `20261104043500_fix_recursive_rls_on_memberships_select_policy` — Rewrote `select_own_memberships` to use `is_org_member()` instead of self-referential EXISTS.
- `20261104044000_restrict_invitation_token_visibility` — Changed `select_org_invitations` to `can_manage_org()`; revoked anon privileges.
- `20261104044500_revoke_anon_execute_on_membership_helpers` — Revoked EXECUTE from anon/PUBLIC on helper functions.
- `20261104045000_fix_invitation_update_role_escalation` — Fixed `update_org_invitations` WITH CHECK to include the same role restriction as INSERT policy, preventing Admins from escalating invitation roles via direct UPDATE.
- `20261104045500_lock_immutable_invitation_fields_and_prevent_admin_downgrade` — Revoked table-level UPDATE grant, granted column-level UPDATE only on `role`; added BEFORE UPDATE trigger to block mutation of `organization_id`, `email`, `token`, `invited_by`, `created_at`, `expires_at` even when RLS is bypassed; updated UPDATE policy USING clause to prevent non-owners from selecting admin-role invitations for update.

**Browser verification:** Pending — not yet performed in this environment. The manual walkthrough above remains to be executed in the browser.

**Demo-data changes:** Six disposable test accounts and two disposable test organizations (VerOrgA, VerOrgB, VerOrgB Test2) were created and then deleted after verification. An additional two disposable test accounts and two disposable test organizations (VerCrossA, VerCrossB) with test venues, players, leagues, courses, seasons, and invitations were created for T15-T18 and then deleted after verification. A further two disposable test accounts and two disposable test organizations (LockTestA, LockTestB) with test invitations were created for T19-T20 and then deleted after verification. No existing FLI Golf data was modified.

### Open decisions blocking this phase

- Owner transfer rules — **resolved** (see approved decision register updates above).
- Administrator invitation authority — **resolved** (admins can invite Scorekeepers and Viewers only; owner invites Admins).

Public profile and publication defaults are not Phase 1A blockers; they belong to Phase 1H (approval and publication) and Phase 1I (public results and standings). Phase 1A defines the permission matrix for future approval and publication actions, but the actual approval and publication workflows are verified in their owning phases.

## Phase 1B — Configurable onboarding and capability-aware navigation

**Status:** Implemented and verified locally (2026-11-05). Evidence:
docs/ROADMAP.md "Phase 1B verification record". Walkthrough video for this
phase is not yet recorded.

### Goal and user-visible outcome

A new organization can choose League, Race/Event, or Custom as a starting point, see suggested capabilities, adjust them, and receive navigation that reflects enabled capabilities without bypassing role permissions.

### Dependencies

- Phase 1A membership and role enforcement.
- Initial capability catalog.
- Decisions about race and custom activity configuration.

### In scope

- Starter templates: League, Race/Event, Custom.
- Capability selection and later capability management.
- Capability-aware navigation.
- Clear upcoming labels for sponsorships and reimbursements.
- Race distances including marathon, half-marathon, and custom distances.
- Organization-level capability access checks.

### Explicit exclusions

- Full race timing or external race integrations.
- Sponsorship sales implementation.
- Expense transfer or payment processing.
- All future sport-specific configuration.

### Deliverables

- Onboarding flow.
- Capability catalog and template mapping.
- Capability-aware navigation.
- Empty states that explain what is available, planned, or blocked by role.

### Acceptance checklist

- [ ] Each template suggests the correct initial capabilities.
- [ ] An organization can adjust enabled capabilities after onboarding.
- [ ] Disabled capabilities are not shown as active workflows.
- [ ] Enabled capabilities still enforce role permissions.
- [ ] Race distance choices include marathon, half-marathon, and custom.
- [ ] Sponsorships and reimbursements are labeled as upcoming if not implemented.

### Access-control and data-integrity checks

- [ ] Capability settings cannot grant access beyond the user's organization role.
- [ ] A Viewer cannot gain write access by enabling a capability.
- [ ] Disabling a capability does not delete its existing records.

### Demo steps

1. Create a League organization.
2. Create a Race/Event organization with multiple distances.
3. Create a Custom organization and add a capability later.
4. Sign in as Viewer and confirm navigation remains read-only.

### Open decisions blocking this phase

- Full capability catalog.
- Whether capability changes are owner-only or owner/admin.
- Race scoring and timing rules.

## Phase 1C — Athlete identity

**Status:** Implemented and verified locally (2026-11-05). Evidence:
docs/ROADMAP.md "Phase 1C verification record". Open product decisions remain
as recorded below (duplicate-import matching, cross-organization visibility,
final eligibility fields).

### Goal and user-visible outcome

Organizations can import or create sport-neutral athletes without requiring accounts and keep identity records scoped to the appropriate organization.

### Dependencies

- Phase 1A membership and roles.
- Athlete identity and eligibility decisions.
- Existing player data and branding sources.

### In scope

- Sport-neutral athlete identity.
- Organization registration and eligibility records.
- Existing CSV-derived branding, logos, photos, and flags where available.
- Organization-scoped privacy and approved public display fields.

### Explicit exclusions

- Universal gender-paired teams.
- Coaches, guardians, youth workflows, or advanced eligibility.
- Broad cross-organization athlete discovery.

### Deliverables

- Athlete import and create flow.
- Organization-scoped athlete identity view.
- Approved public display profile fields.

### Acceptance checklist

- [ ] An athlete can be imported or created without an account.
- [ ] Athlete identity and eligibility records are scoped to the organization using them.
- [ ] The same athlete may participate across organizations without leaking private information.
- [ ] Public athlete display fields are separate from private contact and eligibility information.
- [ ] Disc golf-specific pairing rules are not imposed on other sports.

### Access-control and data-integrity checks

- [ ] Organization eligibility and contact information remain private.
- [ ] Public athlete display profiles contain only approved fields.
- [ ] Cross-organization access is controlled by explicit permissions, not identity lookup alone.

### Demo steps

1. Import or create the 24 active demo athletes.
2. Review organization-scoped identity and approved public profile fields.
3. Confirm disc golf pairing remains a later competition-format rule rather than a shared athlete model.

### Open decisions blocking this phase

- Identity matching rules for imported duplicate records.
- Cross-organization profile visibility.
- Final athlete eligibility fields for the pilot.

## Phase 1D — League, season, division, and event relationships

**Status:** Implemented and verified locally (2026-11-06). Evidence:
docs/ROADMAP.md "Phase 1D verification record". Both blocking decisions
approved by Dustin and recorded as D12 in docs/DECISIONS.md.

### Goal and user-visible outcome

An organization can operate leagues that contain seasons, seasons that contain divisions, and events that are either attached to a season or independently operated by the organization.

### Dependencies

- Phase 1A organization permissions.
- Phase 1C athlete identity model.
- Final competition relationship decisions.

### In scope

- League, season, and division records.
- Team entry into a season or division.
- Event-to-season and independent-event options.
- Competition status and scheduling foundations.

### Explicit exclusions

- Full standings calculation.
- Official result approval.
- Fantasy scoring.
- Advanced registration and payments.

### Deliverables

- Competition setup screens.
- Season and division relationship screens.
- Team-entry screens.
- Event relationship selectors.

### Acceptance checklist

- [ ] Teams can be entered into a season or division.
- [ ] Events can belong to a season or operate independently.
- [ ] League, season, division, team, and event relationships are visible and consistent.
- [ ] The disc golf demo can represent one season with one two-round event before roster assignment is added.

### Access-control and data-integrity checks

- [ ] Cross-organization team, athlete, course, and event links are rejected.
- [ ] Deleting or archiving a competition does not erase historical official results.
- [ ] Role permissions distinguish competition management from read-only access.

### Demo steps

1. Create one league.
2. Create one season.
3. Add a division if the pilot uses divisions.
4. Enter the competition teams or team slots.
5. Create one event attached to the season.
6. Create one independent event and confirm it remains outside the season.

### Open decisions blocking this phase

- ~~Whether a team enters both season and division or only division.~~
  **Resolved (D12, approved):** teams enter a season directly; each season
  entry carries one optional division assignment, so entries can exist before
  divisions are finalized and seasons can run division-less.
- ~~Whether an event may count toward multiple competitions.~~
  **Resolved (D12, approved):** an event belongs to at most one season or
  runs independently (optional season relation); multi-competition event
  membership is outside Phase 1D.

## Phase 1E — Season rosters, reserve pools, and substitutions

**Status:** Implemented and verified locally (2026-11-06). Evidence:
docs/ROADMAP.md "Phase 1E verification record". All four blocking decisions
approved by Dustin and recorded as D13 in docs/DECISIONS.md.

### Goal and user-visible outcome

Organizations can assign athletes and teams to the competition structure created in Phase 1D while preserving historical season participation and managing disc golf reserve pools.

### Dependencies

- Phase 1A membership and roles.
- Phase 1C athlete identity.
- Phase 1D league, season, division, and event relationships.
- Final pilot roster and substitution rules.

### In scope

- Season roster assignments.
- Team entry into a season or division using the established competition structure.
- Separate male and female disc golf reserve pools.
- Existing CSV-derived branding, logos, photos, and flags where available.
- Historical roster preservation.
- Substitution records for the pilot.

### Explicit exclusions

- Universal gender-paired teams.
- Coaches, guardians, youth workflows, or advanced eligibility.
- Optional athlete account linking unless separately approved.
- Fantasy replacement ownership rules.

### Deliverables

- Season roster view.
- Team and athlete assignment view.
- Reserve-pool view and scheduling exclusion.
- Substitution record view.

### Acceptance checklist

- [ ] A season roster preserves historical participation.
- [ ] Disc golf teams can use the one-male/one-female demonstration rule without imposing it on other sports.
- [ ] Reserve athletes are excluded from ordinary scheduling.
- [ ] An authorized substitution records the replaced and replacement athlete and event.
- [ ] Optional account linking is not required for roster completion.

### Access-control and data-integrity checks

- [ ] Only authorized organization roles can change season rosters.
- [ ] Historical rosters are not rewritten when current affiliations change.
- [ ] Substitution records are append-only or otherwise protected after official results depend on them.
- [ ] Organization and event boundaries are enforced for roster changes.

### Demo steps

1. Use the league, season, division, and event structure from Phase 1D.
2. Assign the 12 competing teams and 24 active athletes.
3. Create separate male and female reserve pools.
4. Confirm reserve athletes are excluded from ordinary scheduling.
5. Record one reserve substitution for a selected event.
6. Confirm the roster history preserves who participated before and after the substitution.

### Open decisions blocking this phase

- ~~Final pilot roster eligibility fields.~~
  **Deferred (D13, approved):** Phase 1E uses existing athlete identity only
  (gender for pool restrictions) and adds no eligibility fields; the final
  pilot eligibility fields remain an open product decision.
- ~~Exact substitution record fields needed by competition operations.~~
  **Resolved (D13, approved):** organization, event, season entry,
  athleteOut, athleteIn, optional reason, hook-recorded author, and
  timestamps; append-only (update and delete locked).
- ~~Whether reserve pools are represented as teams, pools, or another format.~~
  **Resolved (D13, approved):** first-class pool records with member rows and
  an optional gender restriction; pools are structurally not teams, so they
  are excluded from ordinary scheduling by shape.

## Phase 1F — Course layouts, rounds, groups, and assignments

**Status:** Implemented and verified locally (2026-11-06). Evidence:
docs/ROADMAP.md "Phase 1F verification record". Model decisions approved by
Dustin and recorded as D14 in docs/DECISIONS.md; the two content/behavior
questions below remain open without blocking the model.

### Goal and user-visible outcome

An administrator can configure the nine-hole disc golf course, two basket-position rounds, six groups, team assignments, and scorekeeper assignments.

### Dependencies

- Phase 1A role permissions.
- Phase 1E reserve and substitution rules.
- Phase 1D season and event relationships.
- Confirmed hole-eight content.

### In scope

- Nine-hole course with named holes.
- Par-three defaults.
- Red and blue basket positions.
- Position-specific distances within 220–425 feet.
- Six groups per event.
- Two teams and four athletes per group.
- One scorekeeper per group.
- Event assignment validation.

### Explicit exclusions

- Unverified playoff rules.
- Automatic scheduling optimization.
- External maps or live GPS integrations.

### Deliverables

- Course layout editor.
- Round setup and intermission display.
- Group assignment screen.
- Scorekeeper assignment screen.
- Assignment validation messages.

### Acceptance checklist

- [ ] Nine holes have numbers and names.
- [ ] All demo holes default to par 3.
- [ ] Red and blue positions can have different distances.
- [ ] All distances are within the approved demo range.
- [ ] Six groups each contain two teams and four athletes.
- [ ] Each group has one scorekeeper.
- [ ] Reserve athletes are not assigned unless an official substitution exists.
- [ ] The event clearly distinguishes round one from round two.

### Access-control and data-integrity checks

- [ ] Only authorized administrators can change assignments after scoring begins.
- [ ] Scorekeepers can access only assigned event scoring data, subject to the approved cross-group rule.
- [ ] Changes to assignments are recorded.

### Demo steps

1. Open the nine-hole course.
2. Configure red basket positions and distances.
3. Configure blue basket positions and distances.
4. Create six groups with two teams each.
5. Assign one scorekeeper to each group.
6. Verify the phone scoring view can identify the round, group, teams, and athletes.

### Open decisions blocking this phase

- Final hole-eight content. **Still open** — the demo will use a neutral
  placeholder hole name until the content is confirmed (D14); nothing in the
  model depends on it.
- Whether scorekeepers may be reassigned during a live event. **Deferred to
  Phase 1G** (D14) — no live scoring exists yet to reassign during;
  assignment changes already leave archived rows behind.

The cross-group scorekeeper access rule is already agreed in Section 4.3: authorized scorekeepers may enter and submit scores across all groups in their assigned event.

## Phase 1G — Mobile scorekeeping and submission

**Status:** Not started

### Goal and user-visible outcome

Authorized scorekeepers can enter individual strokes by hole on a phone, save progress, review totals, and submit their assigned event scoring work.

### Dependencies

- Phase 1A roles.
- Phase 1F course, round, group, and scorekeeper assignments.
- Final score validation rules.

### In scope

- Phone-first scoring view.
- Individual strokes per hole.
- Draft save and resume.
- Author recorded for every score change.
- Group totals and team totals.
- Missing-score detection.
- Draft-to-Submitted lifecycle.
- Clearly labeled demo score generation and correction controls where safe.

### Explicit exclusions

- Approval and publication.
- Fantasy scoring.
- Trades, waivers, or payments.
- Automatic zero-filling.

### Deliverables

- Mobile scorecard.
- Draft persistence.
- Submit action and validation.
- Score-change history display.
- Demo sample-score controls.

### Acceptance checklist

- [ ] Scorekeeper can use the flow on a phone-sized screen.
- [ ] Every hole requires an individual stroke value before submission.
- [ ] Missing scores are visible and block submission or finalization as appropriate.
- [ ] Score changes record author and timestamp.
- [ ] Demo team score equals both athletes' strokes added together.
- [ ] Lower team score is treated as better for the disc golf demo.
- [ ] Submitted scores cannot be silently overwritten.
- [ ] Demo controls are visibly labeled and cannot be mistaken for official data entry.

### Access-control and data-integrity checks

- [ ] Only authorized scorekeepers and permitted administrators can enter scores.
- [ ] Viewers cannot change scores.
- [ ] Every score mutation is scoped to the correct organization and event.
- [ ] Missing values are not stored or interpreted as zero.

### Demo steps

1. Sign in as a group scorekeeper.
2. Open round one on a phone-sized viewport.
3. Enter scores for one group and save progress.
4. Resume and submit the group.
5. Demonstrate that missing scores block completion.
6. Generate labeled demo scores for the remaining groups.
7. Repeat for the blue-position round.

### Open decisions blocking this phase

- Whether scorekeepers can edit after submission and before approval.
- Exact stroke validation bounds by sport and format.

The cross-group scorekeeper access rule is already agreed in Section 4.3: authorized scorekeepers may enter and submit scores across all groups in their assigned event.

## Phase 1H — Official approval, publication, playoff, and corrections

**Status:** Not started

### Goal and user-visible outcome

Owners and administrators can review submitted scores, approve and publish official results, reopen them with a reason, and approve corrections without losing history or duplicating downstream results.

### Dependencies

- Phase 1G submitted scores.
- Phase 1D event relationships.
- Confirmed official-result and correction rules.
- Verified playoff requirements before playoff implementation.

### In scope

- Draft, Submitted, Approved, Published statuses.
- Review and approval screens.
- Protected approved results.
- Reopen with required reason.
- Result versions and audit history.
- Correction reapproval.
- Competition totals and standings inputs.
- Playoff design only after the supplied reference or management decision verifies it.

### Explicit exclusions

- Final playoff implementation before throw and measurement rules are decided.
- Automatic fantasy tie resolution.
- External official-result feeds.

### Deliverables

- Official-results review view.
- Publication controls.
- Correction workflow.
- Version history and audit trail.
- Recalculation process with idempotent downstream updates.
- Playoff design decision record if approved.

### Acceptance checklist

- [ ] Scorekeepers can submit but cannot approve their own official results unless explicitly permitted.
- [ ] Owners and Admins can review and approve.
- [ ] Published results are read-only for ordinary users.
- [ ] Reopening requires a correction reason.
- [ ] Previous and new values are visible with author and timestamps.
- [ ] Corrections require reapproval before publication.
- [ ] Missing scores block approval.
- [ ] A corrected score changes competition standings exactly once.
- [ ] Reprocessing the same official result does not create duplicate records.
- [ ] No playoff rule is presented as final without verification.

### Access-control and data-integrity checks

- [ ] Result approval is enforced in the database and server-side operations.
- [ ] Users cannot forge approval, publication, author, or correction metadata.
- [ ] Audit history is append-only or otherwise protected from ordinary edits.
- [ ] Reopening and correction actions are authorized and reasoned.
- [ ] Organization isolation applies to all result and history records.

### Demo steps

1. Submit both rounds as scorekeepers.
2. Review the submitted results as an Admin.
3. Attempt approval as a Viewer and confirm it is denied.
4. Approve and publish the event.
5. Confirm standings and public results use the published values.
6. Reopen one result with a correction reason.
7. Correct one hole score and reapprove.
8. Confirm visible history and exactly one updated competition result.
9. Confirm fantasy will consume only the corrected published result.

### Open decisions blocking this phase

- Exact playoff mechanics.
- Whether the playoff is competition-only or also affects fantasy ties.
- Final correction and reopening authority.
- Whether published results can be unpublished.

## Phase 1I — Organization publishing and public competition standings

**Status:** Not started

### Goal and user-visible outcome

Each organization has a branded, hosted public page at a unique, shareable URL. Visitors see only the sections the organization has enabled and only the data that has been explicitly published — approved schedules, competition standings, teams, athlete display profiles, and results — while private contact and operating information remains protected. Owners and admins can preview unpublished changes, toggle sections on or off, and publish or unpublish the page without developer help.

The same publication rules that gate the hosted public page also gate the later website embed and read-only public API (Phase 2E and Phase 2F), so a field, section, or record that is not published is not exposed through any of the three surfaces.

### Dependencies

- Phase 1H approved and published results.
- Phase 1B capability-aware navigation and organization branding fields.
- Publication-field decisions.
- Competition standings rules.

### In scope

- **Branded hosted public page** served at a unique, stable public slug on the planned route `/o/<slug>` (the host domain `flihub.app` is illustrative only; the actual deployment domain will be determined separately).
- **Organization branding** on the public page: organization name, tagline, logo, and theme colors drawn from organization settings. No custom domains in this phase.
- **Unique public slug** per organization, reserved on first publish, validated for uniqueness and safe characters, and changeable only by an owner or admin.
- **Preview and publish controls** in the organization management view: a Preview mode that shows the public page exactly as a visitor will see it, a Publish toggle that makes the page reachable at its public URL, and an Unpublish action that removes public access without deleting the underlying data.
- **Capability-based sections**: the public page renders only sections corresponding to the organization's enabled capabilities (for example schedules, standings, teams, athlete profiles, results). Sections an organization has not enabled are absent from the page and from navigation.
- **Explicitly published data**: each public section shows only records and fields that have been explicitly marked as published. Draft, submitted, unapproved, or private data is never shown. Publication is per-record and per-field, not blanket per-organization.
- Public published schedules.
- Public team and approved athlete display profiles.
- Competition standings.
- Published results and correction indicators where appropriate.
- Private/public field separation enforced by the shared publication rules.
- A shared publication-rule layer reused verbatim by the later website embed (Phase 2E) and read-only public API (Phase 2F).

### Explicit exclusions

- Custom domains and DNS configuration (deferred; the public page uses the shared deployment host, illustratively `flihub.app`).
- Website embeds and embeddable widgets (Phase 2E).
- Read-only public API and API keys (Phase 2F).
- Private integration credentials for outbound third-party data sync.
- Public organization discovery, directory, or search across organizations.
- Recruiting, cross-organization search, or youth visibility workflows.
- Fantasy standings until Phase 2C.

### Deliverables

- Branded hosted public page with unique slug and organization branding.
- Preview mode, publish toggle, and unpublish action in the organization management view.
- Capability-based section rendering on the public page.
- Shared publication-rule layer (the single source of truth for what is public).
- Public results, standings, schedules, teams, and athlete display profiles.
- Visibility controls and test fixtures.

### Acceptance checklist

- [ ] Each organization can publish a public page at a unique, stable slug.
- [ ] The public page displays organization branding (name, tagline, logo, theme colors).
- [ ] Preview mode shows the page exactly as a visitor will see it, including unpublished-state differences.
- [ ] Publish makes the page reachable at its public URL; Unpublish removes public access without deleting data.
- [ ] The public page renders only sections for the organization's enabled capabilities.
- [ ] Published schedules are visible according to organization settings and per-record publication status.
- [ ] Public views exclude contact details, operational information, and any field not explicitly published.
- [ ] Draft, submitted, and unapproved data are not public.
- [ ] Standings use only approved and published competition results.
- [ ] Corrected results update public standings after reapproval.
- [ ] Private organization data remains isolated and is not reachable from the public page.
- [ ] The shared publication rules are reused unchanged by the embed and API milestones (verified by design review, not by implementation in this phase).

### Access-control and data-integrity checks

- [ ] Public queries expose only explicitly published fields, enforced by the shared publication-rule layer.
- [ ] The public slug is unique across all organizations and cannot collide with reserved slugs.
- [ ] Preview access is restricted to the organization's own members; visitors cannot see preview state.
- [ ] Unpublishing does not delete historical data or published records.
- [ ] Public access cannot be used to mutate competition records or organization settings.
- [ ] A published page cannot expose a section whose capability is not enabled for the organization.

### Demo steps

1. Configure organization branding (name, tagline, logo, colors) in management settings.
2. Reserve a public slug and open Preview mode.
3. Verify the preview shows only enabled-capability sections and only explicitly published data.
4. Publish the pilot event and the public page.
5. Open the public page at its shareable URL without an organization staff role.
6. Verify schedules, teams, athlete display profiles, standings, and results are visible.
7. Confirm private contact details and unpublished records are absent.
8. Unpublish the page and confirm the URL no longer serves public content.
9. Republish, correct and republish one result, and confirm the public standings update.

### Open decisions blocking this phase

- Which organization branding fields are required vs. optional for publish.
- Slug format, length limits, and reserved-word list.
- Public default settings: whether a newly published page is visible by default or requires an explicit publish action (the latter is assumed).
- Correction visibility wording on the public page.
- Public athlete profile fields and whether athletes can opt out.
- Whether unpublish reverts to a hidden state or a coming-soon placeholder.

## Phase 2A — Fantasy membership and event draft preparation

**Status:** Not started

### Goal and user-visible outcome

A private fantasy league owner can invite and approve participants, configure a participant limit, and prepare a separate draft for each selected event.

### Dependencies

- Phase 1A authentication and organization isolation.
- Phase 1C active athlete pool.
- Phase 1D event relationships.
- Approved fantasy membership model.

The fantasy draft occurs before the event starts and before scoring. It depends on the athlete pool and event structure, not on published official results. Fantasy scoring (Phase 2C) is what depends on Phase 1H published results.

### In scope

- Fantasy league creation and ownership.
- Invitations and participant approval.
- Six-person demo: one owner plus five approved participants.
- Configurable participant limit.
- Separate fantasy permissions and participant room.
- Per-event draft preparation.
- Independently randomized draft order.
- 24-athlete active demo pool.

### Explicit exclusions

- Payments, prizes, refunds, and entitlements.
- Trades and waivers.
- Automatic event start.
- Final replacement ownership rules.

### Deliverables

- Fantasy league setup.
- Invitation and approval room.
- Event selection.
- Draft preparation and order display.
- Participant status view.

### Acceptance checklist

- [ ] Fantasy owner can invite participants.
- [ ] Only approved participants count toward the limit.
- [ ] Six approved participants unlock demo draft preparation.
- [ ] Fantasy permissions are independent from organization staff roles.
- [ ] Each selected event has a separate draft order.
- [ ] Draft orders are saved and do not change unexpectedly.
- [ ] Athlete pool contains only eligible active competing athletes.

### Access-control and data-integrity checks

- [ ] Fantasy members cannot gain organization staff permissions through fantasy membership.
- [ ] Organization staff cannot see private fantasy data unless explicitly granted fantasy access.
- [ ] Invitations are scoped to the intended fantasy league and participant.
- [ ] Duplicate membership and duplicate athlete picks are prevented.

### Demo steps

1. Create a private fantasy league.
2. Invite five participants.
3. Approve all five.
4. Select the two-round disc golf event.
5. Prepare and save the event draft.
6. Show the participant room and saved draft order.

### Open decisions blocking this phase

- Final fantasy league naming.
- Participant visibility and privacy.
- Handling of rejected, withdrawn, or inactive participants.
- Exact draft preparation window.

## Phase 2B — Owner-controlled live snake draft

**Status:** Not started

### Goal and user-visible outcome

The fantasy owner can schedule or manually start a four-round snake draft with a configurable pick timer and eligibility-aware choices.

### Dependencies

- Phase 2A approved participants and saved order.
- Final roster composition and draft rules.
- Phase 1C active athlete eligibility.

### In scope

- Four-round snake order.
- Two male and two female roster outcome.
- Rounds one and two open to available athletes.
- Rounds three and four filtered to preserve valid completion.
- Displayed, saved, and automatic eligibility checks.
- Scheduled, rescheduled, and manually started states.
- Separate gathering countdown and active pick timer.
- 60-second configurable default.
- Timeout preferences or explicitly labeled demo ranking.
- Completed draft results.

### Explicit exclusions

- Trades, waivers, and substitutions after draft lock.
- Paid leagues, prizes, or refunds.
- Automatic draft start.

### Deliverables

- Draft room.
- Owner controls.
- Participant pick controls.
- Timer and notification states.
- Eligibility filter and validation.
- Completed roster view.

### Acceptance checklist

- [ ] Draft order follows saved snake order.
- [ ] Each athlete can be selected only once in the event fantasy league.
- [ ] Rounds one and two show all available eligible athletes.
- [ ] Round three filters choices that would make a valid final roster impossible.
- [ ] Round four offers only the needed gender.
- [ ] Invalid picks are blocked even if a stale client attempts them.
- [ ] Rescheduling notifies participants.
- [ ] Manual start is distinct from scheduled gathering time.
- [ ] Timeout selection respects roster eligibility.
- [ ] Completed rosters are displayed.

### Access-control and data-integrity checks

- [ ] Server-side validation repeats all client-side eligibility rules.
- [ ] Pick timer expiry cannot create duplicate or out-of-order picks.
- [ ] Owner controls cannot change completed picks without an audit record.
- [ ] Draft order and picks are protected from unauthorized alteration.

### Demo steps

1. Schedule a draft and show the gathering countdown.
2. Manually start the draft.
3. Complete four rounds with six participants.
4. Demonstrate gender filtering beginning in round three.
5. Allow one pick to time out and show the labeled fallback selection.
6. Show each participant's completed two-male, two-female roster.
7. Start the event and confirm roster lock.

### Open decisions blocking this phase

- Final timeout fallback policy.
- Incomplete-draft policy at roster lock.
- Participant pick visibility during and after the draft.
- Replacement athlete ownership after official substitutions.

## Phase 2C — Fantasy scoring, explanations, and correction processing

**Status:** Not started

### Goal and user-visible outcome

Fantasy standings are calculated only from published official results, show the scoring-rule version and calculation, and update safely when official results are corrected.

### Dependencies

- Phase 1H published and versioned results.
- Phase 2B completed locked rosters.
- Approved fantasy scoring rules.

### In scope

- Versioned scoring-rule configuration.
- Par-minus-strokes points per athlete.
- Four-athlete roster totals.
- Shared fantasy rankings.
- Point explanations tied to official results.
- Correction-triggered recalculation.
- Idempotent result and point processing.
- Replacement behavior after official substitution once decided.

### Explicit exclusions

- Payments, prizes, refunds, and entitlements.
- Advanced sport rules beyond the demo.
- Trades and waivers.
- Automatic fantasy tie resolution by playoff.

### Deliverables

- Fantasy scoring service/workflow.
- Standings view.
- Per-athlete calculation explanation.
- Scoring-rule version display.
- Correction reprocessing and audit view.

### Acceptance checklist

- [ ] Drafted athletes are linked to the correct event.
- [ ] Only approved and published official results produce fantasy points.
- [ ] Athlete points equal par minus strokes using the selected event scope.
- [ ] Roster total equals the four athlete totals.
- [ ] Higher totals rank above lower totals.
- [ ] Standings explain every athlete's calculation.
- [ ] Corrected official results update affected points exactly once.
- [ ] Reprocessing the same result does not duplicate points.
- [ ] Scoring-rule version is visible.
- [ ] Unapproved or draft changes do not affect fantasy standings.

### Access-control and data-integrity checks

- [ ] Fantasy users cannot alter official competition results.
- [ ] Fantasy scoring cannot bypass official publication status.
- [ ] Scoring rules are immutable once used or are versioned on change.
- [ ] Recalculation is safe to retry.
- [ ] Correction history links competition and fantasy updates.

### Demo steps

1. Publish both event rounds.
2. Open the fantasy standings.
3. Show the four athlete calculations for one participant.
4. Correct one official stroke count.
5. Reapprove and republish the official result.
6. Confirm competition and fantasy standings both change.
7. Repeat the processing action and confirm no duplicate points.
8. Show the correction history and scoring-rule version.

### Open decisions blocking this phase

- Final fantasy event scope across two rounds.
- Replacement athlete point ownership.

Tie presentation and resolution are already agreed: shared fantasy rankings are acceptable for the initial prototype, meaning tied positions are allowed (Section 4.4). Participant visibility is a separate future concern.

## Phase 2D — End-to-end demo and System Map

**Status:** Not started

### Goal and user-visible outcome

Authorized users can understand the complete platform map and demonstrate the approved FliHub-to-fantasy workflow without relying on hidden database operations.

### Dependencies

- Phases 1A–1I.
- Phases 2A–2C.
- Final pilot acceptance criteria.

### In scope

- End-to-end demo script.
- System Map page restricted to authorized users.
- Organization hierarchy and relationships.
- Enabled capabilities.
- Implemented versus planned feature labels.
- Data-flow map from registration through official results to fantasy standings.
- Operational status and audit links.

### Explicit exclusions

- Public system map.
- Technical administration controls for unrelated future services.
- Presenting roadmap features as implemented.

### Deliverables

- Authorized System Map page.
- Full demo data and reset controls where safe.
- Acceptance evidence for the complete workflow.
- Requirement-to-feature traceability report.

### Acceptance checklist

- [ ] Only authorized organization users can open the System Map.
- [ ] The map shows organization, capabilities, leagues, seasons, divisions, teams, rosters, events, results, and fantasy relationships.
- [ ] Enabled, implemented, planned, and upcoming features are visibly distinguished.
- [ ] The map does not expose private contact or operational information to unauthorized users.
- [ ] The complete demo script can be run from visible screens.
- [ ] Organization isolation, role permissions, approval, correction, fantasy scoring, and no-duplicate processing are demonstrated.

### Access-control and data-integrity checks

- [ ] System Map access follows organization membership and role rules.
- [ ] The map reflects server-authoritative capability and permission state.
- [ ] Demo reset controls cannot delete real organization data.
- [ ] Audit links point to immutable or protected history.

### Demo steps

1. Sign in as the pilot owner.
2. Open the System Map.
3. Show enabled capabilities and role assignments.
4. Invite another user and switch roles.
5. Configure the season, teams, event, rounds, groups, and scorekeepers.
6. Create a private fantasy league, approve five participants, and run the four-round snake draft.
7. Start the event and confirm roster lock.
8. Complete two-round scorekeeping.
9. Approve and publish official results.
10. Show competition and fantasy standings.
11. Correct and republish one official result.
12. Show competition and fantasy updates, history, and no duplicate points.
13. Switch to a user from another organization and show isolation.

### Open decisions blocking this phase

- Final System Map audience and role threshold.
- Final pilot acceptance owner.
- Final wording for implemented versus planned features.

## Phase 2E — Website embeds

**Status:** Not started

### Goal and user-visible outcome

An organization can embed lightweight, branded public widgets on its own external website that show the same published schedules, standings, teams, athlete display profiles, and results as the hosted public page. The embeds reuse the Phase 1I publication rules verbatim, so nothing is exposed through an embed that is not also exposed on the hosted page.

### Dependencies

- Phase 1I hosted public page and shared publication-rule layer.
- Approved embed format and styling model.

### In scope

- Embeddable widgets for the published sections available on the hosted public page.
- Embed snippet generation in the organization management view.
- Reuse of the Phase 1I publication rules, public slug, and branding.
- Responsive embed sizing and theme alignment with the host page.
- Read-only embed content with no mutation surface.

### Explicit exclusions

- Custom domains (still deferred).
- Private integration credentials or outbound data sync.
- Interactive mutation through embeds (no scoring, editing, or signup through an embed).
- Cross-organization embed discovery or directory.

### Deliverables

- Embeddable widgets for each published section.
- Embed snippet generator and copy-paste workflow.
- Documentation of allowed embed origins and restrictions.

### Acceptance checklist

- [ ] Embeds show only data that is published on the hosted public page.
- [ ] Embeds cannot expose unpublished, draft, or private data.
- [ ] Embed styling respects organization branding and remains readable on mobile and desktop host pages.
- [ ] Embeds are read-only and provide no mutation or authentication surface.
- [ ] Removing publication removes the data from embeds as well as the hosted page.

### Access-control and data-integrity checks

- [ ] Embed data path goes through the same publication-rule layer as the hosted page.
- [ ] Embeds cannot be used to enumerate or access other organizations' data.
- [ ] Embed origin restrictions, if any, are enforced server-side.

### Demo steps

1. Publish the organization public page from Phase 1I.
2. Generate an embed snippet for standings.
3. Place the snippet on a sample external page.
4. Confirm the embed shows the same published standings as the hosted page.
5. Unpublish a result and confirm it disappears from both the hosted page and the embed.

### Open decisions blocking this phase

- Allowed embed origins and whether origin allowlisting is required.
- Embed styling customization depth.
- Whether embeds require a per-organization embed key distinct from the Phase 2F server-side credentials.

## Phase 2F — Read-only public API

**Status:** Not started

### Goal and user-visible outcome

Organizations and authorized third parties can retrieve published data through a documented, read-only public API. The API returns exactly the same published data as the hosted public page and embeds, reusing the Phase 1I publication rules, and provides no mutation surface.

The API supports two distinct access patterns:

- **Public read-only access** — no key required, returns only explicitly published data from organizations with a published public page. This is the same data any anonymous visitor can see on the hosted public page. No secret is embedded in a public website; the public endpoints require no credential and expose nothing beyond what the hosted page already exposes.
- **Optional server-side API credentials** — per-organization keys intended for server-to-server integrations (a backend calling the API on behalf of an organization), not for embedding in browser-side code. These keys are never required for public read-only access and must never be embedded in a public website or client-side code. They provide identification and rate-limit attribution for trusted callers; they do not unlock unpublished, draft, or private data. The publication rules are the sole gate for what data is returned, regardless of whether a key is present.

### Dependencies

- Phase 1I hosted public page and shared publication-rule layer.
- Phase 2E embed conventions (for consistency of field shapes and branding).
- Approved API authentication and rate-limit model.

### In scope

- Documented read-only endpoints for published schedules, standings, teams, athlete display profiles, and results.
- Reuse of the Phase 1I publication rules and public slug.
- Per-organization server-side API credentials with rotate and revoke controls, intended for server-to-server use only — never embedded in public websites or client-side code.
- Public read-only endpoints that require no credential and return only published data.
- Rate limiting and abuse protections.
- API documentation and example responses.

### Explicit exclusions

- Write or mutation endpoints.
- Private integration credentials for outbound third-party data sync.
- Custom domains.
- Cross-organization search or discovery through the API.

### Deliverables

- Read-only public API endpoints.
- API key management in the organization management view.
- API documentation with field shapes matching the hosted page and embeds.

### Acceptance checklist

- [ ] API responses expose only data that is published on the hosted public page.
- [ ] API responses cannot expose unpublished, draft, or private data.
- [ ] Public read-only endpoints return only published data with no key required.
- [ ] Server-side API credentials are per-organization and can be rotated and revoked.
- [ ] Server-side credentials are never required for public read-only access and must not be embeddable in client-side code.
- [ ] Rate limiting prevents abuse without blocking legitimate use.
- [ ] Removing publication removes the data from API responses as well as the hosted page and embeds.

### Access-control and data-integrity checks

- [ ] API data path goes through the same publication-rule layer as the hosted page and embeds, regardless of whether a server-side credential is present.
- [ ] Server-side API credentials cannot be used to access unpublished, draft, or private data — the publication rules are the sole gate.
- [ ] Server-side credentials cannot be used to mutate data or access other organizations' data.
- [ ] Revoked credentials immediately lose access.
- [ ] No secret is required for or embedded in public read-only access.

### Demo steps

1. Publish the organization public page from Phase 1I.
2. Call the public standings endpoint with no key and confirm the response matches the hosted page.
3. Generate a server-side API credential for server-to-server use.
4. Call the standings endpoint with the credential and confirm the response is identical to the public response.
5. Unpublish a result and confirm both the public and credentialed API responses update accordingly.
6. Revoke the server-side credential and confirm subsequent calls with it fail, while public read-only access continues to work.

### Open decisions blocking this phase

- Server-side credential model (per-organization, rotation policy, whether distinct from any Phase 2E embed key).
- Whether public read-only endpoints need any form of lightweight identification (origin headers, referer checks) beyond no-key anonymous access.
- Rate-limit thresholds and overage behavior.
- API versioning and deprecation policy.

## Phase 3 onward — Separately scoped business capabilities and expansion

**Status:** Not started

These are roadmap areas, not approved launch scope for the disc golf prototype:

- Custom domains and DNS configuration for organization public pages: deferred beyond the shared deployment host (illustratively `flihub.app`) used in Phase 1I. A later milestone may add per-organization custom domains once the hosted page, embeds, and API are stable.
- Private integration credentials for outbound third-party data sync: deferred. The read-only public API (Phase 2F) covers inbound data retrieval; outbound sync to external scoring, payment, messaging, media, or analytics providers is a separate, later scope with its own credential vault and security review.
- Sponsorship sales: contacts, salesperson assignment, packages, agreements, placements, benefits, and payment status.
- Expenses and reimbursements: receipt submission, review, approval/rejection, and recorded reimbursement without money transfer in the initial workflow.
- Coaches, team managers, guardians, and youth workflows.
- Additional sports and competition formats.
- Advanced eligibility and registration.
- Broader communication and notifications.
- Trades, waivers, paid fantasy, prizes, refunds, and entitlements.
- Media library, content rights, publishing, and highlights.
- Training, credentials, certificates, and badges.
- Sponsor auctions.
- Advanced automation, anomaly detection, recommendations, and integrations.
- External scoring, payment, messaging, media, and analytics providers.

Each area requires its own requirements, permissions, data-retention decisions, acceptance criteria, cost assumptions, and security review. These items must not be presented as approved launch functionality.

## 8. End-to-end prototype demo script

The demo follows this agreed order: organization and competition setup → fantasy membership and draft → event start and roster lock → two-round scoring → official approval and publication → competition and fantasy standings → correction, reapproval, and safe recalculation.

### Organization and competition setup

1. Create Organization A using the League starter template.
2. Confirm the owner is the only user with access initially.
3. Invite a second user as Scorekeeper.
4. Invite a third user as Viewer.
5. Create Organization B with a different owner.
6. Verify users cannot cross-read private records.
7. Add one venue.
8. Add one nine-hole course.
9. Configure nine named holes, par 3, and approved distances for red positions.
10. Configure blue-position distances.
11. Import or create 24 active demo athletes.
12. Create 12 competing teams with one male and one female athlete each.
13. Create separate male and female reserve pools.
14. Create one league, one season, and any approved division.
15. Enter the 12 teams into the season or division.
16. Create one two-round event attached to the season.
17. Create six groups with two teams and four athletes each.
18. Assign one scorekeeper per group.

### Fantasy membership and draft

19. Create a private fantasy league.
20. Invite five participants and approve them.
21. Confirm the separate fantasy participant limit and permissions.
22. Prepare a separate draft for the selected event.
23. Confirm the event-specific randomized order is saved.
24. Run the four-round snake draft.
25. Verify one-time athlete ownership and gender eligibility filtering.
26. Show each participant's completed two-male, two-female roster.

### Event start and roster lock

27. Start the event and confirm fantasy rosters lock.

### Two-round scoring

28. Sign in as a scorekeeper on a phone-sized screen.
29. Enter individual strokes for round one using red positions.
30. Leave one score missing and confirm completion is blocked.
31. Complete and submit all groups.
32. Complete round two using blue positions.

### Official approval and publication

33. Sign in as an Admin and review the submitted results.
34. Approve and publish the official results.

### Competition and fantasy standings

35. Confirm public competition results and standings use only published data.
36. Show fantasy points as par minus strokes across both regulation rounds.
37. Show the four-athlete total and calculation explanation.
38. Show fantasy standings with shared rankings allowed for ties.

### Correction, reapproval, and safe recalculation

39. Reopen one score with a required correction reason.
40. Change the score, preserve the previous value, reapprove, and republish.
41. Confirm competition standings update once and show visible history.
42. Confirm fantasy standings update once, with the scoring-rule version and visible correction history.
43. Reprocess the same result and confirm no duplicate fantasy points.

### System Map

44. Open the authorized System Map.
45. Show organization membership, capabilities, leagues, seasons, teams, rosters, events, official results, and fantasy relationships.
46. Show implemented, planned, and upcoming labels.
47. Confirm a Viewer cannot use the map or any visible navigation to bypass permissions.

## 9. Future-capabilities backlog

| Capability                            | Current status              | Planning note                                            |
| ------------------------------------- | --------------------------- | -------------------------------------------------------- |
| Organization memberships              | Missing                     | Required for Phase 1A                                    |
| Owner/Admin/Scorekeeper/Viewer roles  | Missing                     | Required for Phase 1A                                    |
| Invitations and organization switcher | Missing                     | Required for Phase 1A                                    |
| Starter templates                     | Missing                     | Required for Phase 1B                                    |
| Capability-aware navigation           | Missing                     | Required for Phase 1B                                    |
| Race/event starter configuration      | Missing                     | Phase 1B; rules require confirmation                     |
| Account-optional athlete identity     | Partial concept             | Phase 1C                                                 |
| Historical season rosters             | Missing                     | Required for Phase 1E                                    |
| Reserve pools and substitutions       | Partial demo flag only      | Phase 1E                                                 |
| Divisions and season entries          | Missing                     | Phase 1D                                                 |
| Event-to-season relationships         | Missing                     | Phase 1D                                                 |
| Course and round layouts              | Partial database foundation | Phase 1F                                                 |
| Group and scorekeeper assignments     | Partial database foundation | Phase 1F                                                 |
| Mobile scorekeeping                   | Missing                     | Phase 1G                                                 |
| Result lifecycle                      | Missing                     | Phase 1H                                                 |
| Official result audit history         | Missing                     | Phase 1H                                                 |
| Playoff workflow                      | Unverified and undecided    | Phase 1H only after verification                         |
| Public schedules and results          | Missing                     | Phase 1I                                                 |
| Branded hosted public page            | Missing                     | Phase 1I; unique slug, org branding, preview/publish     |
| Capability-based public sections      | Missing                     | Phase 1I; sections gated by enabled capabilities         |
| Shared publication rules              | Missing                     | Phase 1I; reused by embeds (2E) and API (2F)             |
| Public slug reservation               | Missing                     | Phase 1I; unique, validated, owner/admin changeable      |
| Organization branding fields          | Missing                     | Phase 1I/1B; name, tagline, logo, theme colors           |
| Website embeds                        | Missing                     | Phase 2E; reuses Phase 1I publication rules              |
| Read-only public API                  | Missing                     | Phase 2F; reuses Phase 1I publication rules              |
| Server-side API credentials           | Missing                     | Phase 2F; per-org, server-to-server only, rotate, revoke |
| Public read-only API access (no key)  | Missing                     | Phase 2F; returns only published data                    |
| Custom domains                        | Deferred                    | Phase 3+; not in Phase 1I                                |
| Private integration credentials       | Deferred                    | Phase 3+; outbound sync not in 2E/2F                     |
| Fantasy membership                    | Missing                     | Phase 2A                                                 |
| Event drafts                          | Missing                     | Phase 2A                                                 |
| Snake draft                           | Missing                     | Phase 2B                                                 |
| Fantasy scoring                       | Missing                     | Phase 2C                                                 |
| Correction reprocessing               | Missing                     | Phase 2C                                                 |
| Authorized System Map                 | Missing                     | Phase 2D                                                 |
| Sponsorship sales                     | Future capability           | Separate scope                                           |
| Expenses and reimbursements           | Future capability           | Separate scope                                           |
| Youth and guardian workflows          | Future capability           | Separate policy and security review                      |
| Paid fantasy and prizes               | Future capability           | Pricing and legal decisions required                     |
| Media, training, credentials          | Future capability           | Separate releases                                        |
| Additional sports                     | Future capability           | Requires sport configuration model                       |

## 10. Recommended first implementation phase

The recommended first implementation phase is **Phase 1A — Organization memberships, roles, and data isolation**.

This should come before expanding event or fantasy screens because every later workflow depends on knowing who may see, enter, approve, publish, correct, and administer data. It also directly addresses the largest gap between the current owner-only prototype and the agreed FliHub direction.

The first implementation should be limited to:

- Organization membership records.
- Invitation and acceptance flow.
- Owner, Admin, Scorekeeper, and Viewer roles.
- Organization switcher.
- Database-enforced isolation.
- Role-aware behavior in the existing organization screens.
- A two-organization access test.

It should preserve the current Venues, Players, Teams, Leagues, Courses, and demo-data screens. Event, official-result, fantasy, sponsorship, and reimbursement features should wait until the role boundary is working and verified.

## 11. Phase status definitions

- **Not started** — No verified implementation work has begun for the phase.
- **In progress** — Work is actively being designed or implemented, but acceptance is incomplete.
- **Blocked** — A product, access, data, or external dependency prevents responsible implementation.
- **Complete** — User-visible workflow, database integrity, access controls, and acceptance demonstrations have all been verified.
