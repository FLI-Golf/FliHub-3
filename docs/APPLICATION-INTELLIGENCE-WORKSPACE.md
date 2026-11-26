# FliHub — Application Intelligence Workspace

Date: November 25, 2026.

## Status

JAI-5A architecture specification with JAI-5B and JAI-5C local implementation and acceptance checkpoints.

The protected workspace foundation has completed scoped
local acceptance. JAI-5C objective resolution and advisory
integration have completed local implementation and acceptance.

JAI-5D exact operation review completed local acceptance. JAI-5E adds confirmation and controlled synthetic execution to the protected workspace.

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

## Role within FliHub

The protected workspace is a development, demonstration,
diagnostic and acceptance surface.

It is not the primary interface for ordinary application
workflows. Embedded contextual intelligence within existing
guided workflows is the preferred future integration strategy.

See [Embedded Intelligence Workflow Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md).

Preserve the existing natural-language assessment capability
and all development-only, offline and synthetic boundaries.

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

Exact review should reuse server-owned contracts that are
independent of natural-language input and provider responses.

Workspace-specific session ownership and simulated actor
restrictions remain mandatory for this integration.

This architectural direction does not authorize persistent
operations or alter existing conventional form contracts.

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

Parse the request and refresh authentication before admission. Check workspace
validity and exact review bindings synchronously at admission, then keep the
transition through approval and publication synchronous.

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

Closing the workspace and opening a new session starts a new exercise.

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

### JAI-5D — Reusable exact operation review

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

JAI-6 embedded contextual intelligence and controlled application integration.

JAI-7 intelligence-assisted structured workflow coordination.

General conversational multi-step orchestration remains
a separately approved future candidate.

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

JAI-5 security controls remain authoritative requirements.
Only the JAI-5B and JAI-5C controls identified in their
local acceptance records are implemented and locally verified.
Subsequent phase controls remain requirements.

The initial route, configuration names, session
limits and workspace sections are architectural
decisions subject to scoped implementation review.

Any changes must preserve or strengthen the
documented security boundaries.

## JAI-5B implementation and local acceptance

### Implemented foundation

- Disabled-by-default development-only workspace access.
- Explicit authenticated-user allowlisting.
- Fresh PocketBase authentication.
- Server-owned disposable sessions and account isolation.
- Session ownership, expiration and admission controls.
- Protected request validation.
- Explicit session creation and closure.
- Logout-associated workspace revocation.
- Browser-safe session status presentation.
- Workspace, Operations, History, Capabilities and Usage sections.

Workspace revocation is distinct from global PocketBase token revocation.

### Resource limits

| Resource                         | Limit      |
| -------------------------------- | ---------- |
| Active sessions per user         | 2          |
| Active sessions globally         | 32         |
| Idle lifetime                    | 15 minutes |
| Absolute lifetime                | 60 minutes |
| Request body                     | 8 KiB      |
| Body read deadline               | 5 seconds  |
| New sessions per user per minute | 4          |
| New sessions globally per minute | 32         |

Session reads do not renew idle expiration.
Closing or revoking sessions does not reset admission limits.
These controls are process-local, not distributed production guarantees.

### Recorded acceptance evidence

- 36 workspace unit tests.
- 22 automated HTTP acceptance checks.
- Eight manual browser acceptance checks.
- Final reported regression invocation: 710 passing tests,
  zero failures, zero cancellations and zero skipped tests.
- Successful TypeScript and Svelte verification.
- Successful repository formatting and lint.
- Successful production build.
- Successful managed development environment verification.
- Persistent development database identity preserved.
- Zero paid provider requests.

These counts describe recorded test invocations and must not be
combined into an aggregate test total.

### Manual browser acceptance

1. Opened the protected workspace.
2. Created a disposable session.
3. Observed active session status.
4. Refreshed without losing the session.
5. Manually ended the session.
6. Created another session.
7. Signed out while the session was active.
8. Signed back in and confirmed the session was closed.

HTTP acceptance also covered logout-associated revocation,
old workspace selectors, fresh authentication and account isolation.

### Development environment

Managed commands include:

- `npm run dev:all`
- `npm run dev:status`
- `npm run dev:stop`
- `npm run dev:restart`
- `npm run dev:verify`

The persistent development database remains
`pocketbase/pb_data/data.db`.

Automated HTTP acceptance uses disposable infrastructure.
Workspace enablement and allowlisting must be explicitly configured.

### Outstanding limitations

- Full legacy browser regression.
- GitHub CI verification.
- Complete responsive and keyboard acceptance.
- Actual HTTP stalled-body and oversized chunked-body acceptance.
- Complete cache-policy verification for framework-level early rejection.
- Expanded development service tooling regression.
- Distributed resource controls and session ownership.
- Distributed replay protection.
- Durable transactions and audit.
- Production tenant isolation.
- Provider confidence calibration and recommendation quality.
- Actual provider invoice reconciliation.
- Production release.

The SvelteKit alias deprecation warning remains a separate maintenance item.

### Deferred functionality

Natural-language objective submission and advisory orchestration
remain pending for JAI-5C.

Exact operation review, approval receipts, operation execution
and persistent application integration remain deferred.

The existing advisory playground and controlled synthetic
operation engine are preserved.

External provider access, persistent mutations and operation
execution remain disabled in the protected workspace.

No additional paid Jev experiment is authorized.

Jev supplies intelligence. FliHub retains control.

## JAI-5C — Offline objective assessment implementation

The protected workspace supports registered objectives and conservative
natural-language resolution for tournament preparation and readiness.

The advisory service explicitly uses the offline mock provider.
External transport is blocked. Real application records are not used
as assessment inputs and cannot be mutated through this interface.

The actual authenticated account and simulated operator remain separate.
Simulated roles grant no real FliHub permissions.

### Assessment resource boundaries

- Maximum objective length: 256 characters.
- Maximum concurrent assessments: one per session.
- Maximum assessments: ten per user per minute.
- Process-local global admission limit: 320 per minute.
- Maximum retained assessment history: 50 records per session.
- Existing idle and absolute session limits remain unchanged.

History retains bounded outcome and timing metadata, not raw objectives
or complete advisory responses. Closing or expiring a session discards
its history.

Assessment publication requires renewed authentication and a valid
server-owned session. Logout revocation prevents pending assessments
from publishing. Workspace revocation is not global PocketBase token
revocation.

Request handling enforces origin, method, content type, bounded body
size, read deadline and strict field validation. Stalled transport
acceptance permits a bounded connection reset when the server rejects
the stalled request and subsequent valid requests remain functional.

### Verification and limitations

Local automated HTTP, browser, security and regression acceptance
passed. Manual assessment results confirmed correct preparation,
participant readiness, unknown-information clarification and unsupported
objective rejection.

Manual history and usage displayed four completed assessments,
four retained records, three advisory responses, one unsupported
assessment, zero paid requests and $0.00 paid provider cost.

Refresh persistence and session closure were verified by automated
browser acceptance.

The browser acceptance helper is invoked by the disposable HTTP
harness rather than discovered as a standalone legacy browser spec.

Navigation and assessment controls are hydration-aware. Native session
start and close remain available without assessment JavaScript.

Development database identity verification now performs a bounded
read-only request before checking the managed PocketBase process's
database descriptors. Idle-connection regression passed without
database replacement or managed-service restart.

Resource limits and session storage remain process-local. Distributed
coordination, durable transactions, persistent audit, production
tenant isolation and provider billing reconciliation are deferred.

Minor presentation follow-up: remove redundant recommendation text
where the next-step label is repeated.

Operation review, approval and execution are not enabled by JAI-5C.

Jev supplies intelligence. FliHub retains control.

## JAI-5D — Exact operation review completion

**Status:** Local implementation and acceptance complete.
**Verification date:** 2026-11-26.

### Workspace behavior

An eligible offline advisory assessment can expose a registered
synthetic operation candidate. The candidate is not authorization
or approval.

Preparing an exact review requires the current assessment generation,
a valid authenticated workspace session, an authorized simulated
operator and successful deterministic prerequisite checks.

The Operations tab displays the immutable reviewed proposal.
For the Spring Invitational fixture, the proposal contains six groups,
twelve teams and twenty-four athletes.

The Workspace tab protects assessment inputs while an exact review
exists. The user may view the review or select
**Discard review and edit assessment**.

Discarding uses the existing authenticated server-side cancellation
action. The assessment form is restored after the server confirms
the updated workspace state.

A cancelled review cannot be restored by replaying its preparation
request. A new assessment is required.

### Server ownership and request boundaries

- Assessment generations are server-generated, session-bound and
  distinct from workspace cookie selectors.
- Preparation accepts only the current generation identifier.
- Cancellation accepts only the current review identifier.
- Both actions require protected workspace access, same-origin
  requests and bounded request validation.
- Client-supplied plans, actor overrides, operation overrides,
  approval fields and execution instructions are rejected.
- Repeated valid preparation returns the existing exact review.
- New admitted assessments invalidate previous review state.
- Session closure, expiration and revocation discard review state.
- Foreign accounts cannot read, prepare or cancel another account's
  review.

The review-only facade exposes reading and cancellation, not approval
or execution. Review preparation does not mutate synthetic event state
or persistent application records.

### Acceptance

Manual browser, automated browser, direct authenticated HTTP,
workspace regression and operation regression acceptance passed.

The automated browser exercise verified mobile review presentation,
protected editing, refresh persistence, cancellation, reassessment
and session closure.

The HTTP exercise verified cross-session generations, stale requests,
tampering, strict request fields, exact assignment integrity,
cross-account isolation, authorization and cancellation replay
protection.

TypeScript checks, lint, production build and managed development
environment verification passed.

Persistent database identity and private experiment evidence were
preserved. The live experiment release lock remained disabled.

### JAI-5D security boundaries

| Boundary                         | Status                              |
| -------------------------------- | ----------------------------------- |
| Data source                      | Disposable synthetic fixtures       |
| External provider access         | Disabled                            |
| Paid provider requests           | 0                                   |
| Paid provider cost               | $0.00                               |
| Exact operation review           | Available after eligible assessment |
| Operation approval               | Not implemented in workspace        |
| Operation execution              | Disabled                            |
| Persistent application mutations | Disabled                            |
| Production workspace access      | Disabled                            |

### Work outstanding at the JAI-5D checkpoint

JAI-5E will introduce the protected synthetic approval and execution
transition. JAI-5F through JAI-5H remain outstanding.

Full legacy browser regression and remote GitHub CI are not claimed
as completed by JAI-5D.

The workspace remains a development and acceptance environment,
not the required primary interface for future embedded intelligence.

Conventional guided workflows must remain functional without Jev.

## JAI-5E — Protected synthetic execution

The disposable workspace can admit one execution attempt per session.
Assessments read registered static fixtures. Continuing assessment after
execution could reconstruct stale revision-zero context, so an admitted
attempt concludes the entire scenario. Close the workspace and start a new
session to begin another scenario. Requests rejected before admission leave
the execution opportunity available.

The protected review factory creates two capabilities over the same engine
session. The reusable review-only handle can read or cancel the immutable
review. The workspace also retains a dedicated execution closure bound to the
same review identity and plan. The closure issues an approval using engine
identifiers captured on the server, then passes the receipt directly to the
existing JAI-4 engine. Engine authorization, prerequisites, single-use
consumption, candidate construction, independent verification, and atomic
state and audit publication remain authoritative.

Submit a same-origin URL-encoded POST to `?/executeReview` with exactly these
four fields.

| Field          | Required value                               |
| -------------- | -------------------------------------------- |
| `confirmation` | `approve-and-execute`                        |
| `generation`   | Current assessment generation, 64 hex digits |
| `reviewId`     | Current server-issued review UUID            |
| `planDigest`   | Current canonical plan digest, 64 hex digits |

The request uses the protected workspace cookie and the freshly refreshed,
allowlisted PocketBase identity. Existing request size, read deadline, and
session limits apply. After authentication, the server synchronously checks
ownership, expiration, generation, review identity, digest, confirmation and
transition state. Approval, candidate verification and publication run in the
same synchronous transition. An assessment or cancellation that invalidates
the review first prevents admission. Once admitted, another execution,
assessment, review preparation or cancellation cannot change the scenario.

The protected no-store workspace load returns an optional `execution` outcome.
A published result includes `status: 'published'`, before and after revisions,
verified group, team and athlete counts, `verification: 'passed'`,
`persistentMutation: false`, and zero paid provider requests and cost.
An admitted failure returns only `status: 'failed'`. A failed candidate or
verification preserves the original synthetic state. Refresh and a read after
a lost response use the retained outcome. Private engine session identifiers,
plans, receipts, state digests, and executable handles stay server-side.

Closure, expiration, revocation, and process termination discard the
retained state and outcome. Publication is process-local and disposable.
This design provides no durable production transaction processing or
cross-process recovery. Persistent application execution and production
workspace access remain disabled. JAI-5F covers results, history, audit and
visual polish, subject to JAI-5E acceptance.

The supervisor verified the disabled workspace in the normal managed stack using
an existing authenticated organization owner session. The browser displayed
`404` and `Workspace access unavailable`, with the authenticated header visible.
Raw status and headers for that managed request were outside the observation.
Disposable authenticated HTTP tests verified status and cache behavior separately.

The [JAI-5E roadmap checkpoint](APPLICATION-INTELLIGENCE-ROADMAP.md#jai-5e--protected-synthetic-execution)
records verification commands, results, and outstanding acceptance requirements.

## JAI-5F — Verified results and disposable history

The workspace displays the terminal execution outcome and separately projects
published assignments from the committed synthetic snapshot. Before serving
assignment details, the server binds that snapshot to the retained publication
outcome by revision and canonical state digest, and checks the matching
publication audit record. It resolves the organization, event, simulated actor,
groups, teams and athletes from committed state. The projection exposes labels
and membership only. It keeps approval receipts, internal identifiers, digests,
raw state and exceptions private. Missing detail evidence leaves the retained
outcome intact.

The result includes expandable execution, independent verification and group
details. The verifier checks exact assignments, unique groups and assignments,
complete team and athlete coverage, revision advancement and unchanged synthetic
records outside the assignment scope. Failed verification never supplies
published assignments. The audit projection exposes the bounded record sequence,
outcome, verification status, revisions and state-change flag.

History adds registered objective and capability labels, review preparation and
cancellation times, and admitted execution time to the existing assessment
retention window. Approval issuance and verification appear when the engine
audit supports them. No raw objective is retained. This evidence is process-local
and is discarded with the disposable session.

A terminal outcome replaces action notices such as the review-ready message.
Operations stop prompting for an assessment once the scenario concludes.
The operator can end the session from Workspace and start a fresh scenario.
Refresh and lost-response recovery read retained state only.

### Supervisor acceptance walkthrough

Use an authorized development environment and a disposable synthetic workspace.
Start a fresh workspace
and assess **Prepare a tournament** with **Spring Invitational** and the
simulated organization owner. Prepare and inspect the exact review, then
explicitly approve and execute. Inspect the published group, team and athlete
assignments. Expand execution and verification details, then view History and
expand the audit. Refresh and confirm the outcome persists, the scenario is
concluded and conflicting controls are unavailable. End the synthetic session
from Workspace and confirm that the result is cleared and the start control is
available.

### Supervisor acceptance record

On November 26, 2026, the supervisor completed the walkthrough on the
temporarily enabled managed Codespaces development stack. The session and
execution remained disposable and synthetic-only. The supervisor matched all
six published groups to the approved review, inspected the verification and
audit disclosures, confirmed refresh and terminal behavior, then ended the
session and saw the result clear. The managed stack was restored to its
disabled baseline. The browser displayed `404 — Workspace access unavailable`
after restoration. Independent service and effective-configuration checks and
the scope of the manual evidence are recorded in the
[JAI-5F roadmap closeout](APPLICATION-INTELLIGENCE-ROADMAP.md#supervisor-browser-acceptance--november-26-2026).

JAI-5F local acceptance is complete. JAI-5G integrated acceptance, JAI-5H branch
closeout, full legacy browser regression and GitHub CI remain open.
