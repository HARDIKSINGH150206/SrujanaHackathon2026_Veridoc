import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from app.model_adapter import LocalModelAdapter, build_adapter
from app.model_manifest import (
    REPO_MANIFEST,
    ModelVerificationError,
    load_manifest,
    verify_model_file,
)
from app.settings import settings_from_env

WEIGHTS = b"not real weights, just test bytes"
WEIGHTS_SHA = hashlib.sha256(WEIGHTS).hexdigest()


class VerifyModelFileTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        self.model = self.dir / "test-model.gguf"
        self.model.write_bytes(WEIGHTS)

    def manifest(self, entries: list[dict]) -> Path:
        path = self.dir / "manifest.json"
        path.write_text(json.dumps({"models": entries}), encoding="utf-8")
        return path

    def test_accepts_a_matching_file(self):
        m = self.manifest([{"file": "test-model.gguf", "sha256": WEIGHTS_SHA}])
        self.assertEqual(verify_model_file(self.model, m), WEIGHTS_SHA)

    def test_refuses_a_file_whose_hash_differs(self):
        m = self.manifest([{"file": "test-model.gguf", "sha256": "b" * 64}])
        with self.assertRaisesRegex(ModelVerificationError, "does not match"):
            verify_model_file(self.model, m)

    def test_refuses_a_tampered_file(self):
        m = self.manifest([{"file": "test-model.gguf", "sha256": WEIGHTS_SHA}])
        self.model.write_bytes(WEIGHTS + b"x")
        with self.assertRaisesRegex(ModelVerificationError, "does not match"):
            verify_model_file(self.model, m)

    def test_refuses_a_file_the_manifest_does_not_list(self):
        m = self.manifest([{"file": "other.gguf", "sha256": WEIGHTS_SHA}])
        with self.assertRaisesRegex(ModelVerificationError, "not listed"):
            verify_model_file(self.model, m)

    def test_refuses_a_missing_file(self):
        m = self.manifest([{"file": "test-model.gguf", "sha256": WEIGHTS_SHA}])
        self.model.unlink()
        with self.assertRaisesRegex(ModelVerificationError, "not found"):
            verify_model_file(self.model, m)

    def test_refuses_an_unpinned_entry(self):
        m = self.manifest([{"file": "test-model.gguf", "sha256": "0" * 64}])
        with self.assertRaisesRegex(ModelVerificationError, "not pinned"):
            verify_model_file(self.model, m)

    def test_env_sha256_must_agree_with_the_manifest(self):
        m = self.manifest([{"file": "test-model.gguf", "sha256": WEIGHTS_SHA}])
        self.assertEqual(verify_model_file(self.model, m, expected_sha256=WEIGHTS_SHA), WEIGHTS_SHA)
        with self.assertRaisesRegex(ModelVerificationError, "MODEL_SHA256"):
            verify_model_file(self.model, m, expected_sha256="c" * 64)

    def test_refuses_a_malformed_manifest(self):
        bad = self.dir / "bad.json"
        bad.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ModelVerificationError, "manifest"):
            verify_model_file(self.model, bad)

    def test_local_mode_builds_the_stub_only_after_verification(self):
        env = {"MODEL_MODE": "local", "MODEL_FILE_PATH": str(self.model), "LLAMA_SERVER_PATH": "/x"}
        good = self.manifest([{"file": "test-model.gguf", "sha256": WEIGHTS_SHA}])
        self.assertIsInstance(build_adapter(settings_from_env(env), manifest_path=good), LocalModelAdapter)
        bad = self.manifest([{"file": "test-model.gguf", "sha256": "d" * 64}])
        with self.assertRaises(ModelVerificationError):
            build_adapter(settings_from_env(env), manifest_path=bad)


class RepoManifestTests(unittest.TestCase):
    def test_committed_manifest_is_well_formed(self):
        entries = load_manifest(REPO_MANIFEST)
        self.assertTrue(entries)
        for e in entries:
            self.assertRegex(e["sha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(e["file"].endswith(".gguf"))

    def test_committed_manifest_cannot_verify_a_file_until_a_hash_is_pinned(self):
        with tempfile.TemporaryDirectory() as d:
            for e in load_manifest(REPO_MANIFEST):
                f = Path(d) / e["file"]
                f.write_bytes(b"anything")
                with self.assertRaises(ModelVerificationError):
                    verify_model_file(f, REPO_MANIFEST)


if __name__ == "__main__":
    unittest.main()
