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
   ./pocketbase/pocketbase serve
   ```

   The admin UI is available at <http://127.0.0.1:8090/_/> and the API at
   <http://127.0.0.1:8090/api/>.

4. Copy `.env.example` to `.env` in the repository root and set
   `POCKETBASE_URL=http://127.0.0.1:8090`.
5. Restart `npm run dev`.

## What lives here

| Path                | Contents                          | Committed?            |
| ------------------- | --------------------------------- | --------------------- |
| `pocketbase` binary | Downloaded executable             | No (git-ignored)      |
| `pb_data/`          | Local database and uploaded files | No (git-ignored)      |
| `pb_migrations/`    | Collection/schema migrations      | Yes, once implemented |

## Rules

- Do not use the PocketBase superuser (admin) account as the normal
  application identity. Application access is enforced through collection API
  rules and trusted server-side operations.
- Do not point a local checkout at any production PocketBase instance.
- When collections are implemented, schema changes are committed as
  reproducible PocketBase migrations in `pb_migrations/`.
