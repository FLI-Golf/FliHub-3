# FliHub — Application Capability Catalog

## Purpose

Inventory reusable application functionality and
establish a foundation for controlled Jev assistance.

This document is a design inventory, not an executable
operation registry and not an authorization mechanism.

## Existing catalog layers

FliHub already contains several distinct concepts:

- Activity and configuration preview catalog.
- Supported organization creation mappings.
- Organization capability configuration.
- Organization-specific presentation profiles.
- Setup checklist definitions.
- User-visible feature progress catalog.

These concepts must remain distinct from the future
intelligence operation catalog.

Existing references:

- src/lib/setup/preview.ts
- src/lib/setup/creation.ts
- src/lib/setup/checklist.ts
- src/lib/organizations/profiles.ts
- src/lib/data/planned-features.ts

## Registered activities

| Activity ID      | Competitor types          | Result methods          |
| ---------------- | ------------------------- | ----------------------- |
| charity-run-walk | Individuals               | Participation           |
| disc-golf        | Individuals, teams, pairs | Strokes                 |
| golf             | Individuals, teams, pairs | Strokes                 |
| baseball         | Teams                     | Matches                 |
| basketball       | Teams                     | Matches                 |
| bowling          | Individuals, teams, pairs | Pins                    |
| running          | Individuals, relays       | Time                    |
| pickleball       | Individuals, pairs        | Matches                 |
| darts            | Individuals, pairs, teams | Matches, points         |
| billiards        | Individuals, pairs, teams | Matches, points         |
| archery          | Individuals, teams        | Points                  |
| dog-show         | Animals                   | Judging, awards         |
| car-show         | Vehicles                  | Judging, voting, awards |
| pageant          | Contestants               | Judging, awards         |
| other            | Configurable              | Configurable            |

These are registered preview choices, not proof
of complete implemented activity workflows.

## Supported organization creation mappings

The inspected creationPlan function supports:

### Disc golf

- Activity: disc-golf
- Format: league
- Competitors: team
- Result: strokes
- Template: league

Existing capability mapping:

- athletes
- teams
- leagues-seasons
- venues-courses
- events
- scoring-results
- standings

### Charity run/walk

- Activity: charity-run-walk
- Format: single
- Competitors: individual
- Result: participation
- Template: race-event
- Profile: charity-run-walk
- Initial capabilities: empty
- Initial distance: 5K

Other configurations remain unsupported by the
inspected organization creation mapping.

Preserve all existing activation restrictions.

## Existing component inventory

| Area                    | Components                                                   |
| ----------------------- | ------------------------------------------------------------ |
| Organization onboarding | SetupWizard, OrganizationSetupChecklist                      |
| Competition setup       | CompetitionsManager, LeagueSeasonSetup                       |
| Event management        | EventsManager, GuidedEventSetup, EventOpsManager             |
| Participants            | AthletesManager, TeamsManager, RostersManager                |
| Scheduling              | TeeTimeScheduler                                             |
| Scoring                 | ScoringManager, ScoreStepper, ScoreCompletionMark            |
| Results                 | StandingsTables                                              |
| Funding                 | SponsorsManager, SponsorshipFunding, SponsorshipQuoteBuilder |
| Expenses                | ExpensesManager                                              |
| Navigation              | OrgNav, NavigationCountBadges                                |
| Fantasy                 | FantasyManager                                               |

Component presence does not establish that its
underlying operations are activity-neutral.

Inspect server actions, domain services, PocketBase
hooks, and authorization before exposing operations.

## Proposed reusable capability families

- Organization configuration.
- Membership and role management.
- Participant identity and entry management.
- Team and pair management.
- Competition structure.
- Venue and competition resource configuration.
- Scheduling.
- Event preparation.
- Score and result entry.
- Result approval and publication.
- Standings and awards.
- Sponsorship and funding.
- Expenses.
- Public presentation.

These are architectural candidates, not newly
implemented capabilities.

## Proposed intelligence capability metadata

Each registered intelligence capability should define:

- Stable identifier.
- Description.
- Supported activity and objective categories.
- Required context.
- Required permissions.
- Organization scope.
- Prerequisites.
- Parameter schema.
- Side-effect classification.
- Approval requirements.
- Execution handler, when implemented.
- Independent verification requirements.
- Supported presentation patterns.

The application determines eligibility.

Jev may recommend only registered eligible capabilities.

## Initial offline recommendation candidates

- review_participant_readiness
- plan_group_assignments
- review_scoring_requirements
- review_event_prerequisites
- request_clarification

These are synthetic recommendation identifiers.

No persistent operations are authorized by this catalog.

## Future activity pilots

Evaluate pickleball as a match-based activity pilot.

Evaluate car shows as a judged-event and non-human
competition-entry pilot.

Golf remains a candidate for validating reuse of
existing stroke-based competition functionality.

Final pilot selection requires further requirements
review and owner approval.

## Activity architecture assessment

Evaluate each activity across:

- Organization configuration.
- Competition format.
- Entry identity.
- Eligibility.
- Venue or resource requirements.
- Scheduling.
- Scoring or judging rules.
- Ranking and tie handling.
- Approval and publication.
- Corrections and audit.
- Public presentation.
- Funding and expenses.

Prefer reusable services where requirements genuinely
overlap. Preserve activity-specific rules where needed.

## Existing safeguards

- Preview catalogs do not grant capabilities.
- Presentation profiles do not grant permissions.
- Organization creation requires a supported mapping.
- Checklist counts do not establish readiness.
- Existing role and organization boundaries remain.
- Unsupported activity choices remain previews.
- Charity activation remains gated.

## Inventory status

Initial activity catalog and component inventory
completed from source inspection.

Server-side operation extraction, capability
registration, authorization mapping, and independent
verification remain outstanding.
