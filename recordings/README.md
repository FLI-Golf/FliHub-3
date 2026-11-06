# Walkthrough recordings

Repeatable screen recordings of implemented capabilities, recorded with
Playwright against a fully disposable stack. Separate from the automated
acceptance tests (`tests/`): these scripts prioritize readable pacing and
clear scene transitions for humans.

## Recording a walkthrough

```sh
npx playwright install chromium        # one-time browser setup (also ships ffmpeg)
npm run record:walkthrough             # Phase 1A (default)
npm run record:walkthrough-1b          # Phase 1B
npm run record:walkthrough-1c          # Phase 1C
npm run record:walkthrough-1d          # Phase 1D
```

The runner (`run-walkthrough.mjs [1a|1b]`):

1. Boots a **disposable** PocketBase (temp dir, committed migrations + hooks),
   a disposable mailpit, and a production preview of the app on dedicated
   ports (8097 / 1127 / 8127 / 5175). Your development services (5173, 8090, 8025) and `pocketbase/pb_data` are never touched.
2. Seeds fictional demo accounts (Phase 1A: Casey, Alex, Sam, Val; Phase 1B:
   Dana, Morgan, Jesse — all `@example.com`) and verifies their emails
   off-camera via mailpit.
3. Records the walkthrough script as a single continuous 1280×720 take with
   scene slates. Persona switches use prepared session cookies; invitation
   and verification tokens are blurred or kept off-camera; passwords are
   always masked by the browser. Every scene synchronizes on visible outcomes
   and logs them with timestamps into the run manifest.
4. Writes the raw video and a per-scene timing manifest to
   `recordings/output/` (git-ignored), and extracts inspection frames.

Cleanup stops only the processes the runner created.

## Demo data / reset

Every recording run starts from an empty disposable database, so demo data
never accumulates. To reset your **development** instance instead, stop
PocketBase, delete `pocketbase/pb_data/`, and restart with
`npm run pocketbase` (migrations re-apply; you will need to create a new
superuser via the installer link it prints).

## Reviewing and publishing the playback assets

1. Record, then inspect the footage before linking it:
   - `recordings/output/run-manifest.json` — scene IDs with real start offsets
   - `recordings/output/frames/` — per-scene screenshots for review
2. After review, copy the playback assets to the served location:

   ```sh
   mkdir -p static/walkthroughs
   cp recordings/output/phase1a-walkthrough.webm static/walkthroughs/
   # after narration (see below):
   cp recordings/output/phase1a-walkthrough-narrated.mp4 static/walkthroughs/
   cp recordings/output/phase1a-walkthrough.vtt static/walkthroughs/
   ```

   **Versioned media exception:** the reviewed assets in `static/walkthroughs/`
   (silent WebM, narrated MP4, WebVTT captions) are intentionally committed so
   the walkthrough plays after a fresh checkout. Raw recordings, frames,
   cached narration clips, and all other intermediates stay untracked in
   `recordings/output/` (git-ignored). `*.webm` is ignored globally except for
   the reviewed asset in `static/walkthroughs/`.

3. The walkthrough page at `/walkthroughs/phase1a` streams the narrated video
   with captions and offers downloads (narrated MP4 primary, silent WebM
   preserved). When no asset exists, the page and the home-page card show
   "Walkthrough coming soon" instead of a broken link.

## Scenes and narration

- Scene manifest: `recordings/scenes.json` (IDs, titles, personas, rough
  durations). Real per-run offsets land in `recordings/output/run-manifest.json`.
- Narration script (human-readable): `recordings/narration-phase1a.md`;
  machine-readable twin used for synthesis: `recordings/narration.json`
  (TTS input spells "FliHub" as "Fly Hub" for pronunciation; captions keep
  the correct spelling).

## Narration (ElevenLabs)

The narrated cut was generated 2026-11-05 with:

- **Voice:** Rachel (premade stock voice, id `21m00Tcm4TlvDq8ikWAM`). The
  API key is TTS-only: voice listing and the subscription endpoint are not
  permitted, so the stock fallback was used automatically. No voice cloning.
- **Model:** `eleven_multilingual_v2`, output `mp3_44100_128`.
- **Usage:** 1705 characters sent across 8 scenes (the key cannot read
  subscription counters; the billed count equals the submitted characters).
- Clips are cached in `recordings/output/narration/` with a content hash —
  reruns skip unchanged scenes and do not spend credits.

Regenerate or assemble:

```sh
sudo apt-get install -y ffmpeg   # full FFmpeg (H.264/AAC); one-time
node recordings/narrate.mjs 1b   # ElevenLabs per scene, hash-cached (arg: 1a default | 1b | 1c | 1d)
node recordings/assemble-narrated.mjs 1b   # scene holds + mux + captions (1a → static/walkthroughs/, 1b/1c/1d → static/review/ preview until approved)
```

`assemble-narrated.mjs` holds each scene's final frame when its narration
runs longer than the recorded scene (speech is never time-stretched), then
writes:

- `static/walkthroughs/phase1a-walkthrough-narrated.mp4` — H.264 + AAC,
  1280×720, 2:33, ~3.4 MB (primary playback asset)
- `static/walkthroughs/phase1a-walkthrough.vtt` — captions synchronized to
  the assembled timeline
- `recordings/output/narrated-timeline.json` — actual per-scene timeline

The silent original stays at `static/walkthroughs/phase1a-walkthrough.webm`
(5.8 MB) as a downloadable alternative.
