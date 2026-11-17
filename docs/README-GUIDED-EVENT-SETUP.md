# Guided team golf event setup

## Scope and status

Prepared on `feature/guided-event-setup`, based on merged PR #34. This increment
adds a guided flow on an organization's Events page for a **new, single- or multi-day,
season-linked team golf event**. Real PocketBase, Svelte/TypeScript, build and
browser checks remain required before calling this increment verified.

The flow reuses existing seasons, season team entries, active rosters, courses,
complete basket/tee position labels and organization members. The venue follow-up
adds optional `venueName` (120 characters) and `venueAddress` (500 characters)
text fields on events. It adds no new activity or scoring engine. Independent creation and manual date/time entry remain under Advanced event
creation. Existing editing, archiving,
substitutions, tee scheduling, scorecard locks and published-result tools remain
in their current workflows.

## Steps

1. **Event:** choose a planned/active season, event name and date within its dates,
   plus an optional venue name and address. Checking Multi-day event reveals an end
   date, which must be later than the start and within the season.
2. **Rounds:** choose each course and a position present on every active course
   hole. With one course, complete Red/Blue labels are suggested as two rounds.
3. **Groups:** select season teams with valid rosters and generate editable groups.
   The default is two teams per group; names and team placement can be changed.
4. **Lineups:** review the selected teams' active roster athletes and choose the
   first group’s local tee date/time for each round. Following groups start at
   the selected interval (10 minutes by default). Reserve pools
   are excluded; later substitutions use the existing event workflow.
5. **Scorekeepers:** assign an Owner, Admin or Scorekeeper to each group. Viewers
   are excluded. An eligible current user is suggested; one person can cover
   multiple groups. Creating additional user accounts is not required.
6. **Review:** review rounds, groups, athlete names and scorekeepers, then submit
   once. Back/Next save nothing. Refreshing clears unfinished answers.

The start date is stored at **midnight UTC**. For a multi-day event, the end
is saved at **23:59:59.999 UTC on the selected final day**. These planning
boundaries are not local tee times. Set each round’s local first tee date/time during Lineups. The wizard reuses
the existing timezone-aware conversion; later edits use the existing scheduler. Two rounds on nine
physical holes produce eighteen playing holes; this flow does not add eighteen
physical course holes.

## Server guarantees and limits

The authenticated endpoint checks the actor's current Owner/Admin membership,
organization capabilities, active same-organization relationships, season dates,
course hole IDs and position coverage, current roster athletes and scorekeeper
roles inside the same transaction as the saves. Missing/failed setup reads block
the wizard rather than becoming an apparently empty setup.

The server derives the event and assignment relationships. It creates a Planned
event, rounds, groups, group team assignments, group athlete assignments and
per-round tee schedules together, or rolls the entire transaction back. No scorecards, scores, official
results, fantasy records or substitutions are created. A submitted event ID is
never used to update an existing event.

Reviewed hole and athlete ID sets must still match current records. A roster or
hole-set change rejects submission and requires another review. This is not a
snapshot of every editable course/athlete field; existing result publication
retains responsibility for its saved scoring context.

A transaction checks for an existing event with the same organization, season,
name and exact midnight-UTC date to catch repeat submissions. This is not a
persistent request token or a universal event-name uniqueness rule. An archived
matching event also blocks this creation path; open the existing event or choose
an appropriate distinct name.

Wizard batch limits are 1–12 rounds, 1–64 groups, 256 teams total, 128 athletes per
team, 1,024 athletes total and 500 active holes per selected course. These limits
bound this batch operation; they do not change shared sport or schema rules.

## Verification

Run `bash scripts/validate-guided-event-setup.sh` from the repository. The script
is included with this change and runs the checks below; it neither stages nor
commits files. The integration runner uses disposable data.

- `node --test tests/guided-event-setup.test.mjs`: parser, current role/capability
  checks, relationship scope, dates, stale selections, duplicate submissions and
  rollback after a simulated late storage error.
- `npm run test:integration`: includes `tests/integration/guided-event-setup.test.mjs`
  against disposable PocketBase, testing saved relationships, concurrent repeats,
  stale rosters, incomplete positions, role restrictions and disabled capabilities.
- Run targeted Prettier/ESLint, `npm run check`, production build and `git diff --check`.
- Restart local PocketBase to apply `1794931200_event_venue_details.js` and load
  the hooks. Existing events keep empty optional location fields. Back up the
  database before applying the migration in a deployed environment.

Reuse the existing Guided Disc Golf Test organization for a short browser check:
choose Spring 2027, Coastal Spring Open, April 10, 2027; confirm East course Red
then Blue and 18 playing holes; select all 12 rostered teams and generate six
groups; review the existing 24 athletes; keep Bob as scorekeeper or choose an
eligible member; review and create once. Confirm the new event is selected in
operations below, with two rounds, six groups and the expected assignments.
Check Back/Next, keyboard controls and mobile layout without rebuilding the data.

A Viewer/Scorekeeper must not see the creation wizard. The endpoint must also
reject their direct requests. Existing scoring and published-result workflows
must retain their prior behavior.

## Event venue details

Venue name and address are event-local text, separate from each round's course.
They appear on Review and the saved event card, and can be corrected through
Edit event. Independent creation also offers the same fields. Blank values are
allowed. This does not introduce a reusable venue catalog, geocoding, map links
or automatic course-to-venue associations. Public pages are unchanged.

Migration rollback refuses to drop these fields once any event has saved venue
details. Ordinary event read/write permissions remain unchanged. Older requests
that omit the fields leave them blank on creation; ordinary event updates that
omit them preserve the saved values.

Verify the name and address survive creation, reload and Edit event. Existing
events without a venue must remain readable and editable. The disposable
PocketBase integration suite verifies the new fields and an ordinary metadata
edit; the rule suite checks bounds, trimming and migration rollback protection.

## Multi-day wizard follow-up

The guided Event step now includes the Multi-day event checkbox. Review shows
the entire selected date range. A single-day event keeps `endsAt` empty; switching
the checkbox off ignores the unfinished end-date input. The flag is form state,
not a new database column: saved events use the existing `startsAt` and `endsAt`
fields. This follow-up requires no additional migration.

All date validation also runs on the server inside the creation transaction.
Tests include invalid, missing, reversed and out-of-season end dates, the season
boundary, and preserving compatibility with older single-day requests. Existing
event cards and Edit event already support the saved end date. Multi-day dates
do not automatically choose a separate day or tee time for each round.

## Tee times during Lineups

The wizard now requires a first-group local date/time for each round. It defaults
to a 10-minute interval; the organizer can change it within the existing 1–240
minute scheduler limits. Group order follows the reviewed group list. Lineups
and Review show all generated group starts. Changing groups, dates, timezone or
interval recalculates the preview and is validated again before saving.

Timezone choices are shown explicitly (America/Los_Angeles is suggested).
Conversion uses the existing `generateTeeTimes` / `toTeeInstant` helpers, including
rejection of ambiguous or skipped daylight-saving times. Local tee dates,
including the final generated group start, must stay within the selected event
dates. Each later round must start after all groups have teed off in the previous
round; the organizer must still allow sufficient playing time.

The SvelteKit action validates and converts local times. The PocketBase endpoint
checks supported zone names, UTC instants, intervals and round ordering, derives
all saved group IDs, and writes `rounds.teeSchedule` within the same transaction
as creation. The JSON uses the existing timezone, intervalMinutes and slots
format, so existing scoring assignment displays and schedule editors can read it.
The timezone list lives alongside the hooks and is also imported by the frontend.

No additional migration is needed: `rounds.teeSchedule` and `events.endsAt` already
exist. The earlier venue migration remains necessary. Existing requests that do
not contain scheduling inputs can still create unscheduled events. Existing
scorecard locks continue to govern changes through the existing scheduler.

For the current six-group demo, 09:00 produces 09:00, 09:10, 09:20, 09:30, 09:40
and 09:50. Choose a separate first tee date/time for Round 2; the wizard does not
guess round duration. Back/Next generate no database writes.

## Saved-event presentation

The event card shows midnight-UTC planning dates separately from local tee
schedules. Explicit non-planning date/time boundaries entered through advanced
creation remain displayed as UTC timestamps. This is presentation only; saved
dates and schedules do not change.

Optional add-round and add-group forms are collapsed and explicitly labeled as
new unsaved forms. Empty athlete choices distinguish currently eligible athletes
already assigned here, athletes assigned elsewhere, and missing eligible roster
records. These messages do not certify event readiness. Scoring permission copy
reflects the implemented Owner/Admin/Scorekeeper rules and Viewer restrictions.
