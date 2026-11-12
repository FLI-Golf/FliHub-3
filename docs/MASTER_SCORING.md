# Master scoring

Status: Agreed direction; implementation pending.
Last updated: November 12, 2026.
Repository: FLI-Golf/FliHub-3
Working branch: feature/fantasy-scoring
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
| --- | ---: |
| Three under par | −3 |
| Two under par | −2 |
| One under par | −1 |
| Even par | 0 |
| One over par | +1 |
| Two over par | +2 |
| Three over par | +3 |

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

## 2. Source review findings

Reviewed the supplied scoring source archive on November 12, 2026. This was
static source inspection, not a database integration test in Codespaces.

| Area | Existing behavior | Required follow-up |
| --- | --- | --- |
| Result snapshots | result_versions.totals preserves individual athlete IDs, names, team references, per-round strokes, and event stroke totals. | Extend snapshots with the relevant pars, holes, and completeness information. |
| Historical par | public_rules.js calculates display par from current active course holes. | Fantasy scoring must use snapshotted par, so later course edits cannot change historical scores. |
| Completeness | Scorecard submission checks required athlete/hole cells; approval checks submitted round/group cards. | Revalidate required cells at approval; remove the missing athlete-round total fallback to zero. |
| Publication | event_results.publishedVersion identifies the official snapshot. Approved unpublished versions are not official. | Calculate fantasy standings from this pointer, not the latest approved version. |
| Corrections | Reopening requires a reason; reapproval creates a new version. The previous published version remains official until republication. | Refresh fantasy standings from the new published version without adding duplicate scores. |
| Permissions | Direct result_versions reads require organization membership; fantasy membership is separate. | Provide a restricted server read path for approved fantasy participants without granting staff membership or exposing private audit details. |
| Fantasy linkage | Picks connect a participant, draft, event, and athlete. Designated substitutes are recorded separately from original picks. | Use a stable, auditable effective roster mapping for scored versions. |
| Substitution locking | The commissioner substitution endpoint requires a completed draft but has no publication check. | Prevent silent historical fantasy changes; settle and enforce the scoring lock boundary. |
| Documentation | ROADMAP.md still states par minus strokes. | Update the roadmap and record the new golf scoring decision in DECISIONS.md. |

## 3. Implementation sequence

### Step A — Document rules and validate result snapshots

- [ ] Record the agreed scoring convention in DECISIONS.md and update ROADMAP.md.
- [ ] Define the snapshot payload and document whether it needs a migration.
- [ ] Identify each required active round, group, athlete, and playing hole.
- [ ] Reject missing, duplicated, mismatched, or invalid required scoring cells.
- [ ] Validate finite positive strokes and valid pars against the scoring schema.
- [ ] Ensure all required queries are complete; detect or paginate query limits.
- [ ] Derive par from the corresponding scored holes, not a fixed nine- or eighteen-hole assumption.
- [ ] Preserve round/course references, hole identity/number, and par in the result snapshot.
- [ ] Preserve per-athlete, per-round strokes, par, score relative to par, and completeness.
- [ ] Apply the same validation and snapshot creation to initial approval and correction reapproval.
- [ ] Verify result lifecycle and version writes remain consistent if a write fails.
- [ ] Keep old snapshots unchanged; identify legacy snapshots without scoring-ready par.

### Step B — Resolve fantasy rosters and permissions

- [ ] Require a completed, valid draft with four unique effective athletes per participant.
- [ ] Verify the two-MPO/two-FPO roster requirement and event/league/season relationships.
- [ ] Respect existing event activation cutoffs and drafts requiring resolution.
- [ ] Preserve original picks and use explicitly recorded, eligible designated substitutes.
- [ ] Block unresolved, conflicting, duplicate, or chained substitutions according to existing rules.
- [ ] Define and enforce a roster/scoring lock so later substitutions cannot silently change published standings.
- [ ] Authorize approved members of the requested fantasy league on every scoring read.
- [ ] Reject forged draft, league, event, and organization combinations.
- [ ] Keep organization staff access separate; Bob does not automatically gain access to Jim's private league.
- [ ] Return only the athlete scores, roster explanations, and result-version metadata needed by participants.

### Step C — Calculate and display standings

- [ ] Read the event's publishedVersion and its immutable scoring snapshot.
- [ ] Show Awaiting published results when no official version exists.
- [ ] Show a clear legacy-snapshot message if the published version lacks required par data.
- [ ] Match athletes by stable IDs rather than names or team totals.
- [ ] Calculate each athlete's strokes minus snapshotted par across all required rounds.
- [ ] Sum all four effective athlete scores once per event and participant.
- [ ] Mark missing athlete, round, par, or unresolved roster data as Incomplete; do not assign a rank.
- [ ] Sort complete totals ascending and assign shared competition ranks.
- [ ] Explain each roster total with four athlete rows and their round/event scores.
- [ ] Identify the source published result version and corrected status.
- [ ] Keep the participant view compact and usable on phones.

### Step D — Corrections and stable history

- [ ] Continue showing the previous published result while a correction is open or approved but unpublished.
- [ ] Switch to the corrected version only after republication.
- [ ] Derive or replace totals by source version; never accumulate another copy of the same event score.
- [ ] Preserve the earlier official result and its audit history.
- [ ] Ensure course, athlete-name, and roster changes cannot silently rewrite a scored version.
- [ ] Define any cache invalidation or persistence keys using the event, draft, result version, and effective roster identity as appropriate.

Implementation details still to settle: the precise roster-lock boundary and
how a later approved roster correction is versioned. These must be explicit
before enabling substitutions that could affect finalized standings.

## 4. Existing demo result: safe transition

The UI showed Summer stage event test 1 with 12/12 scorecards submitted and
v1 approved but unpublished. Confirm its current database state before acting.

After the new snapshot behavior is implemented and verified:

1. Bob reopens the result with a truthful reason explaining that a new version
   is needed to capture par for fantasy scoring.
2. Reapproval validates the existing submitted scores and creates v2 with the
   new snapshot fields. Scorecards need not be reopened if scores are unchanged.
3. Review athlete totals, corresponding pars, and relative-to-par scores.
4. Bob publishes v2.
5. Jim verifies the six fantasy roster totals against that published version.

Do not reset the completed draft, erase v1, silently backfill historical par,
or use current course par as a fallback for old snapshots.

## 5. Verification checklist

- [ ] Under par produces a negative fantasy score; over par produces a positive score.
- [ ] Even par produces numeric zero and displays correctly.
- [ ] Four athlete scores sum correctly across all event rounds.
- [ ] Nine-hole and eighteen-hole configurations use their actual required pars.
- [ ] Missing scores, missing pars, invalid data, and incomplete rosters never become zero.
- [ ] Shared ranks work, including the 1, 1, 3 case.
- [ ] Approved but unpublished results do not create final fantasy standings.
- [ ] Legacy snapshots without par produce an explicit unavailable state.
- [ ] Editing course par after publication does not change historical fantasy scores.
- [ ] Unpublished corrections leave the prior official fantasy standings intact.
- [ ] Republication updates standings exactly once; reloads and repeated reads are idempotent.
- [ ] Approved fantasy participants can read their own league without staff membership.
- [ ] Outsiders, removed/unapproved participants, and forged cross-league IDs are rejected.
- [ ] Designated substitutions preserve original picks and cannot silently alter finalized totals.
- [ ] Bob's organization scoring and Morgan's assigned scorekeeping continue to work.
- [ ] Mobile roster explanations and standings remain readable and keyboard accessible.
- [ ] Relevant unit/hook and real PocketBase integration tests pass.
- [ ] npm run check, npm run lint, and npm run build pass.
- [ ] Complete a Codespaces walkthrough as Bob and Jim, including a published correction.

## 6. Demo context

| Item | Value |
| --- | --- |
| Organization | Bobs Org — 4ksk16f64guhf21 |
| Sports league | FLI Golf Test League |
| Season | Stage 1 Test Season |
| Event | Summer stage event test 1 |
| Fantasy league | Jim's Fantasy Test League — xnx3ktcjzn978yh |
| Draft | slk2dj9ksh4s8xc |
| Commissioner | Jim Fake |
| Other participants | Robin, Avery, Quinn, Devon, Riley (Demo) |
| Completed draft | 24 unique athletes; six rosters with two MPO and two FPO each |

## 7. Working practice and next action

Work on feature/fantasy-scoring. Provide complete Codespaces commands or a
reviewable patch; files created elsewhere are not automatically applied to the
Codespace. Stage intended source, test, migration, and documentation changes
explicitly. Keep downloaded archives and installer patches out of commits.

Next action: implement and test Step A before connecting the fantasy standings
endpoint or UI. Update this checklist with evidence and remaining limitations
after each increment. Payments, payouts, playoff policy changes, and live
provisional fantasy scoring are outside this increment.
