cd /workspaces/FliHub-3

(
set -e
set -o noclobber

cat > docs/CHARITY-EVENT-ROADMAP.md <<'EOF'

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

The following matrix represents proposed functionality.
Existing implementation and dependencies must be audited
before capabilities are activated.

| Capability                  | Disc golf         | Charity run/walk |
| --------------------------- | ----------------- | ---------------- |
| Organization and membership | Required          | Required         |
| Athletes / participants     | Required          | Required         |
| Teams                       | Supported         | Optional         |
| Leagues and seasons         | Supported         | Optional         |
| Venues, courses and routes  | Supported         | Supported        |
| Events                      | Required          | Required         |
| Scoring and results         | Supported         | Optional         |
| Standings                   | Supported         | Optional         |
| Fantasy leagues             | Supported         | Not required     |
| Sponsorships                | Supported         | Supported        |
| Reimbursements and expenses | Supported         | Supported        |
| Participant registration    | Future evaluation | Planned          |
| Donations and pledges       | Optional          | Planned          |
| Fundraising goals           | Optional          | Planned          |

## 5. Development Phases

### Phase CE-1: Architecture and Requirements

Status: In progress

- [ ] Audit existing organization templates.
- [ ] Review the race-event template.
- [ ] Review guided organization setup.
- [ ] Review capability dependencies.
- [ ] Identify disc golf-specific assumptions.
- [ ] Review organization navigation and terminology.
- [ ] Review existing participant and event data models.
- [ ] Determine which existing collections can be reused.
- [ ] Review local database compatibility.
- [ ] Document architecture decisions.

Acceptance criteria:

- Existing functionality and limitations are documented.
- Proposed organization capabilities are defined.
- Required schema and interface changes are identified.
- No unnecessary duplicate infrastructure is introduced.

### Phase CE-2: Organization Onboarding

Status: Planned

- [ ] Define the charity run/walk organization template.
- [ ] Implement appropriate guided setup.
- [ ] Configure default capabilities.
- [ ] Configure organization-specific terminology.
- [ ] Configure organization navigation.
- [ ] Verify owner and administrator permissions.
- [ ] Create the charity demo organization.
- [ ] Verify existing disc golf onboarding.

Acceptance criteria:

- A user can create a charity run/walk organization.
- The organization displays relevant capabilities.
- Disc golf-specific requirements are not imposed.
- Existing organization creation remains functional.

### Phase CE-3: Participant Management

Status: Planned

- [ ] Determine whether the athlete model can be generalized.
- [ ] Support runners and walkers.
- [ ] Support individual participants.
- [ ] Support optional participant teams.
- [ ] Define participant registration workflows.
- [ ] Define registration status and event eligibility.
- [ ] Support appropriate participant import workflows.
- [ ] Verify participant data isolation.

Acceptance criteria:

- Participants can be managed independently of leagues.
- Participants can be associated with charity events.
- Individual and team participation are supported.
- Existing athlete and roster workflows remain functional.

### Phase CE-4: Charity Event Management

Status: Planned

- [ ] Define charity event creation workflows.
- [ ] Support standalone events.
- [ ] Support event dates and schedules.
- [ ] Support event locations and routes.
- [ ] Support configurable event distances.
- [ ] Support running and walking participation.
- [ ] Associate registered participants with events.
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

## 11. Development History

### November 23, 2026

- Funding Phase 2A preserved in draft PR #52.
- Funding database integrity and financial calculations verified.
- Authenticated funding API verification remains outstanding.
- Existing PocketBase data backed up before branch transition.
- Charity-event development branch synchronized with main.
- Charity-event roadmap established.

## 12. Current Focus

Phase CE-1: Architecture and Requirements.

Next action: Audit existing organization templates,
capabilities, guided setup, navigation and event models.

Do not begin new schema or interface implementation until
the initial architecture review is complete.
EOF
) &&

npx prettier --write docs/CHARITY-EVENT-ROADMAP.md &&
git add docs/CHARITY-EVENT-ROADMAP.md &&
git diff --cached --check &&
git commit \
-m "Establish charity event organization roadmap" \
-m "Document architecture principles, phased implementation, acceptance criteria, regression protection, demo requirements, and Funding Phase 2A dependencies." &&
git push &&
git status --short --branch
