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
npm run record:walkthrough-1e          # Phase 1E
npm run record:walkthrough-1f          # Phase 1F
npm run record:walkthrough-1g          # Phase 1G (phone viewport)
npm run record:walkthrough-1h          # Phase 1H (official results and corrections)
npm run record:walkthrough-1i          # Phase 1I (public pages and standings; signed-out take)
npm run record:walkthrough-2ab         # Two fantasy draft walkthroughs (setup + live roster rules)
```

The runner (`run-walkthrough.mjs [1a|…|1i|2ab]`):

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
node recordings/narrate.mjs 1b   # ElevenLabs per scene, hash-cached (arg: 1a default | 1b | … | 1i)
node recordings/assemble-narrated.mjs 1b   # scene holds + mux + captions (1a → static/walkthroughs/, 1b–1i → static/review/ preview until approved)
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

## Phase 2A–2B fantasy draft videos

`npm run record:walkthrough-2ab` records two silent videos with readable
scene labels using the verified six-person, 12-team/24-athlete event fixture
from the Phase 2A–2B browser acceptance flow. No production accounts or data
are used. The normal 30-second pick clock gives each scene time to read.
The demo users separately hold organization Viewer seats so the existing
capability page exposes the fantasy invitation Accept controls; those roles
are seeded off-camera and do not grant fantasy approval.

- **League Setup & Draft Prep:** owner creates the league, invites five
  users, each user accepts in the UI, owner approves all five, prepares the
  event draft, and starts it with six approved fantasy participants.
- **Live Draft & Roster Rules:** all 24 picks are made through the actual
  browser UI while switching between the approved on-clock participants.
  Round 3 shows both full-division cases; round 4 shows both missing
  divisions; the final roster has exactly 2 MPO and 2 FPO.

This run uses its own `recordings/output/phase2ab/` directory, preserving
other raw recordings. Review both manifests and frame directories there,
then copy the two `phase2ab-*-walkthrough.webm` files to
`static/walkthroughs/`. The served destinations are
`/walkthroughs/phase2ab-setup` and `/walkthroughs/phase2ab-live`. Both use the
existing asset-existence gate on the overview card. The Watch buttons play
narrated H.264/AAC MP4s with the original on-screen labels and optional
English WebVTT captions. Silent WebM originals remain unchanged.

The approved fixed-window scripts are `narration-2ab-setup.json` and
`narration-2ab-live.json`. They distinguish fantasy participants making picks
from athletes being drafted, and spell division names letter by letter for
speech. Regenerate with:

```sh
node recordings/narrate-2ab.mjs setup
node recordings/narrate-2ab.mjs live
```

This uses the existing git-ignored `.env` / `ELEVENLABS_API_KEY` configuration,
the established Rachel voice, and `eleven_multilingual_v2`. The secret stays
in memory and request errors suppress response bodies. Content-addressed
clips and measured timelines remain under ignored `recordings/output/phase2ab/`.
Each line must fit its original window; assembly fails on overruns rather
than stretching speech or changing footage timing. Shorten an overlong line
and rerun; unchanged clips are reused.

Playback is checked by `node tests/e2e/run-e2e.mjs walkthrough2ab` after a
fresh build, or against an existing Codespace dev server:

```sh
FLIHUB_E2E_APP_URL=http://localhost:5173 node tests/e2e/walkthrough2ab.spec.mjs
```

The browser check follows both Watch links, verifies decoded audible audio
at the beginning and after seeks, loads English captions, seeks forward and
backward, and checks HTTP range responses. No external hosting upload is required.
