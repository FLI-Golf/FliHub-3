# FliHub roadmap

This roadmap restates the milestone plan from [Milestones.md](../Milestones.md)
as **planned work**. Nothing listed here is implemented in the foundation
build. A capability is only marked complete after its user-visible workflow and
access-control behavior are verified end to end.

## Demonstration scope

The first end-to-end demonstration covers:

1. Organization creation, invitations, roles, and organization switching.
2. Athletes, teams, leagues, seasons, rosters, venues, and courses.
3. A two-round disc golf event on a nine-hole course (red then blue basket
   positions, twelve teams of one male and one female athlete, separate reserve
   pools, six groups of two teams, one assigned scorekeeper per group).
4. Mobile scoring and score submission (Draft → Submitted).
5. Official approval, publication, and correction history (Approved →
   Published; corrections preserve author, time, reason, previous values, and
   require reapproval).
6. Competition standings from published official results.
7. A six-person fantasy league and an event-specific, eligibility-aware
   four-round snake draft (independently randomized saved order, 60-second
   configurable pick timer, manual start by the owner).
8. Fantasy scoring from published official results only (score = strokes −
   snapshotted par across all required event rounds; lowest wins; roster totals sum four athletes).
9. Corrections updating competition and fantasy standings without duplicating
   points.
10. Branded public organization pages, followed later by embeds and a
    read-only public API.

## Phases

| Phase | Name                                                          | Status                                          |
| ----- | ------------------------------------------------------------- | ----------------------------------------------- |
| 0     | Runnable foundation                                           | Done                                            |
| 0A–0C | Current-state audit, recording foundation, narration/assembly | See Milestones.md                               |
| 1A    | Organization memberships, roles, and data isolation           | Implemented — verified locally (see below)      |
| 1B    | Configurable onboarding and capability-aware navigation       | Implemented — verified locally (see below)      |
| 1C    | Athlete identity (sport-neutral records)                      | Implemented — verified locally (see below)      |
| 1D    | League, season, division, and event relationships             | Implemented — verified locally (see below)      |
| 1E    | Season rosters, reserve pools, and substitutions              | Implemented — verified locally (see below)      |
| 1F    | Course layouts, rounds, groups, and scorekeeper assignments   | Complete — merged (see below)                   |
| 1G    | Mobile scorekeeping and submission                            | Complete — merged (see below)                   |
| 1H    | Official approval, publication, playoff, and corrections      | Complete — merged (see below; playoff excluded) |
| 1I    | Organization publishing and public competition standings      | Complete — merged (see below)                   |
| 2A    | Fantasy membership and event draft preparation                | Implemented — verified locally (see below)      |
| 2B    | Owner-controlled live snake draft                             | Implemented — verified locally (see below)      |
| 2C    | Fantasy scoring, explanations, and correction processing      | Prepared — Codespaces verification pending      |
| 2D    | End-to-end demo and System Map                                | Not started                                     |
| 2E    | Website embeds                                                | Not started                                     |
| 2F    | Read-only public API                                          | Not started                                     |
| 3+    | Sponsorships, expenses, payments, other sports, and expansion | Deferred                                        |

## Organization and permission rules (Phase 1A — implemented)

- Users may belong to multiple organizations; creating an account grants no
  organization access.
- Roles are Owner, Admin, Scorekeeper, and Viewer. Every organization has
  exactly one primary Owner.
- Only Owners appoint Admins or change member roles; Admins may invite
  Scorekeepers and Viewers.
- Ownership transfer is atomic; the former Owner becomes Admin. The sole Owner
  cannot leave before transferring ownership.
- Owners may remove non-owner members; Admins may revoke invitations but cannot
  remove accepted members; non-owner members may leave voluntarily.
- Invitations are organization-scoped, expiring (default 7 days,
  `FLIHUB_INVITE_TTL_HOURS`), single-use, and must verify the intended
  authenticated recipient. Invitations are shared by copy-link; **email
  delivery of invitations is not implemented**.
- Private records are isolated between organizations.
- Organization staff roles are separate from fantasy membership and
  commissioner permissions.
- Complex membership operations are enforced by trusted transactional
  PocketBase hooks (`pocketbase/pb_hooks/flihub.pb.js`) — never client-side
  multi-step writes.

### Phase 1A verification record

Verified on this branch (2026-11-05), locally:

- `npm run test:integration` — 15/15 passing against a disposable PocketBase
  - mailpit (isolation, role matrix, invitation lifecycle, single-owner
    invariant, concurrency, audit trail).
- Browser acceptance flow (headless Chromium): register → verify email →
  sign in → create organization → invite → recipient registers through the
  preserved invite destination and accepts → switch organizations → role
  boundaries (Scorekeeper has no management UI; Admin cannot invite Admins) →
  atomic ownership transfer → sign out; mobile-width spot check.
- `npm run check`, `npm run lint`, `npm run build` — all passing.

Remaining Phase 1A limitations: invitation email delivery is not implemented
(copy-link only); destructive confirmations use the browser `confirm()` dialog
rather than shadcn-svelte dialogs; Scorekeeper event permissions and Admin
result approvals belong to later phases.

### Phase 1B verification record

Verified on this branch (2026-11-05), locally (CI has not run for this branch
yet — no claim about CI is made or implied):

- `npm run test:integration` — 25/25 passing (15 Phase 1A regression + 10
  Phase 1B): template defaults, editable subsets, dependency closure,
  Owner/Admin configuration, Scorekeeper/Viewer/outsider denial including
  direct API, cross-organization isolation, distance validation, persistence
  across sessions, disable/re-enable data preservation, no role escalation,
  pre-1B organizations keep working and onboard later.
- Browser acceptance flow (headless Chromium, `tests/e2e/phase1b.spec.mjs`):
  League/Race-Event/Custom onboarding, honest planned capability pages,
  disabled-capability direct-URL denial, settings persistence, viewer
  read-only settings + 403 direct denial, mobile onboarding at 375px, and the
  Phase 1A walkthrough regression (narrated video + captions still play).
- `npm run check`, `npm run lint`, `npm run build` — all passing.

Remaining Phase 1B limitations: race distances are configuration only
(scoring/timing rules deferred); see docs/CAPABILITIES.md for the catalog and
permission model. The narrated walkthrough video for Phase 1B was added in
PR #5.

### Phase 1C verification record

Verified on this branch (2026-11-05), locally (CI runs on the PR):

- `npm run test:integration` — 30/30 passing (25 Phase 1A/1B regression + 5
  Phase 1C): capability-gated writes (hook denies when disabled, including
  direct API), organization scoping (cross-org reads/writes denied), role
  enforcement (Owner/Admin write; Scorekeeper/Viewer read-only), disable →
  preserve → re-enable, required identity fields, sport-neutral record shape.
- Browser acceptance flow (headless Chromium, `tests/e2e/phase1c.spec.mjs`):
  onboarding with the athletes capability, manager reachable from
  organization navigation, create/edit/archive/restore, CSV import, viewer
  read-only + direct-API denial, disable/re-enable preservation, mobile at
  375px. Phase 1A and 1B specs pass unchanged (1B's "planned page" assertion
  moved from Athletes to Teams when Athletes became available).
- `npm run check`, `npm run build` — exit 0; Prettier/ESLint — exit 0
  (combined lint can be SIGTERM'd under this container's memory pressure —
  suspected resource kill, not a rule failure; each half passes separately).

Remaining Phase 1C limitations: CSV import creates one record per row (no
duplicate matching — open product decision); no cross-organization athlete
participation (open decision); no photo/flag imports (no source data in this
repository); final pilot eligibility fields undecided.

### Phase 1D verification record

Verified on this branch (2026-11-06), locally (CI runs on the PR):

- Decisions: both blocking questions approved by Dustin and recorded as D12 —
  teams enter a season directly with one optional division assignment;
  events belong to one season or run independently.
- `npm run test:integration` — 40/40 passing (31 Phase 1A–1C regression + 9
  Phase 1D): capability-gated writes, organization scoping (cross-org reads,
  writes, and relation targets denied), role enforcement (Owner/Admin write;
  Scorekeeper/Viewer read-only; outsiders see nothing), duplicate (season,
  team) entry rejection, division-in-season assignment, parent-link
  immutability (division season; entry season/team), schedule date
  validation, disable → preserve → re-enable, archive preservation, and
  locked deletes on all six collections.
- Migrations: full chain from empty on a disposable PocketBase (suite boot +
  19/19 hook/rules smoke), and an upgrade rehearsal from the merged Phase 1C
  schema (d325150) with seeded athlete/private fixtures — 13/13 assertions
  (exact IDs, statuses, organization links, and private values preserved;
  new collections queryable). No private values printed.
- Browser acceptance (`tests/e2e/phase1d.spec.mjs`, 20 assertions):
  onboarding with the three capabilities, league + division-less season,
  direct team entry before divisions exist, late division assignment,
  independent + season-linked events, archive/restore preservation, viewer
  read-only + direct-API denial, mobile at 375px. Full suite (1A–1D specs):
  88 assertions, exit 0 (1B's planned-panel example moved from Teams to
  Venues & courses, since Teams is now a working page).
- `npm run check`, `npm run build`, Prettier, ESLint — exit 0.

### Phase 1E verification record

Verified on this branch (2026-11-06), locally (CI runs on the PR):

- Decisions: all four blocking questions approved by Dustin and recorded as
  D13 — roster rows belong to the team's season entry; reserve pools are
  first-class records (never teams, so scheduling exclusion is structural);
  one active spot per athlete per season across rosters and pools; and
  append-only substitutions whose event must be season-linked to the entry's
  season. Demo counts and gendered pools are pilot configuration, not
  universal rules.
- `npm run test:integration` — 53/53 passing (42 Phase 1A–1D regression + 11
  Phase 1E): capability-gated writes on all four collections, season derived
  from the entry/pool (client values ignored), one-active-spot exclusivity
  (partial unique indexes + cross-table hook check, both directions, restore
  re-checked), concurrency regression — concurrent roster/reserve creates and
  restores for the same athlete from two independent authorized sessions end
  with exactly one active spot (a reproduced hook-level race, 4/20 creates and
  2/20 restores, fixed by SQLite exclusivity triggers that re-run the
  cross-table check inside the serialized write), participation history
  preserved through archive and re-add, pool gender restriction at join time
  with immutable restriction, append-only
  substitutions (owner update/delete denied) with hook-set recordedBy
  (spoofing ignored) and side-effect isolation (roster and pool rows
  unchanged), independent/wrong-season events rejected, unrostered or
  non-reserve athletes rejected, cross-org reads/writes/links denied, role
  enforcement, parent-link immutability, disable → preserve → re-enable.
- Migrations: full chain from empty on a disposable PocketBase (suite boot),
  and an upgrade rehearsal from the merged Phase 1D schema with seeded
  league/season/entry/athlete/event fixtures — 7/7 assertions (exact IDs and
  links preserved; roster and pool usable on legacy records).
- Browser acceptance (`tests/e2e/phase1e.spec.mjs`, 17 assertions): athlete
  assigned to a team's season entry from the Teams & rosters page, male-only
  reserve pool with candidate filtering, substitution recorded with event +
  both athletes + reason while the roster stays intact, removal shown as
  "Past member" (history preserved), viewer read-only in the UI and denied at
  the direct API, mobile at 375px. Full suite (1A–1E specs): exit 0.
- `npm run check`, `npm run build`, Prettier, ESLint — exit 0.

### Phase 1F verification record

Verified on this branch (2026-11-06), locally (CI runs on the PR):

- Decisions: all six open rules approved by Dustin and recorded as D14 —
  courses only (venues stay planned), sport-neutral labeled hole positions
  with explicit units, demo numbers as pilot configuration, season-linked
  events required for group team/athlete assignment, any member assignable as
  a group's scorekeeper (score-entry permissions are 1G), and lifecycle rows
  as the assignment change record.
- `npm run test:integration` — 62/62 passing (53 Phase 1A–1E regression + 9
  Phase 1F): capability-gated writes (venues-courses vs events), course
  layout invariants (unique active hole numbers and position labels, archived
  numbers reusable, positive distances with explicit units, no fabricated
  range limits), ordered rounds per event, scorekeeper-must-be-member (viewer
  role assignable, outsider rejected), event derived from the group (client
  values ignored), season-linked-event requirement with same-season entries,
  eligibility from rosters + event-scoped substitutions (reserve blocked
  without a substitution, assignable only for the event with one;
  substituted-out athlete blocked for that event only, restore re-checked),
  named round positions requiring coverage on every active hole of the
  selected course (red on 9/9 saves; blue on 8/9 rejected naming hole 9;
  unknown labels and course-less named labels rejected; blank still saves;
  saved rounds unaffected by later position archives, status-only updates
  unblocked, same-label edits not re-validated),
  season roster and reserve pool untouched by assignments, one group per
  event per team and per athlete, assignment rewiring blocked (archive and
  recreate), cross-org reads/writes/links denied, role enforcement, disable →
  preserve → re-enable.
- Migrations: full chain from empty on a disposable PocketBase (suite boot),
  and an upgrade rehearsal from the merged Phase 1E schema with seeded
  roster/event fixtures — 6/6 assertions (records and links preserved; new
  collections usable on legacy data).
- Browser acceptance (`tests/e2e/phase1f.spec.mjs`, 19 assertions): working
  course manager with honest "venues planned" label, par-3 default, red/blue
  positions with different distances, two rounds with an intermission marker,
  group with member scorekeeper, team assignment via season entry, eligible
  athlete filtering (reserve absent until a substitution, substituted-out
  athlete removed, reserve labeled and assignable afterwards), season roster
  preserved, viewer read-only in the UI and denied at the direct API, mobile
  at 375px. Full suite (1A–1F specs): exit 0 (1B's planned-panel example
  moved from Venues & courses to Scoring & official results, since Venues &
  courses is now a working page).
- Format verification (`tests/e2e/phase1f-formats.spec.mjs`, 21 assertions):
  (A) a single nine-hole event built entirely through the organizer UI — one
  course, nine named holes each with one chosen position, one event with
  exactly one round, the position picked from the course's actual labels, and
  no second round or intermission marker; (B) the FLI two-round demo — one
  course with exactly nine physical hole records (par 3, red/blue positions
  all within 220–425 ft, hole 8 on placeholder demo naming), round 1 red →
  intermission → round 2 replaying the same nine holes at blue (18 holes of
  play from nine hole records), six groups of two teams and four athletes
  with one scorekeeper each — saved configuration verified via the API and
  the organizer view verified in the browser for both rounds and the break.
- `npm run check`, `npm run build`, Prettier, ESLint — exit 0.

### Phase 1G verification record

Verified on this branch (2026-11-06), locally (CI runs on the PR):

- Decisions: approved by Dustin and recorded as D15 — ordinary score entry
  requires BOTH the Scorekeeper role AND an active group assignment in the
  event (event-wide, cross-group per §4.3; Viewers read-only even when listed
  as a group's scorekeeper, labeled in the UI); Owners/Admins may enter and
  correct drafts; Submitted is immutable for everyone with Owner/Admin-only
  audited reopen that requires a reason recorded in the change history; once
  a group's scoring starts (its first scorecard exists) the athlete lineup is
  fixed while scorekeeper reassignment stays allowed; positive-integer
  strokes (bounds are pilot configuration);
  missing scores are absent rows, never zero; scoring-time position gaps are
  a non-blocking display note; labeled demo-fill control.
- `npm run test:integration` — 67/67 passing (62 Phase 1A–1F regression + 5
  Phase 1G): capability gate, the full permission matrix (cross-group entry
  within the assigned event, denial in another event, unassigned scorekeeper
  denied, viewer-as-scorekeeper denied, immediate effect of reassignment at
  the direct API), server-side derivation (event/round/group/entry/enteredBy
  never client-trusted), one score per (round, athlete, PHYSICAL hole) with
  per-round separation, zero/non-integer strokes rejected, rounds without a
  course rejected, missing-cells submission rejection with counts, submitted
  locks for scorekeepers AND admins (no silent overwrite), scorekeeper reopen
  denied, reopen without a reason rejected, Owner reopen (with reason)
  preserving score values and recorded authorship with the reason in the log,
  lineup locked once scoring starts (group athlete additions and archiving
  rejected at the direct API) while scorekeeper reassignment still works,
  append-only hook-written change log (entered/updated with prev→new/
  submitted/reopened; direct writes locked), cross-org scoping and outsiders.
- Migrations: full chain from empty (suite boot) and an upgrade rehearsal
  from the merged Phase 1F schema — 5/5 (legacy assignments preserved;
  scorecards, scores, and submission work on legacy data).
- Browser acceptance (`tests/e2e/phase1g.spec.mjs`, 21 assertions, 375 px):
  the phone scorecard identifies event/round/group/teams/athletes from the
  1F setup; "Round 1 · 9 holes · red — intermission — Round 2 · 9 holes ·
  blue" with hole counts derived from the course; draft save/resume; missing
  scores visible, labeled never-zero, and blocking Submit; labeled demo-fill;
  submission stamps the submitter; cross-group entry in the same event; the
  second pass displays 10–18 while the API confirms storage at (round 2,
  physical hole 1) with round 1 untouched; viewer read-only in UI and at the
  direct API with the no-scoring-access label; Owner reopen requires a
  reason, preserves values, and shows the reason in the authored change
  history; a single nine-hole round renders
  with no intermission; the Scoring page lists ready events and keeps
  approval in Phase 1H. Full suite (1A–1G specs): exit 0 (1B's editable-
  defaults example now unchecks Venues & courses, keeping Standings as the
  planned-panel example since Scoring became a working page).
- `npm run check`, `npm run build`, Prettier, ESLint — exit 0.

### Phase 1H verification record

Verified on this branch (2026-11-06), locally (CI runs on the PR):

- Decisions: approved by Dustin and recorded as D16 — event-level official
  results (one per event, approvable only when every active round has a
  course and every (round × group) scorecard is Submitted); Owner/Admin-only
  approve/publish/reopen/reapprove with no self-approval mechanism; reopening
  requires a recorded reason and there is NO unpublish — the published
  version stays on record while the result is visibly "under correction";
  totals are snapshotted per version so later edits can never silently change
  a published result; the result record carries a hook-maintained
  `publishedVersion` pointer, so the UI and the direct API always distinguish
  the official published version from a newer approved-but-unpublished one;
  members read, published results are read-only for
  ordinary users; standings/fantasy/playoff stay outside 1H (the version
  totals are the standings input).
- `npm run test:integration` — 72/72 passing (67 Phase 1A–1G regression + 5
  Phase 1H): capability gate; Viewer/Scorekeeper approval, publication, and
  reopen denied in rules; client-sent status/version/reason metadata
  overwritten; result_versions and result_changes locked against direct
  writes and edits; approval blocked with counts while scorecards are missing
  or unsubmitted and when an active round has no course; version-1 totals
  snapshot checked; duplicate results prevented (unique event); re-approve/
  re-publish of the same state rejected (idempotent); scorecard reopen and
  new scorecards blocked under an approved/published result (result_locked);
  reasoned result reopen → 1G scorecard correction → reapproval producing
  exactly one new version carrying the reason with the previous version's
  totals and publication stamps untouched; the result_changes log reads
  approved v1 → published v1 → reopened v1 → approved v2 → published v2;
  cross-organization references and outsider access denied.
- Browser acceptance (`tests/e2e/phase1h.spec.mjs`): the FLI demo's four
  submitted scorecards reviewed read-only by a Viewer (no approve control;
  direct API denied); Owner approval snapshotting team totals (108) as v1;
  publication stamped with author; the score page explaining the result lock
  and the direct API rejecting scorecard reopen under a published result;
  unpublish and reasonless reopen rejected; a reasoned reopen showing "Under
  correction" with the reason; a hole corrected 3 → 5 through the 1G flow;
  reapproval producing v2 (total 110) while v1 keeps its values and
  publication stamp; version forgery rejected; republication with the full
  audit trail visible. Viewer-session official-result continuity verified at
  every stage: after v1 publishes the Viewer sees 108 as the official total;
  the official total stays v1/108 mid-correction AND after v2 is approved
  but not yet published (the pending v2 is explicitly labeled not official,
  and the direct API keeps publishedVersion = 1 with no publication stamp on
  v2); after republication the Viewer sees 110 with v1 intact at 108 in the
  version history. Full suite (1A–1H specs): exit 0.
- `npm run check`, `npm run build`, Prettier, ESLint — exit 0.

### Phase 1I verification record

Verified on this branch (2026-11-07), locally (CI runs on the PR):

- Decisions: approved by Dustin and recorded as D17 — standings sum total
  strokes per season over the currently PUBLISHED official result version of
  each eligible event (lowest leads; rows are ranked only with a result in
  every event counted in that view — incomplete participation shows
  Unranked with its strokes and "played of counted", and missing results
  never add strokes; equal totals among ranked rows share a rank, with a
  needed-winner tie resolved after the round where it occurs via the
  recorded future-work shootout — no playoff in 1I; par-relative coloring —
  under par red, par blue, over par default — is a display preference only); one shared publication-rule layer
  (`pocketbase/pb_hooks/public_rules.js`) is the only public read path — no
  collection rule was opened to anonymous callers; publication is explicit
  and per-record; slugs are 3–50 lowercase chars with single hyphens, unique,
  reserved-word-checked, Owner/Admin-managed through a trusted audited
  endpoint; unpublished pages are hidden 404s; corrected results carry a
  "Corrected" badge with the republication date and reasons stay private.
- `npm run test:integration` — 77/77 passing (72 Phase 1A–1H regression + 5
  Phase 1I): Owner/Admin-only public-page management with slug
  validation/normalization/reservation/uniqueness and locked direct
  organization writes, audited changes; hidden-until-published pages with
  exact top-level/organization/athlete field whitelists, per-record
  publication, no private contact data, no internal configuration, members-
  only anonymous collection reads, unpublish-then-republish preserving data;
  the D16 standings acceptance (published v1 counts once; a pending
  approved-but-unpublished v2 changes nothing and leaks no reason;
  republication replaces the contribution exactly once with a correction
  indicator); aggregation (season sums across two events with per-event and
  summed par, rank order, shared season boundaries — a second season and a
  members-only event never leak into the public tables, while member
  standings include every officially published event); preview and member
  standings restricted to members with anonymous callers rejected and
  viewer toggles denied.
- Browser acceptance (`tests/e2e/phase1i.spec.mjs`): owner reserves the slug
  and branding, publishes the event/team/one athlete per-record, sees a 404
  before the explicit page publish, publishes; a SIGNED-OUT context then
  reads `/o/<slug>` — branding, schedule, standings (v1 total, E at par),
  result, published team and athlete only — with the private athlete email/
  phone/notes absent from the rendered HTML and the raw payload, the D11
  field whitelist asserted on the payload, and unknown slugs 404; the D16
  correction lifecycle on the public surface (pending v2 invisible,
  republished v2 shown once with a Corrected badge and no reason);
  unpublish hides the page (404) while the members-only preview keeps the
  data; a Viewer gets the preview with no management controls; the member
  standings capability page shows the corrected totals. Full suite (1A–1I
  specs): exit 0 (1B now uses Fantasy as the honest planned-panel example
  since Standings became a working page).
- `npm run check`, `npm run build`, Prettier, ESLint — exit 0.

Remaining Phase 1I limitations: the organization logo is a URL field
(upload deferred); athlete self-service opt-out from public profiles is a
recorded open decision; embeds (2E) and the public API (2F) must reuse
`public_rules.js` verbatim when they arrive. The full six-group disc golf
demo, tracked separately, has since been verified end to end (see the
demonstration verification record below).

Phase 1I closeout (2026-11-07): merged as PR #22 (`d9faa3a`); the D17
completeness ranking (ranked only with a result in every counted event;
Unranked rows show their strokes and "1 of 2 events"-style counts) was added
and verified on the merged main (78/78 integration, full 1A–1I e2e). The
narrated walkthrough was recorded on a disposable stack with fictional data,
approved, and published byte-identically at `/walkthroughs/phase1i` with
captions (see docs/phase1i-standings-public-pages-walkthrough/README.md).

### Six-group demonstration verification record

Verified on 2026-11-07 (baseline `4ce55d5`, PR #23), locally on a disposable
stack via `tests/e2e/demo-sixgroup.spec.mjs` (27 assertions; runs with the
e2e suite):

- The EXACT Phase 1F demo fixture (tests/e2e/phase1f-formats.spec.mjs
  Part B): one course with nine par-3 hole records (red + blue positions in
  the 220–425 ft range, hole 8 keeping its placeholder demo name), a Red
  round, an intermission, and a Blue round replaying the same nine holes,
  12 teams of one male and one female rostered athlete (24 athletes),
  separate reserve pools, and six groups of two teams with an assigned
  scorekeeper.
- Scorekeeping through the scorekeeper's own credentials: all 12 scorecards
  (6 groups × 2 rounds) created, filled with deterministic varied strokes,
  and SUBMITTED by the assigned scorekeeper (submission stamps verified).
- Completeness: 432 scores exist and every one of the 24 athletes has
  exactly 9 scores in each of the two nine-hole rounds.
- Official approval and publication (D16): one result, published as v1;
  every published per-athlete total, per-athlete per-round total, and
  per-team total matches the independently recomputed submitted strokes
  (24 + 12 rows checked exhaustively).
- Signed-out browser: the hosted public page shows the published result
  exactly once and one season standings table counting the event exactly
  once; all 12 teams ranked at "1 of 1" with totals matching the submitted
  scores (equal totals share ranks per D17); all 24 athletes listed; the
  rendered leader row matches the payload and the recomputed totals.

The fantasy portions of the demonstration (membership, draft, scoring,
corrections) remain with Phases 2A–2C.

### Phases 2A–2B verification record

Verified on this branch (2026-11-07), locally (CI runs on the PR):

- Decisions: approved by Dustin and recorded as D18 — fantasy membership
  fully independent of organization staff roles (trusted hook endpoints own
  every fantasy write and the draft board read); invite → accept → approve
  with only approved seats counting toward the configurable limit; one
  fresh four-round snake draft per (league, event) with a randomly drawn,
  PERSISTED first-round order reversing each round (24 picks); rosters of
  exactly 2 MPO + 2 FPO enforced server-side along with event eligibility,
  turn order, and one selection per athlete; 7/15/30-second pick clocks
  (2 seconds on disposable demo stacks only via FLIHUB_FANTASY_DEMO_CLOCK);
  server-persisted turns and deadlines with lazy timeout processing and
  slot-aware auto-picks from per-draft rankings (production ranking source
  recorded open); designated event substitutes take completed roster slots
  with the original pick preserved and ambiguous cases rejected.
- `npm run test:integration` — 84/84 passing (78 Phase 1A–1I regression + 6
  Phases 2A–2B): the membership lifecycle with owner-only controls and the
  participant limit; fantasy/staff independence in both directions
  (organization admins see no fantasy data; fantasy managers read no
  organization records and cannot write); draft preparation gates (seats,
  pool size, clock and rankings validation), persisted independent orders
  per event, and one-draft-per-event; a scripted 24-pick snake draft
  asserting every pick's seat, both reversals, turn/eligibility/duplicate/
  division-cap rejections, and six 2+2 rosters; timeout behavior on the
  2-second demo clock — the draft PAUSES at the expired deadline while all
  six managers are disconnected, the first reconnect triggers exactly one
  overdue auto-pick, a fresh client resumes from identical persisted state,
  a manual pick racing the timeout produces exactly one pick and advances
  the turn once (and two racing ticks act once), and a full
  timeout-completed draft lands 24 picks with every roster at 2 MPO + 2 FPO
  despite male-first rankings; designated substitutions preserving the
  original pick, surfacing pending designations, and rejecting chained,
  cross-division, and duplicate-ownership cases.
- Browser acceptance (`tests/e2e/phase2ab.spec.mjs`): the lobby shows 6 of 6
  approved seats; the owner starts the draft from the room; the saved order
  renders; the on-the-clock manager picks from the live board; a timeout
  auto-pick lands on camera (labeled Auto); a reconnecting manager sees the
  shared board; the completed draft renders six final rosters at exactly
  2 MPO / 2 FPO with real event teams on every athlete and the snake
  reversal visible in the log; a designated substitution is applied from
  the room with the original pick still displayed. Full suite (1A–2B specs
  plus the six-group demo): exit 0 (1B now uses Sponsorships as the honest
  deferred-panel example since Fantasy became a working page).
- `npm run check`, `npm run build`, Prettier, ESLint — exit 0.

Remaining Phases 2A–2B limitations: invitation email delivery is not
implemented (in-app seats only); scheduled gathering countdowns and
rescheduling notifications are open (manual start only); the production
auto-pick ranking source and equal-rank ordering are open (deterministic
placeholder); live updates poll the server-owned board (no PocketBase
realtime yet); fantasy scoring is Phase 2C and is not on this branch.

## Unresolved questions (recorded, not answered)

These remain open from Milestones.md and must not be guessed in code:

- Exact playoff measurement precision and equal-distance (equal-total) rules,
  and whether playoffs affect fantasy standings. The team shootout format
  itself is recorded in Milestones.md §4.8 (documentation only — not
  implemented).
- Substitution identity and fantasy ownership effects when a reserve athlete
  replaces a drafted athlete.
- Incomplete-draft handling and the final draft preparation/completion window.
- Exact invitation/acceptance experience and ownership-transfer UX details.
- Which published fields are public by default and per-organization
  restrictions — largely resolved by D17 (nothing public by default,
  per-record publication, fixed field whitelists in the shared
  publication-rule layer); per-organization restrictions beyond the fixed
  whitelist and athlete self-service opt-out remain open.

## Deferred work

Sponsorships, expenses, reimbursements, payments, prizes, trades, waivers,
custom domains, additional sports, external integrations, and narration
services are out of scope until separately approved.
