# CTG handoff guide

A first-day orientation for a CTG developer opening this private repository.
Section 6 states exactly what was verified for this guide and what still
needs a fresh-clone rehearsal. Use **placeholder credentials only** — this
guide never references Dustin's local database (`pocketbase/pb_data/`) or his
`.env`, both of which are git-ignored and are not part of any handoff.

## 1. Repository access: read access + clone

Recommended: ask for **read (or triage) access** to the private
`FLI-Golf/FliHub-3` repository and **clone it directly**:

```sh
git clone https://github.com/FLI-Golf/FliHub-3.git
cd FliHub-3
```

Cloning the existing repo keeps you on the canonical history, lets you pull
`main` as phases merge, and — once you are granted write access — fits the
project's existing workflow of small, single-concern feature branches and
pull requests reviewed by the owner.

**When a fork makes sense:** only if CTG needs an isolated space to experiment
without any write access to the canonical repo, or wants to propose changes
before collaborator access is settled. A fork of a private repository stays
private and is only possible if the organization allows forking. For normal
collaboration, prefer branches + PRs in the main repository — forks drift and
the CI, walkthrough assets, and migrations are all designed around one repo.

## 2. What you are looking at

FliHub is a configurable sports organization management platform with
connected fantasy competitions, being rebuilt incrementally on SvelteKit +
Svelte 5 (strict TypeScript), Tailwind CSS 4 + shadcn-svelte, and PocketBase
as the only backend (auth, database, file storage). Work ships in small,
verified phases; nothing is deployed publicly and no paid service is required
to run it.

Orient yourself in this order:

1. **Capability progress page** — run the app (section 3) and open the
   welcome page (`/`). The "Capability progress" section renders one card per
   capability with honest statuses (Complete / In progress / Planned),
   narration state, and links to working features and walkthroughs. Source:
   [src/lib/data/planned-features.ts](../src/lib/data/planned-features.ts).
2. **Narrated walkthroughs** — short narrated videos with captions are
   **bundled in the repo** (`static/walkthroughs/`, intentionally committed)
   and play at `/walkthroughs/phase1a` … `/walkthroughs/phase1d` in the
   running app, linked from the matching progress cards. They demonstrate the
   verified flows end to end with fictional demo personas.
3. **Roadmap and plans** —
   [docs/ROADMAP.md](ROADMAP.md) for phase status, per-phase verification
   records, and the unresolved product questions that must not be guessed in
   code; [Milestones](../Milestones.md) for the full product milestone plan
   (the reference document, kept at the repository root);
   [docs/DECISIONS.md](DECISIONS.md) for architecture/policy decisions (D1 —
   D12); [docs/CAPABILITIES.md](CAPABILITIES.md) for the capability catalog
   and what each enabled capability actually does today.

Ground rules worth knowing before writing code: authorization is enforced by
PocketBase collection rules + trusted hooks (never by hiding UI); schema
changes ship as committed migrations in `pocketbase/pb_migrations/`; planned
features must be labeled as planned; and nothing may be claimed to work until
verified end to end. CI (`.github/workflows/ci.yml`) runs exactly
`npm ci`, `npm run check`, `npm run lint`, and `npm run build` on Node 24,
for every pull request and for pushes to `main` — the test suites are run
locally, not in CI.

## 3. Running locally (no public deployment needed)

Everything runs as local processes; there is no hosted environment to point
at, and you must **never connect a checkout to any production PocketBase
instance**.

Tooling — required vs. optional:

- **Required:** Node.js 24 and npm 11 (CI pins Node 24; this guide was
  written on Node v24, npm 11).
- **Required for the full stack and for BOTH test suites:** the free
  `pocketbase` and `mailpit` executables placed in `pocketbase/` — the
  integration and E2E runners boot disposable instances from those exact
  paths. The repo's hooks and migrations are written and verified against
  **PocketBase v0.40.x** (documented in docs/DECISIONS.md D9/D11 JSVM notes;
  the current dev environment runs 0.40.6). No Mailpit version requirement is
  documented; the current dev environment runs v1.33.0.
- **Optional:** the Playwright Chromium install, only needed for
  `npm run test:e2e`.

App only (works with zero configuration — the welcome page shows setup
instructions until PocketBase is configured):

```sh
npm ci
npm run dev        # http://localhost:5173
```

Full stack, self-contained from a fresh clone:

```sh
git clone https://github.com/FLI-Golf/FliHub-3.git
cd FliHub-3
npm ci

# 1. One-time: download the free binaries (git-ignored) into pocketbase/
#    - PocketBase v0.40.x: https://github.com/pocketbase/pocketbase/releases
#      → extract the `pocketbase` binary
#    - mailpit: https://mailpit.axllent.org/ → extract the `mailpit` binary
#    Both go in the pocketbase/ directory and must be executable.

# 2. Start PocketBase (terminal A) — ALWAYS via the npm script, which fixes
#    the auth-email link base for Codespaces (see section 4). On the very
#    first start it applies all committed migrations and prints a one-time
#    installer link — open it to create your local superuser with placeholder
#    credentials of your own (e.g. admin@example.com):
npm run pocketbase                 # http://127.0.0.1:8090

# 3. Start mailpit (terminal B) — captures verification emails locally:
./pocketbase/mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025

# 4. Configure and start the app (terminal C):
cp .env.example .env               # POCKETBASE_URL=http://127.0.0.1:8090
npm run dev                        # http://localhost:5173
```

`.env` is git-ignored; `.env.example` is secret-free and its values are
placeholders (e.g. `admin@example.com` / `admin123`) — replace them with your
own local-only values and never commit real credentials. The
`POCKETBASE_ADMIN_*` variables are declared for future trusted operations but
are not read by app code today, and the superuser must never be used as the
normal application identity.

Verification commands (all pass in the current dev environment; CI runs only
`npm ci` + the first three, as in section 2):

```sh
npm run check              # svelte-check, strict TypeScript
npm run lint               # prettier --check + eslint
npm run build              # production build
npm run test:integration   # access-control suite vs. disposable PocketBase
npx playwright install chromium            # one-time browser setup
sudo npx playwright install-deps chromium  # one-time, Linux only
npm run test:e2e           # browser acceptance vs. a disposable full stack
```

Both test suites boot **disposable** PocketBase + mailpit instances in a temp
directory and never touch `pocketbase/pb_data/` or your running dev services.

## 4. Running in a private GitHub Codespace

The repository works in a Codespace with no public deployment:

- Start the same three processes as in section 3. Forwarded ports (5173 app,
  8090 PocketBase, 8025 mailpit) default to **private** — keep them private;
  you just need to be signed in to GitHub in the browser that opens them.
- `npm run pocketbase` runs `pocketbase/serve-dev.sh`, which auto-detects the
  Codespace's forwarded HTTPS URL and exports it as `FLIHUB_APP_URL`, so links
  in verification emails point at your Codespace instead of `localhost`. No
  manual configuration is needed; details in
  [pocketbase/README.md](../pocketbase/README.md).

## 5. Fresh database and fictional demo data

A fresh PocketBase database needs **no manual schema setup**:

- First start: `npm run pocketbase` applies every committed migration
  (collections, API rules, settings) automatically and prints the one-time
  superuser installer link (see section 3). The superuser is for the admin UI
  at <http://127.0.0.1:8090/_/> only — never the app identity.
- Resetting is for **disposable local demo data only**. Deleting
  `pocketbase/pb_data/` **permanently discards that local database** — every
  account, organization, and record in it. If you (or anyone sharing the
  machine) might want the current data back, preserve it first by moving the
  directory to a unique backup location **outside the repository**:

  ```sh
  # stop PocketBase first, then either preserve…
  mkdir -p ~/flihub-backups
  mv pocketbase/pb_data ~/flihub-backups/"pb_data-$(date +%Y%m%d-%H%M%S)"
  # …or discard a database you know is disposable:
  rm -rf pocketbase/pb_data

  npm run pocketbase   # restarts from empty; migrations re-apply
  ```

  To restore a backup: stop PocketBase, move any newly created
  `pocketbase/pb_data/` aside (so the restore cannot overwrite or mix with
  it), then move the backup directory back to `pocketbase/pb_data`. (The
  from-empty boot is exactly what the test suites do in a temp directory on
  every run — they never touch your `pocketbase/pb_data/`.)

Demo data is **created through the app, not seeded**: there is no committed
seed script in this repository (flagged so you don't go looking for one).
Register an account, verify it via the captured email in mailpit
(<http://127.0.0.1:8025>), create an organization from a starter template, and
add data through the UI. Use **fictional people and organizations only** —
the bundled walkthroughs model this (e.g. "Riley Chen", "Lakeside Golf
Collective"). Never enter real personal data into a development database, and
never display fabricated data as if it were real operational data.

## 6. What was verified for this guide, and what was not

Verified on 2026-11-06 in an existing dev environment (Node v24, npm 11,
PocketBase 0.40.6 and mailpit v1.33.0 already present in `pocketbase/`):

- `npm ci`, `npm run check`, `npm run lint`, `npm run build`,
  `npm run test:integration`, and `npm run test:e2e` all pass.
- The dev stack commands in section 3 (`npm run pocketbase`, mailpit,
  `cp .env.example .env`, `npm run dev`) are the ones this environment runs.
- The CI claims in section 2 were checked against
  `.github/workflows/ci.yml`.
- Database resets from empty are exercised constantly: both test suites boot
  disposable PocketBase instances from the committed migrations on every run.

**Still needs a fresh-clone rehearsal** (not re-run while writing this
guide): downloading the PocketBase and mailpit binaries onto a clean machine,
the first-boot superuser installer link flow, and the one-time
`npx playwright install` steps. These match
[pocketbase/README.md](../pocketbase/README.md) and the repo root README, but
treat the first fresh-clone setup as a verification exercise and report any
drift.

## 7. Who to ask

Product decisions are deliberately centralized: open questions live in
[docs/ROADMAP.md](ROADMAP.md) ("Unresolved questions") and in each
[Milestones](../Milestones.md) phase's "Open decisions blocking this phase".
Do not invent answers to them in code — bring the specific choice, a concrete
example, and a recommendation to the project owner (Dustin / @HalftimeHarry),
mirroring how D10–D12 in [docs/DECISIONS.md](DECISIONS.md) were settled.
