"""Model adapter: numbered chat in, suggested terms out.

Suggestion-only (CLAUDE.md rule 2): nothing here may be imported by, or write
to, the vault, the audit log or the hash path. The caller checks every quote
against the chat before showing a term to anyone.
"""

import copy
import hashlib
import json
from abc import ABC, abstractmethod
from collections.abc import Mapping
from pathlib import Path

from .model_manifest import REPO_MANIFEST, verify_model_file
from .settings import Settings, settings_from_env

RECORDINGS_FILE = Path(__file__).resolve().parent.parent / "recorded" / "recordings.json"


STATUSES = ("stated", "unclear", "contradicted", "missing")
_TERM_FIELDS = ("status", "value", "quote", "msg", "reason")

ModelOutput = dict
"""What a model returns for one chat, exactly as it writes it:

    {"terms": {key: {"status": "stated|unclear|contradicted|missing",
                     "value": str | None,
                     "quote": [str, ...],     # quote[i] is text copied from message msg[i]
                     "msg": [int, ...],       # 1-based positions in the numbered chat
                     "reason": str}}}

The adapter hands this over unvalidated: a model can return anything, and
term_extractor.py decides what to do with a bad term. check_model_output
describes what is wrong, so tests and the extractor share one definition.
"""


class RecordingNotFound(LookupError):
    pass


def check_term(term: object) -> list[str]:
    """Problems with one term in the model format; empty if it is well formed."""
    if not isinstance(term, dict):
        return ["term is not an object"]
    problems = [f"missing field {f!r}" for f in _TERM_FIELDS if f not in term]
    if "status" in term and term["status"] not in STATUSES:
        problems.append(f"unknown status {term['status']!r}")
    if "value" in term and term["value"] is not None and not isinstance(term["value"], str):
        problems.append("value is not text or null")
    if "reason" in term and not isinstance(term["reason"], str):
        problems.append("reason is not text")
    quote, msg = term.get("quote"), term.get("msg")
    if "quote" in term and not (isinstance(quote, list) and all(isinstance(q, str) for q in quote)):
        problems.append("quote is not a list of text")
    if "msg" in term and not (
        isinstance(msg, list) and all(isinstance(n, int) and not isinstance(n, bool) and n >= 1 for n in msg)
    ):
        problems.append("msg is not a list of whole numbers from 1")
    if isinstance(quote, list) and isinstance(msg, list) and len(quote) != len(msg):
        problems.append("quote and msg differ in length")
    return problems


def check_model_output(output: object) -> list[str]:
    """Problems with a whole model output; empty if it is well formed."""
    if not isinstance(output, dict) or not isinstance(output.get("terms"), dict):
        return ['output is not an object with a "terms" object']
    return [f"{key}: {p}" for key, term in output["terms"].items() for p in check_term(term)]


def chat_fingerprint(numbered_chat: str) -> str:
    """Lookup key for recordings. Not part of any proof."""
    return hashlib.sha256(numbered_chat.encode("utf-8")).hexdigest()


class ModelAdapter(ABC):
    @abstractmethod
    def extract(self, numbered_chat: str, playbook_id: str) -> ModelOutput: ...


class FakeModelAdapter(ModelAdapter):
    """Replays recorded model output, mistakes included (see recorded/README.md)."""

    def __init__(self, recordings_file: Path = RECORDINGS_FILE) -> None:
        data = json.loads(recordings_file.read_text(encoding="utf-8"))
        self._recordings = {(r["playbook_id"], r["chat_sha256"]): r for r in data["recordings"]}

    def extract(self, numbered_chat: str, playbook_id: str) -> ModelOutput:
        key = (playbook_id, chat_fingerprint(numbered_chat))
        recording = self._recordings.get(key)
        if recording is None:
            raise RecordingNotFound(f"no recorded output for playbook {playbook_id!r} and this chat")
        return copy.deepcopy(recording["output"])


class LocalModelAdapter(ModelAdapter):
    # STUB: replaced by a later issue
    def extract(self, numbered_chat: str, playbook_id: str) -> ModelOutput:
        raise NotImplementedError("local model adapter is not implemented yet")


def build_adapter(settings: Settings, manifest_path: Path = REPO_MANIFEST) -> ModelAdapter:
    """Fake mode replays recordings. Local mode refuses a model file that fails the manifest check."""
    if settings.model_mode == "fake":
        return FakeModelAdapter()
    assert settings.model_file_path is not None  # settings_from_env guarantees it in local mode
    verify_model_file(settings.model_file_path, manifest_path, settings.model_sha256)
    return LocalModelAdapter()


def adapter_from_env(env: Mapping[str, str] | None = None) -> ModelAdapter:
    """Called once at service startup: bad settings or a bad model file stop the service."""
    return build_adapter(settings_from_env(env))
