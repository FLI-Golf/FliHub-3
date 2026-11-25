# FliHub — Jev Application Intelligence Reference

## Purpose

Maintain a practical technical reference for integrating
Jev into FliHub application workflows.

This document distinguishes existing implementation,
documented provider capabilities, proposed extensions,
and verified application behavior.

Official TypeSafe documentation is authoritative for
provider API contracts.

Community examples are supporting research and must
not override official documentation or local security
requirements.

## Research references

- Official TypeSafe documentation:
  https://docs.typesafe.ai/

- Jev introduction:
  https://docs.typesafe.ai/introduction

- Community Jev cheat sheet:
  https://github.com/Njengah/jev-cheatsheet

- TypeSafe AI skills repository, candidate reference:
  https://github.com/typesafe-ai/skills

The skills repository has not yet been evaluated.

Community examples may reference older model versions.
Verify compatibility before implementation.

## Core architectural principle

Jev supplies intelligence judgments.

FliHub supplies:

- Authoritative application context.
- Authentication and authorization.
- Tenant isolation.
- Deterministic business rules.
- Eligible application capabilities.
- Operation execution.
- Transactions.
- Independent verification.
- Audit and recovery.

Jev must never replace these deterministic controls.

## Existing implementation

Shared intelligence source directory:

    src/lib/server/intelligence/

Existing components:

| File               | Responsibility                         |
| ------------------ | -------------------------------------- |
| types.ts           | Typed request and outcome contracts    |
| providers.ts       | Disabled, mock, and Jev providers      |
| service.ts         | Limits, dispatch, fallback, and audit  |
| validation.ts      | Request and response validation        |
| decisions.ts       | Registered fixed development decisions |
| director.ts        | Engineering director definitions       |
| director-policy.ts | Engineering confidence policies        |
| index.ts           | Shared process-local service           |

Current provider endpoint:

    https://api.typesafe.ai/v1/systemone

Current configured model:

    jev-1.14.0

These values describe the inspected local implementation,
not a guarantee of the latest provider configuration.

The engineering adapter supports one Choice question per
request. Application intelligence now also implements
registered Choice, Score and Noul questions, bounded
multi-question batches, and strict response validation.

The dedicated application experiment adapter and runner
have passed offline acceptance. Live application provider
compatibility remains unverified.

## Intelligence primitives

### Choice

Purpose: select among defined alternatives.

Potential FliHub applications:

- Classify a user objective.
- Select a relevant application capability.
- Recommend the next eligible operation.
- Prioritize preparation tasks.
- Select an appropriate verification strategy.

The current implementation validates:

- Registered decision identifiers.
- Approved context states.
- Eligible choices.
- Answer probabilities.
- Confidence.
- Explicit abstention.
- Model and usage metadata.

### Score

Purpose: evaluate information against a defined rubric.

Potential FliHub applications:

- Qualitative event readiness.
- Sponsorship package suitability.
- Application workflow completeness.
- Quality of a proposed plan.

A model score must not replace actual prerequisite
checks or authoritative application status.

Local Score contracts, weighted score validation,
probability distributions and rubric legends are implemented
and offline-tested. Live wire compatibility and rounding
behavior remain subject to provider qualification.

### Noul

Purpose: evaluate the probability of a proposition.

Potential FliHub applications:

- Assess whether an objective is ambiguous.
- Assess whether clarification may be useful.
- Identify possible duplicate-record candidates.
- Identify possible inconsistencies in approved context.

A Noul judgment is not proof of a factual condition.
Deterministic verification remains necessary.

Local Noul request and response contracts are implemented
and offline-tested. Live wire compatibility remains subject
to provider qualification.

### Box

Purpose: image-related localization.

Potential future uses may include receipt or document
image assistance, subject to provider capability,
privacy review, and separate authorization.

Box is outside the initial application prototype.

## Multi-question requests

Jev documentation and community examples describe
multiple independent questions against shared context.

Potential advantages:

- Reduce repeated context transmission.
- Reduce network round trips.
- Obtain several complementary judgments.
- Potentially reduce total request overhead.

Questions within a request should be treated as
independent. Do not assume one question can access
another question's answer.

For dependent reasoning:

1. Submit the first registered decision.
2. Validate its outcome.
3. Recompute eligible choices locally.
4. Construct the next approved context.
5. Submit another request only when authorized.

Registered five-question batches and independent answer
validation are implemented and offline-tested.

Actual provider batching behavior, limits, response schemas,
latency, and costs still require live verification.

## Conceptual event preparation request

The following is an application-level illustration,
not an executable provider API payload.

Shared synthetic context:

    Event: Spring Invitational
    Status: Draft
    Venue selected: Yes
    Date scheduled: Yes
    Participants: 24
    Groups assigned: 0
    Scoring configured: No

Independent questions:

| Primitive | Question                                             |
| --------- | ---------------------------------------------------- |
| Choice    | What is the user's objective?                        |
| Choice    | Which eligible recommendation is most useful?        |
| Score     | How prepared is the event under the approved rubric? |
| Noul      | Is the objective materially ambiguous?               |
| Noul      | Would prerequisite review be useful?                 |

FliHub validates and combines the answers.

The application constructs explanations using approved
templates, verified facts, and validated judgments.

Do not invent free-form provider explanations or
represent illustrative responses as live results.

## Application capability catalog

A capability is a registered application operation
or recommendation with a defined contract.

Proposed capability metadata:

- Stable capability identifier.
- Human-readable description.
- Supported objective categories.
- Required context.
- Required actor permissions.
- Organization scope.
- Prerequisites.
- Parameter validation.
- Side-effect classification.
- Approval requirements.
- Execution handler, when implemented.
- Independent verification handler.

Initial synthetic recommendation candidates:

- review_participant_readiness
- plan_group_assignments
- review_scoring_requirements
- review_event_prerequisites
- request_clarification

These identifiers are implemented as registered advisory
capabilities. They do not have application operation
execution handlers.

The application computes eligible capabilities before
requesting an intelligence judgment.

Provider output cannot introduce new capabilities.

## Application director pattern

1. Receive an approved objective.
2. Resolve or construct approved context.
3. Determine eligible capabilities locally.
4. Build registered intelligence questions.
5. Enforce provider and workflow budgets.
6. Obtain validated intelligence judgments.
7. Combine judgments using deterministic logic.
8. Present recommendations and explanations.
9. Obtain approval where required.
10. Execute through an authorized domain service.
11. Independently verify the result.
12. Reassess or stop.

Steps involving actual execution remain deferred
until their applicable development gates are met.

## Context and privacy

Send only information necessary for the decision.

Prefer:

- Synthetic fixtures.
- Approved field names.
- Aggregated counts.
- Explicit readiness indicators.
- Registered capability identifiers.
- Minimized structured context.

Do not send:

- Credentials.
- Authentication tokens.
- Raw participant records.
- Protected contact information.
- Private notes.
- Unapproved source code.
- Arbitrary command arguments.
- Unnecessary organization data.

Natural-language input may contain sensitive information
or untrusted instructions. Validate and minimize it before
any external disclosure.

Initial live demonstrations must use explicitly
approved synthetic input only.

## Confidence and abstention

Confidence is a model judgment, not authorization.

Use decision-specific acceptance requirements.

Preserve safe outcomes:

- Suggested.
- Abstained.
- Disabled.
- Unavailable.

A low-confidence, invalid, incomplete, or unavailable
answer must not cause unauthorized execution.

Do not weaken existing engineering confidence policies
when adding application-specific policies.

## Existing cost and usage controls

The inspected implementation includes:

- Disabled-by-default configuration.
- Explicit provider selection.
- Process-local request rate limits.
- Concurrency limits.
- Timeout and transport abort.
- Input-token budget reservations.
- Validated usage reconciliation.
- No automatic provider retries.
- Sanitized audit metadata.
- Response size limits.

Existing constants:

    RESERVED_TOKENS = 65536
    NANODOLLARS_PER_TOKEN = 42

Existing estimated input-token price:

    USD 0.042 per million input tokens

Illustrative estimates under the current implementation:

| Input tokens | Estimated USD |
| ------------ | ------------- |
| 1000         | 0.000042      |
| 10000        | 0.000420      |
| 65536        | 0.002752512   |

These are local implementation estimates, not verified
current provider prices or guaranteed invoice limits.

Process-local budgets reset across service instances.
Distributed production controls require separate design.

## Verification strategy

Offline tests should cover:

- Disabled provider behavior.
- Deterministic mock outcomes.
- Valid application requests.
- Invalid context.
- Unknown decision identifiers.
- Unknown or ineligible capabilities.
- Malformed provider responses.
- Invalid confidence or probability values.
- Missing or invalid batch answers.
- Abstention and unavailable outcomes.
- Rate, timeout, concurrency, and budget limits.
- Sanitized audit metadata.
- No external network calls.

Live tests require separate explicit authorization
and must record actual validated results.

## Development rules

- Reuse the existing provider boundary.
- Do not create an unnecessary second API client.
- Extend contracts incrementally.
- Verify exact official schemas before implementation.
- Keep application and engineering policies distinct.
- Preserve existing regression tests.
- Do not install dependencies merely because a
  community example uses them.
- Do not confuse a successful provider judgment with
  successful application execution.

## Research status

Established by local source inspection:

- Existing Choice adapter.
- Existing mock and disabled providers.
- Existing validation and service controls.
- Existing engineering decision contracts.
- Existing offline intelligence test coverage.

Implemented and verified offline:

- Choice, Score and Noul application contracts.
- Registered multi-question requests.
- Strict application provider response validation.
- Shared Jev HTTP transport.
- Application-specific usage accounting.
- Secure synthetic experiment orchestration.

Deferred capability evaluation:

- Box.

Not yet established:

- Live application-specific provider compatibility.
- Unrestricted natural-language generation.
- Arbitrary structured plan generation.
- Application capability execution.
- Persistent application integration.
- Production application intelligence acceptance.

Update this reference with actual implementation
and verification evidence as development progresses.

## JAI-3 — Secure live experiment preparation

The application experiment is separate from the existing
engineering live smoke test and mock application interfaces.

### Implementation map

Shared intelligence modules:

| Module                     | Responsibility                                |
| -------------------------- | --------------------------------------------- |
| jev-transport.ts           | Bounded shared HTTP transport                 |
| usage-accounting.ts        | Validated usage and estimated cost            |
| primitives.ts              | Choice, Score and Noul validation             |
| dispatch.ts                | Shared resource controls                      |
| application/batch.ts       | Registered synthetic assessment batch         |
| application/jev-adapter.ts | Application wire request and response adapter |
| application/director.ts    | Deterministic recommendation policy           |
| application/plan.ts        | Structured advisory plan                      |
| application/explanation.ts | Deterministic explanation                     |

Dedicated terminal modules under `tools/application/`:

| Module                      | Responsibility                                 |
| --------------------------- | ---------------------------------------------- |
| experiment.ts               | Preview and locked live entry point            |
| experiment-authorization.ts | Exact request digest authorization             |
| experiment-claim.ts         | Persistent local authorization consumption     |
| experiment-dispatch.ts      | Single-use bounded assessment                  |
| experiment-audit.ts         | Sanitized audit contract                       |
| experiment-evidence.ts      | Exclusive durable evidence storage             |
| experiment-orchestration.ts | Ordered authorization and dispatch integration |

### Offline preview

    npm run jev:app:experiment

The preview requires no provider request and does not
initialize persistent experiment evidence.

The registered synthetic request contains two Choice,
one Score and two Noul questions.

The current local adapter expects a strict response envelope
containing model, answers and usage. All five registered
answers must validate before an assessment is accepted.

This is an implemented local contract, not confirmation of
the provider's actual live response envelope.

### Local decision policy

- Objective and recommendation confidence threshold: 0.8.
- Clarification probability threshold: 0.8.
- Readiness is qualitative and cannot authorize operations.
- Low-confidence readiness is withheld.
- Unknown context is not treated as zero.
- Provider recommendations cannot expand locally eligible capabilities.
- All plans remain recommendation-only.

These thresholds are provisional application policy, not
empirically calibrated provider confidence guarantees.

### Persistent experiment evidence

The terminal uses the fixed repository-relative
`.flihub-intelligence/` directory.

Expected evidence files:

- `synthetic-event-assessment.claim`
- `synthetic-event-assessment.intent.json`
- `synthetic-event-assessment.outcome.json`

The claim and intent must be recorded before dispatch.
The outcome contains selected internal audit metadata,
including reported usage when validated.

Evidence does not contain the API key, raw request body,
raw provider response or complete advisory assessment.

Existing evidence is never automatically overwritten or reset.
A failed or interrupted experiment must not be automatically retried.

### Cost and provider qualification

The current local reservation is 65536 input tokens at
42 nanodollars per input token, producing an estimated
reservation of USD 0.002752512.

The estimate is not a guaranteed invoice ceiling.
Actual provider usage, current pricing and billing behavior
must be verified separately.

The release lock remains disabled. Exact authorization alone
cannot currently enable live terminal dispatch.

Before releasing the first paid experiment, independently
confirm the official provider contract, model availability,
mixed-question support, response fields, usage units,
confidence semantics and current pricing.

Official TypeSafe documentation remains authoritative.
The official skills repository and community examples require
compatibility review before being relied upon.

### Acceptance status

Fifty-seven experiment-specific offline tests passed.
The scoped intelligence regression, TypeScript checks,
lint, production build and terminal security checks passed.

No live application assessment has been executed.

See the application intelligence roadmap for remaining
security, provider qualification and release requirements.

## JAI-3H — First live application assessment closeout

On November 25, 2026, the registered synthetic application
assessment completed one explicitly authorized live request using
`jev-1.14.0`.

### Observed contract compatibility

The request combined two Choice questions, one Score question and
two Noul questions in a single shared-state request.

The live response passed the strict application response adapter,
including model identification, all five registered answers and
usage metadata.

Observed objective probabilities:

| Alternative            | Probability |
| ---------------------- | ----------: |
| Prepare event          |        0.35 |
| Assess event readiness |        0.65 |
| Abstain                |           0 |

Reported objective confidence: 0.48.

Observed recommendation probabilities:

| Alternative                 | Probability |
| --------------------------- | ----------: |
| Review event prerequisites  |        0.13 |
| Plan group assignments      |        0.22 |
| Review scoring requirements |        0.65 |
| Abstain                     |           0 |

Reported recommendation confidence: 0.53.

Observed Score probabilities:

| Rubric position | Probability |
| --------------- | ----------: |
| 0               |        0.01 |
| 1               |        0.33 |
| 2               |        0.64 |
| 3               |        0.02 |
| 4               |           0 |

The reported weighted score was 1.68 with confidence 0.69.

The weighted value calculated from displayed probabilities was
1.67. The observed difference of 0.01 was accepted by the existing
local tolerance of 0.011.

This observation does not establish a universal provider rounding
guarantee.

The clarification Noul value was 0.93 and the prerequisite-review
Noul value was 0.90.

### Deterministic reconciliation

The provider selected `assess_event_readiness`, which did not match
the registered preparation objective.

FliHub returned `abstained` with reason `objective_mismatch`.

No actionable recommendation or accepted readiness score was
produced. No application operations were executed.

Provider confidence is not treated as factual accuracy,
authorization or permission to execute.

### Observed usage

- Input tokens: 684.
- Output tokens: 179.
- Estimated usage cost: 28,728 nanodollars ($0.000028728).
- Assessment duration: 161 ms.
- Audit duration: 162 ms.
- Transport attempts: one.
- Reservation: reconciled.
- Automatic retries: none.

The cost estimate uses the configured input-token price of
42 nanodollars per token. Actual provider billing remains unverified.

### Regression and evidence

The sanitized offline reconstruction is maintained in
`tests/application-intelligence-live-response.test.mjs`.

Original private claim, intent and outcome evidence remain outside
version control.

The terminal live release lock remains disabled.

This experiment establishes compatibility for one observed response,
not every possible provider response or production workload.

No confidence thresholds or authorization boundaries were weakened
to obtain a successful result.
