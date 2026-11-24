# FliHub Charity Event Organization Roadmap

## 1. Project Overview

- Status: Active development
- Branch: feature/charity-event-organizations
- Baseline: a148564
- Started: November 23, 2026
- Related roadmap: FUNDING-ROADMAP.md
- Related draft PR: #52 - Funding Phase 2A

## 2. Objective

Expand FliHub beyond disc golf organizations by supporting
charity runs, charity walks, and other participation-based
fundraising events.

This initiative must demonstrate that FliHub is a configurable
sports and event management platform rather than a system
limited to a single sport.

## 3. Architectural Principles

- Maintain one shared FliHub application.
- Reuse existing organization and membership infrastructure.
- Preserve the capability-based architecture.
- Avoid duplicating existing functionality unnecessarily.
- Separate organization templates from individual capabilities.
- Use organization-appropriate terminology.
- Keep disc golf workflows fully functional.
- Enforce organization isolation and role-based permissions.
- Do not expose unfinished capabilities as available.
- Keep financial commitments separate from received cash.
- Preserve existing development and production data.
- Document architectural decisions before implementation.

## 4. Initial Capability Matrix

This matrix describes the target charity profile, not immediate
capability activation. Each workflow must be verified before use.

| Capability                  | Disc golf         | Initial charity scope                  |
| --------------------------- | ----------------- | -------------------------------------- |
| Organization and membership | Required          | Required                               |
| Athletes / participants     | Supported         | Reuse as Participants                  |
| Teams                       | Supported         | Optional, separate relationship review |
| Leagues and seasons         | Supported         | Disabled                               |
| Golf courses and holes      | Supported         | Disabled                               |
| Events                      | Supported         | Reuse standalone events                |
| Routes and distances        | Future evaluation | Planned                                |
| Competitive scoring         | Supported         | Disabled                               |
| Standings                   | Supported         | Disabled                               |
| Fantasy leagues             | Supported         | Disabled                               |
| Sponsorships                | Supported         | Verify in CE-5                         |
| Reimbursements and expenses | Supported         | Verify in CE-5                         |
| Participant registration    | Future evaluation | Planned in CE-4                        |
| Donations and pledges       | Deferred          | Deferred to CE-6                       |
| Fundraising goals           | Deferred          | Deferred to CE-6                       |

## 5. Development Phases

### Phase CE-1: Architecture and Requirements

Status: Complete

- [x] Audit existing organization templates.
- [x] Review the race-event template.
- [x] Review guided organization setup.
- [x] Review capability dependencies.
- [x] Identify disc golf-specific assumptions.
- [x] Review organization navigation and terminology.
- [x] Review existing participant and event data models.
- [x] Determine which existing collections can be reused.
- [x] Review local database compatibility.
- [x] Document architecture decisions.

Acceptance criteria:

- Existing functionality and limitations are documented.
- Proposed organization capabilities are defined.
- Required schema and interface changes are identified.
- No unnecessary duplicate infrastructure is introduced.

### Phase CE-2: Organization Onboarding

Status: Next

- [ ] Define and persist a distinct charity run/walk organization profile.
- [ ] Reuse the existing race-event organization template.
- [ ] Extend the existing guided organization creation workflow.
- [ ] Add a noncompetitive participation result method.
- [ ] Keep frontend and PocketBase creation mappings consistent.
- [ ] Configure verified default capabilities.
- [ ] Introduce organization-specific terminology.
- [ ] Configure organization navigation.
- [ ] Reject unsupported and forged configurations.
- [ ] Verify owner and administrator permissions.
- [ ] Verify profile persistence after refresh.
- [ ] Create the charity demo organization.
- [ ] Verify existing disc golf onboarding.

Supported charity creation configuration:

```json
{
	"version": 1,
	"activity": "charity-run-walk",
	"format": "single",
	"competitors": "individual",
	"result": "participation"
}
```

Acceptance criteria:

- A verified user can create a charity run/walk organization.
- Organization creation remains transactional.
- Owner membership and audit history are created automatically.
- The charity profile persists after refresh and sign-in.
- Navigation and terminology reflect the organization profile.
- Only verified capabilities are enabled.
- Golf-specific workflows are not imposed.
- Unsupported configurations are rejected by the backend.
- Existing disc golf creation remains unchanged.
- Integration and end-to-end tests cover both configurations.

### Phase CE-3: Participant Management

Status: Planned

- [ ] Adapt the existing athlete model for participant management.
- [ ] Support runners and walkers.
- [ ] Support individual participants.
- [ ] Support optional participant teams.
- [ ] Define participant registration requirements for CE-4.
- [ ] Define registration status and event eligibility.
- [ ] Support appropriate participant import workflows.
- [ ] Verify participant data isolation.

Acceptance criteria:

- Participants can be managed independently of leagues.
- Individual participants can be managed without teams or seasons.
- Optional participant team requirements are documented.
- Event registration implementation is coordinated with CE-4.
- Existing athlete and roster workflows remain functional.

### Phase CE-4: Charity Event Management

Status: Planned

- [ ] Define charity event creation workflows.
- [ ] Support standalone events.
- [ ] Support event dates and schedules.
- [ ] Support event locations and routes.
- [ ] Support configurable event distances.
- [ ] Support running and walking participation.
- [ ] Implement event-specific registration records.
- [ ] Support participant check-in and registration status.
- [ ] Evaluate optional event-specific team relationships.
- [ ] Evaluate optional timing and results.
- [ ] Define event lifecycle and completion workflows.

Acceptance criteria:

- An organization can create and manage a charity event.
- An event does not require a disc golf course.
- An event does not require a league or season.
- Participants can be associated with the event.
- Existing disc golf event workflows remain functional.

### Phase CE-5: Sponsorships and Operational Expenses

Status: Planned

- [ ] Verify existing sponsorship functionality.
- [ ] Evaluate charity-specific sponsorship packages.
- [ ] Verify sponsor agreements and payments.
- [ ] Verify reimbursements and expenses.
- [ ] Verify organization-specific financial reporting.
- [ ] Identify necessary adaptations.

Acceptance criteria:

- Existing financial capabilities work for charity organizations.
- Sponsorship revenue remains distinct from donations.
- Existing sponsorship functionality is not duplicated.

### Phase CE-6: Resume Funding Phase 2A

Status: Deferred

Dependency: Functional charity organization and event workflows.

Related draft PR: #52.

- [ ] Review and update the funding branch against main.
- [ ] Verify authenticated PocketBase request hooks.
- [ ] Verify cross-organization access restrictions.
- [ ] Implement TypeScript funding models.
- [ ] Implement funding summary calculations.
- [ ] Implement Donations and Pledges management.
- [ ] Support direct donations.
- [ ] Support pledged commitments.
- [ ] Support partial pledge payments.
- [ ] Support fundraising goals.
- [ ] Evaluate participant and team fundraising attribution.
- [ ] Verify financial reporting and audit requirements.
- [ ] Activate the capability after verification.

Acceptance criteria:

- Donations and pledges are independently tracked.
- Pledge payments cannot exceed pledged commitments.
- Received cash is not confused with outstanding commitments.
- Fundraising progress accurately reflects received funds.
- Existing sponsorship accounting remains unaffected.

### Phase CE-7: End-to-End Verification

Status: Planned

- [ ] Complete the charity organization demo.
- [ ] Verify organization onboarding.
- [ ] Verify participant registration.
- [ ] Verify event creation and management.
- [ ] Verify sponsorship and expense workflows.
- [ ] Verify fundraising workflows.
- [ ] Verify owner, administrator and restricted-user access.
- [ ] Verify cross-organization data isolation.
- [ ] Verify responsive desktop and mobile layouts.
- [ ] Complete disc golf regression testing.
- [ ] Run TypeScript, lint and build checks.
- [ ] Complete integration and end-to-end tests.
- [ ] Document the demonstration workflow.

## 6. Demo Organization

All names, amounts and targets are fictional demonstration data.

| Property           | Value                          |
| ------------------ | ------------------------------ |
| Organization       | Community Steps Foundation     |
| Organization type  | Charity run/walk               |
| Event              | Annual Charity 5K Run and Walk |
| Distance           | 5 kilometers                   |
| Participant target | 250                            |
| Fundraising target | $50,000                        |

### Funding Verification Scenario

| Metric                    | Expected value |
| ------------------------- | -------------- |
| Direct donations          | $500           |
| Pledged commitments       | $10,000        |
| Partial pledge payments   | $3,000         |
| Total cash received       | $3,500         |
| Outstanding pledges       | $7,000         |
| Cash fundraising progress | 7%             |

The database-level funding scenario was verified during
Funding Phase 2A. Full authenticated and user-interface
verification remains outstanding.

## 7. Development Workflow

For each development phase:

1. Review the roadmap and current implementation.
2. Define requirements and acceptance criteria.
3. Identify affected collections, hooks, routes and components.
4. Document architectural decisions.
5. Implement the smallest functional increment.
6. Verify database and permission requirements.
7. Verify the user interface.
8. Run relevant automated tests.
9. Run formatting, lint, TypeScript and build checks.
10. Update the roadmap with verified progress.
11. Commit and push the completed increment.
12. Open or update the appropriate pull request.

Do not mark a task complete solely because code exists.
Completion requires appropriate functional verification.

## 8. Regression Protection

Existing disc golf organizations must retain their current
functionality throughout this initiative.

Regression coverage must include:

- Organization creation and membership.
- Athletes, teams and rosters.
- Leagues and seasons.
- Courses and hole positions.
- Event setup and scoring.
- Results and standings.
- Fantasy leagues.
- Sponsorship agreements and funding.
- Reimbursements and expenses.
- Public pages and organization permissions.

## 9. Initial Scope Boundaries

The following items require separate evaluation before
implementation:

- Online payment processing.
- Public donor checkout.
- Tax-deductible donation receipts.
- Automated recurring donations.
- Per-distance pledge calculations.
- External race timing integrations.
- Advanced fundraising campaigns.
- Additional sports and event templates.

## 10. Architecture Decision Log

### CE-ADR-001: Shared Application Architecture

Decision: Extend FliHub rather than create a separate
charity-event application.

Reason: Shared organization, membership, financial and event
infrastructure should be reused wherever practical.

### CE-ADR-002: Funding Development Sequence

Decision: Pause Funding Phase 2A in draft PR #52 until
charity organization workflows are functional.

Reason: Fundraising functionality should be designed around
a realistic charity-event workflow.

### CE-ADR-003: Capability Activation

Decision: Keep unfinished capabilities unavailable until
their implementation and permissions have been verified.

Reason: Organizations should not be presented with features
that cannot yet be used reliably.

### CE-ADR-004: Charity Organization Profile

Decision: Reuse the race-event template with a distinct persisted
charity run/walk profile.

Reason: Existing template infrastructure supports race distances,
but its current defaults include golf-oriented capabilities.
A charity profile must remain distinguishable from competitive
running organizations.

The profile storage mechanism will be designed in CE-2.
Existing organizations must retain their current behavior.

### CE-ADR-005: Guided Organization Creation

Decision: Extend the existing guided creation workflow rather
than introduce a separate wizard.

Preserve verified-email requirements, frontend and backend
configuration validation, transactional creation, automatic Owner
membership, audit history, and active organization selection.

### CE-ADR-006: Noncompetitive Participation

Decision: Introduce a participation result method for charity
run/walk events.

Competitive timing, rankings, stroke scoring, and official
competitive results are not required for the initial workflow.

### CE-ADR-007: Participant Identity

Decision: Reuse the athletes and athlete_private collections.

Participant terminology will be resolved through the organization
profile. Existing collection names and disc golf behavior remain
unchanged.

Participants do not require user accounts, teams, competitive
divisions, or season membership.

Private contact information must remain protected. Explicitly
verify cross-organization integrity of private companion records.

### CE-ADR-008: Deferred Funding Infrastructure

Decision: Preserve the existing local funding schema and draft
PR #52 without merging or reversing its migrations.

The local database already contains migrations 1795046420 and
1795046421, which are absent from the charity branch.

New migration identifiers must not conflict with the deferred
funding branch.

Use disposable databases for migration and permission testing.
Do not reset or reverse the original development database.

### CE-ADR-009: Shared Event Identity

Decision: Reuse the existing events collection for charity events.

The season relationship is optional. Existing event names, dates,
venue information, status, and organization ownership can be reused.

Preserve existing capability checks, immutable organization
ownership, same-organization season validation, and server-owned
fantasy activation cutoff.

Charity readiness and lifecycle requirements must be implemented
without imposing golf rounds, courses, or scorecards.

### CE-ADR-010: Event Registration

Decision: Introduce an event-specific registration relationship
between participants and events.

Proposed collection: event_registrations.

Registration requirements include participant, event, selected
distance, participation type, registration status, and check-in.

Prevent cross-organization relationships and duplicate registrations
unless a documented future workflow explicitly allows them.

Finalize the schema and lifecycle rules before CE-4 implementation.

### CE-ADR-011: Event Distances

Decision: Preserve organization-level race distances as defaults
and introduce independently saved event-specific distances.

Proposed collection: event_distances.

Changes to organization defaults must not silently modify existing
events or registrations.

Reusable route libraries and advanced route mapping remain subject
to separate requirements review.

### CE-ADR-012: Organization-Specific Terminology

Decision: Resolve terminology and navigation through the persisted
organization profile.

Display Participants instead of Athletes for charity organizations
without globally renaming existing capabilities or collections.

Preserve existing responsive navigation, compact rows, zebra
striping, and applicable count badges.

### CE-ADR-013: Competitive Operations

Decision: Keep season-based competitive operations separate from
charity registration.

Do not create artificial seasons, season entries, golf rounds,
course holes, or scorecards to support charity participation.

Existing team identity may be reusable, but season roster
relationships must not be imposed on charity participants.

### CE-ADR-014: Verified Capability Activation

Decision: Enable only capabilities whose applicable workflows,
permissions, and organization isolation have been verified.

Do not rely exclusively on hidden navigation or disabled UI controls.

Review backend capability configuration and direct API requests
to ensure unfinished workflows cannot be activated improperly.

## CE-1 Architecture Audit Findings

### Existing Infrastructure

- The shared capability catalog is used by frontend and backend.
- Organization templates include league, race-event, and custom.
- Race-event currently includes golf-oriented default capabilities.
- Guided creation currently supports the disc golf league configuration.
- Organization navigation is capability-driven.
- Athlete identity records are sufficiently general for participants.
- Private athlete contact information is stored separately.
- Events support independent creation without a season.
- Organization-level race distances are configurable.
- Competitive group and roster relationships depend on season entries.

### Proposed Schema Scope

| Collection or configuration | Approach                                |
| --------------------------- | --------------------------------------- |
| organizations               | Reuse; design persisted charity profile |
| memberships                 | Reuse                                   |
| athletes                    | Reuse                                   |
| athlete_private             | Reuse                                   |
| events                      | Reuse                                   |
| event_distances             | Proposed new collection                 |
| event_registrations         | Proposed new collection                 |
| sponsorship collections     | Reuse after CE-5 verification           |
| funding collections         | Preserve; deferred to CE-6              |

### Security Requirements

- Preserve role-based organization access.
- Validate organization ownership on every new relationship.
- Reject forged or unsupported guided creation configurations.
- Prevent unauthorized capability activation.
- Preserve private participant contact information.
- Validate lifecycle transitions in the backend.
- Verify direct API access as well as user-interface behavior.
- Review public publication to prevent unintended participant exposure.

### Database Compatibility Verification

- Original development database backed up before branch transition.
- Backup gzip integrity verification passed.
- SQLite quick_check returned ok.
- Deferred funding collections and integrity triggers remain present.
- Funding Phase 2A draft PR #52 CI checks passed.
- Isolated database copy started with current charity branch hooks.
- Automatic migrations were disabled during the startup test.
- PocketBase health endpoint returned HTTP 200.
- Original development database was not modified by the test.
- Full functional and migration compatibility remain to be verified.

Temporary backup and test directories are not permanent storage.

## 11. Development History

### November 23, 2026

- Funding Phase 2A preserved in draft PR #52.
- Funding database integrity and financial calculations verified.
- Authenticated funding API verification remains outstanding.
- Existing PocketBase data backed up before branch transition.
- Charity-event development branch synchronized with main.
- Charity-event roadmap established.

### CE-1 Architecture Closeout

- Completed organization template and capability audit.
- Completed guided creation and navigation audit.
- Completed participant and standalone event model audit.
- Reviewed event creation, update, archive, and restore operations.
- Reviewed backend event capability and relationship validation.
- Established event distance and registration architecture.
- Verified isolated PocketBase startup compatibility.
- Established architecture decisions CE-ADR-004 through CE-ADR-014.
- Preserved existing application code and development database.
- Established CE-2 implementation requirements.

## 12. Current Focus

Phase CE-1: Complete.

Next phase: CE-2 — Organization Onboarding.

Next action: Design the persisted charity organization profile and
implement the smallest verified guided creation increment.

Before implementation:

1. Review organization schema and migration identifiers.
2. Define profile persistence and backward-compatible defaults.
3. Define the supported charity creation mapping.
4. Establish the initial verified capability set.
5. Add frontend and backend configuration tests.
6. Use disposable databases for migration verification.

Funding Phase 2A remains deferred in draft PR #52.

Do not expose participant registration, competitive race timing,
donations, pledges, or other unfinished workflows as available.
