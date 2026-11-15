# Organization navigation counts

Status: implementation prepared for local validation. No migration, backend hook, collection-rule change, or write is included.

Overview, capability pages, and Settings now supply counts to the shared OrgNav. Other call sites may omit the optional counts prop; they display no badge rather than inventing a zero.

| Navigation item            | Count meaning                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Overview & members         | Organization memberships visible to the caller                                                                                    |
| Athletes                   | Non-archived athlete identities, including reserves                                                                               |
| Teams & rosters            | Separate non-archived team and season roster-spot counts                                                                          |
| Leagues & seasons          | Separate non-archived league and season counts                                                                                    |
| Venues & courses           | Non-archived courses; no claim of implemented generic venues                                                                      |
| Events                     | Non-archived events                                                                                                               |
| Scoring & official results | Visible scorecards and published result records for non-archived events                                                           |
| Competition standings      | Published result records, not ranked rows or computed standing positions                                                          |
| Fantasy                    | The signed-in user's league memberships for this organization, excluding declined/removed seats and including pending invitations |

Each loader verifies organization membership before requesting counts using its existing request-scoped PocketBase client. No superuser, new endpoint, or private contact lookup is used. Collection rules continue to scope what the caller can read. Disabled/planned capabilities do not request or display counts. A successful empty read shows 0; a failed or malformed total shows an amber em dash with an accessible explanation.

Counts request at most one identity row and totalItems for each collection/filter pair. Duplicate published-result queries are shared within a page load. Counts are organization-wide presence indicators, not a claim of linked season/event readiness. Non-archived rosters may span several seasons; roster spots are assignments, not distinct teams. Counts over 999 show 999+ with the exact value in the tooltip and accessible label.

Counts refresh on page load or the existing form invalidation. No background polling, roster changes, or status promotion is included. The user's roster-help edit is untouched by this patch.

## Local verification

Run node --test tests/organization-navigation-counts.test.mjs, targeted formatting/lint, npm run check, and the local-backend production build. The focused tests use simulated reads; actual collection permissions must still be checked in the running app.

As Bob, open Guided Disc Golf Test. Expect 28 athletes, 12 teams, one league, and one season if those records remain active. Roster spots should reflect actual imported assignments (for example 24), not the athlete count. Empty courses/events should show 0. Click the tabs and Settings, confirming counts remain scoped to this organization and refresh after edits. Check narrow layout and keyboard access.

As Morgan or Casey, verify only their permitted counts are returned and private fantasy league totals are not exposed by organization staff status. Confirm another organization's records do not affect these badges. Archived records should disappear from the applicable counts; no counts should be displayed for disabled capabilities. Failed-read behavior is covered by focused tests; do not stop or alter a valuable database just to force an error.

## Course layout summary

The Venues & courses mini card now has two count rows: courses and physical holes, followed by Red and Blue saved basket-position/tee-set records. Each query excludes archived records and archived parents, stays scoped to the current organization, and uses the signed-in client's existing collection rules. Red/Blue labels are matched as stored; this summary does not rename or merge position labels. Other named positions remain available in the course editor but are not included in these two named counters.

Counts cover all visible non-archived courses in the organization, not just East course. Nine physical holes with one Red and one Blue position each produce 9 physical holes, Red 9, Blue 9. Playing the same holes in two event rounds does not create 18 physical holes. Positions on every hole do not establish that event rounds, assignments, or scoring are configured. Failures remain unavailable rather than zero. No schema or record changes are included.
