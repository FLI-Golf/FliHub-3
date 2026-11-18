# Randomized event groups for local testing

This increment adds a development-only action under Groups on the Events page.
It rebuilds the selected event's unscored setup using all active team entries
from that event's season, two teams per group, with the current active roster
athletes. It does not import or create athletes or teams. The acting Owner/Admin
is assigned as scorekeeper on the new group arrangement.

The action performs a fresh Fisher–Yates shuffle on each request. Pairings may
repeat by chance; this is not a guarantee of unique pairings across a season and
is not the fantasy draft's random order. The guided event wizard's suggested
groups now shuffle as well and remain editable before creation.

## Local-only availability and locks

The button and SvelteKit action are development-only. The PocketBase endpoint
also requires both `FLIHUB_DEMO_FANTASY=1` and `CODESPACE_NAME`, matching the
existing Codespace demo-fantasy controls. Production's existing default of zero
keeps this endpoint disabled, even if called directly. No migration is needed.

The endpoint rechecks membership, Owner/Admin role, capabilities, event/season/
league status and organization ownership inside the save transaction. It refuses
the operation once **any** scorecard (including an empty Draft), score, official
result, fantasy draft or substitution exists for that event. No existing scored
or drafted event may be regrouped through this helper.

All selected season entries must have valid active teams and nonempty active
rosters. Athletes must be active, same-organization and unique across the selected
entries. Reserve pools are excluded. Limits are 128 team entries and 1,024 roster
athletes for this test batch, not new shared model rules.

## What is changed

Prior active team and athlete assignments are archived. Existing group slots are
reused with names Group 1, Group 2, and so on; extra old groups remain archived.
This avoids accumulating a new set of active or archived group slots on every
shuffle. All changes happen together or roll back, including schedule saves.

For a round with a saved tee schedule, its first tee time, timezone and interval
are retained and new slots are generated using the current group IDs. A round
without a saved schedule remains unscheduled. Invalid schedules or overlapping
expanded round starts reject the action before any changes. Review the expanded
schedule afterward: first tee starts do not establish sufficient playing time,
and this helper does not infer round duration or reconfigure event dates.

The success message reports group/team/athlete counts and the male/female pool
counts used by existing fantasy logic. Missing gender data is reported separately;
this action does not guess or change athlete genders. Fantasy's existing pool
and draft checks remain authoritative.

## Clean event walkthrough

1. Use a development branch based on the merged guided-event work.
2. Run `bash scripts/validate-random-test-groups.sh`.
3. Restart local PocketBase with the same `FLIHUB_DEMO_FANTASY=1` flag used for
   demo fantasy participants. Keep its existing data, hooks and migration paths.
4. Events → select **Clean event**, then Groups → **Shuffle and rebuild test
   groups · 2 teams each**. Do not select the scored Coastal Spring 1 event.
5. With the current season roster, expect 6 active groups, 12 teams and 24 athletes.
   Check the reported division counts; 6 fantasy seats need 12 MPO and 12 FPO.
6. Review both round schedules. A successful shuffle can be repeated before any
   scoring or draft begins; after creating the fantasy draft, regrouping is locked.
7. Return to the fantasy league, select Clean event and create its draft.

Unit tests cover pool construction, assignment history, slot reuse, schedule ID
mapping, role/capability/isolation checks, workflow locks and rollback. The
validation script also runs the existing disposable integration suite with demo
helpers disabled and checks the app/build. The actual local action walkthrough
remains required; no production data changes are part of validation.
