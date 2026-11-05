# Phase 1A walkthrough — narration script

**Status: recorded.** Synthesized with ElevenLabs on 2026-11-05 (voice:
Rachel, premade stock; model: eleven_multilingual_v2; 1705 characters across
8 scenes) and assembled into
`static/walkthroughs/phase1a-walkthrough-narrated.mp4` (2:33) with synchronized
`phase1a-walkthrough.vtt` captions. Timings below are the final assembled
timeline (`recordings/output/narrated-timeline.json`).

## ElevenLabs preparation notes

- **Pronunciation:** FliHub is pronounced "Fly Hub". Write it as `Fly Hub`
  in the synthesis input (or configure a pronunciation dictionary entry
  mapping "FliHub" → "Fly Hub") so the TTS engine says it correctly.
- **Voice/style:** a calm, friendly product-demo voice; medium pace (~150
  wpm). Each scene's narration fits its on-screen duration — keep reads
  unhurried.
- **Delivery:** synthesize one clip per scene ID below, then align each clip
  to its scene start offset during assembly. Assembly (muxing audio into the
  silent WebM) is a separate, later step.
- Scene slate banners on screen already carry the scene titles; narration
  should explain goals and visible behavior, not read the slates aloud.

## Scenes

### s1-intro — 0:00 (≈6s)

> This is Fly Hub, a platform for running sports organizations and their
> fantasy competitions. This walkthrough covers the first milestone: accounts,
> organizations, invitations, and roles.

### s2-register-create-org — 0:07 (≈29s)

> Casey Rivera creates an account with an email and password. Fly Hub sends a
> verification email right away. After signing in, Casey has no memberships
> yet — an account alone grants access to nothing. Casey creates the Riverside
> Disc Golf Club and automatically becomes its Owner.

### s3-invite-members — 0:36 (≈7s)

> As Owner, Casey invites Sam Ortiz as a Scorekeeper. Fly Hub creates a
> single-use invitation link that expires in seven days; Casey copies it and
> sends it to Sam directly. Invitation emails themselves are not sent yet.

### s4-accept-scorekeeper — 0:43 (≈8s)

> Sam opens the link, already signed in with a verified email address — the
> invitation only works for the exact recipient. One click, and Sam joins as a
> Scorekeeper. Scorekeepers can see the member list, but cannot manage
> invitations or roles.

### s5-admin-and-viewer — 0:51 (≈14s)

> Alex Chen accepts as Admin. Admins can invite Scorekeepers and Viewers, but
> only the Owner can invite Admins or change roles. Val Kim joins as a Viewer,
> with the same read-only member view.

### s6-org-switching — 1:05 (≈11s)

> Casey also runs the City League. Users can belong to several organizations
> at once, see only the ones they belong to, and switch between them — the
> active organization and Casey's role are always visible in the header.

### s7-transfer-ownership — 1:16 (≈10s)

> Every organization has exactly one Owner. When Casey transfers ownership to
> Alex, the change is atomic: Alex becomes Owner and Casey becomes Admin — the
> organization is never without an Owner.

### s8-progress-overview — 1:26 (≈4s)

> The overview page tracks capability progress honestly: Phase 1A is complete
> and verified, and upcoming phases are shown as planned. That is the whole
> walkthrough — thanks for watching.

## Assembly checklist (completed 2026-11-05)

- [x] Synthesize one clip per scene with ElevenLabs (cached in `recordings/output/narration/`)
- [x] Align clips to scene offsets and mux audio into a new video file (scene holds extend short scenes)
- [x] Publish the narrated cut to `static/walkthroughs/phase1a-walkthrough-narrated.mp4` + captions
- [x] Update the Phase 1A capability card: `narration: 'recorded'`
- [x] Silent original preserved at `static/walkthroughs/phase1a-walkthrough.webm`
