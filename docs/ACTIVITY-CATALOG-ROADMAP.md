# FliHub — Activity Catalog and Competition Configuration Roadmap

Date: November 26, 2026.

Status: Requirements captured. Architecture and implementation deferred.

Proposed branch: `feature/activity-catalog`.

## Objective

Establish a comprehensive and extensible activity
configuration catalog supporting different sports,
competitions and non-sport event formats.

Distinguish activity identity from competition format,
competitor type, scoring method and implemented capabilities.

Avoid treating disc golf or charity run/walk as
universal templates for every activity.

## Owner observations

The owner identified potential catalog gaps:

- Soccer is missing from activity selection.
- Bowling may not expose appropriate team competition choices.

These observations require inspection of the current
catalog and compatibility rules before implementation.

They are not independently verified defects at
this documentation checkpoint.

## AC-1 — Existing catalog discovery

Inspect:

- Registered activity identifiers.
- Activity selection and setup preview.
- Competitor and participant terminology.
- Competition format choices.
- Scoring and result method choices.
- Capability compatibility rules.
- Existing operational activity implementations.
- Unsupported activity activation restrictions.
- Guided organization and event creation contracts.

Identify missing activities, incomplete configurations,
incorrect combinations and unsupported assumptions.

Preserve existing activity identifiers and
compatibility unless an approved migration is required.

## AC-2 — Activity and competition taxonomy

Separate relevant configuration dimensions.

Candidate dimensions include:

- Activity or sport.
- Individual, pair, team or other entry type.
- Competition format.
- League and season structure.
- Event and match structure.
- Divisions and classifications.
- Scoring and result method.
- Standings and ranking method.
- Venue and playing-area requirements.
- Roster and substitution requirements.
- Scheduling and grouping requirements.

Not every dimension applies to every activity.

FliHub determines compatible combinations and
which questions are relevant to the selected activity.

## Candidate activity configurations

| Activity   | Competitor configurations          | Candidate result methods |
| ---------- | ---------------------------------- | ------------------------ |
| Disc golf  | Individual, pairs, teams           | Strokes, match play      |
| Golf       | Individual, pairs, teams           | Strokes, match play      |
| Bowling    | Individual, doubles, teams         | Pinfall, match results   |
| Soccer     | Teams                              | Goals, match results     |
| Basketball | Teams                              | Points, match results    |
| Baseball   | Teams                              | Runs, match results      |
| Volleyball | Teams                              | Points, sets, matches    |
| Tennis     | Singles, doubles, team competition | Games, sets, matches     |
| Pickleball | Singles, doubles, team competition | Points, games, matches   |
| Running    | Individual, teams, relay           | Time, placement          |
| Cycling    | Individual, teams                  | Time, placement          |
| Swimming   | Individual, relay                  | Time, placement          |
| Car shows  | Entries, classes                   | Judging, points          |
| Pageants   | Contestants, divisions             | Judging, placement       |

These are illustrative planning examples, not an
exhaustive catalog or claims of implemented support.

Actual rules, competition variants and valid combinations
require activity-specific requirements review.

## AC-3 — Capability and support classification

Distinguish proposed support states:

- Cataloged: activity identity is registered.
- Configuration supported: permitted combinations are defined.
- Implementation in development: operational work is underway.
- Operational: applicable functionality has been implemented,
  independently verified and approved for use.

Determine exact status contracts during architecture review.

Support may vary by configuration within one activity.

A cataloged activity is not automatically operational.

Do not activate unsupported configurations simply
because they appear in the selection catalog.

## AC-4 — Deterministic compatibility

Define registered compatibility rules for activity,
competitor type, competition format and result method.

Prevent incompatible selections.

When an earlier answer changes, invalidate incompatible
dependent answers and stale reviews.

Distinguish activity-wide capabilities from
configuration-specific capabilities.

Keep server-side validation authoritative.

Preserve existing guided creation and transaction boundaries.

## AC-5 — Guided activity configuration

Present relevant questions progressively.

Illustrative bowling configuration:

1. Select bowling.
2. Select individual, doubles or team participation
   from supported choices.
3. Select the eligible competition format.
4. Select compatible scoring and standings methods.
5. Configure relevant roster and scheduling requirements.
6. Review and confirm.

Do not expose unsupported choices as operational.

Use existing structured workflows and registered
presentation patterns.

## AC-6 — Optional embedded Jev assistance

Potential intelligence assistance includes:

- Explaining activity configuration choices.
- Asking relevant contextual follow-up questions.
- Recommending eligible competition formats.
- Explaining individual versus team participation.
- Identifying missing configuration requirements.
- Explaining scoring and standings implications.
- Recommending an appropriate existing workflow.

FliHub constructs the registered objective and
approved activity context.

Jev receives eligible choices rather than unrestricted
authority to invent competition configurations.

Provider recommendations cannot activate unsupported
activities, bypass compatibility or alter business rules.

FliHub owns question relevance, mandatory prerequisites,
valid answers and workflow progression.

Preserve deterministic and manual configuration
when intelligence is disabled or unavailable.

See [Embedded Intelligence Workflow Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md).

## AC-7 — Activity implementation pilots

Preserve the existing multi-activity development strategy.

Candidate pilot evaluation should consider:

- Match-based competition.
- Stroke or pinfall-based competition.
- Judged events.
- Timed events.
- Individual and team participation.
- Non-human competition entries.

Select pilots only after inspecting existing capabilities
and obtaining owner approval.

Do not replace the existing pilot strategy or
prematurely select soccer or bowling as the next
operational activity solely because catalog gaps were identified.

Catalog improvements and operational scoring engines
may require separate implementation checkpoints.

## AC-8 — Acceptance and closeout

Future acceptance must verify:

- Catalog completeness for the approved scope.
- Valid activity and configuration identifiers.
- Correct compatibility rules.
- Rejection of unsupported combinations.
- Unsupported activity activation restrictions.
- Existing organization and event setup compatibility.
- Server-side authorization and validation.
- Activity-appropriate scoring and standings.
- Manual configuration without intelligence.
- Validated recommendations, if intelligence is enabled.
- Relevant legacy application regression.
- GitHub CI and review evidence.

## Deferred decisions

The following remain unresolved:

- Complete current catalog inventory.
- Verified soccer and bowling configuration gaps.
- Final activity taxonomy.
- Capability status representation.
- Required schema changes, if any.
- Initial implementation scope.
- Activity pilot selection.
- Sport-specific operational requirements.
- Embedded intelligence decision contracts.

No catalog changes, capability activation, database
migration or provider request is authorized by this document.

Review this initiative after JAI-5H alongside the
[Platform Development Roadmap](PLATFORM-DEVELOPMENT-ROADMAP.md).
