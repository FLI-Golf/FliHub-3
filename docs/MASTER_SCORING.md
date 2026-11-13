# Master scoring

Status: Per-event golf fantasy scoring implemented, verified locally, and merged in PR #28. Remaining checklist entries retain their individual scope.
Last updated: November 13, 2026.
Repository: FLI-Golf/FliHub-3
Implementation branch: feature/fantasy-scoring (historical).
Multi-event planning: [MULTI-EVENT-ASSESSMENT.md](MULTI-EVENT-ASSESSMENT.md). Golf scoring remains a dedicated supported workflow; do not generalize its rules by changing labels.
Baseline: main after PR #27, merge commit e6efa59.

This document is the implementation and verification checklist for connecting
official event results to golf fantasy standings. Keep it current as each step
is implemented and verified. A checked item requires evidence; this plan alone
does not establish that a feature exists.

## 1. Agreed golf scoring convention

Dustin's decision: fantasy scores match athlete scores relative to par. Lower
is better. Apply this convention to golf fantasy scoring going forward.

**Athlete fantasy score = strokes played − par for the corresponding holes.**

| Athlete score relative to par | Fantasy score |
| ----------------------------- | ------------: |
| Three under par               |            −3 |
| Two under par                 |            −2 |
| One under par                 |            −1 |
| Even par                      |             0 |
| One over par                  |            +1 |
| Two over par                  |            +2 |
| Three over par                |            +3 |

An event fantasy roster contains four athletes: two MPO and two FPO. Sum their
scores across all required event rounds. The lowest complete roster total wins.
For example, −4, −2, even, and +1 produce a roster score of −5.

- Display even par as E where helpful, while storing numeric zero.
- Show a plus sign for positive scores and a minus sign for negative scores.
- Equal complete totals share a competition rank: 1, 1, 3, and so on.
- Missing or invalid required scores are Incomplete, never zero or even par.
- Incomplete rosters receive no competitive rank; show completeness explicitly.
- Final fantasy standings use published official results only.
- Live provisional scoring is outside this first increment.
- Do not use the former par-minus-strokes formula.

## 2. Initial source review findings

The initial source review on November 12, 2026 was static inspection. The
table below preserves that starting-state audit; it is not the current
implementation status. The checked tasks and verification checkpoint record
the subsequent implementation and real Codespaces testing.

| Area                 | Existing behavior                                                                                                                   | Required follow-up                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Result snapshots     | result_versions.totals preserves individual athlete IDs, names, team references, per-round strokes, and event stroke totals.        | Extend snapshots with the relevant pars, holes, and completeness information.                                                                |
| Historical par       | public_rules.js calculates display par from current active course holes.                                                            | Fantasy scoring must use snapshotted par, so later course edits cannot change historical scores.                                             |
| Completeness         | Scorecard submission checks required athlete/hole cells; approval checks submitted round/group cards.                               | Revalidate required cells at approval; remove the missing athlete-round total fallback to zero.                                              |
| Publication          | event_results.publishedVersion identifies the official snapshot. Approved unpublished versions are not official.                    | Calculate fantasy standings from this pointer, not the latest approved version.                                                              |
| Corrections          | Reopening requires a reason; reapproval creates a new version. The previous published version remains official until republication. | Refresh fantasy standings from the new published version without adding duplicate scores.                                                    |
| Permissions          | Direct result_versions reads require organization membership; fantasy membership is separate.                                       | Provide a restricted server read path for approved fantasy participants without granting staff membership or exposing private audit details. |
| Fantasy linkage      | Picks connect a participant, draft, event, and athlete. Designated substitutes are recorded separately from original picks.         | Use a stable, auditable effective roster mapping for scored versions.                                                                        |
| Substitution locking | The commissioner substitution endpoint requires a completed draft but has no publication check.                                     | Prevent silent historical fantasy changes; settle and enforce the scoring lock boundary.                                                     |
| Documentation        | ROADMAP.md still states par minus strokes.                                                                                          | Update the roadmap and record the new golf scoring decision in DECISIONS.md.                                                                 |

## 3. Implementation sequence

### Step A — Document rules and validate result snapshots

- [x] Record the agreed scoring convention in DECISIONS.md and update ROADMAP.md.
- [x] Define the snapshot payload and document whether it needs a migration.
- [x] Identify each required active round, group, athlete, and playing hole.
- [x] Reject missing, duplicated, mismatched, or invalid required scoring cells.
- [x] Validate finite positive strokes and valid pars against the scoring schema.
- [x] Ensure all required queries are complete; detect or paginate query limits.
- [x] Derive par from the corresponding scored holes, not a fixed nine- or eighteen-hole assumption.
- [x] Preserve round/course references, hole identity/number, and par in the result snapshot.
- [x] Preserve per-athlete, per-round strokes, par, score relative to par, and completeness.
- [x] Apply the same validation and snapshot creation to initial approval and correction reapproval.
- [ ] Verify result lifecycle and version writes remain consistent if a write fails.
- [x] Keep old snapshots unchanged; identify legacy snapshots without scoring-ready par.

### Step B — Resolve fantasy rosters and permissions

- [x] Require a completed, valid draft with four unique effective athletes per participant.
- [x] Verify the two-MPO/two-FPO roster requirement and event/league/season relationships.
- [x] Respect existing event activation cutoffs and drafts requiring resolution.
- [x] Preserve original picks and use explicitly recorded, eligible designated substitutes.
- [x] Block unresolved, conflicting, duplicate, or chained substitutions according to existing rules.
- [x] Define and enforce a roster/scoring lock so later substitutions cannot silently change published standings.
- [x] Authorize approved members of the requested fantasy league on every scoring read.
- [x] Reject forged draft, league, event, and organization combinations.
- [x] Keep organization staff access separate; Bob does not automatically gain access to Jim's private league.
- [x] Return only the athlete scores, roster explanations, and result-version metadata needed by participants.

### Step C — Calculate and display standings

- [x] Read the event's publishedVersion and its immutable scoring snapshot.
- [x] Show Awaiting published results when no official version exists.
- [x] Show a clear legacy-snapshot message if the published version lacks required par data.
- [x] Match athletes by stable IDs rather than names or team totals.
- [x] Calculate each athlete's strokes minus snapshotted par across all required rounds.
- [x] Sum all four effective athlete scores once per event and participant.
- [x] Mark missing athlete, round, par, or unresolved roster data as Incomplete; do not assign a rank.
- [x] Sort complete totals ascending and assign shared competition ranks.
- [x] Explain each roster total with four athlete rows and their round/event scores.
- [x] Identify the source published result version and corrected status.
- [ ] Keep the participant view compact and usable on phones.

### Step D — Corrections and stable history

- [x] Continue showing the previous published result while a correction is open or approved but unpublished.
- [x] Switch to the corrected version only after republication.
- [x] Derive or replace totals by source version; never accumulate another copy of the same event score.
- [x] Preserve the earlier official result and its audit history.
- [x] Ensure course, athlete-name, and roster changes cannot silently rewrite a scored version.
- [x] Define any cache invalidation or persistence keys using the event, draft, result version, and effective roster identity as appropriate.

Roster-lock boundary is implemented: event activation/cutoff, first result
publication, or an existing scoring lock blocks roster mutations. The first
authorized scoring read captures a valid effective roster and its lock timestamp;
subsequent result corrections reuse it. For existing drafts, that timestamp is
initialization time, not a reconstructed activation-time history. Approved
post-lock roster corrections still need a separate audited design and remain
unsupported.

## 4. Existing demo result: safe transition

Completed in the running Codespace on November 12, 2026:

1. Bob reopened approved, unpublished v1 with the recorded reason:
   “Capture hole pars and athlete scores in a versioned snapshot for fantasy
   scoring. No stroke changes.”
2. Reapproval created v2 without changing submitted stroke values.
3. An authenticated read-only check verified all 24 individual athlete snapshots,
   including round scores, corresponding hole pars, and relative-to-par totals.
4. Each round has nine holes and par 27; each athlete has event par 54.
5. Bob published v2. The page confirmed Official published result — v2, with v1
   preserved in version history.
6. Jim opened fantasy standings and verified all six complete roster totals.

Do not reset the completed draft, erase v1, silently backfill historical par,
or use current course par as a fallback for old snapshots.

## 5. Verification checklist

- [x] Under par produces a negative fantasy score; over par produces a positive score.
- [x] Even par produces numeric zero and displays correctly.
- [x] Four athlete scores sum correctly across all event rounds.
- [x] Nine-hole and eighteen-hole configurations use their actual required pars.
- [x] Missing scores, missing pars, invalid data, and incomplete rosters never become zero.
- [x] Shared ranks work, including the 1, 1, 3 case.
- [x] Approved but unpublished results do not create final fantasy standings.
- [x] Legacy snapshots without par produce an explicit unavailable state.
- [x] Editing course par after publication does not change historical fantasy scores.
- [x] Unpublished corrections leave the prior official fantasy standings intact.
- [x] Republication updates standings exactly once; reloads and repeated reads are idempotent.
- [x] Approved fantasy participants can read their own league without staff membership.
- [x] Outsiders, removed/unapproved participants, and forged cross-league IDs are rejected.
- [x] Designated substitutions preserve original picks and cannot silently alter finalized totals.
- [ ] Bob's organization scoring and Morgan's assigned scorekeeping continue to work.
- [ ] Mobile roster explanations and standings remain readable and keyboard accessible.
- [x] Relevant unit/hook and real PocketBase integration tests pass.
- [ ] npm run check, npm run lint, and npm run build pass.
- [ ] Complete a Codespaces walkthrough as Bob and Jim, including a published correction.

## 6. Demo context

| Item               | Value                                                         |
| ------------------ | ------------------------------------------------------------- |
| Organization       | Bobs Org — 4ksk16f64guhf21                                    |
| Sports league      | FLI Golf Test League                                          |
| Season             | Stage 1 Test Season                                           |
| Event              | Summer stage event test 1                                     |
| Fantasy league     | Jim's Fantasy Test League — xnx3ktcjzn978yh                   |
| Draft              | slk2dj9ksh4s8xc                                               |
| Commissioner       | Jim Fake                                                      |
| Other participants | Robin, Avery, Quinn, Devon, Riley (Demo)                      |
| Completed draft    | 24 unique athletes; six rosters with two MPO and two FPO each |

## 7. Working practice and next action

Work on feature/fantasy-scoring. Provide complete Codespaces commands or a
reviewable patch; files created elsewhere are not automatically applied to the
Codespace. Stage intended source, test, migration, and documentation changes
explicitly. Keep downloaded archives and installer patches out of commits.

Next action: complete the remaining closeout checks below, review the intended
Git diff, and commit/push the scoring and documentation changes on this branch.
No additional scoring feature is required for the current event-scoring
increment. Payments, payouts, playoff policy changes, season-wide fantasy
aggregation, live provisional fantasy scores, and audited post-lock roster
corrections remain outside this increment.

## 8. Verified implementation checkpoint — November 12, 2026

| Evidence                                | Result                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codespaces integration suite            | 90 tests passed; 0 failed. Includes publication, fantasy permissions, roster locking, course edits, and correction replacement.                                  |
| Snapshot tests                          | Initial approval and correction reapproval preserve strokes, hole pars, and completeness; nine- and eighteen-hole fixtures use actual pars.                      |
| Published live result                   | Summer stage event test 1, v2; all 12 scorecards submitted; 24 complete athlete snapshots.                                                                       |
| Golf scoring convention                 | Strokes minus saved par; negative under par, E at even par, positive over par; lowest complete roster total wins.                                                |
| Live fantasy standings                  | Six participants, each with four athletes and expandable round/event calculations, read by Jim without organization staff access.                                |
| Result-version stability                | Integration verification keeps the prior published version during a correction and replaces its contribution on republication; repeated reads do not add scores. |
| Historical par and roster mapping       | Integration and hook tests verify saved par and persisted effective roster mapping; mutable course data is not used as a fantasy fallback.                       |
| UI progress descriptions                | Homepage, account-entry guidance, capability cards, shared build label, and footer updated to describe event fantasy scoring.                                    |
| Final check/lint/build after copy edits | Awaiting recorded confirmation after the final documentation and UI-copy changes.                                                                                |

Live roster totals checked against the displayed athletes:

| Rank | Fantasy participant | Event fantasy score |
| ---- | ------------------- | ------------------: |
| 1    | Devon (Demo)        |                 +17 |
| 2    | Avery (Demo)        |                 +19 |
| 3    | Riley (Demo)        |                 +23 |
| 4    | Jim Fake            |                 +27 |
| 5    | Robin (Demo)        |                 +33 |
| 6    | Quinn (Demo)        |                 +38 |

The roster totals sum to +157. All 24 athletes together have 1,453 strokes and
1,296 par (24 × 54), which also gives +157. These over-par demo results retain
the agreed golf sign; under-par performances produce negative fantasy totals.

Implementation references:

- pocketbase/pb_hooks/result_snapshot_rules.js validates and builds schema-v2 result snapshots.
- pocketbase/pb_hooks/fantasy_scoring_rules.js calculates published event standings and locks effective rosters.
- pocketbase/pb_hooks/flihub_fantasy_scoring.pb.js authorizes the private scoring endpoint.
- pocketbase/pb_migrations/1794600000_fantasy_scoring_roster.js adds scoringRoster and scoringRosterLockedAt without relaxing client write rules.
- The fantasy league lobby links completed drafts to their standings pages.
- docs/README-FANTASY-SCORING.md describes operation, permissions, locking, and remaining scope.

No migration was needed to extend the existing result-version JSON payload in
Step A. The separate Step B migration adds the persistent fantasy roster fields.
It refuses rollback after a scoring roster lock has been recorded.

## 9. Remaining closeout and deferred work

The open checklist items above remain intentional:

- **Write-failure recovery:** validation rejects bad input before approval writes,
  but approval/version/audit consistency after an injected downstream write
  failure has not been established. Review this before calling failure recovery
  verified; passing normal lifecycle tests is not equivalent evidence.
- **Phone and keyboard review:** the standings UI is implemented, but final phone
  layout, expandable roster navigation, and keyboard checks remain unrecorded.
- **Role smoke check:** Bob's approval/publication worked in the live walkthrough;
  role restrictions passed integration tests. A fresh manual Morgan scorekeeping
  check after the scoring changes remains pending.
- **Browser correction walkthrough:** Bob's v1-to-v2 snapshot transition and Jim's
  published standings were observed live. A changed-stroke correction through
  browser reopen, resubmit, reapprove, and republish remains pending; that
  replacement flow already passes automated database integration testing.
- **Final validation:** run check, lint, and build after the last copy/document
  edits. Record outcomes before committing. Avoid repeating the full integration
  suite for documentation-only changes unless implementation changes again.
- **Commit review:** review the two modified logo images separately; select the
  intended source, tests, migrations, and documentation explicitly. Keep archives,
  downloaded patches, and installer scripts out of the feature commit.

Deferred follow-ups include season-wide fantasy aggregation, live provisional
scores, audited post-lock roster corrections, a narrated scoring/end-to-end
walkthrough, production draft ranking rules, and using snapshotted par in
competition/public relative-to-par displays. The last item is separate from
fantasy, which already uses saved par.
