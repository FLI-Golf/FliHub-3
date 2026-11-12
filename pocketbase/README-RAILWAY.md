# Railway PocketBase preview

This packages FliHub's existing backend and pins PocketBase to the tested 0.40.6.
It does not transfer database contents or change the frontend's backend URL.

## Service configuration

Keep the existing Railway PocketBase service and persistent volume. The intended
CEO preview endpoint is https://pocketbase-production-747d784e.up.railway.app.

Configure that service with:

- Source repository: FLI-Golf/FliHub-3.
- Deployment branch: the branch containing these files, initially feature/railway-preview.
- Root/build context: repository root; do not set it to pocketbase/.
- RAILWAY_DOCKERFILE_PATH: Dockerfile.pocketbase.
- Public target port: 8080.
- Volume mount: /pb/pb_data (retain the existing volume).
- Healthcheck path: /api/health.
- Run as a continuously running service with no cron schedule.
- Leave a custom start-command override empty so the Docker CMD is used.
- Keep CODESPACE_NAME unset and FLIHUB_DEMO_FANTASY/FLIHUB_FANTASY_DEMO_CLOCK disabled.

The image includes pb_hooks, pb_migrations, and the shared capability catalog at
the exact relative path required by the hooks. The Dockerfile-specific ignore
file excludes .env, pb_data, uploaded files, node_modules, and loose archives from
the build context. Credentials belong in Railway variables or local migration
process memory, never in the image or Git.

PocketBase is exposed on port 8080 behind Railway HTTPS. New databases receive
committed migrations at normal PocketBase startup. Existing migrated data keeps
its migration history. Inspect deployment logs before transferring data; confirm
the build reports pocketbase version 0.40.6 and there are no hook/migration errors.

## Data transfer sequence

1. Verify the version, health, and FliHub hooks on the deployed service.
2. Authenticate source and target using superuser credentials loaded from the
   Codespace's .env. Never print passwords, tokens, or signed backup URLs.
3. Inventory business collections and confirm the target contains no existing
   business data that would be replaced.
4. Create/download a source PocketBase backup and a separate target rollback
   backup before restoring. Keep both outside Git, with restricted file access.
5. Upload/restore the source backup to this explicit Railway target. This replaces
   its database/settings/files and may replace its initial superuser accounts.
6. Wait for restart, authenticate again, and verify organization IDs, athlete and
   score counts, published v2, fantasy picks, and scoring-roster locks.
7. Configure hosted email: restored localhost/Mailpit SMTP settings will not
   provide production mail delivery. Set FLIHUB_APP_URL to the hosted frontend
   URL before using hosted verification or password-reset emails.
8. Configure backups on persistent/separate storage, then deploy/connect the
   frontend and test CEO access with an ordinary application account.

A built-in PocketBase backup transfers data, not the hook/migration source files.
Keeping this image on the same version as the source prevents an accidental
0.40.6-to-0.39.1 downgrade during restore. Do not point the local app away from its
local backend until a source backup has been captured and remote verification
has completed. Keep the local demonstration intact as the working copy.

The data transfer and hosted frontend setup remain pending until executed and
verified in the user's Codespace/Railway account. This is a CEO preview deployment;
the remaining production-readiness review in MASTER_SCORING.md still applies.
