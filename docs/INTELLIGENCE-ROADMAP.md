# FliHub Intelligence — Roadmap

**Status:** AI-1 through AI-1E support a scoped synthetic workflow and manual local development console. Adoption for application development remains gated. Charity development is frozen after CE-3C.

## Objective

Introduce optional AI-assisted decisions without compromising deterministic business rules, tenant isolation, or existing workflows. Jev is the selected provider; intelligence remains an optional application capability.

## Application intelligence direction

Prioritize optional embedded contextual intelligence
within existing structured application workflows.

FliHub guides the process. Jev helps improve the decisions.

See [Embedded Intelligence Workflow Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md)
and [Application Intelligence Roadmap](APPLICATION-INTELLIGENCE-ROADMAP.md).

The JAI application intelligence track and AI engineering
qualification track remain independently governed.

This direction does not waive AI-1F, AI-2, CE-3D,
or any existing acceptance and authorization requirements.

## Development sequence

| Phase              | Scope                                                                                                                                   | Exit gate                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| AI-1               | Jev adapter, server-only provider interface, disabled and mock providers, configuration, validation, timeouts, audit and usage tracking | Offline tests and CI pass; disabled mode preserves existing behavior                         |
| AI-1A              | Jev–Codex development guardrails                                                                                                        | Scoped interception verified in an isolated Codex session. Preserve native security.         |
| AI-1B              | Development action auditing and approval                                                                                                | Local proposal binding and consumption verified. Agree retention before ongoing operation.   |
| AI-1C              | Jev development orchestration                                                                                                           | Accept the bounded synthetic coordinator, durable checkpoints, and isolated worker boundary  |
| AI-1D              | Jev-driven development and verification loop                                                                                            | Verify the offline loop and approve the live synthetic run before directing application work |
| AI-1E              | Unified manual development environment                                                                                                  | Verify service lifecycle, offline operator console and its bounded worker                    |
| AI-1F              | Final intelligence infrastructure acceptance                                                                                            | Review worker isolation, live and offline evidence, PR, GitHub CI, and merge authorization   |
| AI-2               | First Jev-directed application feature using synthetic CSV headers                                                                      | Functional tests pass; human review required; cost and latency recorded                      |
| Resume CE at CE-3D | Resume charity CSV and participant lifecycle work                                                                                       | Pilot is optional and isolated; no unresolved critical risks                                 |
| AI-3               | Participant duplicate suggestions                                                                                                       | No automatic merges; tenant isolation verified                                               |
| AI-4               | Sponsorship package recommendations                                                                                                     | Staff review; no automatic agreements                                                        |
| AI-5               | Expense categorization suggestions                                                                                                      | No automated approval or payment                                                             |
| AI-6               | Organization intelligence dashboard                                                                                                     | Authorized, explainable recommendations                                                      |
| AI-7               | Natural-language navigation                                                                                                             | Existing access controls enforced                                                            |

AI-3 onward are backlog candidates, not commitments or prerequisites for charity event development.

## Proposed assisted development milestones

[Assisted Development Mode and the Development Assignment Builder](INTELLIGENCE-ARCHITECTURE.md#engineering-operating-modes) support manual development through offline assignment preparation and eventual evidence review. Automated Development Mode continues under the existing AI-1F qualification and native authorization boundaries.

1. Assess assisted development architecture and existing reusable capabilities.
2. Design the Development Assignment Builder and read-only context boundaries.
3. Add human assignment review and export.
4. Add bounded completion report ingestion.
5. Add independent evidence and development progress review.
6. Qualify optional live Jev planning and assessment under separate provider and disclosure approval.
7. Continue authenticated runner qualification under AI-1F and the existing provisioning gates.
8. Integrate engineering orchestration after applicable authorization, isolation, verification and publication gates pass.

These are proposed milestones. Existing phase identifiers and acceptance requirements remain authoritative. Milestones 6 and 7 have independent gates. Assisted Development Mode does not close AI-1F or authorize Assignment 12B, authenticated dispatch, AI-2 or charity resumption. PR #55 merged the accepted JAI-5H checkpoint, and CI passed on main.

#### ADM-6 — Qualified Development Advisory (proposed, separately gated)

ADM-6 refines proposed milestone 6 into the following implementation stages. These labels subdivide ADM-6 only; they do not renumber, replace or satisfy any other ADM milestone or independent acceptance gate. The offline assignment builder and local evidence assessor remain usable without Jev. No stage itself authorizes live provider use; live use requires the separate owner authorization and qualification gates below.

- **ADM-6A — Architectural decisions and qualification requirements.** Document the boundary, threat model, data contract, controls, measurable gates and unresolved provider questions. Documentation only; no provider call or live-use approval.
- **ADM-6B — Bounded development advisory contracts.** Separately authorized implementation of typed planning and advisory assessment request/response contracts, runtime validation, abstention and unavailable outcomes. Limit context to explicitly selected, sanitized objective and approved repository/document references; exclude credentials, private evidence, source code, command data, participant data and unreviewed reports. Provider output cannot authorize, execute, attest or alter workflow rules.
- **ADM-6C — Exact outbound disclosure review and approval.** Present the full canonical serialized request, its sources, provider, purpose, limits and digest before dispatch. Bind one-use, expiring human approval to the exact bytes and decision; any change invalidates approval. Add independent tests proving no call occurs before exact approval and that edits, expiry, cancellation and replay are rejected.
- **ADM-6D — Offline advisory workflow and simulated provider verification.** Exercise the same validation, review, provenance, limits and failure paths with deterministic fixtures and a simulated provider. Verify offline fallback and no network/provider dispatch, credential access, Codex launch or application mutation. Synthetic success does not qualify live service behavior.
- **ADM-6E — Separately authorized live Jev qualification.** Requires a new explicit owner authorization, qualified deployment boundary, approved provider terms/account controls and successful independent safety review before any live request. Require both exact disclosure approval and separate operator dispatch authorization for each bounded run. Demonstrate enforced finite request count, concurrency, request timeout, per-call and aggregate cost ceilings, reservation before dispatch, conservative treatment of unknown usage, no automatic retries on ambiguous outcomes, response size/schema validation, sanitized provenance, secret/data exclusion and deterministic manual fallback. Record actual measured usage and failures without raw sensitive content. A local budget is not a provider-enforced spending cap unless independently verified provider controls establish it.
- **ADM-6F — Independent acceptance and documentation.** An independent reviewer checks the implementation and raw, privacy-safe evidence against every preceding gate, verifies negative tests and fallback, confirms no unapproved disclosure or dispatch, reviews incident/cancellation/accounting behavior, and records limitations and remaining release gates. Acceptance cannot be inferred from provider confidence, generated reports or a successful happy-path call.

**ADM-6D accepted offline checkpoint.** Implementation and independent verification
completed, and the owner accepted the bounded fixture workflow at
`07cc7f6f6bdc08bda6ec5a0d7691cf3cbad19f35`. Both interactive advice kinds
matched the reviewed payload digest and invoked the simulator once. Manual
fallback remains available. This acceptance covers offline simulation. Live
provider behavior, metering, retention, operating-system egress isolation,
automated engineering and deployment readiness require separate evidence.
ADM-6E is the next qualification checkpoint and requires separate authorization.
ADM-6F and AI-1F retain their independent gates.
[Issue #94 acceptance](https://github.com/FLI-Golf/FliHub-3/issues/94#issuecomment-7241436818)

**ADM-6E staging.** The owner accepted ADM-6E.0 discovery. The independent Bash
marker establishes completion of asserted checks. The displayed remote refs and
PR description did not receive separate ChatGPT review. ADM-6E.1 implements
the offline real development context and exact review candidate. It awaits
independent verification and owner acceptance. Discovering draft PR #52 does
not authorize reconciliation of its code or funding implementation.

- ADM-6E.2: Separately authorized live dispatch authorization and mandatory dispatch-time freshness recheck.
- ADM-6E.3: Metering and reservations.
- ADM-6E.4: Integrated offline verification and independent safety review.
- ADM-6E.5: Separately authorized controlled live qualification.

ADM-6E.1 preserves the offline fallback and accepted ADM-6D contracts. Automated
engineering and production activation retain their separate gates.
[Assignment #95](https://github.com/FLI-Golf/FliHub-3/issues/95)

**Measurable qualification criteria:** (1) the approved payload digest equals the exact serialized bytes dispatched, and mutation, replay, expiry or cancellation results in zero requests; (2) zero dispatches occur without a distinct, unexpired operator dispatch authorization matching provider, objective and configured request/cost ceilings; (3) tests show request count, concurrency and timeout never exceed configured values, reservations precede calls, unknown usage retains the full reservation, and budget exhaustion closes dispatch; (4) malformed, oversized, unsupported, errored or ambiguous responses are rejected, do not trigger retries, and do not change workflow state or acceptance; (5) provenance records the decision, digest, approvals, provider identity when available, request ID, bounded outcome, timestamps, validated usage and failure class while excluding raw payloads, credentials, source, commands and private evidence; (6) disablement, abstention, provider failure and timeout all leave the manual offline path usable; and (7) independent tests and review reproduce each gate from a clean disposable environment. No acceptance claim is made for an unmeasured control.

**Unresolved qualification requirements:** verify provider-side spend ceilings and billing/settlement semantics, in-flight cancellation and delayed usage reporting, data retention/deletion and residency terms, model/version identity and availability guarantees, and the deploy-time egress boundary. Define alerting, incident response, reconciliation, retention and shutdown behavior. Until evidence establishes each required property—or the owner explicitly accepts a documented limitation under a separately reviewed risk decision—ADM-6E remains closed. Provider contracts, validators, dispatch controls, accounting and provenance already present in the intelligence foundation are candidates for reuse only after capability-specific review; this roadmap does not assert they currently satisfy ADM-6.

The managed environment gate for each authorized local acceptance run requires `npm run dev:verify` to exit 0 and report all 17 checks passing. If restricted sandbox execution cannot observe managed process identities, service endpoints, PocketBase descriptors or Vite configuration, the operator may request narrowly scoped execution approval for that exact command and rerun it outside the sandbox. Record execution context and complete results. Do not bypass checks, alter the verifier, restart services or change configuration to make the gate pass. If approval is unavailable or any check fails, stop the acceptance run and record the blocker.

### ADM-1 and ADM-2 local checkpoint

ADM-1 reconciles milestone 1 with the existing engineering architecture.
The offline console already supports fixed synthetic objectives, a sealed
fixture exercise and a fixed tee-time proposal pilot. Its committed source
binding, human approval and verification evidence apply to that bounded
pilot. Manual assignments use a separate text contract and reuse the
terminal interaction and bounded read-only Git patterns.

ADM-2 implements milestone 2 through option 8 of `npm run jev:develop`.
The builder inspects local FliHub repository metadata and names applicable
instruction files for the selected paths. It records scope, exclusions,
acceptance, verification, separate commit and push declarations and the
required completion report. It supports custom objectives and the fixed
milestone 3 entry from this roadmap. It does not parse arbitrary roadmaps
or consult the network.

The terminal previews a versioned draft, allows cancellation or revision,
and rechecks observed context before presenting reviewed text for manual
copy. Milestone 3 retains the full review and file export workflow.
Local acceptance covers both objective paths through a real terminal,
deterministic text, cancellation, drift detection, and the Git and execution
boundaries. Nine focused tests passed. The existing offline regression suite
passed 47 tests, with five opt-in sealed capsule cases skipped. TypeScript,
lint, formatting, and the production build passed.

### ADM-3 local checkpoint

Option 8 now supports editable review of the complete draft. Revising
retains unchanged inputs and clears the approval step. Export requires
an explicit SHA-256 confirmation for the current text and a separate
export choice. The builder rechecks its observed repository context
immediately before export. The artifact is byte-identical to the preview,
private, and published at a fixed assignment-derived path in `/tmp`
without overwriting an existing entry. Manual copy and cancellation remain
available.

Approval and export apply to assignment preparation. They grant no
provider, worker, or Git execution authority. The export is intended for
a separately authorized manual Codex session. Live remote state and dirty
file contents remain outside the observed checkpoint.

Local acceptance passed 15 focused tests, 47 existing offline
regression tests with five opt-in sealed capsule cases skipped, and
the standalone 11-test intelligence foundation suite. The terminal
exercise covered both objective paths, revision, cancellation, exact
approval, byte-identical exports, and manual copy. Svelte and TypeScript,
formatting, lint, production build, and the managed environment checks
passed.

### ADM-4 local checkpoint

Option 9 in `npm run jev:develop` previews reports matched to a local export
by assignment ID, format version and starting checkpoint. It reads only
fixed operator-owned regular files under `/tmp`, bounds each input to
64 KiB, and rechecks both digests after explicit confirmation. Version 1
records retain source provenance, the original report bytes and parsed
outcomes. A private, atomic no-overwrite write prevents duplicate imports.

Reported changes, verification, blockers, Git state and remaining work
are displayed as unverified claims. Missing fields stay missing. Imported
commands and references remain inert. The report does not attest execution,
grant authority, or establish acceptance. The README describes the version 1
format, the supported ADM-3 compatibility layout, and temporary storage.

Local verification passed 23 focused importer and builder tests and 47
offline engineering regressions. Five opt-in capsule cases were skipped.
A real terminal export and import preserved exact bytes and refused a
duplicate. The actual ADM-3 report was parsed separately because its
matching assignment export was unavailable. Static checks and managed
environment verification passed.

### ADM-5 local checkpoint

Option 10 assesses an approved assignment, retained report and original
completion report offline. It binds the supplied digests to exact source
bytes and compares retained metadata with a fresh parse. Local Git
observations verify checkpoints, ancestry, net changed paths, and declared
path scope. The review distinguishes contradictions, path violations,
incomplete requirements, missing evidence and unverified claims.

The operator can record an explicit, digest-bound acknowledgment and a
separate human observation. Private, versioned assessment records cannot
replace earlier records. Recording a review leaves completion acceptance
undetermined. The assessor does not replay commands, attest test results
from worker text or look up live remote state.

The real ADM-4 artifacts passed integrity and scope assessment. Seven
reported files matched their net Git diff. The terminal exercise also
covered cancellation, explicit private review of a synthetic case and
duplicate refusal. Thirty focused tests and 47 offline engineering
regressions passed, with five opt-in capsule cases skipped. Static checks,
production build and managed environment verification passed.

Optional live planning (ADM-6), authenticated runner qualification,
AI-1F and later orchestration remain independently gated.

## Baseline and progress

- `feature/intelligence-foundation` is based on merge `28594c7`. PR #54 merged. The owner's baseline evidence records passing [PR CI](https://github.com/FLI-Golf/FliHub-3/actions/runs/45531001595) and [post-merge main CI](https://github.com/FLI-Golf/FliHub-3/actions/runs/45531068690).
- Full legacy browser regression, final charity security acceptance and roadmap closeout remain open. Existing CE-3D through CE-3H gates remain in the [charity roadmap](CHARITY-EVENT-ROADMAP.md).
- AI-1 has server-only providers, validation, process-local quotas and offline tests. AI-1A has a trusted Bash fixture hook and a decline-only native approval adapter. AI-1B has a private SQLite ledger and terminal human approval simulation. See [verification and coverage](INTELLIGENCE-ARCHITECTURE.md).
- AI-1C and AI-1D have a bounded synthetic implementation, including private host-mediated fixture edits and independent verification. AI-1E adds manual service control and operator continuity. AI-2 remains pending and will be the first application feature developed through the accepted Jev-directed workflow.
- The owner’s combined live Jev engineering workflow `580889b8-4d33-4333-9fb2-90d26cc8bb24` reached `complete` with `verified_acceptance`. It recorded 14 successful Jev decisions, six engineering operations, four actual Codex CLI invocations against a synthetic endpoint, one executable test failure, one successful correction, and passing final verification. Estimated Jev cost was USD $0.00027237 and elapsed time was 24.605 seconds.
- Authenticated Codex model integration, independently enforced isolation for real project work, PR CI, and final AI-1F acceptance remain open. The combined workflow verifies the bounded disposable exercise.
- The director now favors action, verification and correction among preauthorized choices. The decision-specific confidence policy retains explicit abstention, defect and security floors, and independent approval and acceptance. Live verification remains a gate before AI-2.

## AI-1 acceptance criteria

- [x] AI disabled by default; no provider credentials required for normal operation.
- [x] Server-only provider boundary with runtime validation and typed outcomes.
- [x] Deterministic mock provider; tests never call paid services.
- [ ] Verify authorization and organization scoping before enabling any application caller.
- [x] Timeouts, rate limits, budget enforcement and safe fallback tested.
- [x] Minimal audit metadata; no raw sensitive payloads in logs.
- [x] Existing check, lint, build and integration tests pass locally using repository-defined commands.
- [ ] GitHub CI passes for the intelligence changes.

## AI-2 acceptance criteria

- [ ] Synthetic CSV headers and approved field names only; no participant records sent.
- [ ] Test representative exact, ambiguous, unknown and malformed headers; preserve deterministic matching.
- [ ] Verify useful suggestions and safe abstention; record live smoke-test latency and available usage data.
- [ ] Suggestions require explicit user confirmation; existing import validation remains authoritative.
- [ ] Disable provider and verify manual import still works.
- [ ] Document implementation and verification results, fix defects, merge, and resume charity development.

## Change control

Use this roadmap as the implementation scope; no additional planning phase is required. Record verification evidence before merge. Use a dedicated PR when authorized. Do not change unrelated charity workflows. Roll back by disabling AI first; retain existing deterministic paths. Any new data collection, external disclosure or paid usage requires explicit approval.

## Companion documents

- [Architecture](INTELLIGENCE-ARCHITECTURE.md)
- [Jev implementation notes (legacy filename)](INTELLIGENCE-PROVIDER-EVALUATION.md)

## Outstanding AI-1F acceptance gates

- Review the combined workflow’s live Jev decisions and disposable engineering evidence, including the isolation preflight, negative scope tests, executable verification, and review artifact handling.
- Verify a deployment boundary for real project context, authorized edits, source and test subprocesses, and an explicitly approved model connection. Keep arbitrary repository work unavailable until these controls are proven.
- Confirm operator authorization, execution and spending budgets, cleanup and retention, documentation, and failure and interruption handling. Require GitHub CI on the intelligence PR and explicit approval before publication or merge.
- Confirm existing tenant, acceptance and charity requirements before AI-2. CE-3D and the previous charity regression, security and closeout gates remain open.

Assignment 8 adds a committed-blob context reader for a single proposed tee-time pilot and improves synthetic worker evidence diagnostics. The authenticated transport and real-project dispatch gates remain open. See the [AI-1F authenticated engineering checkpoint](INTELLIGENCE-ARCHITECTURE.md#ai-1f-authenticated-engineering-checkpoint) for the supported transport investigation and proposed operator authorization.

Assignment 9 adds an authorization-bound offline tee-time pipeline, a sealed Linux candidate verifier and digest-bound review export. Codex proposal admission stays closed because the installed interface leaves resumable execution enabled under local configuration and does not attest the complete effective tool set. See the [sealed tee-time pilot](INTELLIGENCE-ARCHITECTURE.md#ai-1f-sealed-tee-time-pilot) for the local checks and outstanding acceptance requirements.

Assignment 10 adds a typed scoped proposal format, protected compiler checks in the tee-time capsule and offline plan review, progress, cancellation and patch export in `jev:develop`. Live admission still requires a verified deployment policy and authenticated executor routing or an explicitly authorized tool-free API alternative. Full isolated project builds, live acceptance, GitHub CI and charity gates remain open. See [transport deployment and console](INTELLIGENCE-ARCHITECTURE.md#ai-1f-transport-deployment-and-console).

The repository owner accepted the offline tee-time pilot in workflow `73eddca1-d210-432b-aaa7-3aef58be6026`. The walkthrough recorded the initial verification failure, one correction, independent verification and export of the verified patch. The application source remains unchanged. [Owner acceptance evidence](INTELLIGENCE-ARCHITECTURE.md#owner-acceptance-of-the-offline-tee-time-pilot)

AI-1F remains open. Authenticated Codex transport, live Jev-directed engineering, provider egress enforcement, compatible usage limits, full isolated candidate build verification, GitHub CI and final acceptance remain outstanding. AI-2 and CE-3D remain deferred.

Assignment 11 recommends **PROVISION**. The installed CLI honored managed feature pins in a credential-free namespace. The current environment lacks a verified administrator-controlled deployment, complete tool routing and hosted-effect denial, and an approved subscription usage policy. Authenticated admission remains closed. The next milestone is a dedicated-runner admission test under owner-approved provisioning. See the [deployment decision](INTELLIGENCE-ARCHITECTURE.md#assignment-11-deployment-decision).

Assignment 12A prepared a [Codespaces runner provisioning review](INTELLIGENCE-RUNNER-PROVISIONING.md) after the owner confirmed administrator availability in the interactive terminal. The managed feature pins passed the offline probe. Complete effective policy, isolated execution and authenticated service behavior remain qualification gates. 12B provisioning and any credentialed activity require separate authorization.

12A closeout records the owner’s manual development authority and hardens the runner provisioning procedure. Effective local overrides and deployment isolation remain qualification requirements for 12B.

12A-R completed the offline runtime harness for Codex CLI 0.172.0. Strict startup and managed requirements checks passed, including rejection of invalid configuration fixtures. Ephemeral threads retained approval `never` and read-only, network-disabled sandbox settings across conflicting CLI values and after managed-policy rejection of prohibited settings updates. Configuration-layer discrepancies remain recorded. Independent web-search denial and native and hosted tool effects still need evidence. Deployment isolation and all authenticated admission gates remain open. 12B still requires separate authorization. [Runner provisioning evidence](INTELLIGENCE-RUNNER-PROVISIONING.md)
