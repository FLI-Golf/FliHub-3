# Architecture and policy decisions

Decisions are listed newest-last. Each entry records the choice, the reason,
and the consequence for future work.

## D1 — SvelteKit + Svelte 5 + strict TypeScript, single repository

**Choice.** The application is a single SvelteKit app (`minimal` template via
`sv create`) with `strict: true` TypeScript. No monorepo tooling.

**Why.** Deliberate move away from the previous React prototype; one
application repository keeps the bootstrap simple and reviewable.

**Consequence.** All app code lives in `src/`; shared, sport-neutral models
belong in `src/lib/` and must not absorb disc-golf-specific rules.

## D2 — Tailwind CSS 4 + shadcn-svelte

**Choice.** Tailwind CSS 4 via `@tailwindcss/vite`, with shadcn-svelte
components (Vega preset, neutral base color, Lucide icons) for buttons, cards,
forms, dialogs, and other controls.

**Why.** Officially supported Svelte 5 setup; components are vendored into
`src/lib/components/ui/` so we own them.

**Consequence.** New UI controls should come from `npx shadcn-svelte add …`
rather than ad-hoc styling.

## D3 — PocketBase for auth, database, and file storage

**Choice.** PocketBase (official JavaScript SDK) is the only backend. No
Supabase, no PostgreSQL, no React.

**Why.** Stack decision by the project owner; PocketBase is free to run locally
for development.

**Consequence.** Business rules from the old prototype must be re-expressed as
PocketBase collections, API rules, and migrations — Supabase SQL and RLS
policies are never copied over. See [MIGRATION.md](MIGRATION.md).

## D4 — Per-request PocketBase client and session cookie (foundation only)

**Choice.** `src/hooks.server.ts` creates a new PocketBase client per request
and stores it on `event.locals.pb`. A hardened `httpOnly`, `SameSite=Strict`,
`Secure` (outside dev) cookie named `pb_auth` carries the auth token; the
request client hydrates from it and the response persists it.

**Intended authentication approach (documented before implementation):**

1. Sign-in happens through a server action that authenticates against
   PocketBase and lets the hooks persist the token in the `pb_auth` cookie.
2. On every request, the per-request client loads the cookie and the server
   validates the session against PocketBase (auth refresh) before trusting it.
3. Sign-out clears the cookie and the auth store.

**Not yet implemented:** sign-in UI, session validation calls, and any
authenticated routes. The cookie plumbing exists, but no feature may claim
authentication works until validation is implemented and verified.

**Rules.** A mutable authenticated client is never shared across requests or
users. The PocketBase superuser account is never used as the normal application
identity.

## D5 — Authorization is enforced server-side

**Choice.** Authorization will be enforced through PocketBase collection API
rules plus trusted server-side operations (SvelteKit server load/actions) where
rules are insufficient — for example, atomic ownership transfer and other
complex membership writes.

**Rules.** Hiding a button in the UI is never authorization. When collections
are implemented, schema and rule changes ship as committed, reproducible
PocketBase migrations (`pocketbase/pb_migrations/`).

## D6 — npm with a committed lockfile, Node 24

**Choice.** npm is the package manager; `package-lock.json` is committed; CI
uses `npm ci` on Node 24.

**Consequence.** Do not introduce pnpm/yarn/bun lockfiles.

## D7 — Environment configuration stays server-only and secret-free

**Choice.** `POCKETBASE_URL` is read via `$env/dynamic-private` so instance
details never ship in the browser bundle. `.env.example` documents every
variable and contains no secrets; `.env` is git-ignored. The app must start
with no configuration and show setup instructions.

## D8 — No deployment and no production connections in this phase

**Choice.** This bootstrap does not deploy anything, purchase services, or
connect to or modify any existing production PocketBase instance. Local
PocketBase data, uploaded files, downloaded binaries, and local credentials are
git-ignored.

## D9 — Phase 1A invariants enforced in PocketBase hooks, not the browser

**Choice.** Organization creation, invitations, role changes, member removal,
leaving, and ownership transfer are implemented as authenticated custom
endpoints in `pocketbase/pb_hooks/flihub.pb.js`, each running inside a
PocketBase transaction. The `organizations`, `memberships`, `invitations`,
and `membership_events` collections have locked create/update/delete rules,
so ordinary API requests cannot forge memberships, escalate roles, or assign
ownership. Read access is enforced by collection rules (members see only
their own organizations; Owners/Admins see invitations and the audit trail).

**Why.** Atomicity and role invariants (exactly one Owner per organization,
Admin cannot grant ownership, single-use invitations) cannot be guaranteed by
a sequence of browser SDK writes or by hidden UI controls.

**Consequences.**

- Invitation tokens are 48-character cryptographically random strings, stored
  as sha256 hashes (the hash field is API-hidden), single-use, expiring after
  `FLIHUB_INVITE_TTL_HOURS` hours (default 168). Acceptance requires the
  signed-in account's verified email to match the invitation recipient; the
  lookup endpoint reveals only whether the caller matches, never the
  recipient address. Email delivery is not implemented — invitations are
  shared via a copy-link workflow.
- Handlers re-read the caller's membership and role on every call, so
  demotion/removal takes effect on the next request despite valid sessions.
- Every change is recorded in `membership_events` (actor, time, action);
  tokens and passwords are never logged.
- PocketBase's JS runtime (v0.40) executes route handlers isolated from the
  hook file's top-level scope — handlers must be self-contained (verified
  empirically; shared top-level helpers throw `ReferenceError`).
- Local verification emails are captured by mailpit (SMTP `127.0.0.1:1025`);
  the `appurl.pb.js` mailer hook rewrites the link base to `FLIHUB_APP_URL`
  so links work in Codespaces and deployments without touching committed
  settings.

## D10 — Phase 1B capability configuration (approved decisions)

**Choice.** Organizations pick a starter template (League, Race/Event, Custom)
and a capability selection during onboarding, adjustable later in Settings.
The capability catalog is a single JSON file (`src/lib/capabilities/catalog.json`)
loaded by both the SvelteKit app and the PocketBase hooks (via `require` —
the JSVM has no ESM). Configuration writes go through a trusted hook
(`POST /api/flihub/organizations/{id}/configure`); the organizations
collection's update rule is locked so configuration cannot bypass validation
via direct record writes.

**Approved by the project owner (2026-11-05):**

- Owners AND Admins may configure organization capabilities.
- Scorekeepers and Viewers cannot change capabilities.
- Capabilities never grant permissions beyond the user's organization role.
- Disabling a capability preserves its records and configuration.
- Starter templates suggest defaults; organizations adjust them during
  onboarding and later.

## D11 — Phase 1C athlete identity model (2026-11-05)

**Choice.** Athletes are sport-neutral records in a dedicated `athletes`
collection, scoped to one organization. They are records, not accounts.

**Fields.** Public display: firstName, lastName, displayName, gender,
nationality. Private (organization-scoped contact/eligibility): email, phone,
eligibilityNotes. Lifecycle: status active/archived. There is deliberately no
team, division, league, season, event, pairing, or score field — competition
structure belongs to Phases 1D–1F, and disc-golf pairing is a later
competition-format rule, not an athlete-model rule.

**Privacy model (revised 2026-11-06).** Contact and eligibility fields are
restricted to Owners and Admins; Scorekeepers and Viewers read athlete
identity only. Enforced at the field boundary on the backend: the three
private fields live in a companion `athlete_private` collection (one row per
athlete, unique index, cascade-deleted with the athlete) whose
list/view/create/update rules require an Owner/Admin membership in the
organization, and they no longer exist on `athletes` at all — so list,
detail, and relation-expansion responses structurally cannot leak them to
lesser roles. The app merges the companion row into page data only for
Owners/Admins. Verified per role (list, detail, expansion, app page data,
outsider) by an integration regression test and the Phase 1C E2E spec.

**Lifecycle (reviewed 2026-11-06).** Archive and restore only — the documented
Phase 1C lifecycle has no permanent delete, so the athletes delete rule is
locked (superuser-only) and the UI offers no delete control.

**Enforcement.** Collection API rules: any organization member reads;
only Owners/Admins write (create rule failures surface as 400; update/delete
as 403/404). A separate `flihub_athletes.pb.js` hook rejects athlete writes
when the `athletes` capability is disabled, including direct API requests;
reads of preserved records stay open because disabling a capability hides the
workflow, never the data.

**JSVM notes (verified empirically on v0.40).** Record-hook registration is
handler-first (`onRecordCreateRequest(fn, 'collection')`), and hook handlers
are serialized and re-evaluated per invocation with only `$app` bound — they
must be fully self-contained (extends D9). JSON fields read as `types.JSONRaw`;
`String(raw)` yields the JSON text.

**Open product decisions (not invented here).** Identity matching rules for
duplicate imports (CSV import currently creates one record per row, labeled in
the UI); cross-organization athlete participation/visibility; final pilot
eligibility fields. See docs/ROADMAP.md unresolved questions.

## D12 — Phase 1D competition structure (2026-11-06; approved by Dustin)

**Decision 1 — season entry direction.** Teams enter a season directly via
`season_entries`; each entry carries ONE optional division assignment.
Entries can exist before divisions are finalized, and seasons can run
division-less. A unique (season, team) index prevents duplicate entries, and
the `flihub_competitions.pb.js` hook rejects a division assignment outside
the entry's season.

**Decision 2 — event competition membership.** An event belongs to at most
one season (optional relation; empty = independent event) and stays
organization-scoped either way. Multi-competition event membership is
outside Phase 1D.

**Model.** `teams`, `leagues`, `seasons` (league + optional startsOn/endsOn),
`divisions` (season), `season_entries` (season, team, optional division),
`events` (optional season). All organization-scoped. Status fields are
foundations only — no automated transitions in Phase 1D (teams, leagues,
divisions, entries: active/archived; seasons, events:
planned/active/completed/archived).

**Integrity (hook-enforced, `flihub_competitions.pb.js`).** Capability gate
per collection (teams→`teams`; leagues/seasons/divisions/season_entries→
`leagues-seasons`; events→`events`); every relation target must belong to
the same organization; a division's season and an entry's season/team are
immutable after creation (archive and recreate instead), so parent edits
cannot invalidate existing links; season start must be on or before end.

**Access.** Any organization member reads; only Owners/Admins write; delete
is locked on all six collections — archive/restore only (extends the D11
lifecycle). Out of scope per Milestones.md: standings, official result
approval, fantasy scoring, registration, payments.

- League, Race/Event, and Custom are the initial templates.

**Consequences.**

- Capability IDs and dependency closure are validated server-side; race
  distances require explicit km/mi units and positive values.
- Configuration changes are audited in `membership_events`
  (`configuration_changed`, with before/after values).
- Enabling a planned/upcoming capability adds a labeled navigation entry,
  never a fake workflow. No catalog capability is implemented software yet.
- Pre-1B organizations keep working unconfigured; setup is offered, not forced.

## D13 — Phase 1E season rosters, reserve pools, and substitutions (2026-11-06; approved by Dustin)

**Decision 1 — roster ownership.** A roster row (`roster_memberships`) belongs
to a team's season entry, directly modeling "who played for which team in
which season" and inheriting D12's entry immutability. The row's `season` is
denormalized for the exclusivity index but always DERIVED from the entry by
the `flihub_rosters.pb.js` hook — never trusted from the client.

**Decision 2 — reserve pool representation.** Reserve pools are first-class
records (`reserve_pools` + `reserve_members`), not flagged teams: pools can
never receive season entries, so exclusion from ordinary scheduling is
structural rather than a filter every Phase 1F query must remember. A pool
may carry an optional gender restriction enforced at join time; the
restriction (like the demo's separate male/female pools, 12-team and
24-athlete counts) is **pilot configuration, not a universal rule** — the
shared model stays sport-neutral.

**Decision 3 — one active spot per athlete per season.** An athlete holds at
most one active roster membership OR one active reserve membership per
season, enforced by partial unique indexes on (season, athlete) WHERE
status = 'active' in both tables plus a cross-table hook check, backstopped
by SQLite triggers (`phase1e_exclusivity_triggers` migration) that re-run the
cross-table check inside the serialized write itself — a hook check alone is
read-then-write and lost a reproduced race between concurrent direct API
requests (creates and restores). Archived
rows are exempt — they are the preserved participation history, and restoring
one re-checks exclusivity. Different seasons are independent spots. The disc
golf one-male/one-female team composition stays a demo verification, never a
model constraint.

**Decision 4 — substitutions in 1E scope, append-only.** Fields: organization,
event, season entry, athleteOut, athleteIn, optional reason, recordedBy
(hook-set from the authenticated caller, client values overwritten), and
created/updated autodates. Create-only for Owners/Admins; update and delete
are locked for everyone. The hook requires the event to be season-linked to
the entry's season (an independent event has no roster context), athleteOut
to hold an active roster spot on that entry, and athleteIn to be an active
reserve member in that season. A substitution changes nothing else — rosters
and pools are untouched; it applies to its event only. Fantasy replacement
ownership effects remain excluded (open product decision).

**Access.** Any organization member reads; only Owners/Admins write; delete
is locked on all four collections (extends the D11/D12 lifecycle). All four
are gated on the `teams` capability ("Teams & rosters"). Parent links and a
record's organization are immutable on update — archive and recreate instead.

**Not invented here.** Final pilot roster eligibility fields stay undecided —
Phase 1E uses existing athlete identity only (gender for pool restrictions)
and adds no eligibility fields. Milestones.md's "existing CSV-derived
branding, logos, photos, and flags where available" clause is inapplicable:
this repository has no such source data (recorded for 1C in docs/ROADMAP.md),
so pools carry names only — nothing fabricated.

## Open decisions

- Hosting adapter (currently `adapter-auto`; choose a concrete adapter when a
  deployment target is approved).
- Realtime subscriptions for live drafts/scoring (evaluate when those
  milestones start).
- `$lib` import alias vs `#lib` subpath imports. SvelteKit 3 removed `$lib` in
  favor of `#lib` package subpath imports and marks the `alias` config escape
  hatch as deprecated. We deliberately re-enable `$lib` in `vite.config.ts`
  because the shadcn-svelte CLI generates `$lib` imports; revisit when
  shadcn-svelte supports `#lib` cleanly.
- Environment variables use the SvelteKit 3 explicit declaration system
  (`src/env.ts` + `$app/env/private`); older `$env/*` modules are deprecated.
