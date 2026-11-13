# Multi-event foundation assessment

Review date: November 13, 2026.
Scope: source archives supplied from feature/multi-event-foundation. This is a source review, not a live PocketBase or production audit.

## Existing support

- Account activities already separate fantasy, organization management, and invitations. The account loader discovers eligible seasons and the action creates fan leagues without staff membership. Reuse this flow.
- Organization creation and settings already consume a shared capability catalog. Templates suggest editable selections; they are not activity or result engines.
- The configure hook validates template IDs, capability IDs, dependency closure, and race distances; rechecks Owner/Admin membership transactionally; and audits before/after configuration. Organization record updates are locked by migration.
- OrgNav uses enabled capabilities and availability badges. Capability pages check membership and selection. Competition and scoring hooks separately enforce capability gates on writes; collection rules supply authorization. Navigation is not a security boundary.
- Events may be standalone or season-linked. Athlete identity is separate from accounts, with private contact fields in a separate collection. Teams, rosters, archive history, official publication, and versioned corrections provide reusable patterns.

## Current limits

| Concern                  | Current implementation                                                         | Required direction                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Activity and format      | League, Race/Event, Custom are organization templates                          | Separate activity from format; decide inheritance before adding persisted fields                                 |
| Entries                  | Human athletes, teams, season entries, and athlete group assignments           | Review person/team/pair relationships and dedicated animal/vehicle/exhibit identities; do not repurpose athletes |
| Locations and operations | Courses, holes, basket positions, rounds, scorekeeper groups                   | Routes, lanes, courts, heats, classes, or judging sessions need reviewed workflows                               |
| Results                  | Per-hole integer strokes; snapshots validate courses, holes, athletes, and par | Dedicated timing, match, points, measurement, judging, voting, and award rules                                   |
| Competition standings    | Published golf stroke totals, completeness, shared ranks                       | Method-specific aggregation and ranking; no universal lowest-score assumption                                    |
| Fantasy                  | Four athletes, two male/two female slots, golf strokes minus saved par         | Preserve current policy; future formats require explicit eligibility, roster, and scoring rules                  |

Race/Event currently supplies distances and selects existing golf scoring capabilities. It does not implement race timing. The catalog's fantasy description is stale despite working event standings. The homepage progress source also records that competition/public relative-to-par displays still use course configuration; do not claim all historical displays use saved par.

## Recommended first implementation increment

Clarify the existing organization creation/settings and shared catalog without a schema migration. Explain that templates suggest capabilities, race distances are configuration only, and currently available scoring is golf-specific. Update stale fantasy descriptions. Keep template IDs, capability IDs, availability values, defaults, dependencies, and stored selections unchanged in this increment. Describe the supported scope instead of adding unsupported activity selectors.

Do not recreate account onboarding. Keep multi-event configuration within organization/competition settings. Account permissions belong to people; competing identities need not have accounts.

## Acceptance criteria

1. Creation and settings describe template suggestions separately from supported result workflows; Race/Event visibly states timing is not implemented.
2. Catalog descriptions accurately describe existing golf scoring and event fantasy standings without promoting timing, judging, matches, or new entry types to Available.
3. Template/capability IDs, defaults, dependencies, saved selections, race distances, routes, and existing data remain unchanged. No migration or production action is included.
4. Owners/Admins retain configuration access; Scorekeepers/Viewers and outsiders remain denied by backend rules, including direct requests. Disabled capabilities reject writes and preserve data.
5. Account activity selection, fan discovery/creation, invitations, and staff destinations retain their current behavior.
6. Golf setup, score submission, publication, corrections, drafts, pause/resume, and fantasy standings retain existing rules. Missing results stay incomplete; fantasy uses published saved par and lowest complete totals.
7. Type check, relevant formatting/lint, production build, targeted tests, and local mobile/keyboard checks pass. Run existing integration tests against their isolated test stack; do not point test setup at production or a valuable development database.

The delivered planning patch changes documentation only. These acceptance criteria describe the next implementation; they are not a claim it has been completed.

## Decisions still required

Activity defaults should be overridable within competition/event configuration in the design; their exact storage and historical rule boundaries remain open. Select one additional activity and define its entries, completeness, ties, exceptional outcomes, permission roles, publication snapshots, and correction policy before a schema proposal. Choosing a race merely because a Race/Event template exists would skip this review.

## Evidence and validation

Reviewed src/lib/capabilities/catalog.json and catalog.ts; OrgNav; account, organization creation, settings, capability, scoring, and result routes; PocketBase organization, capability, competition, scoring, result, discovery, and fantasy source; migrations; and associated planning documents.

Existing tests run from the supplied source: fantasy-discovery, fantasy-pause, fantasy-scoring, result-snapshot, and draft-recommendation: 125 passed, zero failed. These are simulated hook/rule tests, not live database integration or browser verification. Codespaces check/build completion was reported by the user; full logs were not supplied. No runtime files were modified by this planning patch.

See [account onboarding](README-ACCOUNT-ONBOARDING.md), [multi-event plan](README-MULTI-EVENT-PLATFORM.md), [capabilities](CAPABILITIES.md), [decisions](DECISIONS.md), [roadmap](ROADMAP.md), [master scoring](MASTER_SCORING.md), and [fantasy scoring](README-FANTASY-SCORING.md).
