# FliHub — Platform Development Roadmap

Date: November 26, 2026.

Status: Owner-directed development planning.

## Purpose

Maintain a central inventory of FliHub development tracks,
future capabilities, dependencies and architectural priorities.

This roadmap coordinates existing development roadmaps.
It does not replace their requirements or authorize
implementation, activation, spending, merge or deployment.

## Platform vision

FliHub is a configurable platform for organizations,
sports, competitions, events, fundraising, sponsorships
and related operational workflows.

The platform should support different activity types
through reusable capabilities rather than treating
one sport as the universal application model.

Preserve existing working functionality while expanding
the platform incrementally.

## Governing intelligence principles

**Jev supplies intelligence. FliHub retains control.**

**FliHub guides the process. Jev helps improve the decisions.**

Structured workflows remain the primary interaction model.

Optional contextual intelligence should improve decisions,
explanations, preparation and recommendations without
replacing deterministic business rules.

See [Embedded Intelligence Workflow Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md).

## Development tracks

| Track                    | Current direction                                       |
| ------------------------ | ------------------------------------------------------- |
| Application intelligence | Continue JAI-5D through JAI-5H                          |
| Engineering intelligence | Preserve outstanding AI-1F qualification gates          |
| Branding and media       | Requirements captured; implementation deferred          |
| Activity catalog         | Requirements captured; implementation deferred          |
| Charity events           | Preserve CE-3D and subsequent deferred requirements     |
| Sponsorships and funding | Preserve existing functionality and roadmap             |
| Competition and scoring  | Expand through approved activity implementations        |
| Fantasy competitions     | Preserve existing functionality and future requirements |
| Production readiness     | Complete applicable security and acceptance gates       |

These descriptions are planning summaries, not independent
verification of every development track.

Individual roadmaps remain authoritative for detailed
implementation and acceptance status.

## Current development priority

Continue application intelligence on
`feature/application-intelligence`.

Complete:

- JAI-5D: Reusable exact operation review.
- JAI-5E: Protected synthetic execution.
- JAI-5F: Results, history, audit and visual polish.
- JAI-5G: Integrated browser and security acceptance.
- JAI-5H: Protected workspace closeout.

Do not interrupt this work to implement branding
or expand activity configurations.

The current protected workspace remains offline,
synthetic-only and development-restricted.

## Platform branding initiative

Establish a reusable branding and media capability
for appropriate FliHub entities.

Distinguish brand identity, media assets, inheritance,
sponsor placements and public presentation.

Support contextual intelligence assistance where useful,
while retaining deterministic configuration and permissions.

See [Branding Roadmap](BRANDING-ROADMAP.md).

Proposed implementation branch:

`feature/branding-foundation`

Branch creation and implementation remain deferred.

## Activity catalog initiative

Expand and validate the activity catalog, competition
formats, competitor types, scoring methods and
capability compatibility rules.

Owner observations include:

- Soccer is missing from the activity selection.
- Bowling may lack appropriate team competition choices.

These observations require source inspection before
implementation. They are not yet verified catalog defects.

See [Activity Catalog Roadmap](ACTIVITY-CATALOG-ROADMAP.md).

Proposed implementation branch:

`feature/activity-catalog`

Branch creation and implementation remain deferred.

## Shared platform dependencies

Future capabilities should reuse appropriate foundations:

- Organization and tenant authorization.
- Registered activity and capability definitions.
- Deterministic configuration compatibility.
- Structured guided workflows.
- Optional contextual intelligence.
- Validated recommendations and manual fallback.
- Appropriate exact review and confirmation.
- Transactional domain operations.
- Independent verification and audit.
- Accessible registered presentation components.

Reuse must respect the actual requirements of each domain.

The existing synthetic operation engine is not a
persistent application execution engine.

## Future development priority review

After JAI-5H, review:

1. Branding architecture and media requirements.
2. Activity catalog completeness and compatibility.
3. Candidate embedded intelligence pilots.
4. Existing activity implementation dependencies.
5. Outstanding charity and engineering gates.
6. Production readiness and security requirements.

Select the next implementation track using actual
requirements, source inspection and owner approval.

Do not permanently establish the relative implementation
order of branding and activity expansion at this checkpoint.

An embedded intelligence pilot may require its underlying
domain capability to be implemented and accepted first.

## Development discipline

Capture newly identified requirements without
automatically interrupting active implementation.

Use dedicated feature branches for substantial initiatives.

Before implementation:

- Inspect existing source and data contracts.
- Identify reusable functionality.
- Document requirements and unresolved decisions.
- Establish implementation and acceptance checkpoints.
- Obtain applicable authorization.

Do not represent catalog entries, planned features
or architectural proposals as operational functionality.

## Existing roadmap references

- [Application Intelligence](APPLICATION-INTELLIGENCE-ROADMAP.md)
- [Protected Intelligence Workspace](APPLICATION-INTELLIGENCE-WORKSPACE.md)
- [Embedded Intelligence Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md)
- [Intelligence Roadmap](INTELLIGENCE-ROADMAP.md)
- [Intelligence Architecture](INTELLIGENCE-ARCHITECTURE.md)
- [Charity Events](CHARITY-EVENT-ROADMAP.md)
- [Funding](FUNDING-ROADMAP.md)
- [Application Capability Catalog](APPLICATION-CAPABILITY-CATALOG.md)
- [Design Patterns](FLIHUB-DESIGN-PATTERNS.md)
- [Branding](BRANDING-ROADMAP.md)
- [Activity Catalog](ACTIVITY-CATALOG-ROADMAP.md)

## Preserved boundaries

No existing acceptance requirements are waived.

AI-1F, AI-2, CE-3D and subsequent charity requirements
remain governed by their existing roadmaps.

No new provider disclosure, paid requests, persistent
operations, engineering dispatch, merge or deployment
are authorized by this planning document.
