# FliHub Intelligence — Architecture

## Application foundation

`src/lib/server/intelligence/` contains the shared service, decision definitions, validators and disabled, mock and Jev providers. The server entry point creates one instance per process. At the original foundation checkpoint there were no application route or PocketBase callers.
The later JAI development interfaces provide protected offline synthetic application callers.
Persistent domain integration remains deferred. The registered development decision accepts only fixed synthetic descriptions, including the ordinary test and unfamiliar dependency fixtures. Adding CSV mapping requires a new decision definition and task-specific runtime input validation.

A future application caller resolves actor and organization membership on the server, checks authorization, applies deterministic rules and sends only a minimized, validated decision input. The service returns a suggestion, abstention, unavailable outcome or disabled outcome. The caller retains the manual or deterministic workflow on all fallback outcomes. Before committing a confirmed suggestion, the domain operation rechecks authorization and validates the action. Existing PocketBase rules and domain operations remain authoritative.

## Embedded application intelligence

Application intelligence follows
[Embedded Intelligence Workflow Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md).

FliHub owns structured workflow progression, context
construction, eligibility, validation and authoritative
execution. Jev supplies optional contextual recommendations.

Keep provider decisions separate from domain authorization.
Reuse appropriate deterministic services and exact review
contracts across conventional and intelligence-assisted paths.

The protected workspace remains a development-only
synthetic acceptance surface.

These application architecture decisions do not change
engineering worker qualification, provider limits,
approval boundaries or existing acceptance gates.

## Configuration and limits

| Private environment variable              | Behavior                                                    |
| ----------------------------------------- | ----------------------------------------------------------- |
| `FLIHUB_INTELLIGENCE_ENABLED`             | Must be exactly `true`; default disabled                    |
| `FLIHUB_INTELLIGENCE_PROVIDER`            | Explicit `mock` or `jev`; other values select disabled      |
| `TYPESAFE_API_KEY`                        | Read only for explicitly enabled Jev with sufficient budget |
| `FLIHUB_INTELLIGENCE_TIMEOUT_MS`          | Default 1500, range 1–10000                                 |
| `FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE` | Default 10, range 1–60; rolling window                      |
| `FLIHUB_INTELLIGENCE_CONCURRENCY`         | Default 2, range 1–8                                        |
| `FLIHUB_INTELLIGENCE_BUDGET_INPUT_TOKENS` | Default zero; Jev requires 65536–100000000                  |

Invalid explicit rate, timeout or concurrency settings disable dispatch. Jev reserves 65,536 input tokens before each request, using the documented default request context as a conservative bound. Successful validated results settle to reported input tokens. Unknown costs, malformed results and timed-out calls retain the full reservation. Usage above the reservation closes dispatch for the lifetime of the service. Timeout aborts the HTTP request and returns fallback; an unsettled transport still occupies its slot. The service caps the success body at 16 KiB and issues no retries.

These limits apply to one service instance. Restarts and replicas each have separate counters. Coordinate a shared budget or enforce an account-level limit before a distributed rollout. The estimated dollar conversion uses the documented list price and does not represent an invoice.

The optional audit callback receives a random request ID, registered decision ID, provider, allowlisted model, outcome, sanitized failure reason, latency and validated token usage or estimated cost when available. It excludes raw payloads and provider errors. The application-level service has no persistent sink. The development-only ledger described below has separate local access controls.

## Codex integration and coverage

Codex CLI 0.172.0 lists stable hooks. Generated local app-server TypeScript bindings expose `item/commandExecution/requestApproval`, `item/fileChange/requestApproval` and `item/permissions/requestApproval`. A client that owns its app-server connection can decline a native approval request or ask a human for a decision. The documented Codex TypeScript SDK wraps the CLI for turn execution and events and exposes no general authorization callback. Native approvals and sandbox settings remain authoritative. [App-server approvals](https://learn.chatgpt.com/docs/app-server#approvals) · [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)

| Mechanism           | Verified coverage and limits                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreToolUse`        | Can deny covered Bash, unified exec, apply_patch, MCP and other local function calls before they run. Native `ask` is unsupported here.                                                                                                       |
| `PermissionRequest` | Can deny or defer to the native prompt on covered approval requests, including shell escalation and managed network. Only fires when Codex is about to request approval. An allow may suppress that prompt, so the prototype never emits one. |
| App-server          | An owning client can respond to emitted command, file and permission requests and handle supported MCP workflows. Already-permitted operations do not require an approval response.                                                           |
| Coverage gaps       | Hosted tools such as WebSearch, specialized paths, subsequent `write_stdin` input and subprocess activity inside a shell command do not receive an independent pre-tool decision. Post-tool events run after side effects.                    |

Hooks require trust and may be restricted by managed settings. Invalid hook output or hook failure can let a call continue. A hook is an additional control for its covered calls. [Official Codex hooks](https://learn.chatgpt.com/docs/hooks#tool-coverage)

## Development hook and approval coverage

The original `policy.ts` is a fixture-only evaluator. The development integration uses `hook.ts` and `guardrail.ts` with Codex `PreToolUse` metadata from stdin. It compares the session cwd with a configured real path and checks the tool workdir when supplied. Exact inert commands map to built-in categories. Additional shell syntax and unknown commands are denied on this covered path. The event does not always expose effective workdir, shell options or native permission state. The hook makes no grants and relies on Codex for effective execution permissions.

The read-only print fixture returns an empty hook reply and continues under native policy. A restricted fixture receives a mandatory denial before any assessment. Ambiguous tests and dependencies start in review. A structured mock recommendation may tighten review to deny. Unavailability, malformed Jev output and timeout preserve review. Because `PreToolUse` cannot request approval, review blocks the call and emits an audit decision ID. The app-server adapter can decline command or file escalation or return an empty permission grant. Human decisions are exercised through the terminal demonstration and never cause a native grant or rerun a blocked tool.

Use the example configuration only in a separate trusted test environment. Substitute absolute paths for the hook, canonical fixture directory, and private audit directory. Review the hook definition with `/hooks` there. Leave native sandbox and approval settings enabled. The example matches Bash only. External processes, hosted tools, later stdin writes, specialized paths and actions embedded in a subprocess lack independent coverage. Exceptions handled inside the hook return a denial. Process failure can let the native call continue, so the hook cannot replace sandbox or execution policy.

### Isolated verification

Codex CLI 0.172.0 used a localhost-only synthetic Responses endpoint and a separate test configuration. With the trusted hook, the read fixture ran, the restricted and unsupported Bash fixtures were denied, and the ambiguous ordinary test was blocked for review. A separate stdio app-server run with read-only sandbox and on-request approval emitted a real command approval request for a harmless escalation. The test client used the decline adapter, and the next ordinary read fixture ran. Command, file and permission response shapes are covered offline. The harness also verified that an audit-store permission failure returns a denial. When the trusted hook process exited with status 1 before returning a decision, Codex continued to native policy and ran the harmless print fixture. This is a confirmed coverage gap.

## Development audit and human approval

The ledger uses Node 24's built-in SQLite driver. By default it lives under the local operator's home at `.flihub-dev-guardrail/decisions.sqlite`. A trusted operator can configure a different directory in an isolated environment. On POSIX the code checks owner, directory mode 0700, database file mode 0600 and a single link. Keep the directory under a trusted parent. Local users with the same OS identity and administrators share that trust boundary. This ledger does not provide external tamper evidence or automated retention.

A record stores a UUID, timestamps, policy version, provider, category, verdict, bounded reason and approval state. A per-ledger HMAC binds exact proposal identity and available native identifiers without storing raw source, commands, arguments or native IDs. The native binding is unique within a ledger. Approval or rejection requires an explicit local terminal choice and the matching immutable proposal. Review decisions expire after two minutes. Single-statement conditional updates enforce expiry, cancellation, state transitions and one-time consumption across concurrent connections. An approved demo grant is consumed only for simulation. The hook and app-server bridge emit no native approval, and the model cannot write a human verdict.

## Run the offline prototype

Run from the repository root with Node 24 on a POSIX system.

```sh
node tests/intelligence.test.mjs
node tests/development-guardrail.test.mjs
FLIHUB_GUARDRAIL_AUDIT_DIR="$(mktemp -d)" node tools/intelligence/demo.ts test
FLIHUB_GUARDRAIL_AUDIT_DIR="$(mktemp -d)" node tools/intelligence/demo.ts dependency
FLIHUB_GUARDRAIL_AUDIT_DIR="$(mktemp -d)" node tools/intelligence/demo.ts secret
```

The test fixture prompts on a TTY for approve, reject or cancel. The dependency fixture is denied by the mock recommendation and the protected credential fixture is denied locally. None of the demonstration commands attempts to execute a proposed action. Use a shared private directory across demo invocations if persistent inspection is wanted.

Local verification passed 543 unit checks, including 19 intelligence and guardrail tests, and all 215 disposable integration checks. Type checking, lint, production build and diff validation passed.

Before AI-2, verify branch CI, retain native policy as the enforcement boundary and agree on audit retention. Wider guardrail deployment requires a trusted host execution path, coverage verification and protection against hook-process failures. An application caller still needs authorization, tenant isolation and confirmation tests. Live Jev verification requires separate explicit authorization.

## Development director and worker

Jev is the primary decision maker within an explicitly authorized synthetic workflow. The coordinator offers only eligible identifiers. A validated task or next-action choice directly changes which job is dispatched. Codex is the execution worker. Deterministic dispatch policy, native permissions, human grants and verified acceptance govern each transition.

The centralized Choice registry defines task selection, priority, approach, risk, verification strategy, test assessment, defect triage, retry or escalation, acceptance readiness and next action. Each request names a registered phase and an eligible subset of registered candidate IDs. The API receives fixed descriptions, never raw source, commands or project records. Explicit abstention and unrecognized choices stop progression. Confidence gates are specific to the decision. This loop uses task selection, next action, test assessment, defect triage, retry or escalation, and readiness. The other contracts are available for later approved workflows. The provider cannot emit executable commands.

The synthetic catalog has two initially eligible tasks and a third that depends on both. The coordinator tracks authorization, task completion, observed verification, defect correction and acceptance. It reserves budget and checkpoints before each provider call or worker execution. It reconciles only trustworthy usage, retains uncertain reservations and stops without retries on uncertain billing. Worker errors, missing evidence, unexpected changes, deadline, request, invocation, retry, repeated-failure, iteration and changed-file limits are independent stops. Correction can precede a repeated verification when fixture state changed. An unchanged result cannot produce an unbounded retry. A recommendation of completion only becomes acceptance after all tasks have evidence and verification passed.

The mock worker simulates edits and verification. The separate real Codex adapter runs an ephemeral, read-only CLI session against a trusted localhost fixture endpoint with escalation disabled and an explicit child environment allowlist. It accepts only the fixed verification job. It checks the fixture before and after the run and corroborates the command, exit status, marker and completed turn using CLI JSON events. The read-only sandbox can permit reads outside the fixture directory. The adapter does not dispatch application changes. A production-capable worker needs an independently provisioned writable boundary confined to authorized files and independent test/build collection. A PreToolUse hook cannot supply that boundary because of its confirmed process-failure gap.

### Checkpoints and retention

The workflow ledger reuses the private POSIX directory/file checks from AI-1B in a separate `workflows.sqlite` database. Protected files and operations are fixed catalog identifiers. Records contain workflow and job IDs, decision origin and category, selected identifier, confidence, outcomes, verification status, approvals, transitions and budget counters. The operator account owns the ledger. Records whose last update is more than 30 days old are purged when the store opens. This is logical expiration, with no backup or secure-erasure guarantee. Keep production records and secrets out of this ledger.

Optimistic version checks serialize competing updates. A pending external checkpoint blocks duplicate dispatch. An operator can inspect, pause, cancel, approve an unexpired task-bound proposal, or resume an idle operator-paused mock workflow. Uncertain in-flight work is paused for evidence reconciliation, never replayed. Model-directed clarification and review also pause. Human grants are one-use and cannot modify native settings. Resuming a live workflow needs a separately authorized runner. The CLI controls only resume dispatch automatically for mock workflows.

### Demonstration

From the repository root with Node 24 on POSIX:

```sh
node tools/intelligence/orchestration/demo.ts success
node tools/intelligence/orchestration/demo.ts abstain
node tools/intelligence/orchestration/demo.ts invalid
node tools/intelligence/orchestration/demo.ts budget
node tools/intelligence/orchestration/demo.ts repeat
node tools/intelligence/orchestration/demo.ts scope
node tools/intelligence/orchestration/demo.ts approval
node tools/intelligence/orchestration/demo.ts cancel
node tools/intelligence/orchestration/demo.ts recover
```

The result includes a private directory and workflow ID. To inspect or operate on a saved mock run:

```sh
FLIHUB_GUARDRAIL_AUDIT_DIR=/path/from/demo node tools/intelligence/orchestration/control.ts inspect WORKFLOW_ID
FLIHUB_GUARDRAIL_AUDIT_DIR=/path/from/demo node tools/intelligence/orchestration/control.ts approve WORKFLOW_ID
```

Accept this boundary and branch CI before AI-2. The first application workflow needs verified tenant-scoped authorization, a confined worker capable of producing independent execution evidence, test and build collection and expected human confirmation. Preserve all charity gates.

The real read-only Codex adapter passed an isolated localhost Responses fixture. A genuine Codex command event corroborated the exact read, marker, zero exit status and completed turn. The directory stayed unchanged. No paid Codex model was used.

## AI-1D fixture execution and AI-1E manual environment

The first provider decision is now task selection with registered descriptions for only eligible work. Verification strategy selects targeted or broader host checks, and implementation approach chooses the compact or expanded fixture template. After a failed check, defect triage and retry decisions determine whether to correct, reconsider or escalate. A risk classification can pause a correction, while protected work always needs an independent grant. Readiness and the next action can advance or stop the workflow, subject to actual evidence. Task priority remains defined for a workload with meaningfully distinct priorities. Asking it in addition to task selection would duplicate the decision in this catalog.

The console's fixture worker changes only two registered names inside an operator-owned mode-0700 workflow directory. The host maps registered task and approach IDs to fixed bytes, rejects symlinks, unrelated entries and checkpoint mismatch, and atomically replaces the approved fixture. It verifies syntax using a bounded Node subprocess, and verifies the synthetic result and acceptance contract independently. It records build and test outcomes separately. This does not run project verification commands.

The optional trusted-localhost adapter automatically starts read-only, ephemeral Codex processes with native escalation disabled. Its environment is allowlisted and omits TypeSafe credentials. It requires the exact structured fixture acknowledgement and rejects execution or file-change events, unexpected directory changes, missing output and timeout. Host-mediated edits remain the only writes. Real Codex subprocesses against a local synthetic endpoint were verified through an initial failing check, correction and successful independent fixture checks. No Codex model or Jev account was billed.

Worktrees and scratch checkout copies separate files but do not restrict processes. Bubblewrap with network namespace isolation failed at NETLINK_ROUTE inside the managed shell and succeeded in the separately approved host probe. This proves namespace availability in that context. A general engineering worker still needs a provisioned filesystem and network policy covering its model channel, nested tools and test/build subprocesses. Native read-only mode may allow reads outside a fixture. The acknowledged fixture mode is limited to a trusted synthetic endpoint and cannot be used as a general repository writer. The existing hook failure gap remains.

`npm run dev:all` manually starts or recognizes healthy loopback services. Mutating service commands serialize through a per-checkout lock. The manager uses Linux boot and PID start identity, plus pidfd signalling for graceful shutdown. It does not assume ownership of independently started instances. It leaves successful services running if a later service fails and gives a log path for diagnosis. `npm run dev:status` uses read-only probes and SQLite access. `npm run dev:stop` preserves application and workflow data. No service command launches an intelligence workflow.

`npm run jev:develop` defaults to the offline mock director. It requires explicit scope authorization before a new synthetic run. It records workflow state under `~/.flihub-dev-guardrail` or an operator-supplied `FLIHUB_GUARDRAIL_AUDIT_DIR`. The selected worker mode and optional localhost port persist. Reopening a workflow verifies the saved content checkpoint before the next fixture operation. Interrupted pending work requires reconciliation and is never replayed. A healthy idle paused mock workflow can be explicitly resumed. The console never automatically resumes live work.

Before AI-2, complete AI-1F and independently verify a repository-writing worker boundary with evidence from real project tests and builds. Existing tenant, acceptance and charity gates remain in effect.

## Director operating policy and confidence

Jev directs work within operator-approved scope. Offer concrete eligible choices and favor progress through implementation, verification and bounded correction. Escalation is appropriate when evidence is materially missing, work exceeds authorization, or the independent policy requires approval. The orchestration loop leaves budget and mandatory approval enforcement to deterministic gates. It keeps clarification and blocker paths available where the model can identify a genuine need.

| Decision                                                                            | Minimum Choice confidence                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Task selection, task prioritization, implementation approach, verification strategy | None                                                                |
| Test assessment, retry or escalation, acceptance readiness, next action             | None. The host verifies evidence and constrains authorized effects. |
| Defect triage                                                                       | None for bounded corrections                                        |
| Risk classification                                                                 | 0.90, also the minimum permitted override                           |

Decision-specific operator overrides use the private environment variable `FLIHUB_DIRECTOR_CONFIDENCE`. Set it to a JSON object keyed by registered director decision IDs, for example:

```sh
FLIHUB_DIRECTOR_CONFIDENCE='{"taskSelection":0.5,"taskPriority":0.5,"implementationApproach":0.5,"verificationStrategy":0.5}'
```

Supply numeric values in [0, 1]. A zero floor accepts a validated choice with missing (null) reported confidence without inventing a score. Invalid configuration rejects director requests before provider contact. An explicit abstention always stops, including when no numeric floor applies. The separate development guardrail assessment retains its existing threshold and review behavior.

TypeSafe defines Choice confidence as the selected probability's concentration above a uniform baseline. With three options including abstain, proposed concentration floors of 0.50, 0.60 and 0.90 correspond to top probabilities of about 0.667, 0.733 and 0.933. The number of options affects this mapping. The default routine choices omit the proposed 0.50 floor because selected options already have independent scope checks and any subsequent protected action still requires approval. Confidence never grants authority, determines whether required tests passed, waives budget limits, or changes the independently verified acceptance criteria. [TypeSafe confidence semantics](https://docs.typesafe.ai/confidence)

## End-of-day checkpoint (2026-11-25)

The owner reported that combined workflow `580889b8-4d33-4333-9fb2-90d26cc8bb24` reached `complete` with reason `verified_acceptance`. Live Jev returned 14 successful decisions over six engineering operations. Four actual Codex CLI invocations used the synthetic model endpoint. An executable test failed, one correction succeeded, and final verification passed. Estimated Jev cost was USD $0.00027237 and elapsed time was 24.605 seconds.

This run supplies live director evidence and executable evidence for the disposable fixture. Authenticated Codex model integration, independently enforced isolation for real project context, edits and test/build subprocesses, and final AI-1F acceptance remain outstanding. The PR and corresponding GitHub CI evidence are pending. AI-2 and CE-3D remain gated.

## Isolated source engineering and review

The separate engineering catalog authorizes exactly `discount.mjs` and `discount.test.mjs` in a disposable private workspace. Its workflow uses the same director, checkpoints, approval gates, deadlines and budgets. Jev can select a bounded correction based on a working defect hypothesis. Defect classification alone proves neither the fault nor the fix. Explicit abstention and the 0.90 security classification floor remain in force.

This worker launches a real Codex CLI process without escalation and automatically runs a deterministic synthetic Responses endpoint inside a Bubblewrap capsule. The capsule has new mount, PID and network namespaces and loopback only. The workspace and trusted harness are mapped read-only. System runtime files under `/usr` are read-only. The host checkout, home, and credential environment are absent. Worker subprocesses use time and output limits. A per-ledger lock serializes capsule operations. Scope, native Codex controls and the external namespace apply independently of hooks.

Codex receives only the disposable source context and returns a structured proposal. The outside broker checks the exact task target, bounded source grammar, private workspace manifest and durable snapshot hash before its atomic write. Build and executable test evidence comes from a fresh capsule running host-selected commands and trusted assertions from an independent harness, alongside the proposed test file. A correction must pass the independent tests before acceptance. The test model only exercises the transport and failure/correction path. It does not demonstrate live Codex reasoning.

Run the offline exercise using `node tools/intelligence/engineering/demo.ts` or choose option 6 in `npm run jev:develop`. Only use an environment where the worker isolation probe passes. In this session, managed execution does not permit the required network namespace setup. An explicitly approved host execution can supply it. No fallback to a wider process is used.

After verified acceptance, use `FLIHUB_GUARDRAIL_AUDIT_DIR=/path/from/demo node tools/intelligence/engineering/review.ts WORKFLOW_ID > /tmp/engineering-review.patch` to export a digest-bound proposal for human review. Export rejects stale files and incomplete evidence. It never applies a patch or writes Git state. An authorized operator may review the patch, check it against a separately authorized destination with `git apply --check`, and apply through the normal reviewed change process. The included patch targets disposable fixture filenames. Application changes require their own authorized catalog and approval, and general repository execution remains disabled.

## Engineering operating modes

**Assisted Development Mode** is a proposed human-directed workflow for ordinary FliHub engineering. It should initially operate offline and deterministically. An operator selects a roadmap and phase or enters a custom objective, reviews read-only repository facts and applicable instructions, and prepares and exports a complete Codex assignment. The human starts Codex separately under the existing manual development authority and native security controls. Future report import, independent evidence review, progress tracking, checkpoints, history and audit presentation support closeout. This mode must never launch Codex automatically, access model credentials, execute generated commands, modify application records or contact paid providers.

**Automated Development Mode** retains the existing engineering architecture. Jev recommends registered eligible tasks through bounded decision contracts. Deterministic orchestration and native controls govern authorization and progression. Authenticated Codex proposal or execution requires independently enforced worker isolation, exact source and candidate binding, independent verification, bounded defect correction, execution and spending budgets, durable checkpoints, and human review before controlled publication. AI-1F remains the governing qualification. Assisted workflows and offline verification cannot satisfy authenticated admission, runner qualification or automated engineering acceptance.

### Development Assignment Builder

The proposed builder collects repository identity, branch, full starting commit, working tree status and synchronization evidence using bounded read-only inspection. Record what was actually observed. Distinguish a comparison with the local tracking ref from a live remote observation. Discover governing repository instructions and roadmap references. Accept a registered roadmap phase or a human-entered custom objective. Review scope, exclusions, acceptance criteria, required verification, authorized Git operations and completion report requirements before export.

Label observed facts, cited requirements, human objectives, proposed approaches, optional future Jev recommendations, and unknowns separately. Recheck the starting checkpoint after changes that could invalidate the assignment, and require review of material changes before reuse. Unknown facts stay unresolved. Scope expansion and changes to acceptance requirements require separate authority. Export a reviewed, versioned text artifact for a manually initiated Codex session. Treat generated text as data. The artifact grants no execution permission and cannot override repository instructions, human authorization or native controls.

### Qualified Development Advisory

Qualified Development Advisory is a proposed, separately gated optional capability for bounded Jev planning and contextual assessment of development evidence. It is distinct from the offline Development Assignment Builder and ADM-5 evidence assessor. Until its qualification and controlled activation gates pass, Assisted Development Mode remains offline and deterministic: it does not inspect credentials, contact a provider, dispatch Codex, execute generated commands, or mutate application data. No documentation milestone below authorizes a live request.

FliHub may reuse the existing server-only provider interface, registered decision schemas and runtime validators, timeout and usage reservation controls, deterministic dispatch checks, sanitized audit metadata, and source provenance patterns as design inputs. These components were built for existing intelligence workflows; their presence does not qualify them for development advisory. Before reuse, document and test the exact contract, threat model, accounting semantics, failure behavior, and data minimization for this capability. The operator console remains outside production application routes.

The initial advisory contract is bounded to a selected supported roadmap objective or an operator-authored objective, explicitly approved sanitized repository facts and documentation references, and a narrowly defined requested recommendation. It must exclude credentials, participant or organization private data, source code, command arguments and outputs, unreviewed completion reports, private experiment evidence, and arbitrary repository text. Repository content and provider output are untrusted data. The provider may return a validated recommendation, abstention, or unavailable outcome; it cannot return executable commands or alter eligibility, scope, authorization, budgets, verification requirements, or acceptance.

Before any live call, the operator must inspect the complete canonical outbound disclosure, including provider, decision, exact serialized payload, data sources, declared limits and expected retention. Approval is bound to the payload digest and expires or is consumed once; any changed byte, source, decision, provider or limit invalidates it. A distinct live-dispatch authorization must independently name the operator, approved objective and provider, enablement window, request ceiling, per-request and aggregate spending ceiling, and timeout. Neither assignment approval nor disclosure approval implies dispatch authorization. If exact disclosure review or independent dispatch authorization is unavailable, the workflow remains offline.

Qualification must demonstrate enforceable request count and concurrency limits; a finite request timeout; a hard local spending reservation before dispatch; trustworthy settlement only from validated usage; full reservation retention when cost is unknown; and dispatch closure when a reservation cannot be honored. Provider-side account limits and invoice semantics are not assumed. The maximum request and spending budgets must be shown before approval and remain below operator-authorized ceilings. A timeout, transport ambiguity, malformed or oversized response, schema violation, provider error, cancellation uncertainty, accounting mismatch or audit failure must yield a safe unavailable outcome, retain uncertain cost reservations, avoid automatic retries, and preserve the deterministic manual workflow. The response body and decision schema must have explicit size and field bounds. Sanitized provenance must bind decision ID, payload digest, provider/model identity where available, approval and dispatch authorization references, request ID, timestamps, outcome, validated usage, and failure category without retaining the raw disclosure or response by default.

Jev advice is non-authoritative. FliHub validates responses and retains all workflow progression, scope, deterministic checks, authorization and execution control. A human must independently review any proposed assignment or evidence conclusion. Existing local evidence assessment remains authoritative for observed Git facts and explicitly records missing or unverified claims; advisory cannot attest that commands ran, tests passed, changes were safe, or acceptance is complete. Codex continues only in a separately initiated, explicitly authorized manual session under native controls. Manual preparation, local verification and evidence review remain available whenever the provider is disabled, unavailable, abstains, times out, exceeds limits, returns invalid content, or fails qualification.

No provider guarantee is currently established for invoice-level cost finality, cancellation of in-flight billing, retention/deletion behavior, residency, model/version stability, or service availability. Before live qualification, obtain and verify the applicable provider terms and account controls, define uncertainty and reconciliation procedures, test egress and secret exclusion at the actual deployment boundary, and document retention and incident handling. Do not describe a local reservation as a provider-enforced hard spending cap unless provider controls independently prove that property.

The proposed ADM-6 qualification subdivisions are recorded in the roadmap. They are stages within existing milestone 6, not replacements for AI-1F, Assignment 12B, ADM milestones, or any independent acceptance gate. ADM-6A is architecture and qualification documentation only; it makes no provider request and does not authorize implementation stages or live activation.

#### Offline development advisory simulation

The accepted ADM-6D offline workflow uses one process-local review per harness instance and a fixed
in-process simulator over registered synthetic cases. The preview identifies itself
as simulation while preserving the accepted disclosure envelope. The harness
checks the immutable UTF-8 snapshot against the review digest, consumes the exact
approval before invocation and checks the bytes again at the simulator boundary.
Replacing or cancelling a review invalidates the prior attempt. A timeout or
cancellation wins over a delayed fixture result.

Run `node tools/development/advisory-preview.mjs planning` or pass
`evidence-assessment` in an interactive terminal. The preview displays the complete
synthetic review and requires explicit digest confirmation. Manual assignment
preparation and evidence assessment remain available through the existing console.
Fixture usage exercises local limit checks. Sanitized provenance records reviewed
digests, size, decision, source categories and bounded outcome. The simulation
reports advisory results. FliHub retains deterministic authorization. Codex
implements in separately authorized manual sessions, independent verification
establishes evidence, and the owner controls acceptance. ADM-6D independent
verification and human acceptance apply to the exact offline checkpoint.
ADM-6E live qualification remains separately gated.
[Issue #94 acceptance](https://github.com/FLI-Golf/FliHub-3/issues/94#issuecomment-7241436818)

#### Offline real development context

ADM-6E.1 uses a separate versioned fact registry and a bounded read-only Git and
GitHub collector for FLI-Golf/FliHub-3. It verifies public visibility, pins Git
revisions and registered evidence references, timestamps each observation, and
maps eligibility and provenance to closed enums. Selection consists of one
objective and its required facts, plus an optional registered #62 status fact
for the qualification objective. The two objectives are qualification prerequisite
review and funding draft reconciliation. PR #52 is an assessment subject. Charity
and funding implementation remains deferred, and the old intelligence foundation
branch remains a historical reference.

Run either command from an interactive terminal with the stored authenticated
GitHub CLI session and the relevant Git objects already available locally.

```sh
node tools/development/real-advisory-preview.mjs qualification-prerequisite
node tools/development/real-advisory-preview.mjs funding-draft-reconciliation
```

The first command optionally takes `--include-engineering-qualification`. The
preview performs bounded GitHub reads, displays the exact canonical UTF-8 review
candidate, both digests, and its offline-only constraints. Confirm by entering
`APPROVE <review-sha-256>`, or cancel with Enter. Confirmation refreshes the
selected facts, compares their content and pins, and rejects on change or
unavailability. Initial observation timestamps remain bound to the reviewed
bytes. Context expires 60 seconds after the earliest fact observation, shorter
than the accepted review and approval lifetimes. The preview returns only a
process-local confirmation. No dispatch or engineering authority is issued.
For independent verification, hash the exact printed JSON line without its
terminal newline and compare with the review SHA-256. Repeat with a wrong
digest and cancel. The synthetic preview, manual assignment builder and evidence
review remain available.

The offline candidate admits at most eight public facts and 16 KiB canonical
request bytes. It records the future 4 KiB response and four supporting fact
limits. Actual response validation and dispatch-time freshness belong to later
qualification. Raw source, arbitrary prose, credentials, raw command output,
financial and participant records, and private artifacts are excluded. Public
classification does not grant permission for external disclosure.

#### Offline dispatch authorization and redemption

ADM-6E.2 exercises a local dispatch-authorization lifecycle. An operator first
confirms the exact real-context disclosure, then separately authorizes the
displayed dispatch binding. The simulated request is a distinct canonical UTF-8
artifact with its own digest, fixture provider, in-process destination, protocol
and configuration identity. It has no external transport. The ADM-6E.1 review
envelope is neither this fixture request nor a qualified Jev wire request.
Any future content transformation, destination or protocol requires its own
exact review and separate authorization.

The closed authorization binds a registered repository and objective, numeric
GitHub operator identity, random review and grant IDs, context/disclosure/request
digests, evidence pins digest, transport and limits, purpose, issuance and
expiry. Exact equality to the locally issued canonical record rejects unknown
or altered fields. Grant lifetime is at most 30 seconds and cannot outlast the
60-second context window. A redemption attempt locks the grant before asynchronous
revalidation. Success consumes it. Expired, invalidated and cancelled attempts
remain terminal, including replay following failure. State is process-local.
This supplies no restart-safe or distributed redemption guarantees. The receipt
reports unavailable reservation admission, zero external requests and no
provider or engineering authority.

The qualified collector pins the owner-approved GitHub numeric account ID from
the established authenticated operator account and checks the accepted comment
author against it. It verifies the authenticated operator before and after each
collection. It uses metadata-checked absolute Git/gh image executables, a
reduced environment and explicit github.com, metadata-checked operator-owned
CLI configuration locations, and an isolated temporary Git directory that
excludes checkout config and replacement refs. Local objects must already be
available. Local ancestry/divergence is corroborated by GitHub comparisons
at exact SHAs, and roadmap bytes by their GitHub-pinned blob identity.
An opening and closing query brackets the sequential evidence reads. This
detects observed changes and does not create an atomic GitHub snapshot.
The host image, same-user GitHub configuration, TLS trust and local process
integrity remain environmental trust assumptions. Credential files are not
read by the TypeScript workflow. The authenticated gh process uses its own
stored session. The development checkout and trusted image must be operator
controlled.

From the original checkout on the supported Codespaces image, run in an
interactive Bash terminal with the approved stored GitHub CLI session.

```sh
node tools/development/dispatch-authorization-preview.mjs qualification-prerequisite --include-engineering-qualification
node tools/development/dispatch-authorization-preview.mjs funding-draft-reconciliation
```

Review both exact JSON lines and digests. Enter `APPROVE <disclosure-digest>`
then the separately displayed `AUTHORIZE SIMULATION <binding-digest>` challenge.
The redemption receipt shows zero external requests. Enter cancellation and
wrong approval leave manual review available. Independent verification should
hash the exact UTF-8 lines without a trailing newline, reproduce focused and
restricted fixtures, and inspect the dependency boundary. This preview performs
bounded authenticated GitHub reads. It never contacts an intelligence provider.

ADM-6E.3 retains durable reservation and accounting responsibility. Offline
integration and independent safety review follow, with any real transport
activation separately authorized. Automated engineering and production
activation remain separate gates.

#### Durable offline reservation accounting

ADM-6E.3 extends the simulated authorization with a distinct accounting
challenge that binds exact disclosure and fixture request bytes to the fixed
worst case of 10 synthetic usage units and 20 synthetic credits. The existing
ADM-6E.2 preview remains available. Successful fresh accounting redemption
produces an opaque process-local handle. The ledger acquires a SQLite
`BEGIN IMMEDIATE` lock before consuming the handle and checking budgets.
The committed row uniquely binds reservation, review and grant IDs, request
digest, and a digest of the complete authorization and reservation. The handle
is discarded even after failure. A durable row never acts as a reusable grant.

Use the Node SQLite primitive already used for local intelligence records, in a
separate synthetic ledger. The private directory and files use 0700/0600,
canonical paths, inode and identity checks, an exclusive initialization marker,
and no symlinks or hardlinked database files. Explicit initialization avoids
recreating a missing ledger on routine open. Strict schema, application ID,
version, persisted policy, physical size and record limits are checked. SQLite
uses a local rollback journal, full synchronization and single-writer
transactions, with bounded waits. This is a single local filesystem design
across processes, with trusted OS/operator ownership. It does not prevent
deliberate same-user tampering, restoring a full older copy or a faulty volume
rollback. Process-death recovery evidence does not establish power-loss behavior.

Reservations move from reserved to claimed, or to released with atomic proof
that no claim was recorded. Claims are process-local handles. They can settle
validated synthetic usage once, or retain liability as uncertain. After restart,
a claimed row is treated as unresolved and can only be explicitly marked
uncertain in this phase. Invalid settlement retains its reservation. Reported
overage retains the greater amount on each axis and closes admission. Duplicate
or conflicting completion attempts cannot change a terminal record. Expiry
never automatically releases a reservation. An unclaimed reservation may be
released only through the explicit reconciliation transaction with both IDs. No
post-claim release, retry or external billing reconciliation is supported here.

The demo policy is eight cumulative requests, two outstanding reservations,
40 synthetic usage units and 80 synthetic credits. Settled values plus reserved
and uncertain/claimed liabilities reduce available units and credits. Release
frees those two balances and does not restore the ordinal request count. The
ledger accepts bounded integers only, with no rounding, conversion or actual
provider price. The fixture settlement uses 4 units and 7 credits. The ledger
caps recorded requests at 128 and the database at 1 MiB.

```sh
node tools/development/reservation-accounting-preview.mjs init
node tools/development/reservation-accounting-preview.mjs run qualification-prerequisite
node tools/development/reservation-accounting-preview.mjs run funding-draft-reconciliation
node tools/development/reservation-accounting-preview.mjs inspect
node tools/development/reservation-accounting-preview.mjs reconcile release-unclaimed <reservation-id> <authorization-id>
```

The terminal demo uses one dedicated ledger under the operator home directory.
It performs bounded authenticated GitHub reads for real-context evidence. Enter
the exact disclosure approval and then the displayed separate accounting
challenge. After reservation, CLAIM and SETTLE exercise the fixture. HOLD leaves
a reserved row available for inspection by another process, and Enter releases
an unclaimed row. After claim, Enter instead records uncertainty. Interrupted
sessions leave durable state for inspection. Use the explicit
`record-uncertain` reconciliation mode for a retained claim. Every receipt reports
zero external provider requests, $0.00 actual cost and false provider and
engineering authorization.

ADM-6E.4 must independently test the integrated boundaries, recovery and manual
fallback. ADM-6E.5 retains separate authorization, actual wire and destination
qualification, egress verification, real price/billing semantics, durable
external reconciliation and controlled provider use. No provider transport is
reachable from this demo.

### Completion report ingestion and evidence review

Bind reports to an assignment identity and version, starting and ending commits, and changed-file inventory. Capture implementation summary, verification results, outstanding requirements, blockers and deviations, security checks, Git synchronization evidence and human acceptance status. Track progress and checkpoint history against the assignment and retain provenance for each evidence item.

Distinguish worker-reported claims, independently observed evidence, human-confirmed browser observations, missing or unverified items, and failures or incomplete requirements. Match evidence to the applicable scope and checkpoint before accepting it. A completion marker, worker claim or Jev recommendation cannot establish acceptance. Human review remains required, and mandatory requirements still need supporting evidence.

Treat imported reports and embedded references as untrusted data. Apply bounded input sizes and validation, preserve provenance, exclude credentials and sensitive payloads, and assess private storage, access and retention. Import never executes commands, follows instructions or grants authorization. The final report format, storage schema and retention policy remain open.

The ADM-5 console implements a bounded offline assessment. Approved
assignment and report digests select the artifacts. The assessor reparses
their bytes, checks the retained import, and inspects local Git for the
declared checkpoints and net path scope. Worker test and historical Git
claims remain unverified. Review acknowledgment, optional human
observations and completion acceptance are distinct. The receipt records
the assessment and human review, with completion acceptance undetermined.

### Reuse and future Jev assistance

Candidate reuse includes committed-blob context binding, scoped proposals, local human approval, durable checkpoint history, independent verifier evidence and reviewed export. Current implementations are bounded to their authorized catalogs, fixtures or sealed pilot. Future design must evaluate whether the underlying contracts can be reused without inheriting worker launch, resume or publication authority.

Optional future Jev assistance may recommend implementation approaches, assess dependencies, prioritize tasks, suggest verification, triage defects, assess evidence and recommend acceptance readiness or next steps. Reuse registered Choice contracts for bounded eligible decisions where appropriate. The current contracts do not provide arbitrary natural-language planning or unrestricted repository analysis. New provider contracts, source disclosure, external communication and paid usage require qualification and separate authorization. Preserve deterministic manual fallback.

### Command responsibilities

| Command                      | Current behavior                                                                                                                                                                                                                                                                                                             | Proposed role                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run jev:develop`        | Offline operator console. **New objective** runs a fixed synthetic exercise. The isolated engineering exercise uses disposable discount source and tests. The offline FliHub pilot accepts objective text for local review and presents a fixed tee-time year-padding plan. It does not dynamically interpret the objective. | Assisted engineering development and, after independent qualification, automated engineering orchestration. |
| `npm run jev:app`            | Application advisory development console over registered synthetic objectives and context.                                                                                                                                                                                                                                   | Application intelligence advisory development and testing.                                                  |
| `npm run jev:app:operate`    | Interactive review, explicit approval and independently verified execution exercise for registered synthetic operations.                                                                                                                                                                                                     | Controlled application operation development and verification.                                              |
| `npm run jev:app:experiment` | Separately gated application provider qualification path with its live release lock disabled.                                                                                                                                                                                                                                | Separately authorized live application provider qualification.                                              |

Live Jev engineering planning and authenticated Codex dispatch remain gated. These responsibilities preserve the existing commands and distinguish engineering workflows from application intelligence.

## AI-1F authenticated engineering checkpoint

Codex CLI 0.172.0 reported a local ChatGPT login through `codex login status`. OpenAI documents non-interactive account authentication on trusted runners. The CLI manages its account refresh and can require reauthentication if credentials expire or a session is revoked. The local check confirms stored login status only. OpenAI limits its advanced account-auth CI pattern to trusted, non-public runners. The TypeScript SDK wraps the CLI and provides structured results. App Server exposes turn lifecycle, token usage, failure notifications and approval requests. Its external sandbox mode delegates enforcement to the caller. Neither API surface establishes a separate credential-free execution plane merely by selecting a sandbox mode. [Non-interactive mode](https://developers.openai.com/codex/noninteractive) · [Authentication](https://developers.openai.com/codex/auth) · [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) · [App Server](https://learn.chatgpt.com/docs/app-server)

Prefer a trusted, proposal-only authenticated client if a supported configuration can demonstrably prevent shell, file, network and connector tools from being invoked with access to the authenticated process. Keep source execution and verification in separate network-denied capsules. The authenticated client must receive only explicitly approved context. Current authorization covers synthetic source only, and Jev must receive catalog IDs and sanitized outcomes. Workload identity requires administrator configuration and issues short-lived credentials for a mapped principal. It leaves execution isolation and authorization to the deployment. Agents API environments require API access and an independently evaluated credential and runtime policy. An API account is optional for documented ChatGPT-authenticated CLI use. [Workload identity federation](https://developers.openai.com/api/docs/guides/workload-identity-federation) · [Sandbox security](https://developers.openai.com/api/docs/guides/agents-api/environments/security)

Named Codex permission profiles can constrain local command filesystem reads and disable command networking. Those controls leave the client’s authentication and service traffic, hosted search and separately configured connectors outside the command-network policy. Start a future proof with the documented shell, apps, hooks, subagent and web search controls disabled and verify the effective tool list offline. The documented resumable execution switch requires managed policy to turn it off. Native profiles remain useful for defense in depth. [Permission profiles](https://learn.chatgpt.com/docs/permissions) · [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security) · [Configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic)

The existing Bubblewrap capsule creates separate PID and network namespaces, mounts the fixture and harness read-only, clears the environment and uses a disposable home. It mounts the host's `/usr` read-only, exposing multiple executables, and hosts a synthetic endpoint on isolated loopback. That boundary is specific to the fixture. Real project work still needs a minimal pinned runtime, credential and socket denial probes, enforceable process and storage limits, descendant termination and a separate protected verifier. The host must reconcile interrupted intents before permitting repetition.

The proposed pilot is `tee-time-local-year-padding`. Its only editable source is `src/lib/tee-times.ts`. The host can read exactly one normal file blob from a full commit ID and produce an inventory with blob ID, byte count and SHA-256. The context digest binds repository content to the commit and catalog policy. The reader never consults working-tree copies. It is a data-ingestion primitive, and the workflow store still admits only the existing synthetic objectives. A real verifier would use protected assertions for years 0001, 0999 and 1000 in UTC, plus the existing tee-time, timezone and DST regressions. Context review, candidate capture and review export should remain host operations. The completed verifier must bind the source commit, objective, policy, exact candidate digest and workflow checkpoint. Patch transfer requires separate authorization and destination-state validation.

The synthetic worker collects output through child-process stream closure and now records allowlisted diagnostics for capsule launch, isolation preflight, contention, time and output limits, and malformed or incomplete Codex evidence. Raw stdout, stderr and provider errors stay out of the ledger. The parser rejects partial JSONL, absent or contradictory terminal records, duplicate proposals and tool activity. Codex 0.172.0 emitted a nonfatal fallback model-metadata warning in the local fixture as an error item. The synthetic parser allows that exact warning and still requires a unique proposal and a successful terminal event with usage. The cause of the historical intermittent missing evidence remains unconfirmed. The workflow accepts verification only for its existing candidate checkpoint and consistent executable evidence. These safeguards support diagnosis without retrying a model operation.

### Proposed operator authorization

After isolation and transport acceptance, approve one full source commit, one catalog objective and file, at most two Codex launches, six engineering operations and one correction over five minutes. Cap Jev at 20 decisions and a reserved estimate of USD $0.05505024. The historical fixture run used an estimated USD $0.00027237 across 14 decisions. Approve a 16 KiB source and proposal limit, a 128 KiB per-stream capture limit, seven-day artifact retention and review-only export. The required limits are proposed for the live workflow and need enforcement before dispatch. Codex launches are not a count of internal model requests. Subscription usage and optional credits vary by account and may exhaust. No hard per-workflow monetary ceiling was established for the subscription transport. Require explicit approval of an enforceable compatible usage policy before enabling it. [Codex pricing](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)

The operator can inspect readiness with `codex login status`, `git rev-parse HEAD`, `npm run dev:status`, and `FLIHUB_VERIFY_CAPSULE=1 node --test tests/engineering-worker.test.mjs` on a runner that permits namespace creation. Run `node tools/intelligence/engineering/project-context.ts "$(git rev-parse HEAD)"` to inspect the pilot inventory without printing source. A live command remains pending implementation of the authenticated execution gate. The existing engineering demo command operates on synthetic fixtures and cannot establish authenticated acceptance. Human review, GitHub PR CI and explicit publication and merge authorization remain required. AI-2 and CE-3D remain gated.

Assignment 8 passed type checking, lint, formatting, production build and Git whitespace validation. The full unit run passed 563 tests with one opt-in capsule test skipped. The capsule workflow passed in three separate offline runs, including one test failure and correction per workflow. The intelligence suite passed 11 tests and the disposable PocketBase and Mailpit suite passed 215 integration tests. Browser and GitHub PR verification remain outstanding.

## AI-1F sealed tee-time pilot

The installed Codex 0.172.0 metadata preflight runs with a temporary empty Codex home. The disable switches remove `shell_tool`, apps, hooks and subagents from the reported feature configuration. `unified_exec` remains true after a local disable request. Its documented disable control requires managed requirements. The local App Server startup configuration probe returned no effective requirements in the empty home. The generated experimental App Server schema describes `environments: []` for disabling turn environment access. That field scopes environment access. It does not provide pre-turn attestation of the complete effective tool set, including service-side tools. Output schemas constrain response shape. Native permission profiles constrain local commands. Neither supplies that attestation. The TypeScript SDK uses the CLI and the Python SDK uses App Server. The metadata preflight rejects admission and never starts a turn. [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-basic) · [App Server](https://learn.chatgpt.com/docs/app-server) · [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) · [Permissions](https://learn.chatgpt.com/docs/permissions)

The offline pipeline binds the repository, exact commit and context digest, fixed path, four catalog operations, offline fixture transport, one correction, 30 seconds, 16 KiB proposal, verifier policy, seven-day logical retention and review-only export. The operator approves this envelope through the existing audit store. Approval expires after two minutes and is consumed once. Versioned pilot checkpoints live in the existing workflow SQLite database. They retain fixed operation and outcome identifiers and candidate digests. The pipeline saves intent before verification and never replays an interrupted checkpoint. Original source, candidate bytes and process streams stay out of the database. A consumed approval can be lost if the operator process stops before creating the checkpoint. A fresh approval is required for another offline run after human review. Pilot authorization is separate from existing synthetic authorization and admits only the fixed offline fixture transport. The console and Jev dispatch still exclude this pilot.

The host accepts exactly one closed edit to the year expression of the committed tee-time module. The fixture submits a deliberate right-padding defect, followed by a left-padding correction. The TypeScript module in the working checkout remains unchanged. A fresh Linux x86-64 Bubblewrap namespace receives a read-only staged candidate, protected verifier, pinned ESM date dependency bytes, Node and its seven runtime libraries. It has no broad host executable or repository mount. The isolated PID and network namespaces, disabled nested user namespaces, dropped capabilities, cleared environment, read-only root and Node permission flags restrict this pilot. Node denies writes and subprocesses. The host enforces CPU time, address space, open files, file size, elapsed time and combined output. Timeout and cancellation kill the launcher group, and Bubblewrap ties the namespace to the parent process. The host accepts evidence only after stream closure and an exact exit/output pair. Ordinary completion removes the staged files. Abrupt host death can leave temporary stages for operator cleanup. This is a closed-grammar verifier, with platform runtime components trusted by the host. General repository code and build tooling require a stronger separately reviewed runtime policy.

The in-capsule preflight checks private namespace IDs, loopback-only networking, failed external routing, read-only mount status, denied writes and Node subprocess creation, and absent shell, filesystem canaries and host socket access. Host-side tests create the synthetic credential files, socket and disposable approval database. Namespace-capable host permissions are required to launch this test from the outer Codex sandbox. The protected verifier checks year padding for 0001 and 0999, preserves year 1000 and Phoenix midnight and scheduling behavior, and preserves rejection of both ambiguous and skipped DST times. The review exporter reconstructs a single authorized hunk only from an exact candidate digest associated with complete passing evidence. It binds the workflow, source commit, scope, verification outcome and patch digest. The host tests patch applicability without applying it. Protected type checking and full builds of real candidate snapshots remain open.

Offline commands from the repository root:

```sh
node tools/intelligence/engineering/proposal-preflight.ts "$(command -v codex)"
FLIHUB_VERIFY_CAPSULE=1 node --test tests/project-engineering.test.mjs
FLIHUB_VERIFY_CAPSULE=1 node --test tests/engineering-worker.test.mjs
```

Live acceptance still requires a verifiable managed proposal tool boundary, trusted client egress policy, explicit source disclosure and model approval, separate Jev and Codex counters and operator-approved subscription usage policy. No hard per-workflow dollar ceiling or count of upstream subscription requests is available through the inspected interfaces. A launch cap cannot stand in for either. The pilot also needs a live authorization checkpoint, independent full candidate verification, review and GitHub CI. AI-2, CE-3D and later charity phases remain gated.

The sealed pilot passed all six focused tests. Three bounded runs of the original synthetic Codex capsule passed, with four tests per run. The previous intermittent missing-evidence cause remains unconfirmed. The full offline unit suite passed 565 tests and skipped the three namespace-dependent tests that ran separately. The disposable PocketBase and Mailpit suite passed 215 tests. Browser regression and GitHub CI remain outstanding.

## AI-1F transport deployment and console

The local preflight for Codex 0.172.0 still reports `shell_tool=false`, `unified_exec=true` and denied admission. The Codespaces host has no `/etc/codex/requirements.toml`. That system file is a documented, administrator-controlled delivery path independent of workspace cloud policy. Deploying it requires a trusted host administrator and a worker that cannot rewrite it. The other path is eligible ChatGPT workspace policy, which requires a workspace administrator. The saved login reports ChatGPT sign-in. Account tier, administrator access and effective cloud policy remain unverified. No host policy was installed. [Managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration) · [Requirements reference](https://learn.chatgpt.com/docs/config-file/config-reference)

| Design                               | Evidence and remaining gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local CLI or SDK with managed policy | Managed requirements can pin resumable execution and constrain local approval, permissions, web search, MCP and plugin settings. The SDK carries configuration through the CLI or App Server. A user-configured toggle does not establish the complete effective service-side tool set. Verify managed policy, server-side capabilities and account eligibility on the actual deployment.                                                                                                                                                                                                                                                |
| App Server and a separate executor   | Installed 0.172.0 metadata exposes the experimental `environment/add` endpoint shape and turn environment selection, and `codex exec-server` accepts a separate listener. This is evidence of an integration surface. It does not establish that every native tool, hosted action or local fallback is routed through the isolated executor. A turn using `externalSandbox` delegates sandbox enforcement to the operator and does not create separate namespaces. Verify the executor against denied credentials, protected paths, disallowed commands, no network and local fallback attempts before admitting any authenticated turn. |
| Explicit brokered tools              | App Server dynamic tools can route declared operations to a trusted broker. This cannot by itself remove or constrain other built-in execution paths. Keep filesystem and subprocess mediation independent of model decisions. Hosted search, apps, MCP and similar service-side access need policy separate from the command sandbox.                                                                                                                                                                                                                                                                                                   |
| Tool-free Responses API              | A trusted client can send a fixed request with `tools: []`, `tool_choice: "none"`, a strict response schema and a maximum output token count. Use pinned model and request budgets, a credential-only client, fixed provider egress and no automatic retries. This uses separate API credentials and token billing. It needs operator approval for billing, data and model before any adapter dispatch. It would not be a ChatGPT subscription Codex CLI session.                                                                                                                                                                        |

The preferred subscription path is a managed authenticated client paired with an independently enforced executor. Existing Bubblewrap tests prove the narrow pilot boundary. They establish no routing guarantee for an authenticated App Server. Keep transport admission disabled until the actual deployment proves no unapproved local fallback, tool paths or egress. If the operator cannot provision and demonstrate the required deployment, evaluate the tool-free Responses API path under separate authorization. [App Server](https://learn.chatgpt.com/docs/app-server) · [Codex permissions](https://learn.chatgpt.com/docs/permissions) · [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) · [Separate API billing](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform)

Launch and correction counts, deadlines and byte ceilings are locally enforceable. Jev decisions and reservations remain a separate meter. A Codex subscription launch can result in multiple provider requests. The inspected subscription interface supplies no hard per-workflow charge limit. For subscription use, require an operator-approved deployment that precludes unauthorized overages and verifies included entitlement before launch. If charges cannot be excluded under that policy, keep dispatch disabled. For API use, enforce a local reservation using conservative input and output bounds and authorized model prices before reserving each call. Provider project limits are monthly and their enforcement can lag. Local admission still needs the per-workflow reservation. [API project limits](https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects) The offline pilot has zero provider requests, while authenticated usage and cost remain unavailable.

### Scoped proposals and verification

The reusable scoped replacement reader accepts complete text replacements against exact baseline file digests. It validates a host-supplied immutable inventory, registered TypeScript paths, unique changed paths, bounded JSON and canonical text before returning a frozen digest-bound snapshot. Distinct legitimate solutions can pass the scope check. A passing scope check grants no execution authority. The running tee-time pilot continues to require the closed grammar. General candidate imports, build configuration, repository-wide dependencies and executable tool policies remain gated.

The sealed pilot now performs strict no-emit TypeScript checking with a content-pinned TypeScript 6.0.3 compiler and declarations, using the existing no-egress namespace. The protected harness runs the compiler before loading the candidate. It then runs year-padding, timezone, interval and DST assertions. The toolchain pin and protected harness digest bind the verification policy and the replacement snapshot binds the candidate. Review export requires that exact verified policy. Full isolated candidate builds and broader project regressions require a pinned workspace, writable build-output isolation, resource enforcement and stronger general-code containment. The application build run against the checkout gives repository regression evidence only.

### Operator console

Run `npm run jev:develop` and select **7 Offline FliHub pilot**. Enter an objective for local review. The console offers the fixed offline tee-time plan, full scope, verification policy and limits. It does not interpret free text as authorization or send it to Jev. Enter `authorize` to consume one approval for this run. Progress displays the work ID, verification results and correction attempt after durable checkpoints. Ctrl-C cancels the active run. Option 2 with `inspect` displays a pilot checkpoint without resuming it. If the final verification passes, enter `export` to create one exclusive private review JSON file for the workflow. The artifact is capped at 16 KiB and contains the verified patch and digest. The seven-day checkpoint retention is enforced at export. Exported copies require operator retention management.

Opening the console or rejecting a plan does not contact a model or start a workflow. Live Jev planning, autonomous model dispatch and general candidate execution remain unavailable. The existing mock modes and service controls are preserved.

Assignment 10 passed 12 focused console and sealed pilot tests, including the protected type-check failure case. Three bounded runs of the original synthetic worker suite passed. The historical missing-evidence cause remains unconfirmed. The full offline unit suite passed 569 tests, and the disposable integration suite passed 215 tests.

### Owner acceptance of the offline tee-time pilot

The repository owner completed the option 7 walkthrough in `jev:develop`. The owner reviewed and approved the scope, observed the initial verification failure and one correction, then exported the independently verified candidate. The durable workflow records these outcomes in order.

| Operation         | Outcome        |
| ----------------- | -------------- |
| `implementation`  | `proposed`     |
| `verify_targeted` | `year_padding` |
| `correct_defect`  | `proposed`     |
| `verify_broader`  | `pass`         |

- Workflow `73eddca1-d210-432b-aaa7-3aef58be6026`
- Original commit `0aefda71e04ed3dfab213ee6d27c8d91c4bdae6d`
- Accepted candidate SHA-256 `cb2dbfb862a2ab034d3b8672f2fe2e4eb1d87e691bd4c9e710fd33cd71525b22`
- Patch SHA-256 `8933695b20fd27f998867a92bf226c43a2f44522976c0b08487b36c7d4ccabd0`

Checkpoint review verified the private `0600` export against the recorded workflow, approved scope and committed source. The patch digest matches the Assignment 10 demonstration, the patch touches only the year-formatting expression in `src/lib/tee-times.ts`, and `git apply --check` passed. The working application file is byte-for-byte identical to the committed source. The exported artifact remains in the owner's local audit directory.

This completes the owner's acceptance of the offline fixture workflow, with zero live Jev requests and zero Codex worker launches in that walkthrough. AI-1F remains open pending authenticated Codex transport, live Jev-directed engineering, provider egress enforcement, compatible usage limits, full isolated candidate build verification, GitHub CI and final acceptance. AI-2 and CE-3D remain deferred.

### Assignment 11 deployment decision

**PROVISION.** Keep authenticated dispatch closed. First provision a dedicated, administrator-controlled Linux runner and test a subscription-backed proposal-only client with a separately isolated, credential-free verifier. Qualify a general-purpose remote executor only if it becomes necessary. Tool routing, absence of local fallback and account usage eligibility are acceptance criteria for the deployment.

A disposable network-isolated Bubblewrap probe placed a synthetic read-only policy at `/etc/codex/requirements.toml` inside its mount namespace. Codex 0.172.0 reported effective `shell_tool=false` and `unified_exec=false` in startup requirements and feature listings, including after explicit user enable overrides. A write attempt was denied. The probe ran without a credential store or model turn. The real Codespaces session had no policy file, no effective or bounding capabilities, and `NoNewPrivs=1`. These observations apply to the inspected session. An owner’s separate provisioning authority and any effective workspace policy remain unverified. An ad hoc system file outside `/workspaces` can be lost during a Codespaces rebuild. Provision and re-attest policy through an administrator-controlled runner image or deployment mechanism outside worker control. [Managed requirements](https://learn.chatgpt.com/docs/enterprise/managed-configuration) · [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) · [Codespaces rebuild persistence](https://docs.github.com/en/codespaces/developing-in-a-codespace/persisting-environment-variables-and-temporary-files)

The feature pins alone leave one-shot execution and separate RPC or hosted tool surfaces to account for. The installed protocol distinguishes experimental environment attachment and turn selection from file operations and connection-scoped process operations. Its generated host file RPCs take absolute paths without a turn environment identifier. Keep those RPCs off the untrusted surface. The matching release dispatches file, one-off command and process calls through separate handlers. Its client disconnect path invokes cleanup handlers. Independent evidence is still required for full routing, executor disconnect, local fallback denial, and descendant termination. External sandbox configuration delegates enforcement to the deployment. Command network controls leave hosted search, connectors and MCP subject to separate policy. [App Server](https://learn.chatgpt.com/docs/app-server) · [0.172.0 request dispatch](https://raw.githubusercontent.com/openai/codex/rust-v0.172.0/codex-rs/app-server/src/message_processor.rs) · [Codex security controls](https://learn.chatgpt.com/docs/agent-approvals-security)

The administrator must separate the authenticated client, execution and verification identities. Keep supported login and refresh only on the trusted client, constrain client egress to approved authentication and model destinations, and give an executor only an approved snapshot and bounded scratch space. Its network and management sockets stay unavailable. Keep one-use approvals and audit storage outside worker mounts. Test native and hosted effects independently. The owner must confirm account entitlement, model availability, included allowance, any credit balance, reload or overage behavior, and a usage policy that prevents unauthorized charges. Optional credits can be consumed automatically on eligible accounts. Token reports and launch counts cannot enforce an upstream request or financial limit. Jev usage stays separate. [ChatGPT Codex usage](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan) · [Flexible credit use](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans)

A separately approved alternative is the Responses API with a pinned compatible model such as `gpt-5.4-2026-03-05`, explicit empty tools, `tool_choice: "none"`, strict JSON schema and bounded output tokens. Use approved input, a credential-only client, fixed egress, conservative per-request cost reservation, no retries or paid fallback, and independent verification. API billing and credentials are separate from the ChatGPT subscription. No adapter was added. [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) · [Model compatibility](https://developers.openai.com/api/docs/models/gpt-5.4)

The first proposed live objective and limits remain as recorded above. Full candidate builds still need an immutable project snapshot, pinned dependency closure and tooling, protected tests, sandboxed writable build outputs, no unapproved installs or lifecycle scripts, resource limits and descendant termination, and evidence bound to the candidate and build policy digests. The next milestone is an offline admission test on the provisioned runner. AI-1F stays open. AI-2 and CE-3D remain deferred.

### Assignment 12A provisioning preparation

The owner’s Ubuntu Codespaces terminal demonstrated administrator availability through passwordless root sudo policy. That terminal has a full UID map and a wider capability boundary than the restricted session inspected in Assignment 11. Its Docker and SSH groups and sudo access exclude the owner identity from candidate execution. Kernel operations, protected configuration, aggregate resource limits and client egress still need deployment qualification.

[The provisioning review](INTELLIGENCE-RUNNER-PROVISIONING.md) proposes separate orchestration, model, executor and verifier identities, a root-owned version-pinned bundle, and a namespace-local managed policy. It keeps the host Codex policy and existing development startup outside the installation. The 12A offline probe verified namespace and canary denial and bound managed feature pins to Codex 0.172.0. The effective metadata read did not establish denial of web-search, approval-policy and sandbox-mode override attempts, so qualification remains blocked. None of this evidence establishes authenticated native or hosted tool behavior.

12B requires separate owner approval and target-host qualification. Admission remains closed pending effective local and hosted tool controls, client egress and refresh, executor cleanup and isolation, compatible account usage policy and isolated candidate build evidence. AI-1F remains open. AI-2 and CE-3D remain deferred.

At 12A closeout, the provisioning procedure binds the binary, policy and harness to independently reviewed digests and checks the recorded installation before rollback. The qualification probe still blocks on unresolved effective configuration overrides. Manual development authority is recorded in [AGENTS.md](../AGENTS.md). Automated workers retain their existing security, budget and approval boundaries.

Assignment 12A-R qualified Codex CLI 0.172.0 offline. `config/read` still reported the requested conflicting values, while safe, individual override and combined override thread initialization returned approval `never`, sandbox `readOnly` and network access false. Exact managed-policy rejections and same-thread follow-up notifications established that prohibited approval and sandbox updates left those effective settings intact. Strict startup rejected both malformed and incompatible disposable configurations. Effective web-search denial and independent native and hosted tool effects remain unverified, and authenticated admission stays false. The provisioning review records the measured binary digest, protocol evidence and remaining gates. [Runner provisioning review](INTELLIGENCE-RUNNER-PROVISIONING.md)
