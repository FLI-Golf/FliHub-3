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

| Capability        | Label                      | Availability | Depends on      | Milestone           |
| ----------------- | -------------------------- | ------------ | --------------- | ------------------- |
| `athletes`        | Athletes                   | available    | —               | Phase 1C            |
| `teams`           | Teams & rosters            | available    | athletes        | Phases 1D–1E        |
| `leagues-seasons` | Leagues & seasons          | available    | —               | Phase 1D            |
| `venues-courses`  | Venues & courses           | planned      | —               | Phases 1D–1F        |
| `events`          | Events                     | available    | —               | Phases 1D–1F        |
| `scoring-results` | Scoring & official results | planned      | events          | Phases 1G–1H        |
| `standings`       | Competition standings      | planned      | scoring-results | Phase 1I            |
| `fantasy`         | Fantasy leagues            | planned      | standings       | Phases 2A–2C        |
| `sponsorships`    | Sponsorships               | upcoming     | —               | Phase 3+ (deferred) |
| `reimbursements`  | Reimbursements & expenses  | upcoming     | —               | Phase 3+ (deferred) |

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
private separation is documented for the future public-pages phase (1I) — no
public surface exists yet, so nothing leaks today. CSV import creates one
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
