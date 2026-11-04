# Copilot instructions for FliHub-3

## Stack

- SvelteKit + Svelte 5 (runes mode) with **strict TypeScript**.
- Tailwind CSS 4 + **shadcn-svelte** components (Vega preset, Lucide icons).
  Add UI controls with `npx shadcn-svelte add <component>`; do not hand-roll
  equivalents. Do not introduce React.
- **PocketBase** (official JavaScript SDK) is the only backend —
  authentication, database, and file storage. Do not use Supabase or
  PostgreSQL.
- npm with a committed `package-lock.json`. Single application repository; no
  monorepo tooling.

## Incremental workflow

- Work in small, single-concern pull requests. Do not implement future
  milestones early; the roadmap lives in `docs/ROADMAP.md` and
  `Milestones.md`.
- Planned features must be labeled as planned. Never display fabricated
  operational data, and never claim a feature, migration, or import works
  until it has been verified end to end.
- Unresolved product questions (playoff rules, substitution effects on
  fantasy, incomplete-draft handling, final draft windows) are recorded in
  `docs/ROADMAP.md`. Do not invent answers to them in code.

## Authorization requirements

- Enforce authorization through PocketBase collection API rules and trusted
  server-side operations (SvelteKit server load/actions). Hiding UI controls
  is not authorization.
- Create one PocketBase client **per request** in `src/hooks.server.ts`.
  Never share a mutable authenticated client across users, and never use a
  PocketBase superuser account as the normal application identity.
- Complex membership operations (role changes, ownership transfer, removals)
  require trusted transactional server-side enforcement — never client-side
  multi-step writes.
- When collections are implemented, commit reproducible PocketBase migrations
  under `pocketbase/pb_migrations/`. Keep `pb_data/`, the PocketBase binary,
  local credentials, and `.env` out of version control.
- Keep server-only code in `src/lib/server/` and secrets out of browser
  bundles. `.env.example` must remain secret-free.
- Do not connect to or modify any production PocketBase instance. Do not
  deploy or purchase services without explicit approval.

## Verification expectations

Before opening or updating a PR, run and honestly report the results of:

```sh
npm ci
npm run check   # svelte-check with strict TypeScript
npm run lint    # prettier --check + eslint
npm run build   # production build
```

All four must pass. If a check cannot run, say so and explain why instead of
claiming success. CI (`.github/workflows/ci.yml`) runs the same steps and must
stay green.
