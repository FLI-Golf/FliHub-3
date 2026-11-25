# FliHub Charity Event Organization Roadmap

## 1. Project Overview

- Status: Active development
- Current phase: CE-3 - Participant Management
- Last updated: November 24, 2026
- Branch: feature/charity-participant-management
- Baseline: 3696f66 (CE-2 merged through PR #53)
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

Status: Complete

- [x] Define and persist a distinct charity run/walk organization profile.
- [x] Reuse the existing race-event organization template.
- [x] Extend the existing guided organization creation workflow.
- [x] Add a noncompetitive participation result method.
- [x] Keep frontend and PocketBase creation mappings consistent.
- [x] Configure verified default capabilities.
- [x] Introduce organization-specific terminology.
- [x] Configure organization navigation.
- [x] Reject unsupported and forged configurations.
- [x] Verify owner and administrator permissions.
- [x] Verify profile persistence after refresh.
- [x] Create the charity demo organization.
- [x] Verify existing disc golf onboarding.

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

Status: In progress

- [x] Audit existing participant schemas and relationships.
- [x] Review backend permissions and request hooks.
- [x] Review server actions and participant management UI.
- [x] Review CSV imports and lifecycle operations.
- [x] Review capability restrictions and navigation.
- [x] Review existing automated verification coverage.
- [x] Document CE-3 architecture and implementation requirements.
- [ ] Implement participant data integrity and backend security.
- [ ] Implement profile-specific participant management.
- [ ] Implement validated imports and lifecycle operations.
- [ ] Verify security and functional behavior before activation.
- [ ] Enable the verified participant capability.
- [ ] Complete automated and disc golf regression verification.
- [ ] Verify persistent demonstration data and restart persistence.
- [ ] Complete documentation, pull request, and CI verification.

Acceptance criteria:

- Participants can be managed without accounts, leagues, seasons,
  teams, competitive divisions, courses, or scoring.
- Participant identity remains separate from event registration.
- Private contact information is restricted to authorized roles.
- Organization isolation and relationship integrity are enforced
  through application actions and direct API requests.
- Creation, editing, imports, archive, and restore are verified.
- Charity terminology is consistent across the application.
- Existing disc golf athlete and roster workflows remain functional.
- Existing and new charity organizations receive the verified
  participant capability through a controlled activation process.
- Event registration and optional fundraising team requirements
  are documented for CE-4 without premature implementation.
- Persistent data and deferred funding infrastructure are preserved.

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

### Persistent Demo Organization

Created through normal account registration, email verification,
and guided organization onboarding on November 23, 2026.

- Organization: Community Steps Foundation
- Organization ID: 18lsco0vyx0h058
- Owner: Sarah Mitchell
- Demo email: sarah.mitchell@example.com
- Template: race-event
- Profile: charity-run-walk
- Participation model: Noncompetitive
- Default distance: 5K (5 kilometers)
- Enabled operational capabilities: None
- Organization creation audit: Verified
- Persistence after Codespace restart: Verified

The existing FLI Golf organization remains in the same database
with its existing league template and ten enabled capabilities.

The charity event, participant target, and fundraising target
remain demonstration plans rather than created operational records.

Do not create artificial leagues, seasons, teams, golf courses,
or competitive scoring records for the charity organization.

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

Implemented in CE-2 using migration
1795046422_organization_profile.js.

The organizations collection has an optional single-select profile
field supporting charity-run-walk. Existing organizations retain
an empty profile and their existing behavior.

The charity profile is assigned by server-validated guided creation.
Clients cannot directly assign or change the profile.

The initial charity configuration uses the race-event template,
a default 5K distance, and an empty operational capability set.

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

### CE-ADR-015: Charity Configuration Restrictions

Decision: Keep charity profile configuration restricted to
verified charity-compatible capabilities.

CE-2 permits no operational capabilities for charity organizations.
The race-event template and charity profile cannot be replaced
through ordinary organization configuration.

Owner and Admin users can manage permitted settings, including
organization name and default event distances.

The backend must reject forged profile assignments, incompatible
templates, and unauthorized capability activation.

Expand the charity capability allowlist only after each applicable
workflow has passed its implementation and permission checks.

### CE-ADR-016: Planned Workflow Presentation

Decision: Display unfinished charity workflows as planned rather
than presenting them as operational navigation destinations.

The charity overview and settings identify upcoming workflows
and their implementation phases.

Disabled capability routes retain the existing informational-page
behavior for authorized organization members. They must not expose
operational forms or editable workflow fields.

Charity-specific disabled pages return users to the organization
overview rather than instructing them to enable unavailable features.

Charity public-page management, public publication, and standings
remain unavailable until appropriate workflows are implemented.

### CE-ADR-017: Development Database Preservation

Decision: Apply new charity migrations without reversing or
removing deferred Funding Phase 2A migrations.

Verify migrations against fresh and copied databases before
applying them to persistent development data.

Create and verify a complete database backup before persistent
schema changes. Compare existing organization records, deferred
funding records, migration history, and integrity triggers.

Use disposable databases for automated integration and browser tests.

### CE-ADR-018: Shared Participant Identity

Status: Accepted for CE-3 implementation.

Reuse the existing athletes and athlete_private collections and
the athletes capability identifier.

The minimum charity participant identity consists of first name,
last name, optional display name, and active or archived status.

Email, phone, and private notes remain optional companion fields.
A participant does not require a FliHub user account.

Existing demographic fields remain in the shared schema but are
not required or displayed in the initial charity workflow.
Preserve existing disc golf field behavior.

No new participant identity collection is planned.

### CE-ADR-019: Participant Identity and Event Registration

Status: Accepted for CE-3 implementation.

Participant identity belongs to the organization, not an event.

Runner or walker designation, selected distance, registration
status, event eligibility, and check-in belong to event-specific
registration records planned for CE-4.

An active participant is a candidate for registration, subject
to future event-specific eligibility rules. Archived participants
must not be offered for new registrations.

CE-4 must define registration status transitions, cancellation,
duplicate event registration rules, and check-in behavior.

Archiving an identity must not destroy historical relationships.

Optional fundraising teams are deferred to CE-4 architecture
review. Do not impose competitive teams or season rosters.

### CE-ADR-020: Participant Security and Relationship Integrity

Status: Accepted for CE-3 implementation; verification pending.

Owner and Admin permissions must be evaluated against the exact
target organization and authenticated user.

Viewer and Scorekeeper memberships may read permitted participant
identity data but must not access private companion information
or perform participant management mutations.

Nonmembers and unauthenticated users must not access protected
participant records.

Enforce immutable organization relationships and immutable private
companion athlete relationships. A private companion must reference
an athlete in the same organization, with at most one companion
per athlete.

Validate submitted record IDs against the current route organization.

Direct PocketBase API requests must not bypass these requirements.
Test users holding different roles in different organizations.

Charity participant mutations require the verified participant
capability. Preserve existing non-charity capability behavior.

Charity participant publication remains prohibited.

Use focused shared server operations rather than expanding the
existing capability route with duplicated business logic.

The architecture audit identified missing or unverified safeguards
in relationship validation, organization-scoped mutations, atomic
writes, and error handling. These findings do not establish a
successful unauthorized access attempt.

### CE-ADR-021: Profile-Specific Participant Interface

Status: Accepted for CE-3 implementation.

Reuse the shared athlete management component.

Display Participants for charity organizations and Athletes for
existing disc golf organizations.

Adapt headings, forms, validation, empty states, accessibility
labels, import instructions, and navigation count descriptions.

Hide gender and nationality in the initial charity workflow.
Display eligibility notes as private participant notes.

Keep private contact information out of ordinary charity list rows.
Only authorized management operations may expose private details.

Provide participant search and active or archived filtering.
Preserve responsive layouts, compact navigation, zebra striping,
and existing count badge conventions.

Navigation counts represent non-archived identities, not event
registrations. Counts must remain organization-scoped and must
not query private companion records.

### CE-ADR-022: Participant Lifecycle and CSV Imports

Status: Accepted for CE-3 implementation.

Support creation, editing, archive, and restore without ordinary
hard deletion of participant identities.

Identity and companion writes must be atomic. Validate complete
import batches before persistence and prevent partial batch saves.

Retain the existing 200-row import limit initially.

The initial charity CSV column order is:

firstName,lastName,displayName,email,phone

Preserve the existing disc golf CSV format.

Reject malformed CSV, invalid field values, and unexpected columns.
Provide useful row-level validation errors.

Flag potential duplicates within an import and against existing
organization records. Do not automatically merge identities or
assume that matching names identify the same person.

Define and test duplicate normalization and explicit resolution
before enabling imports. Avoid imposing global uniqueness on
names, email addresses, or phone numbers.

Distinguish missing private companion records from authorization,
network, and other lookup failures.

The precise transaction mechanism and duplicate resolution
interface must be reviewed during implementation.

### CE-ADR-023: Controlled Participant Capability Activation

Status: Accepted for CE-3 implementation; activation pending.

The charity-run-walk profile may enable athletes only after
participant security and functional verification.

Update frontend and backend profile restrictions consistently.
New charity organizations will receive athletes through the
server-derived guided creation configuration.

Existing charity organizations will receive athletes through a
reviewed, idempotent, profile-scoped activation procedure.

Prefer a targeted migration if required for consistent deployment.
Review the activation mechanism and migration compatibility
before implementation.

Do not change global race-event template defaults or existing
non-charity organization capability configurations.

Remove Participants from planned workflows only when operational.
All other unfinished charity capabilities remain restricted.

Verify navigation, settings, guided preview, disabled routes,
direct API enforcement, and persisted capability configuration.

### CE-ADR-024: Verification and Database Preservation

Status: Accepted for CE-3 implementation.

Use disposable databases for security, destructive, integration,
and browser verification.

Cover identity and private companion operations, organization
isolation, mixed memberships, direct API requests, lifecycle,
CSV validation, atomic writes, publication restrictions, and
capability enforcement.

Verify charity and disc golf terminology, responsive layouts,
navigation counts, guided creation, and existing athlete behavior.

Review and deliberately update CE-2 assertions that expect zero
charity capabilities. Preserve all unrelated security assertions.

Before applying any new migration to persistent development data:

- Review migration filenames and persistent migration history.
- Verify compatibility against fresh and copied databases.
- Create and verify a fresh backup.
- Preserve existing organizations, accounts, and participant data.
- Preserve deferred funding tables, records, triggers, and history.
- Compare persistent data before and after migration.

Migration IDs 1795046420 and 1795046421 belong to deferred funding
work. Migration 1795046422 introduced the organization profile.
Review the next available migration ID before creating a migration.

Use Community Steps Foundation for a small fictional participant
demonstration after automated verification. Verify refresh and
restart persistence and preserve the existing FLI Golf organization.

Do not claim full legacy browser regression unless it has been
executed successfully.

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

### CE-2 Organization Onboarding Closeout

Implementation completed November 23-24, 2026.

#### Implementation

- Added the persisted charity-run-walk organization profile.
- Reused the race-event organization template.
- Extended the existing guided organization creation wizard.
- Added the noncompetitive participation result method.
- Kept frontend and PocketBase creation mappings consistent.
- Preserved transactional creation, verified-email requirements,
  Owner membership, active organization selection, and audit history.
- Added charity-specific overview, settings, and navigation.
- Introduced profile-aware participant terminology.
- Preserved existing compact and responsive organization navigation.
- Added backend profile and capability configuration restrictions.
- Restricted unfinished charity public-page and standings workflows.
- Preserved informational pages for disabled capabilities.
- Updated disabled charity workflow messaging and navigation.
- Updated the shared application footer to advertise charity onboarding
  without claiming that charity operational workflows are available.
- Retained the existing global Phase 2C build label.

#### Automated Verification

| Verification                           | Result                   |
| -------------------------------------- | ------------------------ |
| Guided organization tests              | 39/39 passed             |
| Targeted unit tests                    | 69/69 passed             |
| Integration tests                      | 116/116 passed           |
| Charity browser acceptance             | All eight stages passed  |
| Svelte and TypeScript checks           | Zero errors and warnings |
| Production build                       | Passed                   |
| Changed implementation file formatting | Passed                   |
| Changed implementation file ESLint     | Passed                   |
| Git whitespace checks                  | Passed                   |

The guided organization test count is included in the targeted unit
test coverage; these counts must not be added together.

The integration suite includes thirteen charity-specific tests and
existing integration regression coverage.

Browser acceptance verified:

- New account registration and email verification.
- Guided charity organization creation.
- Charity overview and capability-based navigation.
- Default event distance configuration and persistence.
- All ten disabled capability informational pages.
- Denial of charity public-page management.
- Responsive mobile layout at 375 pixels.
- Returning authenticated sessions.
- Existing guided disc golf organization creation.

Final browser acceptance was executed against a separately verified
production build using a disposable database.

Browser acceptance command:

```bash
E2E_SKIP_BUILD=1 node tests/e2e/run-e2e.mjs charity-organization
```

Full legacy browser-suite execution remains outstanding. Some older
browser tests still assume the previous account and organization
creation workflows. Do not interpret targeted browser acceptance
as full application end-to-end regression coverage.

#### Production Build Procedure

Unrestricted production builds were terminated in the development
Codespace after bundling. No explicit compiler error was identified.

A resource-constrained standalone build completed successfully:

```bash
NODE_OPTIONS="--max-old-space-size=1536" RAYON_NUM_THREADS=1 npm run build
```

Reuse the verified build for targeted browser acceptance when
necessary to avoid redundant resource-intensive builds.

Existing SvelteKit alias deprecation and local adapter-auto
environment warnings were observed. These did not prevent the
successful build or browser acceptance.

#### Database Migration and Preservation

Migration applied:

1795046422_organization_profile.js

Verification completed against fresh and copied databases before
application to persistent development data.

Persistent database backup:

/tmp/flihub-backups/pb-data-before-ce2-demo-20261124-031925.tar.gz

Verified extracted backup:

/tmp/flihub-ce2-backup-verify.bqyDYn

- Archive integrity and SHA-256 checksum recorded.
- Extracted main and auxiliary database integrity checks passed.
- Persistent database integrity check passed after migration.
- Existing organization data compared against the verified backup.
- Existing organization profile defaults remained empty.
- Deferred funding tables and their records remained unchanged.
- Both deferred funding integrity triggers remained unchanged.
- Existing migration history was preserved.
- Only the organization profile migration was added.

Community Steps Foundation was subsequently created through the
normal guided onboarding workflow.

Both organizations and the deferred funding schema were verified
again after stopping and restarting the Codespace.

Temporary backup directories remain Codespace-local storage and
must not be treated as independent permanent backups.

#### Development Startup

The application requires POCKETBASE_URL to be configured.

For a running local PocketBase instance:

```bash
POCKETBASE_URL=http://127.0.0.1:8090 npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

PocketBase health endpoint:

http://127.0.0.1:8090/api/health

The working combined startup procedure checks PocketBase health,
starts pocketbase/serve-dev.sh when necessary, waits for readiness,
and launches SvelteKit with the explicit PocketBase URL.

The startup procedure cleans up the PocketBase process it starts
when the script exits. Review the startup script and migration
settings before changing branches with different migration histories.

Mailpit remains the local email verification service.

#### Known Limitations and Deferred Work

- Charity operational capabilities remain disabled.
- Participant management is the next implementation phase.
- Event registration, check-in, routes, and event-specific distances
  remain planned for CE-4.
- Sponsorships and reimbursements require charity verification in CE-5.
- Funding Phase 2A remains deferred in draft PR #52.
- Authenticated funding API and user-interface verification remain
  outstanding.
- Private participant companion-record organization integrity must
  be explicitly reviewed and tested in CE-3.
- GitHub install, check, lint, and build CI passed.
- Broader legacy browser regression remains outstanding.
- New accounts must follow the account activity selection workflow
  before guided organization creation.
- The existing Open organizations link can return users without
  memberships to the account activity picker; broader onboarding
  navigation polish remains outside this increment.

#### Closeout Status

Implementation, targeted automated verification, persistent
migration, and manual charity onboarding are complete.

Final documentation, changed-file quality checks, commit,
push, and implementation CI verification are complete.

- Implementation commit: 5a95800
- Pull request: #53
- GitHub CI run: 45411678649
- CI verification date: November 24, 2026
- Install, check, lint, and build: Passed
- Netlify header rules: Passed
- Netlify deployment preview: Passed
- Checks: 3 successful, 2 skipped, 0 failing, 0 pending
- Merge status at implementation verification: CLEAN

CE-2 implementation is complete. The final documentation commit
requires CI verification before pull request merge.

Full legacy browser regression remains outstanding and is not
claimed as complete.

### CE-3A Participant Architecture Audit

Date: November 24, 2026.

Baseline: 3696f66 on feature/charity-participant-management.

CE-2 PR #53 is merged and the CE-3 branch was created from
synchronized main.

Reviewed:

- Participant and private companion collection schemas.
- Collection rules, backend hooks, and relationship integrity.
- Shared capability server actions and authorization.
- Participant management interface and CSV parser.
- Profile restrictions, guided creation, and navigation counts.
- Existing charity verification and regression requirements.

Persistent database inspection found 28 existing athlete records,
no charity participants, and no private companion records.

No participant identity schema expansion is currently required.
Security rules, integrity enforcement, and transactional operations
require implementation and authenticated verification.

Deferred funding tables and integrity triggers were present.
Their preservation must be verified again before and after any
new persistent migration.

The source audit does not constitute completed security testing.
No application implementation or persistent database mutation
was performed during CE-3A.

The broader legacy browser regression remains outstanding.

## 12. Current Focus

Phase CE-1: Complete.

Phase CE-2: Complete.

Current phase: CE-3 - Participant Management.

CE-2 PR #53 has been merged and main was synchronized before
creating feature/charity-participant-management.

CE-3A architecture audit is documented. Begin CE-3B after
reviewing the roadmap update.

### CE-3 Entry Requirements

1. Review this roadmap and the existing athlete implementation.
2. Review athletes and athlete_private collections, API rules,
   request hooks, server actions, and import workflows.
3. Define participant terminology across navigation, pages, forms,
   validation messages, and import instructions.
4. Define the minimum participant identity and private contact fields.
5. Determine which running and walking attributes belong to the
   participant identity and which belong to event registration.
6. Verify same-organization integrity for private companion records,
   including forged relations and attempted relationship changes.
7. Define Owner, Admin, and restricted-user permissions.
8. Review optional participant teams without imposing season rosters.
9. Define event registration requirements for CE-4 without prematurely
   implementing the registration lifecycle.
10. Establish integration, browser, and disc golf regression tests
    before activating the participant capability.

### CE-3 Implementation Sequence

| Increment | Scope                                  | Status   |
| --------- | -------------------------------------- | -------- |
| CE-3A     | Architecture and requirements audit    | Complete |
| CE-3B     | Data integrity and backend security    | Complete |
| CE-3C     | Profile-specific participant interface | Complete |
| CE-3D     | CSV imports and lifecycle operations   | Next     |
| CE-3E     | Controlled capability activation       | Pending  |
| CE-3F     | Automated and regression verification  | Pending  |
| CE-3G     | Persistent participant demonstration   | Pending  |
| CE-3H     | Documentation, pull request, and CI    | Pending  |

Security and functional tests must accompany implementation.
CE-3E activation is gated by successful targeted verification;
CE-3F provides final integrated and regression verification.

Charity development is frozen after CE-3C through AI-1F acceptance and
the AI-2 pilot. See the [intelligence roadmap](INTELLIGENCE-ROADMAP.md).
Resume at CE-3D with charity-specific CSV import and participant lifecycle
integration using the verified CE-3B security foundation and CE-3C interface.

Do not activate the participant capability in persistent data
during CE-3D. Controlled activation remains gated by CE-3E.

### CE-3 Implementation Boundaries

- Reuse athletes and athlete_private wherever practical.
- Keep existing collection and capability identifiers stable.
- Display Participants for charity organizations and Athletes for
  existing disc golf organizations.
- Do not require a league, season, team, competitive division,
  or participant user account.
- Protect private contact information.
- Verify direct API requests and organization isolation.
- Do not expose public participant publication prematurely.
- Do not activate additional charity capabilities before verification.
- Use Community Steps Foundation as the persistent demonstration
  organization.
- Preserve the existing FLI Golf organization and deferred funding
  schema.
- Use disposable databases for automated and destructive tests.

Funding Phase 2A remains deferred in draft PR #52.

Do not expose event registration, competitive race timing,
donations, pledges, or other unfinished workflows as available.

## CE-3B Foundation Checkpoint — 2026-11-24

Status: Foundation implementation and verification complete.
CE-3 overall remains in progress.

### Completed implementation

- Shared athlete and participant identity security safeguards.
- Organization-scoped authorization for participant operations.
- Transactional identity and private contact creation and updates.
- Organization-scoped archive and restore operations.
- Atomic CSV imports with a maximum of 200 participants.
- Profile-aware CSV validation and row-specific validation errors.
- Duplicate detection against existing and incoming records.
- Explicit duplicate acknowledgment and stale-review protection.
- Bounded duplicate warning generation.
- Database integrity triggers protecting participant relationships,
  organization ownership, status, and charity publication restrictions.
- SvelteKit server actions connected to transactional operations.
- CSV preview, duplicate review, and confirmation interface.
- Updated legacy athlete browser verification for guided onboarding
  and collapsible management sections.

### Verification completed

- 103 participant unit tests passed.
- 215 integration tests passed, including existing regression coverage.
- 23 standalone database integrity checks passed.
- 341 combined unit, integration, and database checks passed.
- Fresh database migration, rollback, and reapplication verified.
- Existing database compatibility verified using a disposable copy.
- Transaction rollback verified using disposable failure injection.
- Phase 1C browser verification passed.
- Production build passed.
- Changed-file formatting and ESLint checks passed.
- Svelte and TypeScript checks reported zero errors and warnings.

### Persistent database status

Migration 1795046423_participant_integrity.js was found applied
to the persistent development database during final verification,
earlier than the planned activation checkpoint.

The exact application mechanism was not established.

Read-only verification confirmed:

- All four participant integrity triggers are present.
- Deferred funding migration history is preserved.
- All three deferred funding tables are present.
- Both deferred funding integrity triggers are present.
- SQLite integrity_check returned ok.
- PocketBase returned HTTP 200 from its health endpoint.

No migration reversal or database reset was performed.

### Remaining work

- Charity-specific participant management presentation.
- Profile-aware participant terminology and navigation counts.
- Charity participant capability activation and authorization verification.
- Persistent fictional charity participant demonstration.
- Dedicated forged SvelteKit server-action verification.
- Full legacy browser regression.
- Incorporate standalone SQL integrity checks into the automated suite.
- Complete CE-3 documentation, pull request, and final acceptance.

The integration failure-injection harness uses Python 3.
CI execution of that harness remains to be verified.

This checkpoint does not complete CE-3, activate charity participant
management, or resume deferred Funding Phase 2 development.

## CE-3C Interface Checkpoint — 2026-11-24

Status: Interface implementation and targeted verification complete.
CE-3 overall remains in progress.

### Completed implementation

- Profile-aware participant and athlete terminology.
- Charity-specific participant management presentation.
- Simplified participant creation and editing without sporting
  demographic fields.
- Participant directory with identity search, active and archived
  status filters, counts, reset controls, and empty states.
- Preservation of existing disc golf athlete functionality.
- Charity-specific CSV instructions, examples, and preview presentation.
- Privacy guidance for externally generated CSV content.
- Creation and editing validation with recoverable form errors.
- Success feedback and private form-value cleanup.
- Unsaved creation and editing navigation protection.
- Duplicate submission prevention.
- Read-only protection for all 12 charity creation and editing
  input fields while their respective save requests are pending.
- Responsive participant management and dialog presentation.

### Privacy and security

- Ordinary charity directory payloads exclude private contact
  information and private participant notes, including for managers.
- Authorized owners and administrators retrieve private information
  through a dedicated organization-scoped endpoint when editing.
- Private endpoint responses use private, no-store cache controls
  and the nosniff response header.
- Viewer and scorekeeper roles retain identity-only directory access.
- Nonmembers, anonymous requests, foreign participant identifiers,
  and unauthorized organization requests are denied.
- Disabled participant capability prevents private endpoint access.
- Pending private requests are cancelled when the editing component
  is destroyed.
- Stale private responses cannot update a different participant
  editing context.
- Organization and management permission changes recreate the
  participant management component.
- Saving, discarding, and navigating away remove private editing
  values from the active interface.
- Existing transactional participant operations and database
  integrity safeguards remain unchanged.

### Verification completed

- Svelte and TypeScript checks passed with zero errors and warnings.
- Changed-file formatting and targeted ESLint checks passed.
- JavaScript syntax validation passed.
- Production build passed.
- Git diff validation passed.
- Existing Phase 1C disc golf athlete browser regression passed.
- Dedicated charity participant browser specification passed
  all 18 verification stages.

The charity browser specification covers:

1. Disposable charity fixtures.
2. Authenticated browser sessions.
3. Private endpoint authorization.
4. Directory document and page-data privacy.
5. Disabled capability enforcement.
6. Charity participant interface.
7. Participant creation and validation.
8. Identity search and status filtering.
9. Authorized editing and validation.
10. Unsaved edit protection.
11. Archive, restore, and status filtering.
12. Charity CSV presentation and preview.
13. Read-only participant access.
14. Organization navigation privacy.
15. Mobile participant interface at 375-pixel viewport width.
16. Interrupted private request cancellation during client-side
    organization navigation.
17. Unsaved creation navigation protection.
18. Pending save input protection and recovery after validation
    failure.

Automated browser verification used disposable PocketBase data.
The final production rebuild and both targeted browser regression
suites passed after the input protection correction.

### Implementation files

- src/lib/components/AthletesManager.svelte
- src/lib/organizations/profiles.ts
- src/routes/(app)/organizations/[id]/cap/[capability]/+page.server.ts
- src/routes/(app)/organizations/[id]/cap/[capability]/+page.svelte
- src/routes/(app)/organizations/[id]/cap/[capability]/participants/[participant]/private/+server.ts
- tests/e2e/charity-participants.spec.mjs

### Persistent database status

No persistent database changes were performed during CE-3C.

The previously applied participant integrity migration and deferred
funding schema remain in place. CE-3C did not require a new migration,
database reset, or migration reversal.

Community Steps Foundation remains the designated persistent charity
demonstration organization. Its participant capability remains
intentionally inactive until controlled activation in CE-3E.

The existing FLI Golf organization remains outside the scope of
persistent charity demonstration changes.

### Remaining work

- CE-3D: Complete charity CSV import and participant lifecycle
  integration, including committed imports, duplicate acknowledgment,
  stale review rejection, and atomic failure verification.
- CE-3E: Controlled participant capability activation.
- CE-3F: Final integrated acceptance and regression verification.
- CE-3G: Persistent fictional charity participant demonstration.
- CE-3H: Final documentation, pull request, CI, and merge review.
- Dedicated forged SvelteKit server-action verification.
- Full legacy browser regression.
- Incorporation of standalone SQL integrity checks into the
  automated suite.
- GitHub CI verification, including the Python 3 integration
  failure-injection harness.

Funding Phase 2A remains deferred in draft PR #52.

This checkpoint completes CE-3C implementation and targeted
verification only. It does not complete CE-3, activate persistent
charity participant management, or authorize a merge into main.
