# FliHub-3

FliHub is a configurable sports organization management platform with connected
fantasy competitions. This repository is a fresh, single-application rebuild
using a new stack — see [docs/DECISIONS.md](docs/DECISIONS.md) for why and
[docs/MIGRATION.md](docs/MIGRATION.md) for what still needs to be imported from
the previous prototype.

> **Status: foundation milestone.** The app runs, the checks pass, and the
> PocketBase groundwork is in place. Authentication, organizations,
> competitions, scoring, and fantasy features are **planned, not implemented**.
> See [docs/ROADMAP.md](docs/ROADMAP.md) and [Milestones.md](Milestones.md).

## Stack

- [SvelteKit](https://svelte.dev/docs/kit) with Svelte 5 and strict TypeScript
- [Tailwind CSS 4](https://tailwindcss.com) with
  [shadcn-svelte](https://shadcn-svelte.com) components
- [PocketBase](https://pocketbase.io) (JavaScript SDK) for authentication,
  database, and file storage
- npm with a committed `package-lock.json`
- Single application repository (no monorepo)

## Prerequisites

- Node.js 24 and npm 11
- Optional: a local PocketBase instance (free, no account needed) — the app
  starts without one and shows setup instructions

## Quick start

```sh
npm ci
npm run dev
```

Open the printed local URL (default <http://localhost:5173>). Without a
configured PocketBase instance the welcome page shows how to set one up.

## Scripts

| Command           | Purpose                           |
| ----------------- | --------------------------------- |
| `npm run dev`     | Start the development server      |
| `npm run check`   | Svelte + strict TypeScript checks |
| `npm run lint`    | Prettier check and ESLint         |
| `npm run format`  | Format all files with Prettier    |
| `npm run build`   | Production build                  |
| `npm run preview` | Preview the production build      |

## PocketBase (local development)

PocketBase runs as a **separate, free local process** — nothing is embedded in
this repository and no paid service is required:

```sh
# 1. Download PocketBase from https://pocketbase.io and put the binary in pocketbase/
./pocketbase/pocketbase serve

# 2. In another terminal, configure the app and restart the dev server
cp .env.example .env
npm run dev
```

Full details, including what is git-ignored and the rules around credentials,
live in [pocketbase/README.md](pocketbase/README.md).

## Environment variables

Configuration is read from `.env` (git-ignored). `.env.example` documents every
variable and contains no secrets.

| Variable         | Scope       | Purpose                             |
| ---------------- | ----------- | ----------------------------------- |
| `POCKETBASE_URL` | server-only | Base URL of the PocketBase instance |

## Project structure

```text
src/
  hooks.server.ts            Per-request PocketBase client + session cookie foundation
  lib/
    server/pocketbase.ts     Server-only PocketBase factory (never shipped to browsers)
    components/ui/           shadcn-svelte components
    data/planned-features.ts Planned capability list shown on the welcome page
  routes/                    App shell and welcome page
docs/                        Roadmap, decisions, migration notes
pocketbase/                  Local PocketBase home (binary and data are git-ignored)
.github/                     CI workflow and Copilot instructions
```

## Documentation

- [Milestones.md](Milestones.md) — product milestone plan (reference document)
- [docs/ROADMAP.md](docs/ROADMAP.md) — planned phases and unresolved questions
- [docs/DECISIONS.md](docs/DECISIONS.md) — architecture and policy decisions
- [docs/MIGRATION.md](docs/MIGRATION.md) — exports still needed from the previous project

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs install, Svelte/TypeScript
checks, linting, and a production build on pushes to `main` and on pull
requests.
