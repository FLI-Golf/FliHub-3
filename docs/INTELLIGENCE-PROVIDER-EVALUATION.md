# FliHub Intelligence — Architecture

This file preserves historical provider evaluation and architecture evidence. The [intelligence architecture](INTELLIGENCE-ARCHITECTURE.md#assignment-11-deployment-decision) is the authoritative record for current transport decisions.

## Application foundation

`src/lib/server/intelligence/` contains the shared service, decision definitions, validators and disabled, mock and Jev providers. The server entry point creates one instance per process. There are no application route or PocketBase callers yet. The registered development decision accepts only fixed synthetic descriptions, including the ordinary test and unfamiliar dependency fixtures. Adding CSV mapping requires a new decision definition and task-specific runtime input validation.

A future application caller resolves actor and organization membership on the server, checks authorization, applies deterministic rules and sends only a minimized, validated decision input. The service returns a suggestion, abstention, unavailable outcome or disabled outcome. The caller retains the manual or deterministic workflow on all fallback outcomes. Before committing a confirmed suggestion, the domain operation rechecks authorization and validates the action. Existing PocketBase rules and domain operations remain authoritative.

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
