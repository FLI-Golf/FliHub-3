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
