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
| JAI-2 | Offline application intelligence foundation  | In progress |
| JAI-3 | Authorized live read-only demonstration      | Pending     |
| JAI-4 | Controlled disposable application operations | Pending     |
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
