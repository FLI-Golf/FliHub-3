"""Offline qualification only. This process has no dispatch or provisioning path."""

import argparse
import errno
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import socket
import stat
import subprocess
import sys
import tempfile
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


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def validate_startup(payload):
    require(isinstance(payload, dict), "startup_payload_invalid")
    require(payload.get("appServerVersion") == VERSION.removeprefix("codex-cli "),
            "version_mismatch")
    require(isinstance(payload.get("configRequirements"), dict), "managed_requirements_missing")
    requirements = payload["configRequirements"].get("requirements")
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


# The metadata namespace binds a trusted runtime read-only. Candidate code never runs here.
INNER = """
import errno, json, os, resource, socket, subprocess, sys
expected_pid, expected_net, *hidden = sys.argv[1:]
if os.readlink('/proc/self/ns/pid') == expected_pid or os.readlink('/proc/self/ns/net') == expected_net:
    raise SystemExit(10)
if any(os.path.lexists(path) for path in hidden) or os.path.exists('/var/run/docker.sock'):
    raise SystemExit(11)
if 'FLIHUB_SYNTHETIC_CREDENTIAL' in os.environ or resource.getrlimit(resource.RLIMIT_CORE) != (0, 0):
    raise SystemExit(12)
with socket.socket() as client:
    if client.connect_ex(('192.0.2.1', 443)) != errno.ENETUNREACH:
        raise SystemExit(13)
try:
    with open('/etc/codex/requirements.toml', 'a'):
        raise SystemExit(14)
except OSError as exc:
    if exc.errno not in (errno.EROFS, errno.EACCES, errno.EPERM):
        raise
if os.access('/codex', os.W_OK) or os.access('/etc/codex', os.W_OK):
    raise SystemExit(15)
def metadata(args):
    run = subprocess.run(['/codex', *args], stdin=subprocess.DEVNULL,
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         check=True, timeout=5, text=True)
    if len(run.stdout) > 65536:
        raise SystemExit(16)
    return run.stdout
keys = ['shell_tool','unified_exec','apps','plugins','hooks','browser_use','skill_mcp_dependency_install','goals']
overrides = [arg for key in keys for arg in ('--enable', key)]
policy_overrides = [
    '-c', 'web_search="live"', '-c', 'approval_policy="on-request"',
    '-c', 'sandbox_mode="workspace-write"'
]
# Only local introspection RPCs run inside the empty, network-denied namespace.
def read_config(overrides):
    with subprocess.Popen(
        ['/codex', *overrides, 'app-server', '--listen', 'stdio://'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True
    ) as process:
        def send(message):
            process.stdin.write(json.dumps(message) + chr(10))
            process.stdin.flush()
        def read(request_id):
            while True:
                line = process.stdout.readline(65537)
                if not line or len(line) > 65536:
                    raise SystemExit(17)
                reply = json.loads(line)
                if reply.get('id') == request_id:
                    return reply
        try:
            send({'id': 1, 'method': 'initialize', 'params': {
                'clientInfo': {'name': 'flihub_offline_probe', 'version': '1'}
            }})
            if 'result' not in read(1):
                raise SystemExit(18)
            send({'method': 'initialized'})
            send({'id': 2, 'method': 'config/read', 'params': {'includeLayers': False}})
            reply = read(2)
            return reply.get('result', {}).get('config')
        finally:
            process.kill()
expected = {'web_search': 'disabled', 'approval_policy': 'never', 'sandbox_mode': 'read-only'}
base = ['-c', 'web_search="disabled"', '-c', 'approval_policy="never"', '-c', 'sandbox_mode="read-only"']
safe_config = read_config(base)
attempted_config = read_config(policy_overrides)
def has_expected(config):
    return isinstance(config, dict) and all(config.get(key) == value for key, value in expected.items())
print(json.dumps({
    'version': metadata(['--version']).strip(),
    'startup': json.loads(metadata(['app-server', '--print-startup-config'])),
    'features': metadata(['features', 'list']),
    'overrides': metadata([*overrides, 'features', 'list']),
    'safe_configuration_effective': has_expected(safe_config),
    'override_mismatches': [
        key for key, value in expected.items()
        if not isinstance(attempted_config, dict) or attempted_config.get(key) != value
    ],
}))
"""


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
            run = subprocess.run(
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
                    "--ro-bind", str(POLICY), "/etc/codex/requirements.toml", "--chdir", "/tmp",
                    "--remount-ro", "/", "--clearenv", "--setenv", "HOME", "/tmp",
                    "--setenv", "CODEX_HOME", "/tmp", "--setenv", "PATH", "/usr/bin:/bin",
                    "--", "/usr/bin/python3", "-I", "-c", INNER,
                    os.readlink("/proc/self/ns/pid"), os.readlink("/proc/self/ns/net"),
                    *map(str, hidden),
                ],
                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=25,
                env={"FLIHUB_SYNTHETIC_CREDENTIAL": "inert"},
            )
        require(run.returncode == 0, "offline_namespace_probe_failed")
        require(len(run.stdout) <= 262144, "probe_output_limit")
        result = json.loads(run.stdout)
        require(result["version"] == VERSION, "version_mismatch")
        validate_startup(result["startup"])
        validate_features(result["features"])
        validate_features(result["overrides"])
        require(result["safe_configuration_effective"], "effective_configuration_unverified")
        mismatches = result["override_mismatches"]
        require(isinstance(mismatches, list) and
                all(key in {"web_search", "approval_policy", "sandbox_mode"} for key in mismatches),
                "configuration_probe_invalid")
    return {
        "admitted": False,
        "mode": "installed-offline" if installed else "fixture-offline",
        "metadata_namespace": "pass",
        "managed_feature_overrides": "denied",
        "configuration_override_check": "blocked" if mismatches else "pass",
        "unverified_configuration_keys": mismatches,
        "pending": PENDING,
    }


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
        if result["configuration_override_check"] != "pass":
            return 1
    except (OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired) as exc:
        reason = str(exc) if type(exc) is ValueError else "probe_unavailable"
        if not reason or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_:" for ch in reason):
            reason = "probe_unavailable"
        print(json.dumps({"admitted": False, "status": "blocked", "reason": reason}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
