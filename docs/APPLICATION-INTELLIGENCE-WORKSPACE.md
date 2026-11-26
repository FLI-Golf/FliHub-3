# FliHub — Application Intelligence Workspace

Date: November 25, 2026.

## Status

JAI-5A architecture specification.

Implementation begins in JAI-5B.

The verified starting checkpoint is `bc11b87`,
Complete controlled application operation acceptance.

JAI-4 recorded 852 passing automated regression tests
and seven interactive acceptance scenarios.

These are historical JAI-4 acceptance results,
not new JAI-5 browser acceptance results.

## Governing principle

Jev supplies intelligence. FliHub retains control.

Recommendations never authorize operations.

The browser is an untrusted presentation and input
boundary, not an execution authority.

## Scope

Build an optional native SvelteKit workspace for
offline synthetic application intelligence.

Initial objectives:

- Prepare an event.
- Assess event readiness.

Initial executable operation:

- `create_synthetic_group_assignments`.

The advisory capability `plan_group_assignments`
remains separate from the executable operation.

No real organization data or persistent application
mutations are authorized.

## Existing architecture

Preserve the existing advisory playground at
`/development/intelligence`.

The proposed controlled workspace route is
`/development/intelligence/operations`.

Preserve the existing terminal commands and behavior.

Reuse the existing application intelligence service,
registered objectives, capability registry, synthetic
fixtures, operation registry, approval session,
execution planning, candidate construction,
independent verification and publication audit.

Extract reusable offline orchestration from the
terminal workflow into a server-only TypeScript
module when required.

Do not introduce a second execution engine.

Do not weaken existing operation contracts to
accommodate browser input.

## Workspace access

The controlled workspace must be unavailable unless:

- SvelteKit development mode is active.
- A dedicated server-side feature gate is enabled.
- The current PocketBase session is freshly verified.
- The authenticated user is explicitly permitted
  to access the development workspace.

Proposed configuration:

- `FLIHUB_APPLICATION_WORKSPACE_ENABLED`.
- `FLIHUB_APPLICATION_WORKSPACE_ALLOWED_USER_IDS`.

The feature gate defaults to disabled.

Missing, empty or malformed authorization
configuration must fail closed.

Use server-resolved authenticated user IDs.
Do not use client-submitted identities, email
addresses or simulated roles as access authority.

Production mode must reject access regardless
of feature configuration.

Do not add production navigation or automatic
service startup.

## HTTP security

Every protected load and endpoint must independently
enforce the required access checks.

Do not rely on parent layouts, hidden controls
or client-side navigation restrictions.

Every state-changing request must:

- Use an explicitly supported HTTP method.
- Require an exact same-origin Origin header.
- Reject missing, opaque and mismatched origins.
- Validate the expected content type.
- Enforce a bounded body before full parsing.
- Reject malformed, duplicate and unexpected fields.
- Validate registered IDs and exact request shapes.
- Resolve session ownership on the server.
- Recheck expiration and applicable state revision.

Do not trust arbitrary forwarded host or origin
headers as authorization evidence.

Apply no-store caching to workspace responses,
including redirects and error responses.

Return sanitized errors without stack traces,
credentials or internal implementation objects.

Verify actual HTTP behavior in addition to
isolated handler tests.

## Offline provider boundary

Construct the application intelligence service
using explicit mock-only configuration.

Do not inherit provider selection, credentials
or billing configuration from the environment.

Inject a rejecting external fetch implementation.

Do not access TypeSafe credentials.

Keep the existing live experiment release lock
disabled.

Preserve the private experiment evidence.

No paid requests, provider retries, engineering
dispatch or external execution are authorized.

## Workspace session ownership

Maintain disposable process-local server sessions.

Bind each session to:

- A freshly authenticated user identity.
- A server-generated browser workspace identity.
- A registered synthetic fixture.
- A registered simulated actor.
- The applicable workflow generation.

Use cryptographically random session identifiers.

Browser session identifiers are selectors, not
independent authorization credentials.

Prefer an HttpOnly, SameSite Strict workspace
cookie with appropriate transport and path scope.

Keep browser workspace identity separate from
the internal operation approval session identity.

Never use a real organization membership to
authorize a synthetic operation.

Never use a synthetic actor role to authorize
access to real application data.

Do not store credentials or PocketBase auth tokens
in workspace state.

Recheck authenticated ownership on every access.

Account switching must not expose the previous
account's workspace state.

Close, expiration, access revocation and restart
must safely invalidate applicable sessions.

Do not depend on browser unload events for cleanup.

## Proposed resource limits

Initial development limits:

| Resource                                        |          Limit |
| ----------------------------------------------- | -------------: |
| Objective text                                  | 256 characters |
| Request body                                    |          8 KiB |
| Active sessions per user                        |              2 |
| Active sessions globally                        |             32 |
| Idle lifetime                                   |     15 minutes |
| Absolute lifetime                               |     60 minutes |
| Concurrent operations per session               |              1 |
| Assessments per user per minute                 |             10 |
| Assessment history per session                  |             50 |
| Publication audit records per operation session |            100 |

Enforce limits on the server.

The request body limit must also cover streaming
requests without a Content-Length header.

Bound rate-limit bookkeeping and expired session
cleanup independently of active session count.

Do not permit new session creation to bypass
per-user rate limits.

Retain shared global dispatch controls.

Add bounded global request admission controls
where required by implementation review.

Do not silently evict an in-flight operation.

These are initial process-local development limits,
not distributed production guarantees.

## Objective resolution

Support explicit registered objective selection
and bounded natural-language entry.

Map recognized text to existing synthetic
objective IDs:

- `prepare_tournament`.
- `assess_readiness`.

Preserve the existing application-level objective
mapping.

Use conservative deterministic resolution.

Ambiguous input requires clarification.

Unsupported or conflicting input must abstain.

Do not use substring matches that turn negated,
compound or destructive instructions into an
accepted executable objective.

Do not send raw user text to an external provider.

Do not execute instructions embedded in text.

Do not interpret a natural-language request as
operation approval.

## Advisory workflow

Validate objective, scenario and simulated actor.

Run the existing mock advisory service.

Preserve deterministic eligibility, explanation,
clarification and abstention behavior.

Only a validated eligible recommendation may
resolve to a registered operation.

Readiness assessments remain advisory.

A recommendation alone must not create groups
or change synthetic application state.

Use an explicit review transition.

Do not automatically reassess a published state
using an unchanged static fixture.

Clearly distinguish historical advisory context
from current synthetic operation state.

Multi-step adaptive reassessment remains deferred.

## Exact operation review

Retain the immutable execution plan on the server.

Display all consequential plan details:

- Synthetic organization and event.
- Simulated operator and role.
- Operation and intended effect.
- Current state revision.
- Exact proposed group assignments.
- Team and athlete identities from synthetic data.
- Expected changes and unchanged boundaries.
- Review identity and plan digest.

Do not substitute a summary for the exact plan.

Bind confirmation to the current server-owned
review, workspace owner and workflow generation.

Changing objective, fixture or simulated actor
must invalidate the outstanding review.

Historical views must never expose actionable
approval controls.

Cancellation must not change authoritative state.

## Approval and execution

Require an explicit user confirmation action.

The server must validate the current review
before invoking the existing approval engine.

Keep internal approval receipts entirely
server-side.

Do not serialize approval receipts, session
objects, executable handlers or mutable state
references to the browser.

Serialize state-changing work per session.

Acquire the session guard before asynchronous
work and recheck validity before publication.

Use the existing single-use approval consumption,
candidate construction, independent verification
and atomic publication mechanism.

Do not implement a browser-specific shortcut.

Do not retry an interrupted or failed execution
automatically.

After a lost response, retrieve the authoritative
session result without executing again.

Cancellation and expiration must not be reported
as successful rollback of a completed publication.

Retain completed results for bounded inspection.

Any new exercise must be an explicit reset or
new disposable session, not an implicit replay.

## Response contracts

Construct explicit browser-safe DTOs.

Expose only necessary registered labels,
synthetic facts, advisory results, review details,
safe status values and sanitized audit summaries.

Do not serialize raw provider responses,
credentials, internal exceptions, approval
receipts or server session objects.

Treat all provider output as untrusted.

Render approved Svelte components and escaped
text, never provider-generated executable markup.

## Presentation

Follow FLIHUB-DESIGN-PATTERNS.md.

Proposed workspace sections:

- Workspace.
- Operations.
- History.
- Capabilities.
- Usage.

Use existing Tailwind and shadcn-svelte components.

Use Lucide icons, compact information hierarchy,
zebra rows, collapsible chevrons and amber
attention indicators.

Reserve verified success styling for independently
verified outcomes.

Clearly identify synthetic data, simulated actors,
offline provider configuration and temporary state.

Distinguish unknown information from zero.

Distinguish qualitative readiness from official
completion.

Support responsive desktop and mobile layouts,
keyboard access, focus management and visible
validation.

Preserve existing manual workflows.

## History and audit

Retain bounded server-owned assessment history.

Retrieve original results without reassessment.

Preserve the existing atomic publication audit.

Distinguish assessment history, review lifecycle
events and verified publication audit records.

Display sanitized timestamps, outcomes, revisions
and operation effects.

Do not record raw user objective text in audit
records.

Do not imply process-local history is a durable
production audit ledger.

Refreshing a page must not execute an operation.

## Implementation sequence

### JAI-5A — Architecture checkpoint

- Inspect existing implementation.
- Establish browser security requirements.
- Define workspace and presentation architecture.
- Document the implementation sequence.
- Commit and push the documentation checkpoint.

### JAI-5B — Protected workspace foundation

- Implement disabled-by-default access gate.
- Implement bounded server session ownership.
- Implement expiration and request protection.
- Establish browser-safe response contracts.
- Build the initial protected workspace shell.
- Verify negative access and session isolation.

No executable operation endpoint is enabled.

### JAI-5C — Objective and advisory guidance

- Implement bounded objective resolution.
- Support registered scenario and actor selection.
- Reuse existing offline advisory orchestration.
- Present context, recommendations and clarification.
- Preserve advisory-only behavior.

### JAI-5D — Exact operation review

- Resolve eligible registered operations.
- Prepare immutable server-owned execution plans.
- Render exact consequential plan details.
- Implement review invalidation and cancellation.
- Verify stale and tampered review rejection.

### JAI-5E — Protected synthetic execution

- Integrate explicit confirmation.
- Retain internal approval receipts server-side.
- Serialize execution and publication.
- Reuse independent candidate verification.
- Verify replay and concurrent submission behavior.

### JAI-5F — Results and visual polish

- Display verified state changes.
- Display bounded assessment history and audit.
- Display scoped usage and resource limits.
- Complete responsive and accessible presentation.
- Preserve historical retrieval without execution.

### JAI-5G — Browser and security acceptance

Verify:

- Disabled and production-mode rejection.
- Fresh authentication and development access.
- Actual authenticated HTTP origin rejection.
- Concurrent account and session isolation.
- Missing, malformed and oversized requests.
- Expiration, cancellation and stale review behavior.
- Duplicate and concurrent confirmation rejection.
- Lost-response recovery without re-execution.
- Owner and admin synthetic success.
- Viewer and other ineligible actor rejection.
- Clarification and advisory-only scenarios.
- Independent verification and atomic publication.
- No external provider requests.
- No persistent application mutations.
- Existing terminal and playground compatibility.
- Responsive and keyboard interaction.
- Relevant legacy application regression.

Use disposable test infrastructure.

Record actual evidence and unresolved limitations.

### JAI-5H — Final checkpoint

- Complete scoped automated acceptance.
- Run TypeScript and Svelte verification.
- Run repository lint and production build.
- Document browser and security evidence.
- Preserve outstanding production requirements.
- Commit and push verified changes.

No merge or deployment is authorized.

## Deferred requirements

JAI-6 persistent application integration.

JAI-7 multi-step intelligent orchestration.

JAI-8 production readiness.

Distributed session ownership, distributed replay
protection, durable transactions, tenant isolation,
production audit retention, provider quality
evaluation and account-wide billing controls.

Authenticated engineering dispatch and AI-1F.

AI-2 CSV mapping.

Charity CE-3D and subsequent charity development.

Outstanding legacy browser regression and GitHub
CI must not be represented as completed without
recorded passing evidence.

Existing roadmaps and AGENTS.md remain authoritative.

## Architecture acceptance limitations

This specification is based on inspected source
and the recorded JAI-4 acceptance checkpoint.

JAI-5 security controls are requirements, not
implemented or verified capabilities.

The initial route, configuration names, session
limits and workspace sections are architectural
decisions subject to scoped implementation review.

Any changes must preserve or strengthen the
documented security boundaries.
