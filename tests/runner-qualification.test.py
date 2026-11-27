from contextlib import nullcontext
import copy
import io
import json
import os
import hashlib
import tempfile
import time
from pathlib import Path
import runpy
from types import SimpleNamespace
import unittest
from unittest.mock import patch

runner = runpy.run_path(str(Path(__file__).resolve().parents[1] /
                            "tools/intelligence/deployment/qualify.py"))
features = runner["FEATURES"]


class QualificationTests(unittest.TestCase):
    def test_metadata_rejects_missing_or_relaxed_requirements(self):
        expected = {**runner["EXPECTED"],
                    "featureRequirements": dict.fromkeys(features, False)}
        payload = {"appServerVersion": "0.172.0",
                   "configRequirements": {"requirements": expected}}
        runner["validate_startup"](payload)
        for key in (*runner["EXPECTED"], "featureRequirements"):
            changed = copy.deepcopy(payload)
            del changed["configRequirements"]["requirements"][key]
            with self.assertRaises(ValueError):
                runner["validate_startup"](changed)
        different = copy.deepcopy(payload)
        different["appServerVersion"] = "0.173.0"
        with self.assertRaisesRegex(ValueError, "version_mismatch"):
            runner["validate_startup"](different)
        expected["featureRequirements"]["unified_exec"] = True
        with self.assertRaisesRegex(ValueError, "managed_pin_missing"):
            runner["validate_startup"](payload)

    def test_reply_envelope_requires_exact_correlation(self):
        classify = runner["classify_reply"]
        self.assertEqual(classify({"id": 1, "result": {}}, 1), {"id": 1, "result": {}})
        self.assertIsNone(classify({"method": "thread/started", "emittedAtMs": 2}, 1))
        for reply in (None, [], {}, {"id": 1}, {"id": 2, "result": {}},
                      {"id": True, "result": {}}, {"id": "1", "result": {}},
                      {"id": 1, "result": {}, "error": {}}, {"id": 1, "method": "server/request"},
                      {"result": {}}, {"method": "thread/started", "params": []}):
            with self.subTest(reply=reply), self.assertRaises(ValueError):
                classify(reply, 1)
        for raw in (b"not-json", b'{"id":1,"id":2}', b'{"result":NaN}'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                runner["decode_json"](raw)

    def test_bounded_output_rejects_missing_oversized_or_late_reply(self):
        reader = runner["BoundedOutput"](io.BytesIO())
        with patch.object(reader, "read", return_value=b""):
            with self.assertRaisesRegex(ValueError, "rpc_response_missing"):
                reader.line(time.monotonic() + 1)
        with patch.object(reader, "read", return_value=b"x" * 65537 + b"\n"):
            with self.assertRaisesRegex(ValueError, "rpc_message_limit"):
                reader.line(time.monotonic() + 1)
        read_fd, write_fd = os.pipe()
        with os.fdopen(read_fd, "rb") as stream, os.fdopen(write_fd, "wb") as writer:
            reader = runner["BoundedOutput"](stream)
            with self.assertRaisesRegex(ValueError, "probe_timeout"):
                reader.read(time.monotonic())
            reader.total = runner["LIMIT"]
            writer.write(b"x")
            writer.flush()
            with self.assertRaisesRegex(ValueError, "probe_output_limit"):
                reader.read(time.monotonic() + 1)

    @staticmethod
    def runtime_transcript():
        thread_id = "12345678-1234-1234-1234-123456789abc"
        sandbox = {"type": "readOnly", "networkAccess": False}
        requirements = {**runner["EXPECTED"], "featureRequirements": dict.fromkeys(features, False)}
        transcript = [
            {"id": 1, "result": {"codexHome": "/tmp", "platformOs": "linux",
                                 "platformFamily": "unix", "userAgent": "fixture"}},
            {"id": 2, "result": {"requirements": requirements}},
            {"id": 3, "result": {"config": runner["PROHIBITED_CONFIG"]}},
            {"id": 4, "result": {"thread": {"id": thread_id, "ephemeral": True,
                                          "path": None, "turns": []}, "cwd": "/tmp",
                                 "approvalPolicy": "never", "sandbox": sandbox}},
        ]
        for index, (field, request, allowed, personality) in enumerate((
            ("approval_policy", "OnRequest", "Never", "pragmatic"),
            ("sandbox_mode", "WorkspaceWrite", "ReadOnly", "friendly"),
        )):
            notification = {"method": "thread/settings/updated", "params": {
                "threadId": thread_id, "threadSettings": {
                    "cwd": "/tmp", "approvalPolicy": "never", "sandboxPolicy": dict(sandbox),
                    "personality": personality,
                },
            }}
            accepted = {"id": 6 + index * 2, "result": {}}
            transcript.extend([
                {"id": 5 + index * 2, "error": {"code": -32600, "message": (
                    f"invalid thread settings override: invalid value for `{field}`: "
                    f"`{request}` is not in the allowed set [{allowed}] "
                    "(set by /etc/codex/requirements.toml)"
                )}},
                *([notification, accepted] if index == 0 else [accepted, notification]),
            ])
        return copy.deepcopy(transcript)

    def inspect_transcript(self, transcript):
        inspect = runner["inspect_runtime"]
        in_fd, in_writer = os.pipe()
        out_fd, out_writer = os.pipe()
        with (os.fdopen(in_fd, "rb") as requests, os.fdopen(in_writer, "wb") as stdin,
              os.fdopen(out_fd, "rb") as stdout, os.fdopen(out_writer, "wb") as replies):
            replies.write(b"".join(json.dumps(frame).encode() + b"\n" for frame in transcript))
            replies.close()
            fake = SimpleNamespace(stdin=stdin, stdout=stdout)
            with patch.dict(inspect.__globals__, {"child": lambda *_, **__: nullcontext(fake)}):
                reporting = inspect([], test_updates=True)
            stdin.close()
            commands = [json.loads(line) for line in requests]
        return reporting, commands

    def test_discrepancies_are_reported_while_runtime_and_updates_pass(self):
        reporting, commands = self.inspect_transcript(self.runtime_transcript())
        self.assertEqual(reporting, runner["PROHIBITED_CONFIG"])
        self.assertEqual([frame["method"] for frame in commands], [
            "initialize", "initialized", "configRequirements/read", "config/read",
            "thread/start", *["thread/settings/update"] * 4,
        ])
        self.assertTrue(commands[0]["params"]["capabilities"]["experimentalApi"])
        self.assertTrue(commands[4]["params"]["ephemeral"])
        report = runner["qualification_report"]({"combined": reporting})
        self.assertEqual(report["configuration_layer_discrepancies"]["combined"], reporting)
        self.assertEqual(report["independent_tool_effects"]["web_search"], "unverified")
        self.assertIn("effective_web_search_denial", report["pending"])
        self.assertIs(report["admitted"], False)

    def test_runtime_and_post_rejection_evidence_fail_closed(self):
        for case, index, replacement in (
            ("missing requirements", 1, {"id": 2, "result": {}}),
            ("malformed config", 2, {"id": 3, "result": {"config": {"web_search": True}}}),
            ("approval relaxed", 3, {"approvalPolicy": "on-request"}),
            ("network relaxed", 3, {"sandbox": {"type": "readOnly", "networkAccess": True}}),
            ("sandbox relaxed", 3, {"sandbox": {"type": "workspaceWrite", "networkAccess": False}}),
            ("unsupported protocol", 4, {"id": 5, "error": {"code": -32600, "message": "unsupported"}}),
            ("malformed request", 4, {"id": 5, "error": {"code": -32602, "message": "invalid params"}}),
            ("incorrect identifier", 4, {"id": 51, "result": {}}),
            ("approval accepted", 4, {"id": 5, "result": {}}),
            ("sandbox accepted", 7, {"id": 7, "result": {}}),
            ("missing snapshot", 9, None),
        ):
            transcript = self.runtime_transcript()
            if index == 3:
                transcript[index]["result"].update(replacement)
            elif replacement is None:
                del transcript[index]
            else:
                transcript[index] = replacement
            with self.subTest(case=case), self.assertRaises(ValueError):
                self.inspect_transcript(transcript)
        for key, value in (("approvalPolicy", "on-request"),
                           ("sandboxPolicy", {"type": "workspaceWrite", "networkAccess": False})):
            transcript = self.runtime_transcript()
            transcript[5]["params"]["threadSettings"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.inspect_transcript(transcript)
        transcript = self.runtime_transcript()
        transcript[5]["params"]["threadId"] = "unrelated"
        with self.assertRaisesRegex(ValueError, "runtime_thread_mismatch"):
            self.inspect_transcript(transcript)
        transcript = self.runtime_transcript()
        transcript[7]["error"]["message"] = transcript[7]["error"]["message"].replace(
            "/etc/codex/requirements.toml", "/tmp/requirements.toml")
        with self.assertRaisesRegex(ValueError, "managed_update_denial_unverified"):
            self.inspect_transcript(transcript)

    def test_strict_failures_require_fixture_specific_startup_errors(self):
        fixture = Path("/tmp/fixture/config.toml")
        for _, diagnostic in runner["STRICT_FIXTURES"].values():
            evidence = b"Error: /tmp/fixture/config.toml:1:20: " + diagnostic + b"\n"
            runner["validate_strict_failure"](1, evidence, fixture, diagnostic)
            for status, output in ((0, evidence), (-9, evidence), (1, b"Error: unsupported flag"),
                                   (1, evidence.replace(b"/fixture/", b"/other/")),
                                   (1, evidence + b'{"id":1,"result":{}}\n')):
                with self.subTest(status=status, output=output), self.assertRaises(ValueError):
                    runner["validate_strict_failure"](status, output, fixture, diagnostic)

    def test_feature_list_rejects_missing_enabled_or_duplicate_rows(self):
        rows = [f"{key} stable false" for key in features]
        runner["validate_features"]("\n".join(rows))
        for invalid in (rows[1:], rows + [rows[0]], [*rows[1:], rows[0].replace("false", "true")]):
            with self.assertRaises(ValueError):
                runner["validate_features"]("\n".join(invalid))

    def test_pins_require_expected_bytes_and_native_header(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "artifact"
            contents = b"\x7fELFinert"
            path.write_bytes(contents)
            digest = hashlib.sha256(contents).hexdigest()
            runner["verify_digest"](path, digest, native=True)
            with self.assertRaisesRegex(ValueError, "invalid_approved_digest"):
                runner["verify_digest"](path, None)
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "approved_digest_mismatch"):
                runner["verify_digest"](path, digest)
            with self.assertRaisesRegex(ValueError, "native_binary_required"):
                runner["verify_digest"](path, digest, native=True)

    def test_protected_path_rejects_alias_and_untrusted_ancestors(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "policy"
            path.write_text("inert")
            alias = Path(temporary) / "alias"
            alias.symlink_to(path)
            with self.assertRaisesRegex(ValueError, "path_not_canonical"):
                runner["canonical"](alias)
            with self.assertRaisesRegex(ValueError, "path_not_root_protected"):
                runner["protected"](path)


if __name__ == "__main__":
    unittest.main()
