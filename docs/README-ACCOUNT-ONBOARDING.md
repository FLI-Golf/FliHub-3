# Account onboarding and fantasy entry

Status: Planned — implementation has not started.

Repository: FLI-Golf/FliHub-3
Working branch: stage-1-testing
Proposed repository location: docs/README-ACCOUNT-ONBOARDING.md

## Why this work is needed

A newly registered fan currently arrives at organization creation. Jim Fake's test account exposed the gap: someone who wants to create a fantasy league should first find the organization and season they want to follow.

This is a separate, phased addition to the existing roadmap. It connects account onboarding, published organization pages, and fantasy participation. Existing organization operations and scoring must continue working throughout.

## Intended experience

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

| Scenario | Expected outcome |
| --- | --- |
| New fan signs up directly | Welcome flow leads to eligible organization and season selection |
| Fan starts from a published organization | Organization context survives authentication |
| Jim creates a fantasy league | Jim becomes commissioner with no organization staff role |
| Recipient follows an invitation | Authentication returns to the intended invitation |
| Morgan signs in | Assigned scoring work remains accessible |
| Bob signs in | Organization management remains accessible |
| Account has several activities | User can switch without changing permissions |
| Organization is unpublished or fantasy is disabled | New participation is blocked according to the agreed policy |
| User refreshes or goes Back | Flow remains usable without duplicate creation |
| User changes a URL or submits a forged ID | Server rejects unauthorized access |

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

## Delivery approach

Implement and review one phase at a time on stage-1-testing. Use separate commits for reviewable milestones and document schema migrations alongside the changes that require them. Do not treat this plan as evidence that a feature already exists.

Next action: begin Phase O1 with the current authentication, published-page, and fantasy permission code.
