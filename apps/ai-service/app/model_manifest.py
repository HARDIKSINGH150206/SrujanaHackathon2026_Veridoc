"""Startup check for the local model file.

models/manifest.json pins the SHA-256 of each model file the service may load.
A file that is missing, unlisted, unpinned or differs by one byte is refused.
This hash is only a supply-chain check on the weights; it has nothing to do
with the evidence Merkle tree.
"""

import hashlib
import json
from pathlib import Path

REPO_MANIFEST = Path(__file__).resolve().parents[3] / "models" / "manifest.json"
UNPINNED_SHA256 = "0" * 64
_CHUNK = 1024 * 1024


class ModelVerificationError(RuntimeError):
    pass


def load_manifest(path: Path = REPO_MANIFEST) -> list[dict]:
    try:
        entries = json.loads(Path(path).read_text(encoding="utf-8"))["models"]
        for e in entries:
            if not (isinstance(e["file"], str) and isinstance(e["sha256"], str)):
                raise TypeError("file and sha256 must be strings")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ModelVerificationError(f"model manifest {path} is unreadable or malformed: {exc}") from exc
    return entries


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model_file(model_path: Path | str, manifest_path: Path = REPO_MANIFEST, expected_sha256: str | None = None) -> str:
    """Returns the verified SHA-256, or raises ModelVerificationError."""
    model_path = Path(model_path)
    entries = {e["file"]: e["sha256"].lower() for e in load_manifest(manifest_path)}
    pinned = entries.get(model_path.name)
    if pinned is None:
        raise ModelVerificationError(f"{model_path.name} is not listed in the model manifest")
    if pinned == UNPINNED_SHA256:
        raise ModelVerificationError(f"{model_path.name} is not pinned in the model manifest (placeholder hash)")
    if expected_sha256 is not None and expected_sha256.lower() != pinned:
        raise ModelVerificationError("MODEL_SHA256 does not agree with the model manifest")
    if not model_path.is_file():
        raise ModelVerificationError(f"model file not found: {model_path}")
    actual = _file_sha256(model_path)
    if actual != pinned:
        raise ModelVerificationError(f"{model_path.name} does not match the manifest hash (got {actual})")
    return actual
