# Guided organization creation

Status: implementation prepared for local validation. Type/lint/build and real PocketBase/browser checks remain required before commit.

## Entry points

`/organizations/new` is the standard signed-in organization creation route. Organizations and the account management choice link here. Old `/organizations?create=1` links redirect here. The old Organizations creation form is removed; its browser POST action returns a clear error instead of silently creating an unconfigured organization. Organization switching, membership cards, scorekeeper assignments, and existing organization settings remain unchanged.

The styled wizard is shared with `/organizations/setup-preview`, which remains a non-writing exploration route. Both inherit the existing signed-in `(app)` layout. Other activities remain preview-only, including golf combinations not explicitly supported by this increment.

## First supported mapping

Only **Disc golf → League season → Teams → Strokes** exposes a Create organization button on Review. This narrow mapping fits the existing team/season-entry assignment workflow; individual or pair competition is not claimed by this increment.

Creation requires verified email and makes the caller Owner using the existing transaction. It enables the existing League capabilities: athletes, teams, leagues-seasons, venues-courses, events, scoring-results, and standings. Fantasy is not enabled. The server derives this configuration; it never trusts client capability IDs or template values.

The operation creates only the organization, Owner membership, and creation audit record. League, season, team, course, event, and result records are configured afterward using existing tools. Wizard answers are versioned provenance in the existing creation audit details, not new organization activity fields or enforced competition rules. No schema migration is included. Existing settings can adjust capabilities later.

## Server enforcement and compatibility

The SvelteKit action validates the name and exact supported combination, then sends only the name and versioned guidedSetup answers to the existing PocketBase endpoint. The PocketBase hook independently validates the supported combination and email verification, derives canonical capabilities, and retains existing dependency checks. Conflicting template/capability/distance overrides and malformed guidedSetup objects are rejected before writes.

Existing legacy PocketBase callers without guidedSetup retain the previous API behavior for compatibility. They create configuration under the existing contract and do not claim a guided profile or unlock unsupported result methods. This increment makes the wizard standard in the app, not a mandatory API protocol for old clients.

On success the action sets the existing active-organization cookie and redirects to the new overview. On failure it returns the name, selections, and an error; the user can edit without reentering answers. An enhanced submission disables the Create and Back controls while pending. This prevents repeated clicks in that page, not duplicate creation across tabs or uncertain network retries. Check Organizations before retrying after an ambiguous network failure; there is no persisted idempotency token in this increment.

## Validation and local walkthrough

Run targeted formatting/lint, `node --test tests/setup-preview.test.mjs tests/guided-organization.test.mjs`, `npm run check`, and a production build. The hook/action tests use simulated records and are not real PocketBase integration tests. Run the existing isolated integration suite before merging backend changes.

Restart LOCAL PocketBase after applying the new hook/module. Keep the frontend explicitly on `http://127.0.0.1:8090`. Do not apply this test to production.

1. As Bob, use Organizations → Create an organization. Confirm the old flat form is absent and preview exploration remains accessible.
2. Enter a fresh local test organization name, then choose Disc golf → League season → Teams → Strokes. Confirm review states exactly what will and will not be created.
3. Back/Next and refresh behavior should match the displayed instructions. Verify required-choice errors and mobile/keyboard use.
4. Submit once. Confirm redirect to the new organization, Bob as Owner, the seven capabilities enabled, and guidedSetup in creation history. No league, season, event, or fantasy league should have been created.
5. Return to Bob's original organization. Confirm its members, configuration, scoring navigation, and settings are unchanged. Check scorekeeper assignment access under its existing account.
6. Explore Running, Bowling, Pageant, individual, pair, and unsupported format paths; no Create button should appear. `/organizations/setup-preview` must never show Create, even for the supported combination.
7. Verify signed-out access goes to login. A signed-in unverified account must be denied creation. Forged action/endpoint selections and capability overrides must fail without records, as covered by tests.

The overall wizard design remains in [README-MULTI-EVENT-PLATFORM.md](README-MULTI-EVENT-PLATFORM.md). The earlier prototype checkpoint in [README-SETUP-PREVIEW.md](README-SETUP-PREVIEW.md) still describes the non-writing preview route.
