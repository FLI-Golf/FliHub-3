# Guided setup preview

Creation follow-up: [README-GUIDED-CREATION.md](README-GUIDED-CREATION.md) documents the separate writing route. This page remains about the non-writing preview; both routes now share `SetupWizard.svelte`.

Implementation checkpoint: source prepared for local review. Codespaces type/lint/build and browser verification must pass before treating this increment as verified.

Open Organizations and choose **Try guided setup preview**, or visit `/organizations/setup-preview` while signed in. The existing `(app)` layout requires a validated session and preserves the destination through login. The preview adds no loader, server action, endpoint, migration, capability grant, or database request. Existing organization creation and settings stay available.

The six steps cover organization context, activity, format, competitors, result method, and review. Suggestions are presentation data in `src/lib/setup/preview.ts`, separate from the shared capability catalog. They are not authoritative sporting rules or permission policy. No selection enables an unsupported workflow.

Answers remain in component memory during Back/Next. A refresh or navigation away resets the preview. Changing an earlier answer removes incompatible downstream selections and displays a notice; compatible answers remain. Required choices and a 2–120 character organization name are checked before advancing. The review screen creates no records, including for golf. Organization context is a sample name, not an edit to an existing organization.

## Local validation

Run `node --test tests/setup-preview.test.mjs`, `npm run check`, targeted Prettier/ESLint, and the production build with local PocketBase configuration. The branching tests run with Node 24's native TypeScript support and do not require a database.

As Bob, open Organizations and follow the preview link. Review:

- Bowling → League season → Teams → Pin totals.
- Running / race → Single event → Individuals → Elapsed time.
- Beauty pageant → Judged show → Contestants → Judged criteria.
- Disc golf → Single event → Individuals → Strokes, retaining the explicit combination-review limitation.
- Go Back from review, change Bowling to Running, and confirm incompatible pin totals are cleared and timing is the offered result method. Change to a pageant and verify incompatible answers clear before continuing.
- Try Next with a blank name or no selection; verify clear errors and focus. Use Tab and arrow keys for radio controls, and check a narrow mobile viewport.
- Refresh and confirm answers reset as disclosed. Exit to existing setup and confirm no organization was created or edited.
- Sign out and visit the preview URL; verify login is required. Existing server permissions for real workflows must remain unchanged.

See [the multi-event plan](README-MULTI-EVENT-PLATFORM.md) and [decisions](DECISIONS.md). Persistence, a supported creation mapping, detailed scoring rules, and specialized entry models remain later reviewed work.
