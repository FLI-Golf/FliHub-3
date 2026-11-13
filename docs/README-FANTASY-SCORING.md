# Golf fantasy standings

Status: Per-event golf fantasy scoring implemented, verified locally, and merged in PR #28. Historical validation notes below remain useful for regression checks.

Scope: golf only. Other result methods and entry types remain proposed in the [multi-event plan](README-MULTI-EVENT-PLATFORM.md) and [assessment](MULTI-EVENT-ASSESSMENT.md).
Plan: [MASTER_SCORING.md](MASTER_SCORING.md).

## Rules

Athlete fantasy score = strokes − snapshotted par across all required event
rounds. Sum the four effective roster athletes. Lowest complete total wins;
equal totals share competition ranks (1, 1, 3). E is numeric zero. Missing,
invalid, or unresolved required data is Incomplete and unranked.

Only the event's published official result version counts. Approval alone is
not publication. While a correction is open or merely reapproved, standings
continue to use the previous published version. Republication replaces that
source version; reading again does not add another copy of its score.

## Access and navigation

Sign in as an approved fantasy participant, open the fantasy league lobby, and
choose Fantasy standings beside a completed event draft. The page provides a
compact rank/participant/score table and expandable four-athlete explanations,
including round strokes, pars, and designated substitutes. Use Refresh after a
result publication or correction. There is no live provisional score polling.
Organization owners/admins without an approved fantasy seat cannot read it.

The trusted endpoint checks organization, league, draft, event, season, and
approved membership. Raw result snapshot collection rules remain unchanged.
The scoring response omits contact details, private correction reasons, and
approver identities. Responses are private and not cached.

## Roster stability

Existing event activation cutoffs, first publication, and persisted scoring
locks block new selections, substitutions, and demo draft resets. Publication
also blocks new draft preparation even for legacy events without an activation
stamp. A valid published standings read captures the effective roster in the
same database transaction as its first scoring lock. Later reads and corrected
result versions reuse that saved roster; participant removal does not rewrite
historical scores. The initialization timestamp is not a retroactive claim
about the original event activation time.

Pending, duplicate, cross-division, chained, and otherwise invalid designated
substitutions block scoring rather than being guessed. Post-lock roster
corrections remain unsupported and require a separate audited policy.

Migration 1794600000_fantasy_scoring_roster.js adds a JSON scoringRoster and
scoringRosterLockedAt date to fantasy_drafts. It does not open client write
rules. Apply the migration before restarting the hooks. Rollback is blocked
once any scoring roster lock exists, to preserve historical mapping.

Legacy published results without schemaVersion 2 and saved par display an
explicit unavailable message. Reopen/reapprove/publish a reviewed result version;
never infer historical par from the current course.

## Verification

- [ ] Apply the migration in Codespaces and restart PocketBase.
- [ ] Run node --test tests/*.test.mjs.
- [ ] Run npm run check, npm run lint, and npm run build.
- [ ] Run npm run test:integration against its disposable database.
- [ ] As Jim, open standings for the published demo v2 without staff membership.
- [ ] Check six rows, four athletes each, and manual strokes-minus-par totals.
- [ ] Check shared ranks and E/negative/positive displays on a phone.
- [ ] Confirm Bob without a fantasy seat and removed/unapproved users are denied.
- [ ] Confirm the saved roster lock appears and repeated refreshes do not change totals.
- [ ] Confirm a course-par edit cannot alter the published fantasy score.
- [ ] Confirm an unpublished correction leaves current standings unchanged.
- [ ] Publish a reviewed correction and confirm replacement totals, not added points.
- [ ] Confirm locked substitutions and demo resets are rejected.
- [ ] Recheck Bob's official-result workflow and Morgan's scorekeeping access.

Tests cover the calculation and security rules in a simulated hook runtime. The
additional Phase 2C integration scenario exercises real migrations, fantasy
membership, a complete draft, published results, roster locks, permissions,
course edits, and correction republication. It must pass in Codespaces before
this work is called verified.

Season-wide fantasy aggregation, live provisional scoring, payouts, and
post-lock roster correction UI are outside this increment.
