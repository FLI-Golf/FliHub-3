# Phase 1I standings & public pages walkthrough

This review package was prepared from the merged baseline at PR #22 (`d9faa3a` on `origin/main`). The media was approved and is now published: the narrated MP4 and captions are committed under `static/walkthroughs/` and served at `/walkthroughs/phase1i` (the Watch walkthrough link on the Competition standings and Branded public pages cards).

## Published files

- `static/walkthroughs/phase1i-walkthrough-narrated.mp4` (byte-identical to the approved preview `phase1i-walkthrough-narrated-preview.mp4`, sha256 `959ec8c979adfebaee2f2120013a05d730f6295da9dfca37adf9de2cc1956300`)
- `static/walkthroughs/phase1i-walkthrough.vtt` (the approved preview captions, sha256 `512b8261530345cea2ca0c130c85e3e1eb11db79c83d29f48c14d20b796601e3`)
- `static/walkthroughs/phase1i-walkthrough.webm` (approved silent original, sha256 `ecfdabf28224ce1cff8a263de4a5de8fd272602a3d2de9ae94d7b4ad6a3a66ac`)

## Duration

- Silent original: 71.44s (`recordings/output/run-manifest-1i.json`)
- Final narrated preview: 1:11.75 (`ffmpeg` probe of the assembled MP4)
- Scene hold adjustments: two short end-frame holds (1.9s and 0.3s) keep each narration line inside its scene; speech is never time-stretched

## Scene timestamps (narrated cut)

1. `s1-public-page` — 0:00.0–0:19.3 — a signed-out visitor opens the hosted public page: branding, published schedule, official results, and standings from explicitly published data only
2. `s2-unranked` — 0:19.3–0:41.3 — Solo A: Unranked, 1 of 2 events, 12 strokes; Solo B: rank 1, 2 of 2 events, 24 strokes (D17 completeness ranking)
3. `s3-pending-correction` — 0:41.3–0:55.6 — the corrected second result is reapproved off-camera; the public standings hold steady while it awaits publication
4. `s4-shared-first` — 0:55.6–1:11.8 — the corrected result publishes: both teams at 24 strokes across 2 of 2 events share first place, with a dated Corrected badge

## Verification status

- The entire take is the SIGNED-OUT visitor context; owner-side corrections ran off-camera via the API so the video shows exactly what the public sees
- Playwright assertions confirmed every scene state before the take advanced: signed-out header, branding and tagline, both published results, `Solo A — Unranked — 1 of 2 — 12`, `Solo B — 1 — 2 of 2 — 24`, standings unchanged with no Corrected badge while v2 was pending, then both rows at rank 1 / 24 / 2 of 2 with the dated Corrected badge
- Captions match the narration script verbatim and every cue falls inside its assembled scene segment (`recordings/output/narrated-timeline-1i.json`)
- The published `static/walkthroughs/` files were verified byte-for-byte (`cmp`) against the approved preview output before committing
- Fictional demo data throughout (Riverbend Disc Golf Club, Solo A/Solo B, example.com accounts) on a fully disposable stack
