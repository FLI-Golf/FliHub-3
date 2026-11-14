# Organization setup checklist

Status: implementation prepared for local review on feature/organization-setup-checklist. Local type/lint/build, tests, and browser verification must pass before marking this increment complete. Guided organization creation is already available through PR #32; new result and entry workflows remain planned.

## Scope

Owners/Admins of organizations created through the supported Disc golf → League season → Teams → Strokes wizard mapping see a read-only setup guide on the organization overview. The server recognizes version 1 guidedSetup provenance in the trusted organization_created audit details. It does not guess an activity from the League template or modify legacy organizations.

Steps link to existing Leagues & seasons, Teams & rosters, Athletes, Venues & courses, and Events tools. Team season entry and roster building have separate links on the roster step. Rounds and group assignments remain in the event tools; this guide creates nothing and changes no permissions, schema, defaults, score rules, or published records.

For each enabled step, the loader requests one identity row plus totalItems from the relevant collections, scoped to this organization and excluding archived records. It never reads athlete_private. Counts are organization-wide and may span unrelated seasons/events. They are presence hints, not eligibility, completeness, or event readiness. There is no completion percentage or checkbox that can bypass validation.

States:

- Needs records: at least one count is zero.
- Records found: every count for that step is positive; this does not mean the setup is complete.
- Not checked: at least one read failed or returned an invalid count. Other successful counts remain visible; failures never become zero.
- Enable capability: one or more required capabilities are disabled. That step does not query its collections and links to Settings. Disabling continues to preserve records.

The guide is management-only. Scorekeepers/Viewers receive no checklist data or additional count queries. Existing membership and audit access checks still run before the guide loads. Destination routes and PocketBase independently retain their authorization and capability gates.

## Verification

Run `node --test tests/setup-checklist.test.mjs`, targeted Prettier/ESLint, `npm run check`, and the production build. The new tests use simulated reads and do not establish live PocketBase behavior.

Use LOCAL PocketBase and the local frontend:

1. As Bob, open Guided Disc Golf Test. Verify seven colored guide cards appear above the existing management sections and link to the correct organization's tools.
2. Confirm a new/empty organization shows zero counts as Needs records; no records should be created simply by viewing or following a link.
3. As you add records using existing forms, revisit the overview to refresh counts. Positive counts should say Records found, never Complete or Ready to score.
4. Verify a record in another organization does not change these counts. Archived records must not count.
5. On a disposable local test organization, disable a required capability, revisit the overview, and confirm affected steps point to Settings. Re-enable it to restore the guide links without data loss. Do not change an active competition just for this test.
6. Check the original Bobs Org: without supported guided creation provenance it receives no new checklist or inferred activity. Membership/invitation/settings controls remain unchanged.
7. As a Scorekeeper/Viewer, confirm there is no management checklist and existing assigned scoring/read access remains intact.
8. Check narrow mobile layout, keyboard focus, and links. Confirm homepage cards accurately separate available guided creation, checklist local review, and planned timing/judging/match workflows. Homepage collapse controls and walkthrough links must remain working.

Unavailable-read behavior is covered by the focused tests; do not stop or damage a database just to simulate that state.

See [README-GUIDED-CREATION.md](README-GUIDED-CREATION.md) and [README-MULTI-EVENT-PLATFORM.md](README-MULTI-EVENT-PLATFORM.md).
