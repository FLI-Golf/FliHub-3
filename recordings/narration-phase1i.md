# Phase 1I narration — public pages & competition standings

Recording: `npm run record:walkthrough-1i` (disposable stack; fictional data; desktop viewport). Synthesis input is `recordings/narration-1i.json` (TTS spells "FliHub" as "Fly Hub" and spells numerals out; captions keep the correct spelling). The whole take is the SIGNED-OUT visitor's view of the hosted public page — owner-side corrections happen off-camera so the video shows exactly what the public sees.

Status: review preview — not published; assembled under `static/review/` for approval only.

## s1-public-page — A signed-out visitor opens the hosted public page

Signed out, a visitor opens the organization's hosted public page. Branding, the published schedule, official results, and competition standings all come from explicitly published data — private fields and pending work are never exposed.

## s2-unranked — Solo A is Unranked at 1 of 2 events

Standings rank a team only when it has a result in every counted event. Solo B played 2 of 2 events and leads at 24 strokes. Solo A has 12 strokes from 1 of 2 events, so it shows Unranked — missing results never add strokes.

## s3-pending-correction — Standings hold steady while the correction awaits publication

Solo A's missing second result is corrected and reapproved behind the scenes — but until it is republished, the public standings hold steady. Pending versions are invisible to visitors.

## s4-shared-first — The corrected result publishes; both teams share first place

The moment the corrected result is published, Solo A's second event counts: both teams now stand at 24 strokes across 2 of 2 events and share first place — and the result carries a dated Corrected badge.
