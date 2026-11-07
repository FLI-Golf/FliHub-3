# Phase 1H official results & corrections walkthrough

This review package was prepared from the merged baseline at PR #20 (`8467e02` on `origin/main`). The media was approved and is now published: the narrated MP4 and captions are committed under `static/walkthroughs/` and served at `/walkthroughs/phase1h` (the Watch walkthrough link on the Official results & corrections card).

## Published files

- `static/walkthroughs/phase1h-walkthrough-narrated.mp4` (byte-identical to the approved preview `phase1h-walkthrough-narrated-preview.mp4`, sha256 `638853df89e9fae26e2bd8b2006c9b0b781df67ce5a8d4dc66898a308aab7081`)
- `static/walkthroughs/phase1h-walkthrough.vtt` (the approved preview captions, sha256 `31c2df7c6fb86f22f53863adea44ee867fb53fe1647fc78822b778cc1ae575a6`)
- `static/walkthroughs/phase1h-walkthrough.webm` (approved silent original)

## Duration

- Silent original: 47.72s (`recordings/output/run-manifest-1h.json`)
- Final narrated preview: 56.40s (`ffprobe` on the assembled MP4)
- Scene hold adjustments: the narration is timed to keep each scene readable while preserving the on-screen state transitions

## Scene timestamps

1. `s1-approve-publish` — 0:00–0:11.67 — Owner approves and publishes v1; Viewer sees official v1 at 108
2. `s2-reopen-correct` — 0:11.67–0:29.12 — Owner reopens with a recorded reason, corrects 3→5, approves v2 at 110
3. `s3-viewer-mid-correction` — 0:29.12–0:43.64 — Viewer still sees official v1 at 108 while v2 waits to publish
4. `s4-publish-v2` — 0:43.64–0:56.40 — Owner publishes v2; Viewer sees v2 official at 110 while v1 remains in version history

## Verification status

- Playwright assertions confirmed each scene’s exact labels before advancing
- Viewer state assertions verified `v1 = 108 official`, `v2 = 110 awaiting publication`, and final `v2 = 110 official`
- Correction reason and version history were validated in the result workflow
- Captions were generated and synchronized to the final assembled timeline
- The published `static/walkthroughs/` files were verified byte-for-byte against the approved preview output before committing
