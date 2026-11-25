# FliHub engineering runner provisioning review

Assignment 12A prepares this procedure for owner review. The 12B commands require separate approval. The existing owner account retains access to the Codespace. Its sudo, Docker and SSH privileges make it unsuitable as a candidate identity.

## Separation and enforcement

| Role                  | Access                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner administrator   | Installs and verifies the sealed bundle, controls identity and deployment policy, and approves source disclosure and review.                                       |
| `flihub-orchestrator` | Future deterministic snapshot, proposal validation and authorization. Owns private audit state. Jev receives approved catalog IDs and sanitized outcomes.          |
| `flihub-model`        | Trusted proposal-only Codex client with a separate private login. Receives only a bounded approved proposal input. Returns structured text to the host.            |
| `flihub-executor`     | Credential-free candidate execution identity. Receives an exact approved read-only snapshot and private bounded scratch. No host filesystem or socket mounts.      |
| `flihub-verifier`     | Separate credential-free verification identity. Receives the sealed candidate and independently pinned tools and tests. Returns digest-bound evidence to the host. |

Start with one short-lived job at a time. Keep Bubblewrap, PID and mount namespaces, no privilege escalation and `prlimit`. Start with separate ordinary local accounts and isolated filesystems. Docker group and socket access confer host-management capabilities and are excluded. No Docker daemon, remote executor, new devcontainer, background service, or change to existing developer startup is proposed here.

The model client uses a root-owned qualification bundle. Mount its policy read-only at `/etc/codex/requirements.toml` **inside the model process namespace only**. The host path and existing Codex sessions stay unchanged. The policy allows ChatGPT login, denies approvals and pins local feature controls. Resumable commands, shell, apps, plugins, hooks, browser, dependency tooling and goals carry explicit pins. The empty MCP allowlist and disabled web search are documented requirements. Keep the App Server control channel private. Local feature flags alone cannot guarantee absence of one-shot execution, native host filesystem RPCs, subagents or hosted tool effects. Require a reviewed client launch boundary and direct negative evidence for those paths. [Managed requirements](https://learn.chatgpt.com/docs/enterprise/managed-configuration) · [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) · [App Server](https://learn.chatgpt.com/docs/app-server)

## 12B read-only preflight

On the owner's terminal, inspect the intended host and check for collisions. This procedure assumes Ubuntu Linux x86-64 with the native 0.172.0 CLI, Python 3.11 or newer, Bubblewrap and util-linux. The qualification script requires a separately approved native binary SHA-256. The install commands use a trusted, owner-reviewed transfer directory outside the worktree.

```sh
id
uname -m
stat -fc %T /sys/fs/cgroup
cat /sys/fs/cgroup/cgroup.controllers
df -h /opt /var/lib
namei -l /opt /var/lib
command -v bwrap setpriv prlimit systemd-run python3
for role in orchestrator model executor verifier; do
  getent passwd "flihub-$role" || true
  getent group "flihub-$role" || true
done
ls -ld /opt/flihub-codex-qualification /var/lib/flihub-engineering 2>/dev/null || true
```

Stop on an unexplained pre-existing path, identity or group. On a documented repeat, verify its exact ownership, purpose and membership before reusing it. Parent directories must be canonical, root-controlled and free of group or world write access. Check ACLs, mount sources, binary file capabilities and external access rules on the actual host. Controller listings and installed commands do not prove delegated cgroup, namespace, firewall or service-manager authority.

## 12B modification commands prepared for review

Prepare `$HOME/flihub-12b-reviewed` as owner-private storage containing exactly the reviewed `requirements.toml`, `qualify.py`, native `codex`. Verify the binary against an independently approved release artifact or digest, rather than treating its installed hash as provenance. The native binary is about 306 MiB in the inspected installation. Freeze the reviewed input hashes before elevating. Run the blocks only on the approved Codespace. A partial installation confers no launch authority.

```sh
set -eu
review="$HOME/flihub-12b-reviewed"
bundle=/opt/flihub-codex-qualification
state=/var/lib/flihub-engineering
# Digest variables come from independent owner review.
: "${APPROVED_CODEX_SHA256:?}" "${APPROVED_POLICY_SHA256:?}" "${APPROVED_HARNESS_SHA256:?}"
verify_bundle() {
  for digest in "$APPROVED_CODEX_SHA256" "$APPROVED_POLICY_SHA256" "$APPROVED_HARNESS_SHA256"; do
    [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || return 1
  done
  (cd "$1" && printf '%s  %s\n' \
    "$APPROVED_CODEX_SHA256" codex "$APPROVED_POLICY_SHA256" requirements.toml \
    "$APPROVED_HARNESS_SHA256" qualify.py | sha256sum --strict -c -)
}
verify_bundle "$review"
# Fresh installation. For a verified existing bundle, skip installation
# and run the digest and ownership checks below.
test ! -e "$bundle"
test ! -L "$bundle"
test ! -e "$state"
test ! -L "$state"
for role in orchestrator model executor verifier; do
  if getent passwd "flihub-$role" || getent group "flihub-$role"; then
    exit 1
  fi
done
sudo install -d -o root -g root -m 0755 "$bundle" "$state"
sudo install -o root -g root -m 0555 "$review/codex" "$bundle/codex"
sudo install -o root -g root -m 0444 "$review/requirements.toml" "$review/qualify.py" "$bundle/"
verify_bundle "$bundle"
for role in orchestrator model executor verifier; do
  account="flihub-$role"
  sudo useradd --system --user-group --no-create-home \
    --home-dir "$state/$role" --shell /usr/sbin/nologin "$account"
  sudo install -d -o "$account" -g "$account" -m 0700 "$state/$role"
done
```

The digest check binds exactly the native binary, policy and harness to the owner-approved bytes. A second run is verification-only if the installed state matches the reviewed manifest and identities. On drift or partial install, stop, reconcile the inventory, then roll back or complete deliberately. The commands make four local accounts and four primary groups, the three-file root-owned bundle and four private state directories. They create no global policy file, cgroup unit, proxy, network configuration, login or credential store. The orchestrator state directory is reserved for private approvals and audit. The executor and verifier homes must remain credential-free and go unmounted during candidate work. Rebuild or CLI upgrades require a fresh manifest and qualification. Codespaces changes outside `/workspaces` can be cleared on rebuild. [Codespaces persistence](https://docs.github.com/en/codespaces/developing-in-a-codespace/persisting-environment-variables-and-temporary-files)

## 12B qualification commands

Run in Bash after authenticating the root-owned bundle and checking ownership, mode and ACLs. Repeat the fixed-name `verify_bundle "$bundle"` check from the installation block before executing the harness. Its self-check is supplementary to the operator's pre-launch check. Treat any service identity sudo grant as a stop. `sudo -l -U` is an inspection command and denial is expected. The administrator launches the harness after dropping privileges.

```sh
bundle=/opt/flihub-codex-qualification
state=/var/lib/flihub-engineering
for role in orchestrator model executor verifier; do
  id "flihub-$role"
  sudo -l -U "flihub-$role"
done
sudo /usr/bin/setpriv --reuid=flihub-model --regid=flihub-model --clear-groups \
  --no-new-privs --bounding-set=-all --ambient-caps=-all --inh-caps=-all \
  /usr/bin/env -i PATH=/usr/bin:/bin HOME="$state/model" PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I "$bundle/qualify.py" --installed "$bundle/codex" "$APPROVED_CODEX_SHA256" \
  --policy-sha256 "$APPROVED_POLICY_SHA256" --harness-sha256 "$APPROVED_HARNESS_SHA256"
```

Each identity needs a distinct UID and primary group, no sudo or privileged groups, and no host services, secrets or inherited descriptors. The harness checks file type, digest, version, root ownership and ancestors, account groups, environment, namespace separation, denied TEST-NET route, hidden canaries and socket, and read-only policy. It always reports `admitted: false` and exits 1 while behavioral and authenticated admission gates are open. A completed offline run reports individual evidence. A failed probe emits a sanitized blocking reason.

The 12A fixture recognized managed requirements and denied feature overrides. Its `config/read` responses under CLI overrides left effective runtime policy unverified at that checkpoint.

### Assignment 12A-R offline evidence

The fixture used native Codex CLI **0.172.0** and the local source checkout tagged `rust-v0.172.0` at `3d86e43b075adeba2193ec5c22ac92f55afd82e6`. The measured native binary SHA-256 was `ad83b94c093f0cdd8176a6bc8005a461bdf23a759863e157d40f562b8a9d664d`. This measurement identifies the tested binary. Installation still requires independent release provenance and prior approval of the binary, policy and harness digests.

- Strict App Server startup succeeded for the safe baseline and four override cases in the credential-free namespace. The individual cases set one prohibited value and kept the other two values safe. The combined case set all three prohibited values. Both startup metadata and `configRequirements/read` recognized the managed restrictions and disabled features. The existing feature-override checks passed.
- `config/read` showed the requested prohibited values for `web_search` (`live`), `approval_policy` (`on-request`) and `sandbox_mode` (`workspace-write`) in their respective cases and together in the combined case. These are configuration-layer observations. In all five cases, an ephemeral `thread/start` returned effective `approvalPolicy: "never"`, `sandbox.type: "readOnly"` and `sandbox.networkAccess: false`.
- With experimental RPC capability enabled only in the baseline session, `thread/settings/update` rejected each prohibited update with code `-32600` and the prefix `invalid thread settings override:`. The approval error identified `approval_policy`, `OnRequest` and the allowed set `[Never]`. The sandbox error identified `sandbox_mode`, `WorkspaceWrite` and the allowed set `[ReadOnly]`. Both named `/etc/codex/requirements.toml` as the source. After each rejection a benign personality change produced a correlated settings notification from the same ephemeral thread with approval still `never`, the sandbox still `readOnly` and network access still false.
- Disposable malformed TOML (unclosed array) and incompatible TOML (numeric approval policy) both failed strict startup with exit 1 and a diagnostic tied to the fixture file.
- The pinned source applies a managed web-search constraint during configuration initialization in `core/src/config/mod.rs`, resolves it in the turn context, and omits the hosted search tool for disabled mode in `core/src/tools/hosted_spec.rs`. The offline thread RPCs do not expose effective web-search tool availability. Source inspection and requirements metadata leave behavioral web-search denial unverified. Effective web-search denial remains an explicit blocker. Qualification still needs independent evidence at the real tool registration or invocation boundary under a separately approved test. No model turn was submitted.

The effective sandbox and approval fields describe initialized runtime settings. Independent tool effects, installed-identity isolation, aggregate limits and cleanup, approved client egress and refresh, local fallback and disconnect behavior, subscription usage, and a full isolated candidate build remain required before authenticated admission.

After the metadata run, repeat the committed sealed pilot regressions sequentially on the intended kernel with disposable data. On the target deployment, provision and test process isolation and a bounded filesystem chain before considering any authenticated run. Suggested starting limits for the existing pilot are one slot, 1 GiB RSS budget and 64 tasks per transient cgroup, and a small 64 MiB scratch tmpfs where writes become necessary. These are proposed deployment envelopes. Keep existing verifier deadlines and output caps. Use an administrator-controlled cgroup v2 subtree, or a transient systemd unit if the manager supports it. Test process, memory, CPU and storage limits with inert programs. Cancellation must kill the process group and the entire job cgroup, wait for an empty job, and discard staged outputs. Where `cgroup.kill` is unavailable, prove equivalent cleanup before enabling candidate execution. [Linux cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)

If an administrator-controlled systemd manager is available, qualify a single named transient unit before selecting it for the runner. These 12B-only commands create an inert sleep and child for at most 20 seconds. Use a fresh unit name, and stop if that name already exists. Capture the cgroup path before stopping the unit and require the controller values and cleanup evidence before accepting this mechanism.

```sh
set -eu
unit=flihub-qualification-cgroup.service
test "$(systemctl show -p LoadState --value "$unit")" = not-found
sudo systemd-run --unit="$unit" --collect \
  -p User=flihub-executor -p Group=flihub-executor -p NoNewPrivileges=yes \
  -p PrivateNetwork=yes -p MemoryMax=1G -p TasksMax=64 -p CPUQuota=100% \
  -p KillMode=control-group -p RuntimeMaxSec=20s \
  /bin/sh -c '/usr/bin/sleep 18 & wait'
cg=$(systemctl show -p ControlGroup --value "$unit")
test -n "$cg"
cat "/sys/fs/cgroup$cg/memory.max" "/sys/fs/cgroup$cg/pids.max" \
  "/sys/fs/cgroup$cg/cpu.max" "/sys/fs/cgroup$cg/cgroup.procs"
sudo systemctl stop "$unit"
if test -d "/sys/fs/cgroup$cg"; then
  remaining=$(cat "/sys/fs/cgroup$cg/cgroup.procs")
  test -z "$remaining"
fi
```

Expect memory.max of 1073741824, pids.max of 64, a CPU quota equal to the period, and both inert processes before cancellation. After stop, require an empty or removed cgroup. A missing controller or unavailable service manager blocks this approach. The harness's per-process limit check cannot substitute for these aggregate checks. Stop only the transient qualification unit named above.

In 12B, use synthetic files and an inert child process to check executor and verifier namespace scope, protected mounts, binary and toolchain pins, denied sockets and subprocesses, no credentials or private network, resource ceilings and cleanup on cancellation. A future broker must reject unknown RPCs, local fallback and unauthorized subprocess paths, bind process handles to the same namespace, and fail closed on disconnect. If no remote executor is introduced, verify that an unavailable verifier, missing boundary or interrupted client yields no accepted evidence and no fallback. The metadata harness leaves these effects pending. Repository code has no authenticated dispatch route.

## Network and login gate

The candidate and independent verifier use dedicated no-uplink network namespaces and no mounted proxy or control socket. The eventual trusted client requires a separate namespace with a dedicated provider-only gateway. Prefer a small root-controlled proxy reachable through a private channel. Ensure a denied direct route for IPv4 and IPv6, no access to container or cloud metadata, GitHub or Codespace services, no raw external DNS, and no worker ability to change routing. Resolve upstream names at the gateway, deny rebinding to private/link-local or unapproved addresses, disallow broad host/port patterns, and reapply policy to every redirected request. Qualify TLS, WebSocket if required, refresh, reconnect and proxy failure with an owner-reviewed endpoint inventory. A CONNECT gateway can attest host and port only. If same-origin path restrictions are required, establish a supported request boundary or keep the gate closed. Official guidance identifies ChatGPT domains and Codex WebSocket traffic but is a broad connectivity list. It does not define this runner's minimal allowlist. No host-wide nftables or iptables rule, default route, DNS configuration or active Codespaces service changes are proposed. If dedicated namespace enforcement is unavailable, stop and use a separately managed runner. [OpenAI network guidance](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps)

Only after approval and qualification of client egress, the owner may initiate supported fresh ChatGPT device login **inside the trusted model namespace**, using the pinned executable and private `CODEX_HOME=/var/lib/flihub-engineering/model/.codex` with mode 0700 and umask 077. The command inside that boundary is `/codex login --device-auth` followed by `/codex login status`. Normal refresh stays with the trusted client. The launcher and gateway for a real login remain gated. Copying existing credentials between identities is excluded. The owner must confirm entitlement, model, included allowance, any credits, automatic reload and overage behavior, and approve a policy preventing unauthorized charges. Separate Jev accounting remains required. Local launch limits cannot enforce a subscription dollar or request ceiling. [Codex authentication](https://learn.chatgpt.com/docs/auth) · [Codex usage](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)

## Rollback and gate

Use a separate owner-controlled terminal. Stop any approved transient qualification jobs first and confirm no process under any proposed identity remains. Run only for the intact, recorded installation and after verifying the bundle and each recorded UID/GID. Check every home and the full state/bundle inventory before removal. Stop on unexpected contents, mounts, processes, account mapping or drift. For a partial installation, reconcile each item against the installation record individually before any deletion.

```sh
bundle=/opt/flihub-codex-qualification
state=/var/lib/flihub-engineering
set -eu
for role in orchestrator model executor verifier; do
  account="flihub-$role"
  entry=$(getent passwd "$account")
  home=$(printf '%s\n' "$entry" | cut -d: -f6)
  test "$home" = "$state/$role"
  test ! -L "$home"
  contents=$(sudo find "$home" -mindepth 1 -maxdepth 1 -print -quit)
  test -z "$contents"
done
for role in orchestrator model executor verifier; do
  # rmdir deliberately stops rollback if the account contains state.
  sudo rmdir "$state/$role" || exit 1
  sudo userdel "flihub-$role" || exit 1
  if getent group "flihub-$role" >/dev/null; then
    sudo groupdel "flihub-$role" || exit 1
  fi
done
sudo rmdir "$state"
sudo unlink "$bundle/qualify.py"
sudo unlink "$bundle/requirements.toml"
sudo unlink "$bundle/codex"
sudo rmdir "$bundle"
```

Protect any later approval records or credential state for owner-directed disposition before removing nonempty homes. Keep rollback restricted to this inventory. No global firewall rollback is needed for these steps.

Full isolated candidate production verification still requires an exact committed snapshot, pinned dependency and tool closure, protected tests, isolated writable output, no package install or unauthorized lifecycle execution, aggregate enforcement and digest-bound evidence. The first proposed tee-time objective and prior limits remain proposals. AI-1F remains open, with AI-2 and CE-3D deferred.
