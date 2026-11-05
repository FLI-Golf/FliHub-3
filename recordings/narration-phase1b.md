# Phase 1B walkthrough — narration script (draft for ElevenLabs)

**Status: scripted, not recorded.** Do not synthesize — no ElevenLabs API
calls or credits are authorized yet. Timings come from the recorded silent
footage (`recordings/output/run-manifest-1b.json`, 2 minutes 11 seconds total).
Recording: `recordings/output/phase1b-walkthrough.webm` (git-ignored raw
asset; not published).

## ElevenLabs preparation notes

- **Pronunciation:** FliHub is pronounced "Fly Hub" — write `Fly Hub` in the
  synthesis input (same convention as the Phase 1A narration).
- **Voice/style:** match the Phase 1A walkthrough voice for series
  consistency (stock premade voice was used there; see recordings/README.md).
- **Scope honesty:** the script must not imply that capability workflows
  (athletes, events, scoring, fantasy) exist — they are labeled Planned on
  screen. "Preserved" claims are limited to organization configuration.
- Scene slate banners carry the scene titles; narration explains goals and
  visible behavior, not the slates.

## Scenes

### s1-intro — 0:00 (≈12.0s)

> This is Fly Hub. The first milestone added accounts, organizations,
> invitations, and roles. This walkthrough covers configurable onboarding:
> starter templates and capability settings.

### s2-league-onboarding — 0:12 (≈21.6s)

> Dana creates the Riverside Disc Golf League with the League template. The
> template suggests capabilities, and every suggestion is editable. Turning
> off Events also turns off what depends on it — scoring and standings — and
> the summary shows the choices before the organization is created.

### s3-honest-planned — 0:34 (≈15.299999999999997s)

> Enabled capabilities appear in the navigation, clearly labeled Planned —
> the Athletes page explains what is coming instead of pretending it works.
> A capability that is not enabled explains that, too.

### s4-race-onboarding — 0:49 (≈15.400000000000006s)

> The City 10K Series uses the Race/Event template, which suggests marathon
> and half-marathon distances with explicit units. Dana adds a custom
> five-mile charity distance. In settings, the saved distances stay editable.

### s5-custom-onboarding — 1:04 (≈8.299999999999997s)

> The Custom template assumes nothing — the Community Club enables only
> Athletes, chosen deliberately.

### s6-admin-configures — 1:13 (≈17.799999999999997s)

> Owners are not the only ones who can configure. Morgan is an Admin, and
> Admins can change capabilities too. Choosing Fantasy automatically selects
> the capabilities it depends on, and the change is recorded in the audit
> trail.

### s7-disable-reenable — 1:31 (≈14s)

> Disabling a capability removes it from navigation without deleting anything
> — re-enabling brings it back exactly as it was, and the race distances
> configured earlier are still intact.

### s8-viewer-boundary — 1:45 (≈12s)

> Capabilities never grant permissions. Jesse is a Viewer: no Settings link,
> and the settings page stays read-only. Only Owners and Admins can configure.

### s9-outro — 1:57 (≈14s)

> Three organizations, three templates, all adjustable later — with honest
> labels for what is planned and what is upcoming. That is Phase 1B.

## Assembly checklist (later, not authorized)

- [ ] Synthesize one clip per scene with ElevenLabs after owner review
- [ ] Assemble with `recordings/assemble-narrated.mjs` (scene holds, captions)
- [ ] Publish to `static/walkthroughs/` and update the Phase 1B card
- [ ] Keep the silent original downloadable
