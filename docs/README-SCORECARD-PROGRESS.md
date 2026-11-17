# Saved scorecards and completion indicators

Prepared on `feature/guided-event-scoring-results`. This is a presentation update
for the event score-entry page, not a change to scoring, permissions, submission,
result approval or standings rules. No migration or backend hook change is needed.

- A saved scorecard table remains visible during hole entry and review: one hole
  per row, full athlete names, team names, saved strokes and totals. Missing
  scores stay as dashes; partial totals retain their missing-score labels.
- A green square check and highlight mark a completed round for the selected
  group, or a completed group for the selected round. Individual player tiles
  and hole rows indicate saved scores too. Empty layouts and empty groups never
  count as complete. Pending saves do not show completion for the current card.
- Completion requires every current athlete/hole pair to have a positive whole
  saved stroke value in this group and round. It does not use an audit-log count.
- Scores complete is separate from Draft/Submitted. A complete draft opens
  scorecard review by default and still requires an explicit Submit scorecard
  action. Back to hole entry and Edit hole remain available for editable drafts.
- Recent change history is collapsed and shown as an audit table, retaining time,
  actor, action, athlete, hole, previous/new value and reason. Its existing server
  response is limited to recent entries; this UI does not claim a full audit
  export or delete any history.

Run `node --test tests/scorecard-progress.test.mjs`, targeted formatting/lint and
`npm run check`. In development, reuse the saved Group 1 Red/Blue scores: confirm
both round buttons and their scorecard tables turn green while Draft remains
visible. Switch groups to check incomplete cards stay unmarked. Submit one card
only after review and confirm Submitted remains a separate state. No event or
score recreation is required. Check the horizontal table scroll on a phone and
keyboard access to Edit, View scorecard and Recent change history.

## Round entry guidance

The active round has a prominent banner with its round number, hole count,
position label, playing-hole range and selected group. Later draft rounds are
greyed out until all preceding rounds are submitted for that same group. Saved
complete drafts remain green but do not unlock the next round by themselves.

A successful Submit Round scorecard action refreshes the saved statuses and
selects the first unsubmitted round in that group, with a confirmation message.
An unsuccessful submission stays on the current card. When all group rounds are
submitted, the current submitted card stays visible. Changing groups chooses
that group's first unsubmitted round. Earlier submitted cards remain viewable;
existing later submitted cards stay accessible during corrections too.

This is frontend entry guidance, not a new server scoring-order or permission
policy. Existing saved scores, review, reopen reasons and publication locks are
preserved. All-round saved scores remain available in the overview even when a
later draft round cannot yet be selected for entry. No migration is needed.

Run `node --test tests/scorecard-progress.test.mjs tests/scoring-round-flow.test.mjs`
and the targeted lint and Svelte checks. In development, use Group 3's existing
Round 1 card: confirm its Red/1–9 banner and the disabled Blue round, then fill
missing values, review and submit once. Confirm Round 2/Blue/10–18 opens, and
switch groups to confirm submission state is scoped to each group. The browser
check of the automatic transition remains required.

## Button-style scorecard navigation

The all-holes overview is a button-style Show scorecard / Hide scorecard toggle. Round buttons show Working on, Ready to submit, Locked or Submitted, with saved-score counts. Existing tables, group-specific submission gates and automatic advancement remain unchanged.
