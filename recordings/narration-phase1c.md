# Phase 1C narration — Athlete identity

Recording: `npm run record:walkthrough-1c` (disposable stack; fictional data).
Synthesis input is `recordings/narration-1c.json` (TTS spells "FliHub" as
"Fly Hub"; captions keep the correct spelling).

## s1-owner-create — Owner creates an athlete (Sam)

Sam, the club Owner, opens Athletes and adds Jordan Avery. Next to the
public identity — name, gender, nationality — Owners and Admins can record
private contact and eligibility details: an email address, a phone number,
and notes. They are labeled private, and FliHub enforces that on the server,
not just in the interface.

## s2-viewer-readonly — Viewer boundary (Val)

Val is a Viewer in the same organization. She sees Jordan's identity —
name, nationality, status — but no email, no phone, no eligibility notes,
and no editing controls. Those fields are not hidden in the page; they are
never sent to her browser at all.

## s3-archive-restore — Archive, then restore (Sam)

Back as the Owner: archiving keeps the record and marks it inactive — there
is no permanent delete in this phase. Restoring brings the same record back,
details intact.

## s4-csv-import — Bulk entry (Sam)

And for whole rosters, the CSV import adds athletes in bulk — one per row —
instead of one form at a time.
