# Guided league and season setup

Status: implementation prepared for local validation. Type/lint/build, unit tests, disposable PocketBase integration tests, and the browser walkthrough are required before commit.

Owners/Admins on Leagues & seasons use one guided form before the existing record lists:

1. League: create a named league or choose an existing active league.
2. Season: enter a name, optional start/end dates, and optional USD purse.
3. Review: inspect the proposed records and submit once.

Next/Back do not write records; values stay in memory. Refreshing clears unfinished values. Only Review contains a submission form. Success refreshes the lists and resets the input steps. Validation/backend errors preserve input for correction. Buttons are disabled while a submission is pending. Existing unique indexes reject duplicate league names within an organization and duplicate season names within a league, including retries with the same names.

The old independent Add league and Add season forms are removed from the manager. Existing league/season lists, rename/edit, archive/restore, division management, team entries, and editing a season's fantasy setting remain available. The old backend form actions remain compatible but are not used by this UI. Add another season uses the existing-league option in the same guided form.

## Backend

The new setupLeagueSeason SvelteKit action sends only text inputs to POST /api/flihub/organizations/{id}/league-season-setup. The PocketBase handler rechecks current Owner/Admin membership and the leagues-seasons capability inside one transaction. Existing leagues must be active and belong to that organization. New records derive the organization, parent link, active league/planned season status, and false fantasyEnabled on the server. Input cannot override these fields.

Internal app.save calls do not run API-request hooks. The handler therefore explicitly validates role/capability gates, existing parent organization/status, strict calendar dates and order, and exact nonnegative integer purse cents/currency. Collection validation and unique indexes still apply. New league and season saves share a transaction: if either fails, no partial new league remains. There is no schema migration. Existing records are never rewritten by this flow.

Blank dates stay unset. A blank purse stores the current convention of zero cents and empty currency; explicit zero uses USD. No team, athlete, event, roster, result, or fantasy league is created. There is no persisted request token: after an ambiguous network failure check the record lists before changing names and retrying.

## Local verification

Run node --test tests/league-season-setup.test.mjs, targeted formatting/lint, npm run check, the production build, and npm run test:integration. Unit tests simulate the handler transaction; real integration tests exercise the endpoint, permissions, no-partial-input failures, duplicate prevention, existing-league additions, dates, purse, and organization boundaries. Do not run integration test files directly against the development or production database; use the existing disposable-stack runner.

Restart LOCAL PocketBase to load the new hook/module. Keep the frontend on http://127.0.0.1:8090 for its backend.

As Bob in Guided Disc Golf Test:

- Open Leagues & seasons. The guided form should be above the empty lists; the two old creation forms should be absent.
- Enter Coastal Disc Golf League, click Next, then Spring 2027 with March 1–May 31, 2027. Leave purse blank. Go Back and confirm answers persist. Before final submission both lists remain empty.
- Review and submit once. Confirm one league and one season appear, with the intended dates and fantasy enrollment off.
- Return to the overview: its structure card should show one league and one season as Records found, without claiming event readiness.
- Select Add a season to an existing league, choose Coastal Disc Golf League, and review Summer 2027 without submitting unless you want another local test record. Existing league creation must not repeat.
- Confirm viewer/scorekeeper accounts have no setup form. Recheck disabled capability behavior, mobile layout, keyboard use, record editing, divisions, and season team entry controls.

The setup checklist and homepage work in this branch remain separate from this flow. Remove temporary setup-checklist console diagnostics before committing the branch.
