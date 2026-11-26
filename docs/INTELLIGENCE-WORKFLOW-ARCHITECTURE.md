# FliHub — Embedded Intelligence Workflow Architecture

Date: November 26, 2026.

Status: Owner-directed architectural decision.
Implementation and acceptance remain subject to the applicable roadmaps.

Baseline: `a347abe` — Build protected offline objective assessment.

## Governing principles

**Jev supplies intelligence. FliHub retains control.**

**FliHub guides the process. Jev helps improve the decisions.**

Intelligence is a reusable, optional application capability.
It is not the application, workflow authority, permission system,
database interface or execution engine.

## Purpose

Establish embedded contextual intelligence as the primary
application intelligence strategy for FliHub.

Preserve existing manual interfaces and structured guided
workflows. Introduce focused intelligence assistance where
it improves decisions, explanations, preparation or readiness.

This decision refines the application intelligence roadmap.
It does not discard completed work or authorize new execution,
provider disclosure, spending, merge or deployment.

## Existing architectural foundation

Architecture inspection at the baseline identified:

- SetupWizard.svelte: structured organization creation.
- GuidedEventSetup.svelte: event preparation and review.
- LeagueSeasonSetup.svelte: guided league and season creation.
- OrganizationSetupChecklist.svelte: setup guidance.
- Deterministic setup compatibility and validation helpers.
- Existing SvelteKit actions and PocketBase domain boundaries.
- Advisory application intelligence contracts.
- Registered synthetic operation definitions.
- Separate planning, approval, authorization, verification
  and audit modules.
- Protected development intelligence interfaces.

Existing guided workflow documentation describes review,
server-side validation and transactional creation.

The inspected operation registry currently supports only
create_synthetic_group_assignments, associated with the
advisory capability plan_group_assignments.

These findings establish architectural compatibility.
They do not constitute new runtime or production acceptance.

## WA-01 — Structured workflows remain primary

Use existing application screens, guided wizards, forms
and checklists as the primary interaction model.

Do not require users to formulate natural-language prompts
to complete ordinary application tasks.

Preserve manual navigation and existing advanced tools.

Introduce new guided workflows incrementally where justified.
Do not replace working interfaces solely to introduce AI.

## WA-02 — FliHub owns workflow progression

FliHub defines:

- Workflow steps and supported transitions.
- Required inputs and mandatory prerequisites.
- Compatible selections and dependent answers.
- Eligibility and deterministic validation.
- Review and confirmation requirements.
- Completion and authoritative execution status.

Jev may recommend an eligible next action but cannot
change workflow state or bypass mandatory dependencies.

Earlier input changes must invalidate incompatible
dependent answers and stale consequential reviews.

## WA-03 — Embedded contextual intelligence

Place intelligence assistance within the relevant
application screen or workflow step.

Candidate assistance includes:

- Explaining missing prerequisites.
- Reviewing preparation and readiness.
- Comparing eligible configuration choices.
- Suggesting group arrangements.
- Identifying potential inconsistencies.
- Explaining recommended next actions.

These are candidate capabilities, not activation commitments.

Prefer focused assistance over a general-purpose chat
interface when the application already understands the task.

## WA-04 — FliHub constructs intelligence requests

The application defines registered objectives, eligible
capabilities, permitted context fields and response contracts.

The server resolves the authenticated actor, organization,
capability permissions and authoritative application facts.

Treat browser selections and unsaved drafts as untrusted
inputs requiring validation.

Construct minimized, task-specific provider requests.
Distinguish verified facts, draft inputs and unknown values.

Do not send complete application records, private notes,
participant identities, credentials or unrestricted source
material to a provider.

Any new provider data category requires explicit approval.

Do not initiate paid requests through navigation, rendering,
step transitions or historical retrieval.

## WA-05 — Natural-language input remains optional

Natural-language objective entry may supplement structured
controls where it provides meaningful value.

A focused intelligence action should normally supply its
registered objective and context without requiring a prompt.

Bound and validate any optional free-text input.
Reject unsupported objectives conservatively.

Preserve the existing protected natural-language assessment
implementation and its recorded acceptance evidence.

## WA-06 — Recommendations remain advisory

Provider responses are untrusted recommendations.

Validate responses against registered contracts and current
eligible capabilities.

Clearly distinguish recommendations, clarification,
abstention, unavailable and disabled outcomes.

Do not represent provider confidence as permission,
verified readiness or authoritative completion.

Provider output must never directly execute commands,
write records, grant permissions or render executable code.

## WA-07 — Conventional workflows remain functional

Existing deterministic and manual paths must continue
working when intelligence is disabled, unavailable,
inconclusive, rejected or over budget.

Do not make successful provider responses prerequisites
for otherwise valid conventional workflow progression.

Retain existing deterministic defaults and suggestions.

Never weaken domain validation to accommodate fallback.

## WA-08 — Reusable exact review and authorization

Separate the source of a proposed action from its
authorization, review and execution requirements.

Conventional and intelligence-assisted proposals should
reuse appropriate deterministic domain services.

For registered controlled operations:

1. Validate the requested operation and current context.
2. Resolve eligibility and authorization independently.
3. Construct a canonical server-owned execution plan.
4. Present the exact consequential changes.
5. Obtain the required explicit confirmation.
6. Recheck authorization, prerequisites and state.
7. Execute through the approved deterministic handler.
8. Independently verify and record the actual outcome.

Bind approval to the exact reviewed plan, current state,
actor and applicable workflow generation.

Reject tampered, stale, expired and replayed approvals.
Invalidate outstanding reviews when relevant inputs change.

Preserve transaction boundaries, atomic publication,
idempotency or replay controls, and audit requirements.

Existing conventional operations retain their current
authorization and confirmation contracts. This decision
does not require retrofitting every existing form with
the synthetic approval protocol.

JAI-5D must avoid unnecessary coupling between reusable
review logic, natural-language objectives, Jev-specific
responses and workspace presentation.

The existing controlled operation engine remains
synthetic-only until persistent integration is separately
implemented and accepted.

## WA-09 — Protected development workspace

Preserve the protected intelligence workspace as a
development, demonstration, diagnostic and acceptance surface.

Use it to verify advisory behavior, exact review,
authorization, synthetic execution, history and audit.

Preserve existing terminal exercises and the advisory
development playground.

The protected workspace is not the required entry point
for ordinary end-user application workflows.

Keep its existing development restrictions, synthetic
fixtures, session isolation and disabled-by-default access.

Do not expose the workspace in production or introduce
persistent application mutations through it.

## WA-10 — Embedded intelligence before orchestration

Prioritize focused intelligence inside existing structured
workflows before general conversational orchestration.

Complete the protected synthetic workspace acceptance.

Then establish controlled contextual application integration
after all applicable gates are satisfied.

Introduce bounded intelligence-assisted coordination of
structured workflows only after individual capabilities
have been independently accepted.

General conversational multi-step orchestration remains
a future candidate requiring separate architecture review,
authorization and acceptance.

## Target interaction model

The following describes the intended architecture,
not a claim of completed integration.

    FliHub structured workflow
              |
       Current step and context
              |
       +------+------+
       |             |
    Manual       Optional Jev
    choices      recommendation
       |             |
       +------+------+
              |
       Validated proposal
              |
       Deterministic review
              |
       Required confirmation
              |
       Authorized domain execution
              |
       Verification and audit

Advisory-only assistance may end after presenting a
recommendation. It does not require operation execution.

## Illustrative integration — guided event setup

The existing event wizard defines:

Event -> Rounds -> Groups -> Lineups -> Scorekeepers -> Review.

At Groups, an optional intelligence action could assess
whether the selected configuration supports group planning.

FliHub would construct the permitted context and eligible
decision choices. Jev could recommend an appropriate
registered planning capability or request clarification.

FliHub would validate any resulting proposal and preserve
the existing editable group arrangement and final review.

The conventional Generate suggested groups action remains
available without intelligence.

This example does not authorize provider access to real
athlete records, persistent writes or a change to the
existing guided event creation transaction.

The first embedded pilot requires separate scope approval.

## Presentation requirements

Follow FLIHUB-DESIGN-PATTERNS.md, including DP-14.

Use recognizable Lucide icons, compact recommendation
panels, amber attention indicators, accessible disclosure
controls and honest progress presentation.

Keep conventional controls visible and usable.

Distinguish a suggestion from an applied draft selection,
an approved plan and a verified execution result.

Do not silently apply recommendations or initiate writes.

## Revised development sequence

| Phase  | Scope                                                                   |
| ------ | ----------------------------------------------------------------------- |
| JAI-5D | Reusable exact operation review                                         |
| JAI-5E | Protected synthetic execution                                           |
| JAI-5F | Results, history, audit and visual polish                               |
| JAI-5G | Integrated browser and security acceptance                              |
| JAI-5H | Protected workspace closeout                                            |
| JAI-6  | Embedded contextual intelligence and controlled application integration |
| JAI-7  | Intelligence-assisted structured workflow coordination                  |
| JAI-8  | Production readiness and acceptance                                     |
| Future | Optional conversational multi-step orchestration                        |

Retain the original phase identifiers and completed
JAI-1 through JAI-5C acceptance records.

JAI-5D remains the next implementation phase.

JAI-6 does not authorize persistent integration before
the existing applicable roadmap gates are satisfied.

JAI-7 retains bounded workflow state, operation limits,
independent verification, interruption reconciliation
and safe stopping requirements.

Preserve the existing multi-activity development strategy.
Pilot selection and unsupported activity activation
require separate approval.

## Acceptance requirements

Future implementation must verify:

- Existing manual and guided workflows remain compatible.
- Disabled and unavailable intelligence preserve valid
  conventional progression.
- No implicit provider dispatch during navigation or
  historical retrieval.
- Server-owned objective and context construction.
- Minimized and authorized provider disclosure.
- Strict request and response validation.
- Unknown information remains distinct from zero.
- Recommendations cannot grant authority.
- Exact consequential review remains independently valid.
- Stale, tampered and replayed reviews are rejected.
- Tenant isolation and current actor authorization.
- Existing transaction and audit guarantees.
- Independent outcome verification.
- Safe interruption and lost-response reconciliation.
- Resource, concurrency and spending controls.
- Accessible and responsive presentation.
- Relevant legacy application regression.
- Recorded GitHub CI and review evidence.

These are requirements, not newly completed tests.

## Preserved security and development gates

This decision does not waive or complete:

- AI-1F engineering infrastructure acceptance.
- Authenticated engineering worker qualification.
- AI-2 synthetic CSV mapping acceptance.
- CE-3D and subsequent charity development requirements.
- Distributed resource and session coordination.
- Durable transaction and audit requirements.
- Production tenant isolation and privacy acceptance.
- Provider quality and account-wide billing verification.
- Full legacy browser regression.
- GitHub CI, review, merge or deployment authorization.

No new paid request, live experiment, engineering dispatch,
persistent mutation or unsupported capability activation
is authorized by this document.

The live experiment lock and private evidence remain intact.

## Related documents

- APPLICATION-INTELLIGENCE-ROADMAP.md
- APPLICATION-INTELLIGENCE-WORKSPACE.md
- INTELLIGENCE-ARCHITECTURE.md
- INTELLIGENCE-ROADMAP.md
- FLIHUB-DESIGN-PATTERNS.md
- APPLICATION-CAPABILITY-CATALOG.md
- CHARITY-EVENT-ROADMAP.md
- AGENTS.md

## Future platform intelligence consumers

Branding and activity configuration are identified
as future consumers of embedded contextual intelligence.

Potential branding assistance includes contextual
questions, visual identity recommendations, inheritance
explanations and eligible sponsorship placement suggestions.

Potential activity assistance includes contextual
configuration questions, competition format recommendations
and explanations of compatible scoring choices.

FliHub remains authoritative for supported questions,
permitted answers, inheritance resolution, compatibility,
authorization and execution.

These future consumers reinforce the need for reusable,
registered, context-specific intelligence contracts.

Do not couple the shared intelligence architecture
exclusively to event preparation or group assignment.

Do not introduce speculative abstractions or implement
these deferred domains during JAI-5D.

Complete the current protected workspace acceptance
before selecting subsequent platform implementation priorities.

See:

- [Platform Development Roadmap](PLATFORM-DEVELOPMENT-ROADMAP.md)
- [Branding Roadmap](BRANDING-ROADMAP.md)
- [Activity Catalog Roadmap](ACTIVITY-CATALOG-ROADMAP.md)

These references capture future requirements without
authorizing implementation or expanding provider access.
