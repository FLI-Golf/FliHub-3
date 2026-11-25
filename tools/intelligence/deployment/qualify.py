"""Offline qualification only. This process has no dispatch or provisioning path."""

import argparse
from contextlib import contextmanager
import errno
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import resource
import selectors
import socket
import stat
import subprocess
import sys
import tempfile
import time
import tomllib

VERSION = "codex-cli 0.172.0"
BUNDLE = Path("/opt/flihub-codex-qualification")
POLICY = Path(__file__).resolve().with_name("requirements.toml")
EXPECTED = {
    "allowedLoginMethods": ["chatgpt"],
    "cliAuthCredentialsStore": "file",
    "allowedApprovalPolicies": ["never"],
    "allowedSandboxModes": ["read-only"],
    "allowedWebSearchModes": ["disabled"],
    "allowManagedHooksOnly": True,
    "allowLoginShell": False,
    "allowRemoteControl": False,
    "allowBrowserAndComputerUse": False,
    "allowAppshots": False,
}
FEATURES = (
    "shell_tool", "unified_exec", "apps", "plugins", "hooks",
    "browser_use", "skill_mcp_dependency_install", "goals",
)
PENDING = (
    "authenticated_client_egress_and_refresh",
    "native_and_hosted_tool_denial",
    "local_fallback_and_disconnect_behavior",
    "candidate_descendant_and_aggregate_resource_enforcement",
    "subscription_usage_and_full_isolated_build",
)


class QualificationError(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise QualificationError(reason)


def validate_startup(payload):
    require(isinstance(payload, dict), "startup_payload_invalid")
    require(payload.get("appServerVersion") == VERSION.removeprefix("codex-cli "),
            "version_mismatch")
    validate_requirements(payload.get("configRequirements"))


def validate_requirements(payload):
    require(isinstance(payload, dict), "managed_requirements_missing")
    requirements = payload.get("requirements")
    require(isinstance(requirements, dict), "managed_requirements_missing")
    for key, expected in EXPECTED.items():
        require(type(requirements.get(key)) is type(expected) and requirements[key] == expected,
                "managed_requirement_mismatch:" + key)
    pins = requirements.get("featureRequirements")
    require(isinstance(pins, dict), "managed_pins_missing")
    for key in FEATURES:
        require(pins.get(key) is False, "managed_pin_missing:" + key)


def validate_features(output):
    rows = [line.split() for line in output.splitlines()]
    for key in FEATURES:
        matches = [row for row in rows if row and row[0] == key]
        require(len(matches) == 1 and matches[0][-1] == "false",
                "feature_not_disabled:" + key)


def canonical(path):
    require(path.is_absolute() and path.resolve(strict=True) == path,
            "path_not_canonical")
    return path


def protected(path, directory=False):
    canonical(path)
    for item in (path, *path.parents):
        info = item.stat()
        require(info.st_uid == 0 and info.st_mode & 0o022 == 0,
                "path_not_root_protected")
        if item != path or directory:
            require(stat.S_ISDIR(info.st_mode), "protected_directory_invalid")
        else:
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                    not info.st_mode & (stat.S_ISUID | stat.S_ISGID),
                    "protected_file_invalid")
            try:
                os.getxattr(item, "security.capability")
            except OSError as exc:
                if exc.errno not in (errno.ENODATA, errno.ENOTSUP):
                    raise
            else:
                raise ValueError("protected_file_capabilities_present")


def verify_digest(path, expected, native=False):
    require(isinstance(expected, str) and re.fullmatch("[0-9a-f]{64}", expected),
            "invalid_approved_digest")
    with path.open("rb") as handle:
        if native:
            require(handle.read(4) == b"\x7fELF", "native_binary_required")
            handle.seek(0)
        require(hashlib.file_digest(handle, "sha256").hexdigest() == expected,
                "approved_digest_mismatch")


def require_identity():
    accounts = [pwd.getpwnam("flihub-" + role)
                for role in ("orchestrator", "model", "executor", "verifier")]
    require(len({account.pw_uid for account in accounts}) == 4 and
            all(account.pw_uid != 0 for account in accounts), "deployment_identity_conflict")
    require(len({account.pw_gid for account in accounts}) == 4,
            "deployment_group_conflict")
    model = accounts[1]
    require(os.getuid() == os.geteuid() == model.pw_uid and
            os.getgid() == os.getegid() == model.pw_gid and
            set(os.getgroups()) <= {model.pw_gid}, "model_identity_or_groups_invalid")
    for account in accounts:
        require(grp.getgrgid(account.pw_gid).gr_name == account.pw_name,
                "deployment_primary_group_invalid")
        require(set(os.getgrouplist(account.pw_name, account.pw_gid)) == {account.pw_gid},
                "deployment_supplementary_groups_present")
    status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines()
                  if ":" in line)
    require(status.get("NoNewPrivs", "").strip() == "1" and
            all(int(status.get(key, "1").strip(), 16) == 0
                for key in ("CapEff", "CapBnd", "CapAmb", "CapInh", "CapPrm")),
            "model_process_privilege_not_dropped")


SAFE_CONFIG = {
    "web_search": "disabled",
    "approval_policy": "never",
    "sandbox_mode": "read-only",
}
PROHIBITED_CONFIG = {
    "web_search": "live",
    "approval_policy": "on-request",
    "sandbox_mode": "workspace-write",
}
UPDATES = {
    "approval": (
        {"approvalPolicy": "on-request"},
        "approval_policy", "OnRequest", "Never",
    ),
    "sandbox": (
        {"sandboxPolicy": {"type": "workspaceWrite", "networkAccess": False}},
        "sandbox_mode", "WorkspaceWrite", "ReadOnly",
    ),
}
STRICT_FIXTURES = {
    "malformed": ('approval_policy = [\n', b"unclosed array, expected `]`"),
    "incompatible": ('approval_policy = 123\n', b"invalid type: unit variant, expected string only"),
}
LIMIT = 256 * 1024


def decode_json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "duplicate_json_key")
            result[key] = value
        return result

    def invalid_constant(_):
        raise ValueError("invalid_json_constant")

    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique,
                      parse_constant=invalid_constant)


@contextmanager
def child(command, *, protocol=False, diagnostics=False, env=None):
    process = subprocess.Popen(
        command, stdin=subprocess.PIPE if protocol else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT if diagnostics else subprocess.DEVNULL,
        env=env,
    )
    try:
        yield process
    finally:
        process.kill()
        process.wait(timeout=3)
        if process.stdin is not None:
            process.stdin.close()
        process.stdout.close()


class BoundedOutput:
    def __init__(self, stream):
        self.stream = stream
        self.pending = b""
        self.total = 0

    def read(self, deadline):
        with selectors.DefaultSelector() as selector:
            selector.register(self.stream, selectors.EVENT_READ)
            require(selector.select(max(0, deadline - time.monotonic())), "probe_timeout")
        require(time.monotonic() < deadline, "probe_timeout")
        chunk = os.read(self.stream.fileno(), 8192)
        self.total += len(chunk)
        require(self.total <= LIMIT, "probe_output_limit")
        return chunk

    def line(self, deadline):
        while b"\n" not in self.pending:
            chunk = self.read(deadline)
            require(chunk, "rpc_response_missing")
            self.pending += chunk
            require(len(self.pending.split(b"\n", 1)[0]) <= 65536, "rpc_message_limit")
        line, self.pending = self.pending.split(b"\n", 1)
        require(len(line) <= 65536, "rpc_message_limit")
        return line

    def collect(self, deadline):
        chunks = []
        while chunk := self.read(deadline):
            chunks.append(chunk)
        return b"".join(chunks)


def capture(command, *, timeout=5, diagnostics=False, env=None):
    deadline = time.monotonic() + timeout
    with child(command, diagnostics=diagnostics, env=env) as process:
        output = BoundedOutput(process.stdout).collect(deadline)
        status = process.wait(timeout=max(0, deadline - time.monotonic()))
    return status, output


def classify_reply(reply, request_id):
    require(isinstance(reply, dict) and reply.get("jsonrpc", "2.0") == "2.0",
            "rpc_envelope_invalid")
    if "id" not in reply:
        require(set(reply) <= {"jsonrpc", "method", "params", "emittedAtMs"} and
                type(reply.get("emittedAtMs", 0)) is int and
                isinstance(reply.get("method"), str) and bool(reply["method"]) and
                isinstance(reply.get("params", {}), dict), "rpc_notification_invalid")
        return None
    require(type(reply["id"]) is int and reply["id"] == request_id, "rpc_identifier_mismatch")
    require("method" not in reply and ("result" in reply) != ("error" in reply),
            "rpc_envelope_invalid")
    return reply


class Protocol:
    def __init__(self, process):
        self.input = process.stdin
        os.set_blocking(self.input.fileno(), False)
        self.output = BoundedOutput(process.stdout)
        self.request_id = 0
        self.settings = []

    def send(self, message):
        frame = json.dumps(message).encode() + b"\n"
        require(len(frame) <= 4096, "rpc_request_limit")
        require(os.write(self.input.fileno(), frame) == len(frame), "rpc_write_incomplete")

    def request(self, method, params=None):
        self.request_id += 1
        request = {"method": method, "id": self.request_id}
        if params is not None:
            request["params"] = params
        self.send(request)
        deadline = time.monotonic() + 5
        while True:
            frame = decode_json(self.output.line(deadline))
            reply = classify_reply(frame, self.request_id)
            if reply is not None:
                return reply
            self.note_notification(frame)

    def note_notification(self, frame):
        if frame["method"] == "thread/settings/updated":
            params = frame.get("params")
            require(isinstance(params, dict), "settings_notification_invalid")
            self.settings.append(params)

    def require_settings_snapshot(self, thread_id, personality):
        deadline = time.monotonic() + 5
        offset = 0
        while True:
            while offset < len(self.settings):
                params = self.settings[offset]
                offset += 1
                require(params.get("threadId") == thread_id, "runtime_thread_mismatch")
                settings = params.get("threadSettings")
                require(isinstance(settings, dict) and settings.get("cwd") == "/tmp",
                        "settings_notification_invalid")
                validate_permissions(settings, "sandboxPolicy")
                if settings.get("personality") == personality:
                    self.settings = self.settings[offset:]
                    return
            frame = decode_json(self.output.line(deadline))
            require(classify_reply(frame, self.request_id) is None, "rpc_duplicate_response")
            self.note_notification(frame)

    def result(self, method, params=None):
        reply = self.request(method, params)
        result = reply.get("result")
        require(isinstance(result, dict), "rpc_result_missing")
        return result


def config_discrepancies(config):
    require(isinstance(config, dict), "configuration_probe_invalid")
    differences = {}
    for key, safe in SAFE_CONFIG.items():
        reported = config.get(key)
        require(reported in (safe, PROHIBITED_CONFIG[key]), "configuration_probe_invalid")
        if reported != safe:
            differences[key] = reported
    return differences


def runtime_snapshot(result):
    require(isinstance(result, dict), "runtime_result_invalid")
    thread = result.get("thread")
    require(isinstance(thread, dict) and isinstance(thread.get("id"), str) and
            re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", thread["id"]) and
            thread.get("ephemeral") is True and "path" in thread and thread["path"] is None and
            thread.get("turns") == [] and result.get("cwd") == "/tmp",
            "ephemeral_thread_unverified")
    validate_permissions(result, "sandbox")
    return thread["id"]


def validate_permissions(result, sandbox_field):
    sandbox = result.get(sandbox_field)
    require(result.get("approvalPolicy") == "never", "effective_approval_unverified")
    require(isinstance(sandbox, dict) and set(sandbox) == {"type", "networkAccess"} and
            sandbox.get("type") == "readOnly" and
            sandbox.get("networkAccess") is False, "effective_sandbox_unverified")


def validate_denial(reply, update):
    _, field, requested, allowed = UPDATES[update]
    expected = (
        f"invalid thread settings override: invalid value for `{field}`: `{requested}` is not in the allowed set "
        f"[{allowed}] (set by /etc/codex/requirements.toml)"
    )
    error = reply.get("error") if isinstance(reply, dict) and "result" not in reply else None
    require(isinstance(error, dict) and type(error.get("code")) is int and
            error["code"] == -32600 and error.get("message") == expected,
            "managed_update_denial_unverified")


def validate_strict_failure(status, output, fixture, diagnostic):
    location = re.escape(os.fsencode(fixture))
    pattern = rb"^Error: " + location + rb":[0-9]+:[0-9]+: " + re.escape(diagnostic) + rb"$"
    require(status == 1 and re.search(pattern, output, re.MULTILINE) and
            not any(line.lstrip().startswith(b"{") for line in output.splitlines()),
            "strict_configuration_failure_unverified")


def app_server(overrides=()):
    return ["/codex", *overrides, "app-server", "--strict-config", "--listen", "stdio://"]


def inspect_runtime(overrides, *, test_updates=False):
    with child(app_server(overrides), protocol=True) as process:
        rpc = Protocol(process)
        params = {"clientInfo": {"name": "flihub_offline_probe", "version": "1"}}
        if test_updates:
            params["capabilities"] = {"experimentalApi": True}
        initialized = rpc.result("initialize", params)
        require(initialized.get("codexHome") == "/tmp" and
                initialized.get("platformOs") == "linux" and
                initialized.get("platformFamily") == "unix" and
                isinstance(initialized.get("userAgent"), str) and initialized["userAgent"],
                "rpc_initialization_unverified")
        rpc.send({"method": "initialized"})
        validate_requirements(rpc.result("configRequirements/read"))
        differences = config_discrepancies(
            rpc.result("config/read", {"includeLayers": False}).get("config"))
        thread_id = runtime_snapshot(rpc.result("thread/start", {"cwd": "/tmp", "ephemeral": True}))
        if test_updates:
            for kind, personality in (("approval", "pragmatic"), ("sandbox", "friendly")):
                settings = UPDATES[kind][0]
                validate_denial(rpc.request("thread/settings/update", {
                    "threadId": thread_id, **settings,
                }), kind)
                # A benign setting change publishes a snapshot without resetting the
                # policy fields. Ephemeral threads have no stored rollout to resume.
                require(rpc.result("thread/settings/update", {
                    "threadId": thread_id, "personality": personality,
                }) == {}, "settings_update_response_invalid")
                rpc.require_settings_snapshot(thread_id, personality)
        return differences


def overrides(config):
    return [arg for key, value in config.items() for arg in ("-c", f'{key}="{value}"')]


def metadata(args):
    status, output = capture(["/codex", *args])
    require(status == 0, "offline_metadata_probe_failed")
    return output


def namespace_probe(expected_pid, expected_net, *hidden):
    require(os.readlink("/proc/self/ns/pid") != expected_pid and
            os.readlink("/proc/self/ns/net") != expected_net, "namespace_not_isolated")
    require(not any(os.path.lexists(path) for path in hidden) and
            not os.path.exists("/var/run/docker.sock"), "namespace_canary_visible")
    environment = dict(os.environ)
    require(environment.pop("LC_CTYPE", "C.UTF-8") == "C.UTF-8" and
            environment == {"HOME": "/tmp", "CODEX_HOME": "/tmp", "PATH": "/usr/bin:/bin",
                            "PWD": "/tmp"}, "namespace_environment_invalid")
    require(resource.getrlimit(resource.RLIMIT_CORE) == (0, 0), "core_limit_invalid")
    with socket.socket() as client:
        require(client.connect_ex(("192.0.2.1", 443)) == errno.ENETUNREACH,
                "namespace_network_available")
    try:
        with open("/etc/codex/requirements.toml", "a"):
            raise QualificationError("managed_policy_writable")
    except OSError as exc:
        require(exc.errno in (errno.EROFS, errno.EACCES, errno.EPERM), "policy_probe_failed")
    require(not os.access("/codex", os.W_OK) and not os.access("/etc/codex", os.W_OK),
            "namespace_files_writable")
    require(metadata(["--version"]).strip() == VERSION.encode(), "version_mismatch")
    validate_startup(decode_json(metadata(["app-server", "--print-startup-config"])))
    validate_features(metadata(["features", "list"]).decode())
    feature_overrides = [arg for key in FEATURES for arg in ("--enable", key)]
    validate_features(metadata([*feature_overrides, "features", "list"]).decode())

    cases = {
        "baseline": SAFE_CONFIG,
        **{key: {**SAFE_CONFIG, key: value} for key, value in PROHIBITED_CONFIG.items()},
        "combined": PROHIBITED_CONFIG,
    }
    reporting = {case: inspect_runtime(overrides(config), test_updates=(case == "baseline"))
                 for case, config in cases.items()}
    require(not reporting["baseline"], "baseline_configuration_reporting_unverified")
    with tempfile.TemporaryDirectory(dir="/tmp") as temporary:
        fixture = Path(temporary) / "config.toml"
        for contents, diagnostic in STRICT_FIXTURES.values():
            fixture.write_text(contents)
            status, output = capture(app_server(), diagnostics=True,
                                     env={**os.environ, "CODEX_HOME": temporary})
            validate_strict_failure(status, output, fixture, diagnostic)
    return qualification_report(reporting)


def qualification_report(reporting):
    return {
        "admitted": False,
        "metadata_namespace": "pass",
        "managed_requirements": "recognized",
        "managed_feature_overrides": "denied",
        "configuration_layer_discrepancies": reporting,
        "strict_configuration": {name: "rejected" for name in STRICT_FIXTURES},
        "effective_runtime": {
            "cases": list(reporting),
            "approvalPolicy": "never",
            "sandbox": {"type": "readOnly", "networkAccess": False},
        },
        "managed_settings_updates": {key: "denied_policy_preserved" for key in UPDATES},
        "independent_tool_effects": {"web_search": "unverified", "native_and_hosted_tools": "pending"},
        "pending": ("effective_web_search_denial", *PENDING),
    }


def run_probe(binary, installed):
    require(tomllib.loads(POLICY.read_text())["mcp_servers"] == {}, "mcp_allowlist_not_empty")
    with tempfile.TemporaryDirectory(prefix="flihub-qualification-") as temporary:
        root = Path(temporary)
        hidden = [root / name for name in ("auth-canary", "repository", "audit", "verifier")]
        for path in hidden:
            path.write_text("inert canary")
        with socket.socket(socket.AF_UNIX) as control:
            endpoint = root / "management.sock"
            control.bind(str(endpoint))
            hidden.append(endpoint)
            status, output = capture(
                [
                    "/usr/bin/prlimit", "--core=0", "--nofile=128", "--",
                    "/usr/bin/bwrap", "--unshare-all", "--unshare-user", "--disable-userns",
                    "--die-with-parent", "--cap-drop", "ALL", "--new-session",
                    "--ro-bind", "/usr", "/usr",
                    "--symlink", "usr/bin", "/bin",
                    "--symlink", "usr/lib", "/lib",
                    "--symlink", "usr/lib64", "/lib64",
                    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
                    "--ro-bind", str(binary), "/codex",
                    "--ro-bind", str(Path(__file__).resolve()), "/qualify.py",
                    "--ro-bind", str(POLICY), "/etc/codex/requirements.toml", "--chdir", "/tmp",
                    "--remount-ro", "/", "--clearenv", "--setenv", "HOME", "/tmp",
                    "--setenv", "CODEX_HOME", "/tmp", "--setenv", "PATH", "/usr/bin:/bin",
                    "--", "/usr/bin/python3", "-I", "-c",
                    "import runpy, sys; runpy.run_path('/qualify.py')['_namespace_main']()",
                    os.readlink("/proc/self/ns/pid"), os.readlink("/proc/self/ns/net"),
                    *map(str, hidden),
                ],
                timeout=45,
                env={"FLIHUB_SYNTHETIC_CREDENTIAL": "inert"},
            )
        require(status in (0, 1) and output, "offline_namespace_probe_failed")
        result = decode_json(output)
        if status == 1 and isinstance(result, dict) and result.get("status") == "blocked":
            raise QualificationError(result.get("reason", "offline_namespace_probe_failed"))
        require(status == 0 and isinstance(result, dict) and result.get("admitted") is False
                and result.get("metadata_namespace") == "pass", "offline_namespace_probe_failed")
    return {**result, "mode": "installed-offline" if installed else "fixture-offline"}


def blocked_result(exc):
    reason = str(exc) if isinstance(exc, QualificationError) else "probe_unavailable"
    if not re.fullmatch(r"[A-Za-z_:]{1,100}", reason):
        reason = "probe_unavailable"
    return {"admitted": False, "status": "blocked", "reason": reason}


PROBE_ERRORS = (OSError, ValueError, TypeError, KeyError, RecursionError, subprocess.TimeoutExpired)


def _namespace_main():
    try:
        print(json.dumps(namespace_probe(*sys.argv[1:])))
    except PROBE_ERRORS as exc:
        print(json.dumps(blocked_result(exc)))
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    parser.add_argument("sha256")
    parser.add_argument("--installed", action="store_true")
    parser.add_argument("--policy-sha256")
    parser.add_argument("--harness-sha256")
    args = parser.parse_args()
    try:
        require(os.geteuid() != 0, "run_without_root")
        binary = canonical(args.binary)
        require(binary.is_file() and 0 < binary.stat().st_size <= 384 * 1024 * 1024,
                "binary_not_regular_or_bounded")
        if args.installed:
            harness = BUNDLE / "qualify.py"
            require(binary == BUNDLE / "codex" and POLICY == BUNDLE / "requirements.toml"
                    and Path(__file__).absolute() == harness,
                    "unexpected_installed_paths")
            for path in (binary, POLICY, harness):
                protected(path)
            verify_digest(POLICY, args.policy_sha256)
            verify_digest(harness, args.harness_sha256)
            require_identity()
        verify_digest(binary, args.sha256, native=True)
        result = run_probe(binary, args.installed)
        print(json.dumps(result))
    except PROBE_ERRORS as exc:
        print(json.dumps(blocked_result(exc)))
    return 1


if __name__ == "__main__":
    sys.exit(main())
