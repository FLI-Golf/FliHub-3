import copy
import hashlib
import tempfile
from pathlib import Path
import runpy
import unittest

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
