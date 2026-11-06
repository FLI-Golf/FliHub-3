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
8. Fantasy scoring from published official results only (points = par −
   strokes across both regulation rounds; roster totals sum four athletes).
9. Corrections updating competition and fantasy standings without duplicating
   points.
10. Branded public organization pages, followed later by embeds and a
    read-only public API.

## Phases

| Phase | Name                                                          | Status                                     |
| ----- | ------------------------------------------------------------- | ------------------------------------------ |
| 0     | Runnable foundation                                           | Done                                       |
| 0A–0C | Current-state audit, recording foundation, narration/assembly | See Milestones.md                          |
| 1A    | Organization memberships, roles, and data isolation           | Implemented — verified locally (see below) |
| 1B    | Configurable onboarding and capability-aware navigation       | Implemented — verified locally (see below) |
| 1C    | Athlete identity (sport-neutral records)                      | Implemented — verified locally (see below) |
| 1D    | League, season, division, and event relationships             | Implemented — verified locally (see below) |
| 1E    | Season rosters, reserve pools, and substitutions              | Implemented — verified locally (see below) |
| 1F    | Course layouts, rounds, groups, and scorekeeper assignments   | Complete — merged (see below)              |
| 1G    | Mobile scorekeeping and submission                            | Not started                                |
| 1H    | Official approval, publication, playoff, and corrections      | Not started                                |
| 1I    | Organization publishing and public competition standings      | Not started                                |
| 2A    | Fantasy membership and event draft preparation                | Not started                                |
| 2B    | Owner-controlled live snake draft                             | Not started                                |
| 2C    | Fantasy scoring, explanations, and correction processing      | Not started                                |
| 2D    | End-to-end demo and System Map                                | Not started                                |
| 2E    | Website embeds                                                | Not started                                |
| 2F    | Read-only public API                                          | Not started                                |
| 3+    | Sponsorships, expenses, payments, other sports, and expansion | Deferred                                   |

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

## Unresolved questions (recorded, not answered)

These remain open from Milestones.md and must not be guessed in code:

- Exact playoff measurement precision and equal-distance (equal-total) rules,
  and whether playoffs affect fantasy standings. The team shootout format
  itself is recorded in Milestones.md §4.8 (documentation only — not
  implemented).
- Scoring-time resolution when a round's named basket position is missing or
  archived on some hole after the round was saved (round coverage is
  validated at save time only — D14 Decision 7); define with Phase 1G
  scoring.
- Substitution identity and fantasy ownership effects when a reserve athlete
  replaces a drafted athlete.
- Incomplete-draft handling and the final draft preparation/completion window.
- Exact invitation/acceptance experience and ownership-transfer UX details.
- Which published fields are public by default and per-organization
  restrictions.

## Deferred work

Sponsorships, expenses, reimbursements, payments, prizes, trades, waivers,
custom domains, additional sports, external integrations, and narration
services are out of scope until separately approved.
