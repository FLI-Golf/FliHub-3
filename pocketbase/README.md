# Local PocketBase development instance

FliHub uses [PocketBase](https://pocketbase.io) for authentication, database,
and file storage. You do not need any paid service for development — PocketBase
is a single free executable that runs locally.

## Setup

1. Download the latest PocketBase release for your platform from
   <https://pocketbase.io/docs/> (the "Download" button on the homepage links
   to the current release archive).
2. Extract the archive and place the `pocketbase` executable in this directory
   (`pocketbase/`). The executable is git-ignored, along with all runtime data.
3. Start the instance from the repository root:

   ```sh
   npm run pocketbase
   ```

   This runs `pocketbase/serve-dev.sh`, which starts the instance on
   <http://127.0.0.1:8090> and resolves the app URL used in auth emails (see
   "App URL in auth emails" below). Always start it this way so verification
   links keep working across restarts.

   The admin UI is available at <http://127.0.0.1:8090/_/> and the API at
   <http://127.0.0.1:8090/api/>.

4. Copy `.env.example` to `.env` in the repository root and set
   `POCKETBASE_URL=http://127.0.0.1:8090`.
5. Restart `npm run dev`.

## What lives here

| Path                | Contents                                             | Committed?       |
| ------------------- | ---------------------------------------------------- | ---------------- |
| `pocketbase` binary | Downloaded executable                                | No (git-ignored) |
| `mailpit` binary    | Downloaded local email-capture executable            | No (git-ignored) |
| `pb_data/`          | Local database and uploaded files                    | No (git-ignored) |
| `pb_migrations/`    | Collection/schema/settings migrations                | Yes              |
| `pb_hooks/`         | Trusted transactional endpoints (`*.pb.js`)          | Yes              |
| `serve-dev.sh`      | Dev startup script (resolves the auth-email app URL) | Yes              |

## Schema, hooks, and enforcement (Phase 1A)

`pb_migrations/` creates the `users` (auth, extended), `organizations`,
`memberships`, `invitations`, and `membership_events` collections with their
API rules, plus application settings (app name/URL, SMTP → local mailpit).
They apply automatically at startup; a fresh checkout needs no manual setup.

`pb_hooks/flihub.pb.js` implements the trusted operations under
`/api/flihub/…` (organization creation, invitations, acceptance, role
changes, removal, leaving, ownership transfer). Membership write rules are
locked, so these invariants hold even against direct API requests:

- every organization has exactly one Owner; ownership moves only through the
  atomic transfer endpoint (former Owner becomes Admin);
- only Owners change roles, remove members, or invite Admins; Admins invite
  only Scorekeepers/Viewers and revoke pending invitations;
- invitation tokens are cryptographically random, single-use, and stored as
  sha256 hashes; acceptance requires the signed-in account's verified email
  to match the invitation recipient.

All changes are recorded in `membership_events` (actor, time, action) —
tokens and passwords are never logged.

Invitation lifetime defaults to **7 days** and is configurable via
`FLIHUB_INVITE_TTL_HOURS` (hours, positive integer) in the PocketBase
process environment.

## Local email capture (verification emails)

PocketBase sends auth emails through SMTP. In local development those emails
are captured by [mailpit](https://mailpit.axllent.org/) instead of being
delivered:

1. Download a mailpit release for your platform and place the `mailpit`
   executable in this directory (git-ignored).
2. Run it: `./pocketbase/mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025`
3. The settings migration already points PocketBase SMTP at
   `127.0.0.1:1025`; browse captured mail at <http://127.0.0.1:8025>.

Without mailpit, registration still works but verification emails cannot be
received, and accepting invitations requires a verified email.

## Integration tests

`npm run test:integration` (repository root) boots a disposable PocketBase
(temp data dir, committed migrations + hooks) and a disposable mailpit, runs
the access-control suite in `tests/integration/`, and tears everything down.

## Rules

- Do not use the PocketBase superuser (admin) account as the normal
  application identity. Application access is enforced through collection API
  rules and trusted server-side operations.
- Do not point a local checkout at any production PocketBase instance.
- When collections are implemented, schema changes are committed as
  reproducible PocketBase migrations in `pb_migrations/`.

## App URL in auth emails (verification links)

Auth emails (email verification, password reset, etc.) build their links as
`{APP_URL}/verify-email/{TOKEN}`, where `{APP_URL}` is PocketBase's
`settings.meta.appURL`. The committed settings migration seeds this to
`http://localhost:5173`, which is correct for plain `localhost` development.

Inside a GitHub Codespace (or any deployed/forwarded environment) the app is
reached through a public HTTPS URL, not `localhost`. Always start PocketBase
with `npm run pocketbase`. That runs `pocketbase/serve-dev.sh`, which resolves
the public app URL and exports it as `FLIHUB_APP_URL`; the
`pb_hooks/appurl.pb.js` `onMailerSend` hook then rewrites the app-URL base in
each outgoing email at send time. The value is never written to a committed
migration or to `pb_data`, so it survives normal restarts through this command.

`serve-dev.sh` resolves the app URL in this order:

1. An explicit `FLIHUB_APP_URL` override you export first, e.g.
   `FLIHUB_APP_URL="https://app.example.com" npm run pocketbase` for a
   deployment.
2. The GitHub Codespace forwarded URL, auto-constructed from `CODESPACE_NAME`
   and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` (both always set in a
   Codespace) — no manual configuration needed.
3. The `http://localhost:5173` fallback for plain local development.

Only the email link base is affected — verification tokens, recipient checks,
and token expiration are unchanged.

Note: a Codespace forwarded port set to **private** requires you to be signed in
to GitHub in the browser that opens the link. That is expected and keeps the dev
app private; make the port public only if you understand the exposure.
