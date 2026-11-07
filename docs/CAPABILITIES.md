# Capability catalog and organization configuration (Phase 1B)

Phase 1B adds configurable onboarding: starter templates, a capability
catalog, and capability-aware organization navigation.

## Single source of truth

The catalog lives in `src/lib/capabilities/catalog.json`. Both sides load the
same file — there is no forked list:

- The SvelteKit app imports it via `src/lib/capabilities/catalog.ts` (typed
  accessors, dependency helpers, availability metadata).
- The PocketBase hooks `require()` the same JSON
  (`pocketbase/pb_hooks/flihub_capabilities.pb.js` and the organization-create
  handler in `flihub.pb.js`).

## Catalog

| Capability        | Label                      | Availability | Depends on      | Milestone                 |
| ----------------- | -------------------------- | ------------ | --------------- | ------------------------- |
| `athletes`        | Athletes                   | available    | —               | Phase 1C                  |
| `teams`           | Teams & rosters            | available    | athletes        | Phases 1D–1E              |
| `leagues-seasons` | Leagues & seasons          | available    | —               | Phase 1D                  |
| `venues-courses`  | Venues & courses           | available    | —               | Phases 1D–1F              |
| `events`          | Events                     | available    | —               | Phases 1D–1F              |
| `scoring-results` | Scoring & official results | available    | events          | Phases 1G–1H              |
| `standings`       | Competition standings      | available    | scoring-results | Phase 1I                  |
| `fantasy`         | Fantasy leagues            | available    | standings       | Phases 2A–2B (2C planned) |
| `sponsorships`    | Sponsorships               | upcoming     | —               | Phase 3+ (deferred)       |
| `reimbursements`  | Reimbursements & expenses  | upcoming     | —               | Phase 3+ (deferred)       |

Three layers are kept separate:

- **Organization selection** — a capability is enabled or disabled for the
  organization.
- **Software availability** — planned or upcoming in the catalog (enabling a
  planned/upcoming one never makes it look implemented — navigation entries
  are labeled).
- **User authorization** — role permissions from Phase 1A are unchanged;
  enabling capabilities never grants permissions beyond a member's role.

## Template defaults

| Template   | Default capabilities                                                                 | Race distances                                   |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| League     | athletes, teams, leagues-seasons, venues-courses, events, scoring-results, standings | —                                                |
| Race/Event | athletes, venues-courses, events, scoring-results, standings                         | Marathon (42.195 km), Half marathon (21.0975 km) |
| Custom     | none (deliberate selection, no assumptions)                                          | —                                                |

Templates suggest defaults only; selections are editable during onboarding
and later in Settings. Dependency closure is enforced server-side (selecting
`standings` requires `scoring-results`, and so on).

## Permission rules (approved decisions)

- Owners **and** Admins may configure an organization (name, template,
  capabilities, race distances).
- Scorekeepers and Viewers cannot change configuration — denied by the
  trusted hook (403), including direct API requests, and the organizations
  collection's update rule is locked so configuration cannot be written by
  direct record PATCH at all.
- Configuration writes are validated (capability IDs, dependency closure,
  race-distance shape) and audited: `membership_events` records
  `configuration_changed` with actor, time, and before/after values.
- Disabling a capability hides its navigation entries and rejects its direct
  URLs, but never deletes records or configuration; re-enabling restores them.

## Existing organizations (pre-1B)

Organizations created before this phase have `template = ''`,
`capabilities = []`, `onboarded = false`. They keep working — memberships,
invitations, and roles are unaffected — and Owners/Admins see a setup prompt
linking to Settings. Nothing is forced through onboarding and no arbitrary
defaults are applied.

## Race distances

Race/Event organizations carry `race_distances`: a list of
`{ key, label, distance, unit }` with explicit `km`/`mi` units. Marathon and
half-marathon presets are canonical; custom distances must be positive numbers
(≤ 2000) with a 1–60 character label. Distances are configuration only —
scoring and timing rules are separate later milestones and are not invented
here.

## Deferred decisions

- Race scoring and timing rules (Phase 1G/1H scope).
- ~~Whether "available" capabilities should gate writes once those workflows
  exist~~ — answered in Phase 1C: available capabilities gate their writes
  (athletes does, via `pb_hooks/flihub_athletes.pb.js`); reads of preserved
  records stay open to organization members.

## Available capability behavior: athletes (Phase 1C)

When the `athletes` capability is enabled, its navigation destination is a
working athlete manager (list, create, edit, archive/restore, CSV import).
Owners and Admins manage; Scorekeepers and Viewers read. The same rule set
is enforced by the athletes collection API rules, and the capability gate on
writes is enforced by a PocketBase hook, so direct API requests are covered
as well as the UI. There is no permanent delete in Phase 1C — the lifecycle
is archive/restore only and the collection's delete rule is locked.

Athlete records are sport-neutral and organization-scoped. Identity fields
(firstName, lastName, displayName, gender, nationality) live on `athletes`
and are readable by every organization member. Contact/eligibility fields
(email, phone, eligibilityNotes) live in a companion `athlete_private`
collection whose API rules restrict them to Owners and Admins — enforced on
list, detail, relation expansion, and app page data alike. Public display vs
private separation is enforced by the Phase 1I publication-rule layer: the
public athlete-profiles section exposes exactly the display fields, only for
athletes an Owner/Admin has individually published, and `athlete_private` is
never read by any public surface. CSV import creates one
record per row; duplicate identity matching is a documented open product
decision.

## Available capability behavior: competition structure (Phase 1D)

Three capabilities became working workflows in Phase 1D (decisions recorded
as D12):

- **Teams & rosters** — organization-scoped teams (create, rename,
  archive/restore). Phase 1E (decisions recorded as D13) added season
  rosters, reserve pools, and substitutions under this same capability:
  roster rows belong to a team's season entry (season derived server-side,
  never client-trusted); an athlete holds at most one active spot per season
  across rosters and reserve pools (archived rows are the preserved
  participation history); reserve pools are first-class records — never
  teams, so they are structurally excluded from ordinary scheduling — with an
  optional join-time gender restriction (pilot configuration, not a universal
  rule); and substitutions are append-only event-scoped records (who replaced
  whom, for which season-linked event, recorded author) that leave rosters
  and pools untouched. Enforced by the `flihub_rosters.pb.js` hook plus
  partial unique indexes, with SQLite triggers re-running the cross-table
  exclusivity check inside the serialized write so concurrent direct API
  requests cannot create a second active spot.
- **Leagues & seasons** — leagues, seasons (with optional start/end dates),
  divisions, and season entries. Teams enter a season directly; each entry
  carries one optional division assignment, so entries can exist before
  divisions are finalized and seasons can run division-less. Duplicate
  entries per (season, team) are rejected, and a division can only be
  assigned within its own season.
- **Events** — events belong to at most one season or run independently
  (optional season relation), always organization-scoped.

Every organization member reads competition records; only Owners/Admins
write. There is no permanent delete — archive/restore only, with delete
rules locked. The `flihub_competitions.pb.js` hook enforces the capability
gate on writes, same-organization relation targets, division-in-season
assignment, and parent-link immutability (a division's season and an entry's
season/team cannot change after creation), so direct API requests are
covered as well as the UI. Status fields (planned/active/completed/archived)
are scheduling/status foundations only — no automated transitions, and no
standings, official results, fantasy scoring, registration, or payments in
this phase.

## Available capability behavior: event operations (Phase 1F)

Phase 1F (decisions recorded as D14) turned two more capabilities into
working workflows:

- **Venues & courses** — a course-layout manager: courses with numbered,
  named holes (par defaults suggested at 3 in the UI) and labeled positions
  (e.g. "red"/"blue") carrying a positive distance with an explicit unit.
  Venue records (physical locations) remain planned and are labeled as such.
- **Events (event operations)** — ordered rounds per event (optional course
  and position label; the demo plays red, an intermission, then blue): a
  round's position may stay blank for planning, but a NAMED position must
  exist on every active hole of the round's selected course — the UI offers
  only complete labels (incomplete ones are shown with their coverage and
  missing holes) and the hook rejects partial or unknown labels on create and
  update, while saved rounds are never rewritten by later position archives.
  Event groups carry one scorekeeper each (any organization member —
  score-entry permissions arrive with 1G), team assignment goes through
  season entries (season-linked events only), and athlete assignment is
  resolved from Phase 1E season rosters plus event-scoped substitutions: a
  reserve is assignable only for the event whose substitution brought them
  in, a substituted-out athlete is blocked for that event only, and
  assignments never change the season roster.

Demo numbers (nine holes, six groups, two teams + four athletes per group)
are pilot configuration verified in the demo build, never model constraints.
The `flihub_event_ops.pb.js` hook enforces the capability gates, same-org
targets, group-derived event fields, scorekeeper membership, eligibility,
and assignment immutability (archive and recreate — every change leaves a
row). One active group per event per team and per athlete is enforced by
partial unique indexes.

## Available capability behavior: mobile scorekeeping (Phase 1G)

Phase 1G (decisions recorded as D15) turned the scoring half of
**Scoring & official results** into a working workflow; Phase 1H (D16) added
official approval, publication, and corrections; Phase 1I (D17) added
competition standings and public pages. Fantasy consumption remains planned.

- **Permission matrix** — ordinary score entry requires BOTH the Scorekeeper
  role AND an active assignment as a group's scorekeeper in at least one
  active group of the event; the grant covers every group of that event
  (§4.3) and no other event. Owners/Admins may also enter and correct draft
  scores. Viewers are read-only even when listed as a group's scorekeeper —
  the UI labels those assignments as having no scoring access. Enforced in
  the collection API rules (memberships + event_groups joins, re-evaluated
  per request, so reassignment takes effect immediately).
- **Scorecards and scores** — one scorecard per (round, group) with a
  Draft → Submitted lifecycle; per-athlete positive-integer strokes keyed by
  (round, PHYSICAL hole), so a second pass may display holes 10–18 while
  rounds' scores never mix; hole counts beside each round derive from the
  round's course; missing scores are absent rows — never zero — and block
  submission with a count; rounds must reference a course to be scorable.
- **No silent overwrites** — Submitted locks score writes for everyone;
  only Owners/Admins reopen to Draft, and reopening requires a reason that is
  recorded in the change history, preserving prior values and recorded
  authorship. Once scoring starts for a group (its first scorecard exists),
  the group's athlete lineup is fixed — assignments cannot be added,
  archived, or restored through the UI or the direct API — while scorekeeper
  reassignment stays allowed. Every mutation appends to the locked,
  hook-written `score_changes` log (entered/updated with previous and new
  values, submitted, reopened with its reason — with author). A clearly
  labeled demo-fill control writes ordinary draft scores for the fictional
  demo.

The `flihub_scoring.pb.js` hook enforces the capability gate, server-side
derivation (event/round/group/entry/enteredBy are never client-trusted),
submission completeness, and the change log.

## Available capability behavior: official results and corrections (Phase 1H)

Phase 1H (decisions recorded as D16) added the official-results half of
**Scoring & official results**; standings became a working capability in
Phase 1I, while fantasy consumption remains planned.

- **Event-level results** — one official result per event, approvable by an
  Owner/Admin only when every active round references a course and every
  (active round × active group) scorecard is Submitted (missing scores never
  count as zero and block approval through submission). Approval snapshots
  per-athlete and per-team totals into an append-only result version;
  publication stamps that version. Scorekeepers submit but cannot approve —
  there is no self-approval permission mechanism.
- **No silent changes, no unpublish** — while a result is approved or
  published, the event's scorecards are locked (no reopen, no new
  scorecards) until the result itself is reopened with a recorded reason,
  which visibly marks it "under correction" while the last published version
  stays on record. Corrections flow through the 1G scorecard reopen, then
  reapproval appends exactly one new version carrying the correction reason
  — previous values, approver, timestamps, and publication stamps are
  preserved, so the standings input changes exactly once per correction.
  Re-approving or re-publishing the same state is rejected (idempotent
  reprocessing), and `result_versions`/`result_changes` reject all client
  writes, so approval, publication, author, and correction metadata cannot
  be forged.
- **Visibility** — organization members read results, versions, and the
  audit history; published results are read-only for ordinary users. Public
  exposure is handled by the Phase 1I publication-rule layer below.

The `flihub_results.pb.js` hook enforces the capability gate, the
completeness check, the totals snapshots, the transition rules, and the
locked audit log; the review UI lives at
`/organizations/[id]/events/[event]/results`.

## Available capability behavior: standings and public pages (Phase 1I)

Phase 1I (decisions recorded as D17) made **Competition standings** a
working capability and added the organization public page.

- **Standings** — computed exclusively from the currently PUBLISHED official
  result version of each event (D16 pointer): seasons sum total strokes
  across their events with a published result — lowest total leads. A team
  or athlete is ranked only with a result in every event counted in that
  view; incomplete participation shows Unranked with its strokes and an
  event count ("1 of 2 events" — missing results never add strokes). Equal
  totals among ranked rows share a position (no invented tie-break), and
  scores render relative to par (under red, even blue, over black — a
  display preference that never affects ranking). Members see standings over
  all such events at `/organizations/[id]/cap/standings`; the public page
  counts only events that are additionally published per-record.
- **Shared publication-rule layer** — `pocketbase/pb_hooks/public_rules.js`
  is the single source of truth for everything a visitor can read; the
  trusted routes in `flihub_public.pb.js` serve the public payload
  (`/api/flihub/public/{slug}`), the members-only preview, the members-only
  standings, and the Owner/Admin-only audited slug/branding/publish
  management. No collection list/view rule is open to anonymous callers.
  Embeds (Phase 2E) and the public API (Phase 2F) must reuse this module
  verbatim.
- **Explicit, per-record publication** — nothing is public by default. The
  page requires a reserved slug (3–50 lowercase chars, single hyphens,
  unique, reserved-word-checked) and an explicit publish; events, teams, and
  athlete profiles each carry their own `publicPublished` flag. Unpublished
  pages are hidden 404s; unpublishing deletes nothing. Corrected results
  carry a public "Corrected" badge with the republication date — reasons and
  version history stay members-only. The hosted page lives at `/o/<slug>`;
  management and preview at `/organizations/[id]/public`.

## Available capability behavior: fantasy leagues and drafts (Phases 2A–2B)

Phases 2A–2B (decisions recorded as D18) made **Fantasy leagues** a working
capability for league setup and live per-event snake drafts; fantasy scoring
remains planned for Phase 2C.

- **Independent membership** — fantasy seats are personal and separate from
  organization staff roles in both directions: every fantasy write (and the
  draft board read) goes through the trusted `flihub_fantasy.pb.js`
  endpoints, so organization staff see no fantasy data without a seat and
  fantasy managers gain no organization access. The lifecycle is owner
  invite (in-app, existing accounts) → invitee accept/decline → owner
  approve; only approved seats count toward the configurable limit.
- **Per-event snake drafts** — one draft per (league, event), creatable only
  when every seat is approved and the event pool covers 2 MPO + 2 FPO per
  manager. The eligible pool is the event's active group athletes shown with
  their real event teams. The first-round order is drawn randomly once,
  persisted, and reversed each round (24 picks for six managers); the owner
  starts the draft manually.
- **Server-owned boards** — turn, deadline, picks, and rosters live on the
  server, so every manager polls the same state and reconnecting is just
  reloading. Pick clocks are 7/15/30 seconds (2 seconds only on disposable
  demo stacks); expired deadlines auto-pick the highest-ranked available
  athlete who fits the manager's remaining slots (per-draft rankings; the
  production ranking source is a recorded open decision). Turn order,
  eligibility, one-selection-per-athlete, and the 2 MPO + 2 FPO caps are
  transactional with unique-index backstops — a manual pick racing the
  timeout produces exactly one pick.
- **Designated substitutes** — after a withdrawal, the league owner applies
  the event's designated substitute (Phase 1E) to the completed roster slot:
  the original pick is preserved and the substitution recorded separately;
  cross-division, duplicate-ownership, and chained cases are rejected
  pending a product ruling.

The league lobby lives at `/organizations/[id]/fantasy/[league]`; draft
rooms at `/organizations/[id]/fantasy/[league]/draft/[draft]`.
