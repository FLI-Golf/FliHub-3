# Account onboarding and fantasy entry

Status: Core account activity selection, eligible-season discovery, and fan league creation implemented and merged in PR #27. Later sections preserve delivery history.

Repository: FLI-Golf/FliHub-3
Original implementation branch: stage-1-testing (historical).
Current planning branch: feature/multi-event-foundation.
Proposed repository location: docs/README-ACCOUNT-ONBOARDING.md

## Original motivation (historical)

A newly registered fan currently arrives at organization creation. Jim Fake's test account exposed the gap: someone who wants to create a fantasy league should first find the organization and season they want to follow.

This is a separate, phased addition to the existing roadmap. It connects account onboarding, published organization pages, and fantasy participation. Existing organization operations and scoring must continue working throughout.

## Intended experience and implemented core flow

1. Ask what the person wants to do: Play fantasy, Start or manage a sports organization, or Join through an invitation.
2. For fantasy, choose a published organization that has enabled fantasy participation. If registration started from that organization's published page, carry the selection forward.
3. Choose a season that is available for fantasy participation.
4. Create a fantasy league or join one through an invitation. Only show discoverable leagues if that feature is explicitly supported.
5. Arrive at the relevant dashboard, with a clear next action.

Creating a fantasy league makes the creator its commissioner. It must not grant an organization staff role. Activity choices guide navigation; they do not permanently restrict an account. Users may participate in fantasy, keep scores, and manage organizations through the same account.

## Phase O1 — Review permissions and entry points

- Map registration, login, invitation acceptance, published pages, and current organization and fantasy routes.
- Identify which fantasy operations currently depend on organization staff membership.
- Define explicit organization and season eligibility for fan participation. Publication alone must not expose private data or automatically enable fantasy.
- Confirm where onboarding progress and the preferred activity will be stored.
- Record any backend or schema changes before implementation.

Completion criteria: documented route and permission rules, an agreed eligibility policy, and a migration plan where needed.

## Phase O2 — Account welcome and activity selection

- Add a short step-by-step welcome flow for accounts without an existing destination.
- Offer Play fantasy, Start or manage an organization, and Join through an invitation.
- Keep organization creation within the organization-management path.
- Support Back, cancellation, and resuming without creating duplicate records.
- Make Start something new available after onboarding so users can add another activity.

Completion criteria: Jim can choose fantasy without creating an organization; existing organization creation still works.

## Phase O3 — Published organization and season selection

- Add a fantasy entry action to eligible published organization pages.
- Preserve the organization context through registration and login.
- Offer a directory containing only organizations eligible for this entry flow.
- Show only seasons available for fantasy, with dates and clear availability labels.
- Handle no organizations, no eligible seasons, and an organization becoming unavailable during onboarding.
- Revalidate eligibility on the server when the user proceeds.

Completion criteria: direct signup and entry from a published organization both lead to a valid season without exposing unpublished organization data.

## Phase O4 — Fan creation and invitation acceptance

- Let an authenticated regular account create a fantasy league for an eligible season.
- Create the commissioner relationship without creating an organization staff membership.
- Reuse supported fantasy league settings, membership limits, and invitation rules.
- Preserve invitation destinations across signup, verification, and login.
- Validate invitation recipients and permissions on the server.
- Provide clear handling for expired invitations, existing membership, and unavailable leagues.

Completion criteria: Jim can create a league and invite another participant; accepting the invitation grants access only to the intended fantasy league.

## Phase O5 — Dashboards and returning-user navigation

- Give fantasy participants a My fantasy leagues home with their next action.
- Keep scorekeepers focused on their assigned events and groups.
- Keep organization management accessible to Owners and Admins.
- Provide activity switching for accounts with multiple responsibilities.
- Respect valid explicit destinations before applying a default dashboard.
- Provide a clear recovery path if an account has no remaining accessible activity.

Completion criteria: Jim, Morgan, and Bob each reach a useful home, and mixed-role accounts can switch activities.

## Phase O6 — Verification and handoff

Test the following scenarios with separate accounts:

| Scenario                                           | Expected outcome                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| New fan signs up directly                          | Welcome flow leads to eligible organization and season selection |
| Fan starts from a published organization           | Organization context survives authentication                     |
| Jim creates a fantasy league                       | Jim becomes commissioner with no organization staff role         |
| Recipient follows an invitation                    | Authentication returns to the intended invitation                |
| Morgan signs in                                    | Assigned scoring work remains accessible                         |
| Bob signs in                                       | Organization management remains accessible                       |
| Account has several activities                     | User can switch without changing permissions                     |
| Organization is unpublished or fantasy is disabled | New participation is blocked according to the agreed policy      |
| User refreshes or goes Back                        | Flow remains usable without duplicate creation                   |
| User changes a URL or submits a forged ID          | Server rejects unauthorized access                               |

Run npm run check, relevant permission and flow tests, and a production build. Complete a browser walkthrough covering registration, league creation, invitation acceptance, and returning login. Review mobile layouts and keyboard navigation.

Completion criteria: checks pass, the walkthrough succeeds, and documentation describes the implemented behavior and remaining limitations.

## Scope boundaries

This work does not implement payouts, manager commissions, payment processing, sponsorships, reimbursements, or expenses. The season purse remains separate from fantasy onboarding.

Fantasy scoring, draft behavior, and standings continue under their existing roadmap. This addition supplies the fan entry path into those features.

## Decisions to settle in Phase O1

- How organizations enable fantasy participation and mark seasons available.
- Whether joining initially supports invitations only or also explicitly discoverable leagues.
- What happens to existing fantasy leagues if an organization later disables new participation.
- How the default dashboard is chosen for accounts with several activities.

## Original delivery approach (historical)

Implement and review one phase at a time on stage-1-testing. Use separate commits for reviewable milestones and document schema migrations alongside the changes that require them. Do not treat this plan as evidence that a feature already exists.

Current next action: reuse completed onboarding for the organization configuration review in [MULTI-EVENT-ASSESSMENT.md](MULTI-EVENT-ASSESSMENT.md) and [README-MULTI-EVENT-PLATFORM.md](README-MULTI-EVENT-PLATFORM.md). Do not restart O1 or recreate the account welcome flow. The original O1–O6 sections are historical acceptance goals, not a new backlog.

## Phase O2 implementation checkpoint (historical)

The first increment adds /account with activity selection and an Activities navigation link. New accounts land here by default. Existing organization members continue to /organizations, retaining the scorekeeper dashboard when applicable. Explicit login destinations remain honored.

Organization creation remains available through the management choice. Fantasy participants can open their existing leagues and invitations. Published organization and season discovery, new fan league creation, durable activity preferences, and invitation links for unregistered fantasy recipients remain pending. This increment does not change PocketBase rules or require a migration.

Validation: node --test tests/account-welcome.test.mjs, npm run check, and npm run build. In the running application, verify Jim's welcome flow, Bob's organization controls, Morgan's assignments, mobile Activities navigation, and a signed-out invitation link through login.

## Published organization and sports league picker increment

The fantasy account page now lists sports leagues with at least one eligible season. A published /o/[slug] page links to the account flow with its organization slug preserved through login and registration. Users choose a sports league, choose a season, and create a private fantasy league as commissioner without organization staff access.

Eligibility requires a published organization with a slug and the Fantasy capability enabled, an active sports league in that organization, and a planned or active season explicitly opened for fantasy. The new season setting defaults to closed. Owners/Admins enable it from Edit season on Leagues & seasons. League and season names and season dates become discoverable through this opt-in. Existing publication rules for events, teams, athletes, results, and private contact data remain unchanged.

Migration 1794434400_fantasy_season_entry.js adds seasons.fantasyEnabled and the optional fantasy_leagues.season relation. Existing fantasy leagues remain organization-wide with an empty season. Staff can still create legacy organization-wide leagues; regular accounts must select an eligible season. Season-linked drafts reject events from other seasons.

Closing a season or unpublishing an organization blocks new fan league creation and removes discovery listings. Existing fantasy memberships and leagues remain accessible. Fantasy leagues are invitation-only; this change does not publish their membership lists or enable public joining.

Directory results currently cap at 2,000 eligible season candidates. Pagination is required before supporting directories beyond this size.

Validation commands: node --test tests/account-welcome.test.mjs tests/fantasy-discovery.test.mjs, npm run check, npm run build. Hook tests use a simulated PocketBase app; apply the migration and verify the real database flow in Codespaces before merging.

Manual walkthrough: as Bob, enable Fantasy, publish the organization, and open Stage 1 Test Season for fantasy. As Jim, follow Play fantasy from the public page, sign in if needed, select FLI Golf Test League and Stage 1 Test Season, create a named fantasy league, and verify the commissioner lobby. Confirm Jim has no organization membership. Confirm a different-season draft is rejected, and closing fantasy enrollment prevents a new league while leaving the existing league accessible. Recheck Bob's controls and Morgan's assignments.

## Draft room layout increment (historical; later layout below supersedes it)

Rosters appear across the top, with the active participant highlighted. The turn panel below them shows the participant on the clock, remaining seconds, and a recommended eligible athlete. Only the participant whose turn it is receives the recommendation Pick button. All athletes remain visible below, including drafted athletes and their participant labels. Picks so far moves to the bottom, after any pending substitutions.

The board adds recommendedAthlete from the existing server timeout-selection function. Recommendations follow the saved draft rankings, skip drafted athletes, and respect roster gender limits. The saved ranking may use the existing placeholder ordering; this feature does not introduce performance-based recommendations. Normal pick validation remains authoritative for stale or racing submissions. Ready and completed drafts show no on-clock recommendation.

Validation: node --test tests/draft-recommendation.test.mjs, npm run check, npm run build. In Codespaces, restart PocketBase, open an active draft, and verify roster highlighting, countdown, recommendations, manual picks, auto-picks, and refresh persistence across participant sessions.

## Commissioner pause and compact pick history

Pick history uses one horizontal column per participant, retaining round, pick number, team, and auto-pick labels. The region scrolls horizontally on smaller screens and is focusable for keyboard scrolling. Available male athlete cards use light blue; female cards use light pink. Gender labels remain visible so color is not the only indication.

Commissioners can pause an active draft and resume a paused draft. Migration 1794520000_fantasy_draft_pause.js adds the paused status and pausedRemainingMs. The transactional clock endpoint verifies commissioner ownership, checks event activation restrictions, and freezes the remaining milliseconds. Resume continues the same pick using the stored remainder rather than granting a new full timer. An already expired deadline cannot be paused. Invalid or repeated transitions are rejected.

Paused boards preserve the current participant and round while disabling manual picks and recommendations. Timeout ticks cannot create picks in paused state. All participant pages continue polling while paused so they detect resume. Event activation restrictions remain in effect, including on resume.

Validation: node --test tests/fantasy-pause.test.mjs tests/draft-recommendation.test.mjs, npm run check, npm run build. Tests use simulated PocketBase records and clocks. In Codespaces, verify pause/resume across two signed-in participant sessions, wait while paused, refresh, and confirm the remaining time and current pick persist. Check the six-column pick history at desktop and mobile widths. Rollback requires resuming any paused drafts first.
