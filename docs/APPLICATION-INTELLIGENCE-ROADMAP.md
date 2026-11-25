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
