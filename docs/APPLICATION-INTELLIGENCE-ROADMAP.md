# FliHub — Application Intelligence Roadmap

## Mission

Make Jev a reusable, optional intelligence capability
throughout FliHub.

Allow authorized users to express objectives naturally
and receive intelligent assistance with application
navigation, preparation, planning, recommendations,
and eventually controlled workflow execution.

Jev provides intelligence.
FliHub provides authoritative execution.

## Development baseline

- Repository: FLI-Golf/FliHub-3
- Parent branch: feature/intelligence-foundation
- Baseline commit: a3a0beb
- Development branch: feature/application-intelligence
- Node.js: v24.22.2
- Existing intelligence tests: 11 passed, 0 failed
- Existing charity documentation stash preserved

## Development tracks

Engineering intelligence and application intelligence
are related but independently governed development tracks.

Engineering intelligence includes Codex orchestration,
worker isolation, engineering verification, and runner
qualification.

Application intelligence includes objective interpretation,
application context, capability selection, recommendations,
and controlled domain operations.

Both tracks should reuse the shared intelligence service.

This roadmap authorizes only the agreed offline synthetic
research scope initially. It does not waive AI-1F, AI-2,
CE-3D, or existing security and acceptance requirements.

## Development sequence

| Phase | Scope                                        | Status      |
| ----- | -------------------------------------------- | ----------- |
| JAI-1 | Discovery and architecture                   | Complete    |
| JAI-2 | Offline application intelligence foundation  | Complete    |
| JAI-3 | Authorized live read-only demonstration      | Complete    |
| JAI-4 | Controlled disposable application operations | In progress |
| JAI-5 | Application intelligence interface           | Pending     |
| JAI-6 | Persistent application integration           | Pending     |
| JAI-7 | Multi-step intelligent orchestration         | Pending     |
| JAI-8 | Production readiness and acceptance          | Pending     |

## JAI-1 — Discovery and architecture

Completed:

- Reviewed existing intelligence architecture.
- Reviewed provider and service implementations.
- Reviewed runtime validation and decision contracts.
- Reviewed engineering director and confidence policies.
- Inspected the existing engineering terminal.
- Confirmed the existing application integration gap.
- Verified all 11 existing intelligence tests pass.
- Identified additional Jev primitives and batching
  as candidates for future implementation.

## JAI-2 — Offline application intelligence foundation

### JAI-2A — Application decision contracts

- Define application-specific request and outcome types.
- Establish registered application decision identifiers.
- Define a bounded application capability catalog.
- Preserve existing engineering contracts.
- Reject unknown decisions and capabilities.

### JAI-2B — Structured application context

- Define a synthetic event readiness fixture.
- Validate context using task-specific schemas.
- Minimize information supplied to the provider.
- Determine eligible capabilities locally.
- Prevent arbitrary commands and database queries.

### JAI-2C — Intelligence primitives

- Reuse existing Choice support.
- Evaluate Score and Noul against official API contracts.
- Introduce additional primitives incrementally.
- Implement strict request and response validation.
- Preserve confidence and abstention behavior.
- Do not assume unsupported provider capabilities.

### JAI-2D — Multi-question requests

- Support registered independent questions.
- Validate each answer against its own contract.
- Define safe handling of incomplete or invalid answers.
- Preserve request budgeting and usage accounting.
- Do not assume questions can see each other's answers.
- Keep dependent decisions in separate workflow steps.

### JAI-2E — Application director

- Interpret approved synthetic objectives.
- Select eligible application recommendations.
- Combine validated intelligence judgments.
- Construct explanations using verified context.
- Identify missing prerequisites.
- Request clarification when necessary.
- Never treat model recommendations as authorization.

### JAI-2F — Application intelligence terminal

Introduce an independent command:

    npm run jev:app

The initial terminal should support:

- Entering approved synthetic objectives.
- Inspecting synthetic application context.
- Viewing the capability catalog.
- Running an event readiness assessment.
- Reviewing recommendations and explanations.
- Viewing sanitized usage information.
- Exiting without persistent application changes.

The initial terminal must operate offline by default.

### JAI-2G — Offline acceptance

- Verify deterministic mock behavior.
- Verify disabled and unavailable fallback.
- Reject malformed requests and responses.
- Reject unknown and ineligible capabilities.
- Verify confidence and abstention handling.
- Verify no external requests occur in offline tests.
- Preserve existing intelligence behavior.
- Complete check, lint, build, and relevant tests.
- Review and document the complete Git diff.

### JAI-2H — Offline development intelligence playground

Introduce an authenticated development-only SvelteKit
playground for the existing synthetic advisory service.

- Provide Assessment, History, Capabilities and Usage sections.
- Reuse registered objectives and synthetic scenarios.
- Display structured context and bounded recommendations.
- Distinguish qualitative readiness from official completion.
- Display clarification when required information is unknown.
- Retain bounded page-memory history.
- Retrieve historical results without additional dispatch.
- Report browser-session counters and configured server limits.
- Follow FLIHUB-DESIGN-PATTERNS.md.
- Block live provider access and application execution.
- Verify development and authentication access restrictions.
- Complete consolidated offline acceptance before JAI-3.

This playground does not activate the production intelligence
interface described in JAI-5.

## Initial proof of concept

Scenario: prepare an upcoming synthetic tournament.

Synthetic context:

- Event: Spring Invitational
- Status: Draft
- Venue selected
- Date scheduled
- Registered participants: 24
- Groups assigned: 0
- Scoring configuration incomplete
- Event not activated

Example objective:

    Help me prepare our next tournament.

Potential intelligence judgments:

- Classify the objective.
- Assess qualitative event readiness.
- Identify the most useful eligible next step.
- Determine whether clarification is needed.
- Recommend reviewing missing prerequisites.

The application independently determines actual
prerequisite completion and eligible capabilities.

The initial demonstration is recommendation-only.
No application operation is executed.

## JAI-3 — Live read-only Jev demonstration

Entry requirements:

- JAI-2 offline acceptance completed.
- Existing roadmap gates reviewed.
- Explicit owner authorization for the live scope.
- Exact provider input previewed.
- Estimated cost and request limit disclosed.

Acceptance requirements:

- At most one provider request per authorization.
- No real participant or organization records disclosed.
- Validated intelligence judgments.
- Sanitized latency and usage evidence.
- Safe fallback on failure or abstention.
- No application operations executed.
- No automatic retries.

## JAI-4 — Controlled disposable operations

- Introduce deterministic operation handlers.
- Use disposable synthetic state.
- Validate operation parameters and prerequisites.
- Bind approval to the exact proposed operation.
- Execute only explicitly authorized operations.
- Independently verify resulting state.
- Stop safely on unexpected results.

### JAI-4A — Architecture and checkpoint

Status: Complete.

Starting checkpoint: `d29abba`.

JAI-3 closeout verified:

- 342 scoped offline intelligence tests passed.
- TypeScript verification passed with zero errors and warnings.
- Lint and production build passed.
- Live experiment release lock remains disabled.
- Original private experiment evidence remains protected.
- No additional paid provider requests were authorized.
- Broader release acceptance remains outstanding.

Architecture inspection reviewed the existing application
intelligence contracts, synthetic fixtures, eligibility rules,
group planning utilities, grouping business rules, and
associated regression tests.

The existing application capability catalog remains advisory.
A recommendation is never execution authority.

Jev supplies intelligence. FliHub retains control.

#### First controlled operation

Registered advisory capability:

- `plan_group_assignments`

Separate controlled operation:

- `create_synthetic_group_assignments`

The initial demonstration uses the Spring Invitational
synthetic fixture with twelve teams, twenty-four athletes,
and no existing groups.

Each synthetic team has two active roster athletes.
The proposed operation creates six groups with two teams
and four athletes per group.

These counts describe the demonstration fixture, not a
universal production grouping requirement.

The operation must preserve team and roster integrity.
It must not create athlete identities, split teams,
replace existing groups, assign scorekeepers, configure
scoring, modify schedules, or activate an event.

#### Reuse and architectural boundaries

The existing grouping implementation uses two teams per
group and preserves each team's roster assignments.

Reuse the pure shuffle utility where appropriate, with
controlled deterministic ordering for reviewed plans.

Preserve applicable existing authorization, organization
isolation, active roster, workflow lock, and transaction
principles.

Do not invoke existing PocketBase mutation handlers.

The synthetic advisory context uses `draft` status.
The persistent grouping handler requires `planned` status.
These are separate lifecycle contracts and must not be
silently treated as equivalent production states.

The new operation layer must remain server-side, isolated,
optional, and inaccessible to ordinary application routes.

No persistent application integration is authorized.

#### Operation lifecycle

1. Obtain a validated advisory recommendation.
2. Resolve an explicitly registered operation locally.
3. Validate synthetic state and operation prerequisites.
4. Resolve the registered synthetic actor and permissions.
5. Construct a deterministic, bounded execution plan.
6. Present the exact proposed changes for review.
7. Obtain explicit approval bound to the plan and revision.
8. Revalidate authorization, prerequisites, and approval.
9. Apply changes to isolated candidate state.
10. Independently verify the candidate state.
11. Commit the verified candidate atomically.
12. Record a sanitized operation outcome.

Any failure must preserve the original state.

Provider confidence, readiness scores, recommendation
identifiers, and caller-supplied permission claims must
never substitute for local authorization.

#### Security and isolation requirements

- Use disposable in-memory synthetic state only.
- Use registered synthetic actors and organizations.
- Require simulated owner or admin authorization.
- Reject unknown actors, roles, scopes, and operations.
- Require applicable simulated organization capabilities.
- Require valid event lifecycle and active roster membership.
- Reject existing groups and started downstream workflows.
- Reject cross-organization records and duplicate assignments.
- Reject arbitrary commands, code, SQL, and filesystem actions.
- Reject unexpected fields and malformed input.
- Do not expose mutable registry definitions or internal state.
- Bind approvals to the exact operation, actor, scope,
  plan digest, and state revision.
- Revalidate approval and state immediately before execution.
- Prevent repeated execution and approval reuse.
- Prevent partial state changes on execution failure.
- Prevent state publication on verification failure.
- Keep audit records bounded and sanitized.
- Make no external provider requests.
- Do not access PocketBase or real organization records.
- Preserve existing live experiment evidence and release locks.

Simulated authorization does not establish production
authentication, tenant isolation, or distributed replay
protection. Those requirements remain subject to later
acceptance gates.

### JAI-4B — Operation registry and contracts

Status: Complete.

Acceptance evidence:

- Separate server-side operation namespace implemented.
- Exactly one synthetic operation registered.
- Advisory recommendation mapping resolved locally.
- Existing advisory contracts preserved unchanged.
- Strict request validation rejects unexpected fields,
  unsupported fixtures, unknown operations, accessors,
  malformed objects, and caller-supplied authority claims.
- Registry lookups return independent definitions.
- Exported identifier and failure-reason arrays are frozen.
- Operation, intelligence, and existing grouping
  regression suites passed.
- TypeScript, lint, and production build passed.
- No operation handler or execution authority enabled.
- No provider requests or database operations performed.

- Establish a separate server-side operation namespace.
- Define operation identifiers and typed contracts.
- Register the first synthetic group creation operation.
- Define strict runtime input validation.
- Define bounded operation outcomes and failure reasons.
- Preserve existing advisory contracts unchanged.
- Verify unknown operations and unexpected fields are rejected.
- Verify returned registry definitions cannot mutate the registry.

### JAI-4C — Synthetic state and deterministic planning

Status: Complete.

Acceptance evidence:

- Implemented independent, disposable synthetic state
  instances for the Spring Invitational demonstration.
- Registered synthetic organizations, actors, leagues,
  seasons, event, teams, entries, athletes, and rosters.
- Established a fixture containing twelve teams,
  twenty-four athletes, and no existing groups.
- Verified consistency with the existing advisory fixture.
- Implemented simulated owner and administrator
  authorization with restricted-role, inactive-actor,
  unknown-actor, and cross-organization rejection.
- Enforced required organization capabilities, event
  lifecycle, league and season eligibility, workflow
  locks, roster integrity, and unique identities.
- Rejected existing groups and invalid roster relationships.
- Reused the existing Fisher-Yates shuffle utility with
  a deterministic, non-cryptographic random source.
- Proposed six groups containing twelve intact teams
  and twenty-four uniquely assigned athletes.
- Verified reproducible proposals, complete roster
  coverage, organization scope, and independent copies.
- Verified that planning leaves original synthetic state
  unchanged, including its group count and revision.
- Passed consolidated intelligence, operation, and
  existing grouping regression suites.
- Passed TypeScript, lint, and production build checks.
- No provider dispatch, persistent database access,
  approval authority, or operation execution enabled.

Limitations:

- Fixed team and athlete counts are demonstration-specific.
- Synthetic authorization assumes trusted local state
  and is not production authentication.
- The seeded shuffle is not cryptographic randomness
  or an official competition draw mechanism.
- Returned proposals are not approval credentials.
- State encapsulation, canonical plan integrity,
  explicit approval, replay protection, atomic execution,
  and independent post-execution verification remain
  subsequent implementation requirements.

- Define isolated synthetic organization and event state.
- Register synthetic actors, teams, athletes, and rosters.
- Establish explicit lifecycle and workflow lock rules.
- Validate organization ownership and active membership.
- Build deterministic team-preserving group plans.
- Verify complete roster coverage and unique assignments.
- Reject existing groups and inconsistent state.
- Keep planning free of state mutation.

### JAI-4D — Execution plans and approval

Status: Complete.

Acceptance evidence:

- Implemented versioned canonical serialization and
  SHA-256 state and execution-plan digests.
- Bound exact proposed assignments, operation, actor,
  organization, event, scope, and state revision.
- Verified immutable reviewed plans and rejection of
  modified, rehashed, malformed, and stale plans.
- Regenerated expected plans during validation rather
  than trusting caller-supplied digests.
- Introduced disposable, process-local approval sessions
  with privately owned synthetic state and actor identity.
- Required explicit confirmation of the reviewed digest.
- Protected approval records from external mutation.
- Bound approval receipts to their originating session,
  actor, operation, scope, plan, and state.
- Implemented cancellation and terminal single-use
  approval consumption.
- Rejected missing, modified, cross-session, cancelled,
  and repeated approval consumption attempts.
- Verified competing consumption calls within one
  JavaScript process succeed only once.
- Added defensive Proxy rejection at canonical
  serialization, confirmation, and preparation boundaries.
- Verified that Proxy traps cannot reenter protected
  session methods through these tested boundaries.
- Preserved original synthetic state throughout
  preparation, approval, cancellation, and consumption.
- Passed consolidated offline regression, TypeScript,
  lint, and production build checks.
- No provider dispatch, persistent integration, or
  application operation execution enabled.

Limitations:

- Synthetic actor selection is not production
  authentication or authorization.
- Plan digests identify content but are not credentials.
- Approval receipts are informational and do not
  independently authorize execution.
- Approval state and replay protection are process-local
  and disposable, not distributed or persistent.
- Programmatic test confirmation is not evidence of
  genuine human review.
- Canonical serialization is not a general-purpose
  hostile JavaScript sandbox.
- Controlled candidate execution, independent
  verification, atomic state publication, sanitized
  execution audit, and interactive operator review
  remain subsequent implementation requirements.

- Define canonical operation plans and SHA-256 digests.
- Bind plans to actor, scope, operation, and state revision.
- Require explicit local operator approval.
- Reject missing, modified, stale, and reused approvals.
- Prevent approval of unregistered or ineligible operations.
- Preserve independent copies of reviewed plans.

### JAI-4E — Controlled execution

Status: Up next.

- Resolve only registered deterministic handlers.
- Revalidate authorization and prerequisites.
- Apply approved changes to isolated candidate state.
- Enforce single-use approval and execution boundaries.
- Reject concurrent or repeated execution.
- Preserve original state on every failure.
- Do not invoke persistent application services.

### JAI-4F — Independent verification and audit

Status: Pending.

- Verify resulting state independently of handler success.
- Verify six groups and complete fixture roster coverage.
- Verify all twelve teams remain intact.
- Verify all twenty-four athletes appear exactly once.
- Verify unrelated state remains unchanged.
- Commit only independently verified candidate state.
- Record bounded sanitized outcomes.
- Test injected execution and verification failures.

### JAI-4G — Interactive terminal demonstration

Status: Pending.

- Use the existing offline mock intelligence pipeline.
- Display the recommendation and exact proposed changes.
- Require explicit operator approval before execution.
- Display independently verified resulting state.
- Demonstrate rejection, cancellation, and safe failure.
- Keep all state disposable and process-local.
- Make no paid provider requests.

### JAI-4H — Final acceptance and checkpoint

Status: Pending.

- Complete positive and negative operation regression tests.
- Verify advisory and engineering intelligence regressions.
- Verify existing group planning regressions.
- Verify TypeScript, lint, and production build.
- Verify operation isolation and absence of provider dispatch.
- Verify existing private experiment evidence protection.
- Document acceptance evidence and remaining limitations.
- Commit and synchronize the completed phase.

JAI-4 does not authorize JAI-5 implementation, persistent
application integration, automated engineering execution,
additional paid provider requests, merge, or deployment.

## JAI-5 — Application intelligence interface

- Build an optional SvelteKit intelligence workspace.
- Follow existing Tailwind and shadcn-svelte conventions.
- Provide natural-language objective entry.
- Display context and recommended actions.
- Display progress, clarification, and approval states.
- Preserve existing manual application workflows.
- Keep intelligence optional and disabled by default.

## JAI-6 — Persistent application integration

- Resolve authenticated actors on the server.
- Resolve organization scope on the server.
- Enforce existing domain authorization.
- Minimize approved provider context.
- Reuse existing deterministic domain services.
- Recheck authorization before execution.
- Preserve transactions and audit requirements.
- Verify tenant isolation and negative access cases.

No persistent integration may begin until its
applicable existing roadmap gates are satisfied.

## JAI-7 — Multi-step intelligent orchestration

- Maintain bounded workflow state.
- Select eligible operations based on current evidence.
- Execute only authorized operations.
- Independently verify each result.
- Reassess context after each completed operation.
- Support clarification, correction, and safe stopping.
- Enforce workflow budgets and operation limits.
- Reconcile interrupted operations before repetition.

## JAI-8 — Production readiness

- Complete security and authorization acceptance.
- Complete tenant isolation testing.
- Complete legacy application regression testing.
- Verify distributed usage and spending controls.
- Establish audit retention and privacy requirements.
- Verify interruption and recovery behavior.
- Complete GitHub CI and review.
- Obtain explicit merge and deployment authorization.

## Future application opportunities

These are candidates, not implementation commitments:

- Event preparation and readiness.
- Participant and athlete management assistance.
- Group assignment recommendations.
- Scoring workflow assistance.
- Fantasy league administration.
- Sponsorship recommendations.
- Funding readiness assessment.
- Expense categorization.
- Organization intelligence dashboard.
- Natural-language application navigation.
- Charity participant import assistance after
  existing charity and AI-2 gates are satisfied.

## Security boundaries

- Intelligence remains optional and disabled by default.
- Credentials remain private and server-only.
- No unrestricted database or shell access.
- No arbitrary provider-selected operation execution.
- No automatic authorization escalation.
- No real application data during initial research.
- No paid requests without explicit authorization.
- No Codex launches or engineering worker dispatch.
- No automatic application service startup.
- No persistent application changes during JAI-2.
- No weakening of existing security controls.
- No merge or deployment without authorization.

Provider output is untrusted until independently
validated. A recommendation is never an authorization.

## Change control

This roadmap supplements, rather than replaces:

- INTELLIGENCE-ROADMAP.md
- INTELLIGENCE-ARCHITECTURE.md
- INTELLIGENCE-RUNNER-PROVISIONING.md
- CHARITY-EVENT-ROADMAP.md
- AGENTS.md

Existing acceptance gates remain authoritative.

Coordinate shared intelligence changes with the
engineering development track before integration.

Use separate working directories or worktrees if
both development tracks are active concurrently.

Record actual verification evidence before review.

## Technical references

See JEV-APPLICATION-REFERENCE.md for provider
concepts, implementation patterns, and research links.

## Adaptive workflows and existing interfaces

Preserve three complementary interaction modes:

- Manual application navigation and forms.
- Existing guided wizards.
- Optional Jev-assisted workflows.

Reuse deterministic application services across modes.

Existing setup compatibility rules and creation
mappings remain authoritative.

Introduce intelligent navigation and wizard assistance
incrementally. Adaptive sequencing must not bypass
mandatory prerequisites or authorization.

See FLIHUB-DESIGN-PATTERNS.md for presentation conventions
and APPLICATION-CAPABILITY-CATALOG.md for the initial
application capability inventory.

## Multi-activity development strategy

Disc golf and charity run/walk are initial activity
implementations, not universal architectural templates.

FliHub already defines 15 activity preview choices.

Before broadly retrofitting existing workflows:

1. Inventory existing activity and capability contracts.
2. Establish the offline intelligence foundation.
3. Complete authorized read-only intelligence verification.
4. Evaluate an unimplemented activity as a development pilot.
5. Identify reusable and activity-specific requirements.
6. Implement an approved end-to-end pilot after applicable gates.
7. Evaluate a substantially different second activity.
8. Review existing disc golf and charity architecture using
   evidence from the completed pilots.

Candidate pilots:

- Pickleball for match-based competition.
- Car shows for judged events and non-human entries.
- Golf for stroke-based capability reuse.

Pilot selection remains subject to requirements review
and explicit approval.

Do not activate unsupported activity configurations
merely because they exist in the preview catalog.

## Shared design language

Future application and authorized engineering intelligence
should preserve established FliHub design conventions:

- Collapsible sections with chevrons.
- Amber-driven attention and next-action guidance.
- Multi-step forms with deterministic validation.
- Compact navigation and count badges.
- Zebra-pattern tables and responsive layouts.
- Honest progress and completion indicators.

Future intelligent presentation may select from approved
registered component patterns. The application remains
responsible for rendering and validation.

No arbitrary provider-generated interface code may execute.

These additions do not waive AI-1F, AI-2, CE-3D,
or any existing security and acceptance gates.

## JAI-2A implementation checkpoint

Date: 2026-11-25

Status: Complete — local acceptance passed.

### Implemented

- Typed application objectives, requests and advisory outcomes.
- Five registered recommendation-only capabilities.
- Objective compatibility and bounded candidate selection.
- Strict request and normalized recommendation validation.
- Unknown, duplicate and excluded candidate rejection.
- Explicit abstention and safe confidence handling.
- Independent application intelligence tests.

The provisional recommendation confidence threshold is 0.8.
Confidence does not grant application permissions or authorize execution.

### Verification evidence

- Application intelligence tests: 16 passed, zero failed.
- Existing intelligence regression tests: 11 passed, zero failed.
- TypeScript verification passed.
- Lint verification passed.
- Production build passed.
- Existing pickleball organization setup preview completed through review.
- Unsupported pickleball functionality remained clearly identified as planned.
- Existing intelligence foundation stash preserved.

### Boundaries preserved

- No live Jev requests or paid provider usage.
- No Codex execution.
- No database access or persistent application mutations introduced.
- No existing wizard or component modifications.
- No application operation execution.
- Existing engineering and charity acceptance gates remain unchanged.

### Outstanding work

- JAI-2B: validated synthetic context and context-based eligibility.
- Provider-specific response validation and shared service integration.
- Application director and interactive terminal.
- Full offline application intelligence acceptance.
- Explicit authorization before live provider verification.
- GitHub CI and final integration acceptance.

## JAI-2B implementation checkpoint

Date: 2026-11-25

Status: Complete — local acceptance passed.

### Implemented

- Minimized and strictly validated synthetic event context.
- Six independent synthetic event scenarios.
- Deterministic context-based recommendation eligibility.
- Locally constructed bounded decision requests.
- Rejection of malformed, inconsistent and unsupported context.
- Rejection of unexpected private fields and accessor properties.
- Clarification recommendations when required information is unknown.
- Rejection of context-ineligible intelligence recommendations.

### Verification evidence

- Application intelligence tests: 37 passed.
- Existing intelligence regression tests: 11 passed.
- Total intelligence tests: 48 passed.
- TypeScript verification passed.
- Lint verification passed.
- Production build passed.
- Existing intelligence foundation stash preserved.

An initial test initialization failure occurred because additional
Vite module imports followed registered tests. Moving all module
initialization before test registration resolved the failure.
No application source changes or weakened assertions were required.

### Boundaries preserved

- Synthetic draft disc golf context only.
- No production event readiness or authorization claims.
- No database access or persistent application mutations introduced.
- No live Jev requests or paid provider usage.
- No Codex execution.
- No existing wizard or component modifications.
- Existing engineering and charity acceptance gates remain unchanged.

### Outstanding work

- JAI-2C: verify and implement supported Jev intelligence primitives.
- JAI-2D: bounded multi-question requests.
- JAI-2E: application intelligence director.
- JAI-2F: interactive application intelligence terminal.
- JAI-2G: complete offline acceptance.
- JAI-3: explicitly authorized live Jev demonstration.
- GitHub CI and final integration acceptance.

## JAI-2C implementation checkpoint

Date: 2026-11-25

Status: Complete — offline primitive acceptance passed.

### Implemented

- Typed Choice, Score and Noul question and answer contracts.
- Reusable primitive response validation.
- Registered Choice selection and probability validation.
- Score range, weighted mean and rubric legend validation.
- Noul probability validation.
- Strict response-field validation.
- Rejection of unexpected execution and authorization fields.
- Independent normalized response copies.
- Preservation of valid low-confidence and null-confidence judgments
  for subsequent application decision policy.

### Verification evidence

- Choice validation: 7 tests passed.
- Score validation: 10 tests passed.
- Noul validation: 3 tests passed.
- Shared primitive validation: 7 tests passed.
- Existing application intelligence: 37 tests passed.
- Existing engineering intelligence: 11 tests passed.
- Total intelligence tests: 75 passed, zero failures.
- TypeScript verification: zero errors and zero warnings.
- Prettier and ESLint passed.
- Production build passed.
- Original intelligence foundation stash preserved.

### Boundaries preserved

- Offline synthetic response fixtures only.
- No live Jev requests or paid provider usage.
- No new network client.
- Existing provider and engineering contracts unchanged.
- No database access or application operation execution.
- No Codex execution.
- No existing application interface modifications.

### Outstanding requirements

- Runtime validation of registered question definitions.
- Bounded multi-question request construction.
- Shared provider dispatch and response integration.
- Shared budget, timeout, rate and concurrency verification.
- Application decision policy and consistency checks.
- Live provider compatibility verification.
- GitHub CI and final integration acceptance.

The local rubric length restriction and score rounding tolerance
remain provisional implementation choices. Primitive validation
does not establish application readiness or operation authorization.

### JAI-2D implementation checkpoint

Status: Complete — offline technical acceptance passed.

Implemented:

- Registered five-question application assessment batches.
- Independent Choice, Score and Noul answer validation.
- Shared process-local dispatch resource controller.
- Single-use budget reservation reconciliation.
- Reported usage snapshots protected from subsequent result mutation.
- Synthetic application request snapshots.
- Deterministic mock application assessment provider.
- Separate sanitized application audit metadata.
- Native Node.js-compatible TypeScript module imports.
- Shared engineering and application rate and concurrency limits.

Verification evidence:

| Verification                                   | Passing tests |
| ---------------------------------------------- | ------------: |
| Application contracts and eligibility          |            37 |
| Intelligence primitives                        |            27 |
| Registered application batches                 |            22 |
| Existing intelligence regression               |            11 |
| Dispatch resource security                     |            11 |
| Application service and cross-path integration |            17 |
| Total                                          |           125 |

Additional verification:

- TypeScript and Svelte diagnostics: zero errors and warnings.
- Prettier and ESLint: passed.
- Production build: passed.
- Git diff whitespace verification: passed.
- Existing intelligence-foundation stash preserved.

Boundaries and outstanding requirements:

- Application assessments remain mock-only.
- Live application dispatch is disabled even when Jev is configured.
- Mock confidence and readiness values are synthetic, not measured AI
  confidence or official event completion.
- Cross-path resource sharing is verified in mock mode.
- Live multi-question provider compatibility and application token
  accounting remain unverified.
- Process-local resource controls are not distributed account limits
  or authorization boundaries.
- No paid application requests, Codex execution, application operations,
  persistent application data changes or deployment were performed.
- AI-1F authenticated engineering acceptance remains independently gated.
- AI-2 and CE-3D remain deferred.

Next: JAI-2E — application intelligence director and recommendation policy.

## JAI-2E implementation checkpoint

Status: Complete — offline synthetic advisory director.

### Completed implementation

- JAI-2E.1: Application director contracts and deterministic decision policy.
- JAI-2E.2: Confidence thresholds, clarification handling, conflicting judgments,
  and essential prerequisite priority.
- JAI-2E.3: Structured advisory plans with local facts, eligible recommendations,
  alternatives, and qualitative readiness assessments.
- JAI-2E.4: Deterministic human-readable explanation templates.
- JAI-2E.5: Unified application advisory service integration.
- JAI-2E.6: Local acceptance and documentation checkpoint.

### Unified advisory service

The shared intelligence service exposes `adviseApplication(input)`.

A successful response contains:

- Validated primitive assessment answers.
- A structured application advisory plan.
- A deterministic human-readable explanation.
- Explicit mock-provider provenance.

The existing `assessApplication()` and engineering intelligence interfaces
remain available.

Each advisory request uses one assessment dispatch. Local planning and
explanation generation require no additional provider requests.

### Decision policy

- Application recommendations remain restricted to registered capabilities
  and locally eligible context.
- Missing required context produces clarification.
- Known missing date or venue prerequisites take priority over other
  preparation recommendations.
- Objective and recommendation confidence thresholds are provisionally 0.8.
- Clarification probability at or above 0.8 withholds preparation advice.
- Qualitative readiness scores cannot establish official readiness,
  authorize operations, or replace deterministic application rules.
- Abstention and clarification suppress unrelated preparation advice.
- All recommendations remain advisory only.

### Local acceptance evidence

- 209 intelligence regression tests passed.
- All twelve registered objective and fixture combinations supported.
- Unified assessment, plan, and explanation consistency verified.
- In-flight request mutation resistance verified.
- Shared rate and concurrency enforcement verified.
- Disabled and unavailable outcomes preserved.
- Sanitized assessment audit metadata verified.
- Mock-only application dispatch verified.
- Unified service smoke test reported zero external network calls.
- TypeScript checks passed.
- Prettier and ESLint passed.
- Production compilation passed.
- Existing engineering intelligence behavior preserved by regression tests.

### Limitations and outstanding gates

- Live Jev application dispatch remains disabled.
- The live multi-question API contract remains unverified.
- Confidence thresholds are provisional and not empirically calibrated.
- Synthetic readiness judgments are not production readiness measurements.
- Resource controls remain process-local.
- Assessment auditing does not independently record final advisory
  presentation outcomes.
- Plans and explanations perform separate deterministic validation passes.
- No authenticated application context, organization data, or operational
  execution is introduced.
- No paid provider requests, Codex invocations, database mutations,
  deployment, or production capability activation occurred in this increment.
- GitHub CI and final release acceptance remain outstanding.
- Existing engineering security qualification gates remain unchanged.
- AI-2 and charity CE-3D remain deferred.

### Next implementation phase

JAI-2F: Interactive offline application intelligence terminal.

Introduce a separate `npm run jev:app` console using the unified advisory
service, registered synthetic objectives, and registered fixtures.

The terminal must remain isolated from application operations, engineering
execution, live provider dispatch, and persistent application data.

### JAI-2F completion checkpoint

Completed November 25, 2026.

The application intelligence terminal is implemented as a separate
development interface, launched using `npm run jev:app`.

#### Delivered capabilities

- Interactive terminal with seven registered menu actions.
- Event preparation and readiness assessment objectives.
- Six registered synthetic event scenarios.
- Read-only capability and scenario inspection.
- Unified application advisory service integration.
- Structured event context, recommendations, reasoning, alternatives
  and qualitative readiness presentation.
- Explicit clarification when required information is missing.
- Amber attention indicators and explicit advisory-only notices.
- In-memory session history with replay without additional dispatch.
- Resource reporting with independent lifetime session counters.
- Bounded retention of the latest 50 responses.

#### Security boundaries

- Offline mock provider explicitly selected.
- Live provider configuration overrides ignored.
- Injected external provider fetch function blocks requests.
- Blocked provider fetch attempts reported.
- Rate limit of 10 requests per minute.
- Concurrency limit of one.
- Interactive terminal required.
- Invalid selections and cancelled scenarios do not dispatch.
- No persistent session storage.
- No application operation execution.
- No Codex worker invocation.
- No paid application provider requests.
- No real organization or participant data supplied.

#### Verification evidence

Local acceptance completed successfully:

- Nine automated pseudo-terminal regression tests passed.
- All 209 existing intelligence regression tests passed.
- Combined total: 218 passing tests, zero failures.
- Svelte diagnostics: zero errors and zero warnings.
- Prettier and ESLint passed.
- Server and client builds passed.
- Git diff validation passed.

The terminal regression suite verifies provider configuration isolation,
invalid selections, cancellation, capability browsing, advisory
responses, clarification, history replay, rate limiting, bounded
history, session counters, interruption and session isolation.

The rate-limit and retention exercise submits 52 offline assessment
attempts, retains the latest 50 responses and preserves lifetime
session counters.

#### Repeatable verification

```bash
python3 tests/application-intelligence-terminal.py
node --test tests/*intelligence*.test.mjs
npm run check
npm run lint
npm run build
git diff --check
```

#### Limitations and outstanding gates

- The terminal regression harness uses Linux-compatible Python
  pseudo-terminal support.
- The rapid rate-limit test assumes completion within one minute.
- Resource controls are process-local.
- The blocked-fetch counter is not a system-wide network monitor.
- Existing SvelteKit alias deprecation and adapter-auto notices remain.
- Live application provider contracts and usage accounting require
  verification before any paid assessment.
- GitHub CI, full legacy browser regression and production acceptance
  are not established by this checkpoint.
- Authenticated engineering worker execution remains separately gated.
- AI-2 CSV mapping and charity CE-3D remain deferred.
- No merge or deployment is authorized by this checkpoint.

JAI-2F implementation and local terminal acceptance are complete.

Next: JAI-2G consolidated offline application intelligence acceptance.
JAI-3 live synthetic assessment remains subject to explicit authorization.

## JAI-2H implementation checkpoint

Date: 2026-11-25

Status: Implemented — browser functional walkthrough passed.
Server security and consolidated regression acceptance pending.

### Delivered interface

- Development route: /development/intelligence.
- Four independent workspace sections.
- Two registered synthetic objectives.
- Six registered synthetic event scenarios.
- Five registered advisory capabilities.
- Unified offline advisory service integration.
- Lucide icons, zebra rows and amber guidance.
- Structured event facts and qualitative readiness.
- Clarification and advisory-only notices.
- Expandable capability and history records.
- Always-visible historical retrieval controls.
- Page-memory history limited to 50 records.
- Session usage dashboard and configured resource limits.

### Browser verification evidence

- Spring Invitational displayed 24 participants and zero groups.
- Group assignment recommendation and 2.00 / 4 readiness displayed.
- Venue Missing produced a prerequisite review recommendation.
- Information Missing distinguished unknown participants from zero.
- Clarification withheld the qualitative readiness score.
- Workspace navigation preserved assessment results.
- Repeated assessments retained independent history records.
- Historical retrieval preserved original results and timestamps.
- Final browser counters showed one assessment submission,
  one advisory response and three historical views.
- Historical retrieval did not increase assessment submissions.
- Final history capacity displayed 1 / 50.
- Offline paid provider cost displayed $0.00.

### Configured boundaries

- Development-only route access.
- Authentication required by server handlers.
- Explicit mock provider configuration.
- External provider fetch blocked.
- Registered objective and scenario validation.
- Ten requests per minute and one concurrent request.
- No application operation handlers.
- No persistent history storage.
- No real organization context supplied to the advisory service.

Browser statistics are page-local. Configured server limits
are process-local. Neither establishes distributed resource
controls or provider billing acceptance.

### Outstanding acceptance

- Verify development and production route access.
- Verify unauthenticated action rejection.
- Verify malformed and unexpected form rejection.
- Verify ordinary and enhanced form submission behavior.
- Verify response cache policy.
- Verify cross-origin request protection.
- Verify offline configuration isolation.
- Complete consolidated JAI-2G regression acceptance.
- Review the complete source diff.
- Commit and push the verified development checkpoint.

Live provider compatibility, GitHub CI, production integration
and existing engineering and charity gates remain outstanding.

No live provider request, Codex invocation, merge or deployment
is authorized by this checkpoint.

### JAI-2G / JAI-2H — Consolidated offline acceptance

**Status:** Offline implementation and scoped local acceptance passed.
GitHub CI, PR acceptance and merge remain outstanding.

#### Completed capabilities

- Registered application objectives and recommendation capabilities.
- Structured synthetic event context and deterministic eligibility.
- Typed Choice, Score and Noul response validation.
- Registered multi-question assessment batches.
- Shared dispatch resource controls.
- Application intelligence director and advisory plans.
- Deterministic explanations and manual fallback behavior.
- Interactive application intelligence terminal.
- Development-only browser intelligence playground.
- Assessment, History, Capabilities and Usage workspaces.
- Bounded browser-session history and replay without reassessment.
- Shared FliHub design patterns and semantic iconography.

#### Security and infrastructure verification

- Playground requires freshly verified PocketBase authentication.
- Missing and mismatched assessment origins are rejected.
- Playground responses receive a no-store cache policy.
- Production-mode assessment requests are rejected.
- Managed Vite startup explicitly receives the local PocketBase URL.
- Managed service startup excludes the inherited TypeSafe API key.
- Managed shutdown preserves existing application data.
- Missing and conflicting inherited PocketBase configuration are
  covered by permanent service launcher regression tests.

#### Acceptance evidence

- Consolidated intelligence regression suite passed.
- Application terminal regression suite passed.
- Unified development regression suite passed.
- TypeScript and Svelte verification passed.
- Full repository lint passed.
- Production build passed.
- Git diff integrity verification passed.
- Authenticated browser assessment returned HTTP 200 with JSON
  content and no-store caching.
- Spring Invitational returned the expected group assignment
  recommendation and qualitative readiness of 2.00 / 4.
- Unauthenticated development page and ordinary form requests
  redirected to login.
- Unauthenticated development JSON assessment returned HTTP 401.
- Unauthenticated production preview page redirected to login.
- Production preview JSON assessment returned HTTP 404.
- Observed playground HTTP responses included no-store caching.
- No paid Jev requests were made during JAI-2 implementation
  and acceptance.

#### Remaining limitations and deferred verification

- Live Jev Choice, Score, Noul and multi-question wire contracts
  require independent confirmation before live dispatch.
- Authenticated production rejection has handler-level coverage
  but has not been verified through an authenticated HTTP session.
- Cross-origin rejection has handler-level coverage but has not
  been independently verified through authenticated HTTP requests.
- Concurrent real HTTP authentication isolation remains unverified.
- An EventEmitter listener warning was observed in browser tooling
  but was not reproduced in the inspected Vite logs.
- The playground remains present in the route source and is
  protected by development-mode and authentication restrictions.
- Managed service readiness does not independently establish
  complete application backend connectivity.
- Existing ordinary application retained-session behavior during
  PocketBase outages remains unchanged. Broader authentication
  review is separate from the playground acceptance.
- Process-local resource controls are not distributed or
  account-wide billing controls.
- GitHub CI, PR review, merge and deployment acceptance remain open.

#### Next phase

JAI-3 — Controlled live Jev application intelligence verification.

Before live dispatch:

1. Confirm current official provider API contracts.
2. Confirm supported model and multi-question request structure.
3. Validate response schemas and usage accounting.
4. Establish a bounded synthetic request and maximum cost.
5. Obtain explicit authorization for the individual paid request.
6. Validate and document the result without executing operations.

Application mutations, real organization data, unrestricted
engineering execution, authenticated Codex dispatch, AI-2 CSV
mapping and CE-3D remain outside this acceptance checkpoint.

No merge or deployment is authorized by this checkpoint.

## JAI-3 — Secure live experiment preparation

Date: 2026-11-25

Status: JAI-3D5 complete — scoped local offline acceptance passed.
JAI-3D6 documentation and Git checkpoint in progress.
Live provider qualification and paid assessment remain pending.

### Completed implementation

- JAI-3A: Development checkpoint and environment verification.
- JAI-3B: Provider documentation research.
- JAI-3C: Local contract and implementation gap analysis.
- JAI-3D1: Reusable bounded Jev HTTP transport.
- JAI-3D2: Offline application provider adapter.
- JAI-3D3: Shared usage accounting.
- JAI-3D4: Secure dedicated application experiment runner.
- JAI-3D5: Full scoped offline regression and acceptance.

### Experiment boundary

The dedicated terminal command is:

    npm run jev:app:experiment

The existing interactive application terminal and browser
playground remain mock-only.

The experiment runner provides an offline preview by default.
The preview exposes the exact registered synthetic request,
request digest, question count and estimated reservation.

The live execution path is implemented but remains protected
by a disabled source-controlled release lock.

### Registered experiment

| Property                                | Value                      |
| --------------------------------------- | -------------------------- |
| Experiment                              | synthetic_event_assessment |
| Objective                               | prepare_tournament         |
| Fixture                                 | spring_invitational        |
| Configured model                        | jev-1.14.0                 |
| Questions                               | 5                          |
| Request body bytes                      | 1929                       |
| Maximum request attempts                | 1                          |
| Timeout                                 | 10000 ms                   |
| Reserved input tokens                   | 65536                      |
| Estimated reservation USD               | 0.002752512                |
| Automatic retries                       | Disabled                   |
| Application execution                   | Not implemented            |
| Paid requests during offline acceptance | 0                          |

Exact request SHA-256:

    544c28a28715dbb4189dd811500a40909abd2c19e00f125a2c07b1a04f563964

The reservation is a local estimated cost, not a guaranteed
provider invoice ceiling.

### Security and evidence controls

- Explicit authorization tied to the exact serialized request.
- Credentials accessed by the CLI only after authorization
  and release checks.
- Fixed repository-relative private evidence storage.
- Exclusive persistent authorization claim.
- Durable dispatch intent recorded before network access.
- Existing conflicting outcome evidence blocks dispatch.
- Single-use bounded provider dispatch.
- Transport abort and response size enforcement.
- Strict model, answer and usage validation.
- Deterministic advisory plan and explanation construction.
- Sanitized durable outcome evidence before returning an assessment.
- Authorization remains consumed after failures and timeouts.
- No automatic retry or automatic evidence reset.

Private evidence is stored under the ignored
`.flihub-intelligence/` directory.

A dispatch intent does not prove provider receipt.
Missing outcome evidence does not prove that no charge occurred.

### Verification evidence

| Experiment acceptance area               | Passing tests |
| ---------------------------------------- | ------------: |
| Authorization validation                 |             8 |
| Dispatch, advisory integration and audit |            26 |
| Persistent authorization claim           |             8 |
| Durable evidence storage                 |             6 |
| Integrated orchestration                 |             9 |
| Total experiment-specific tests          |            57 |

Additional local acceptance:

- Scoped intelligence regression suite passed.
- TypeScript and Svelte diagnostics: zero errors and warnings.
- Prettier and ESLint passed.
- Production build passed.
- Exact request bytes and SHA-256 preserved.
- Correct authorization cannot bypass the release lock.
- Private evidence paths are ignored by Git.
- No persistent experiment evidence created.
- No paid application provider requests.
- No persistent application data changes.
- Git diff whitespace validation passed.

The aggregate intelligence regression count was not retained
in the supplied acceptance output and is not asserted here.

### Limitations and outstanding requirements

- Live Choice, Score, Noul and mixed-question wire compatibility
  remain unverified.
- Official provider model availability, exact schemas, confidence
  semantics, usage accounting and current pricing require final
  qualification before release.
- Local response validation is intentionally strict and may reject
  otherwise legitimate provider responses until qualified.
- Confidence thresholds remain provisional.
- Persistent claims protect one experiment in the configured local
  filesystem, not distributed workers or independent checkouts.
- The source-controlled release lock is a development safeguard,
  not an authentication mechanism.
- Evidence storage assumes a trusted local operating-system user.
- Filesystem failures can leave incomplete evidence and require
  manual investigation without automatic retry.
- Local token reservations do not establish account-wide billing limits.
- The scoped JAI-3 regression does not replace the outstanding
  authenticated HTTP security and legacy browser verification.
- Existing SvelteKit alias deprecation remains a maintenance item.
- GitHub CI, PR review, merge and deployment remain outstanding.
- AI-1F authenticated engineering execution remains separately gated.
- AI-2 and charity CE-3D remain deferred.

### Remaining JAI-3 phases

- JAI-3D6: Document, commit and push the offline checkpoint.
- JAI-3E: Final official provider contract and exact request review.
- JAI-3F: Explicitly authorize and execute one paid synthetic assessment.
- JAI-3G: Validate judgments, usage, estimated cost and durable evidence.
- JAI-3H: Document live results and remaining release gates.

No paid request, merge, deployment, application mutation or
engineering worker execution is authorized by this checkpoint.

## JAI-3H — First live application assessment closeout

Date: November 25, 2026.

Status: Live technical acceptance completed for the registered
synthetic application assessment. Production release is not authorized.

### Authorized experiment

- Provider: TypeSafe AI / Jev.
- Model: `jev-1.14.0`.
- Objective: `prepare_tournament`.
- Fixture: `spring_invitational`.
- Request size: 1,929 UTF-8 bytes.
- Request SHA-256:
  `544c28a28715dbb4189dd811500a40909abd2c19e00f125a2c07b1a04f563964`.
- One authorized transport attempt.
- Five independent questions in one request.
- No automatic retries.
- No real organization data.
- No application mutations.
- No engineering or Codex execution.

### Observed provider results

| Judgment                   | Observed result             |     Confidence |
| -------------------------- | --------------------------- | -------------: |
| Objective                  | Assess event readiness      |           0.48 |
| Next recommendation        | Review scoring requirements |           0.53 |
| Qualitative readiness      | 1.68 out of 4               |           0.69 |
| Clarification needed       | Noul 0.93                   | Not applicable |
| Prerequisite review needed | Noul 0.90                   | Not applicable |

All five answers passed structural validation.

The provider selected an objective different from the registered
objective. The deterministic application director abstained with
`objective_mismatch`.

No next step, alternatives or readiness score were presented as an
accepted advisory recommendation. The explanation directed the user
toward manual review.

The prerequisite-review advisory flag remained true.

This is successful technical and safety acceptance, not evidence
that the provider supplied a useful actionable recommendation.

### Observed usage and latency

| Measurement                   |       Result |
| ----------------------------- | -----------: |
| Reserved input tokens         |       65,536 |
| Reported input tokens         |          684 |
| Reported output tokens        |          179 |
| Estimated reserved cost       | $0.002752512 |
| Estimated reported usage cost | $0.000028728 |
| Estimated cost in nanodollars |       28,728 |
| Assessment duration           |       161 ms |
| Audit duration                |       162 ms |
| Transport attempts            |            1 |
| Automatic retries             |            0 |

The local reservation was reconciled against reported usage.

Approximately 1.04 percent of the input-token reservation was
consumed. The remaining local reservation was released.

These are provider-reported usage measurements and locally calculated
cost estimates. Actual invoice charges have not been independently
verified.

### Security and evidence

The exact authorized request digest was verified before dispatch.

The private authorization claim, dispatch intent and outcome evidence
were persisted under `.flihub-intelligence/`.

The outcome records one transport attempt, the expected model,
validated usage and successful reservation reconciliation.

The live release lock was restored after execution. The working tree
was clean and synchronized with the remote branch.

The original private evidence must remain intact. It must not be
deleted to permit another experiment or committed to GitHub.

### Offline regression preservation

`tests/application-intelligence-live-response.test.mjs` preserves
a sanitized reconstruction of the observed synthetic response.

Six regression tests cover:

- Structural validation of all five observed judgments.
- Deterministic objective-mismatch abstention.
- Recommendation-only and non-execution boundaries.
- Safe manual-review explanation.
- Exact estimated usage cost.
- Observed weighted-score rounding.

The fixture is reconstructed from validated terminal output rather
than a captured raw HTTP response.

No additional provider request is required to run these tests.

### Intelligence-quality findings

The live provider did not reproduce the deterministic mock judgments.

Future evaluation should distinguish explicitly selected registered
objectives from ambiguous natural-language objectives.

For explicitly selected objectives, consider using the registered
objective directly rather than requiring redundant model classification.

Question instructions, context sufficiency and rubric design should
be evaluated before changing confidence thresholds.

The existing 0.8 thresholds remain unchanged and provisional.

A single successful transport experiment does not establish model
reliability, confidence calibration or recommendation quality.

### Remaining boundaries

The following remain outside this acceptance:

- General production readiness and deployment authorization.
- Actual provider invoice verification.
- Broad intelligence-quality evaluation.
- Distributed resource controls and replay protection.
- Outstanding authenticated HTTP and cross-origin security checks.
- Concurrent HTTP authentication isolation.
- Outstanding legacy browser regression and GitHub CI verification.
- Engineering intelligence security acceptance.
- Real organization data access or application execution.

The next planned application intelligence phase is JAI-4:
controlled synthetic application operations.

JAI-4 must preserve deterministic authorization, validation,
transactional integrity, auditability and verification.

JAI-4 is not authorized to operate on real organization data.

No additional paid provider requests, merge or deployment are
authorized by this closeout.
