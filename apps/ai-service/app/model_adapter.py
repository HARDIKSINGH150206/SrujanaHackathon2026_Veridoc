"""Model adapter: numbered chat in, suggested terms out.

Suggestion-only (CLAUDE.md rule 2): nothing here may be imported by, or write
to, the vault, the audit log or the hash path. The caller checks every term's
source lines against the chat before showing it to anyone.
"""

import hashlib
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from .settings import Settings

RECORDINGS_FILE = Path(__file__).resolve().parent.parent / "recorded" / "recordings.json"


@dataclass(frozen=True)
class ExtractedTerm:
    kind: str
    label: str
    value: str
    source_lines: tuple[int, ...]


@dataclass(frozen=True)
class ExtractionResult:
    playbook_id: str
    terms: tuple[ExtractedTerm, ...]


class RecordingNotFound(LookupError):
    pass


def number_chat(raw: str) -> str:
    """Prefix each non-blank line with its 1-based number: `[1] first line`."""
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    if not lines:
        raise ValueError("chat has no lines")
    return "\n".join(f"[{n}] {line}" for n, line in enumerate(lines, start=1))


def chat_fingerprint(numbered_chat: str) -> str:
    """Lookup key for recordings. Not part of any proof."""
    return hashlib.sha256(numbered_chat.encode("utf-8")).hexdigest()


class ModelAdapter(ABC):
    @abstractmethod
    def extract(self, numbered_chat: str, playbook_id: str) -> ExtractionResult: ...


class FakeModelAdapter(ModelAdapter):
    """Replays recorded model output, mistakes included (see recorded/README.md)."""

    def __init__(self, recordings_file: Path = RECORDINGS_FILE) -> None:
        data = json.loads(recordings_file.read_text(encoding="utf-8"))
        self._recordings = {(r["playbook_id"], r["chat_sha256"]): r for r in data["recordings"]}

    def extract(self, numbered_chat: str, playbook_id: str) -> ExtractionResult:
        key = (playbook_id, chat_fingerprint(numbered_chat))
        recording = self._recordings.get(key)
        if recording is None:
            raise RecordingNotFound(f"no recorded output for playbook {playbook_id!r} and this chat")
        terms = tuple(
            ExtractedTerm(t["kind"], t["label"], t["value"], tuple(t["source_lines"])) for t in recording["terms"]
        )
        return ExtractionResult(playbook_id, terms)


class LocalModelAdapter(ModelAdapter):
    # STUB: replaced by a later issue
    def extract(self, numbered_chat: str, playbook_id: str) -> ExtractionResult:
        raise NotImplementedError("local model adapter is not implemented yet")


def build_adapter(settings: Settings) -> ModelAdapter:
    if settings.model_mode == "fake":
        return FakeModelAdapter()
    return LocalModelAdapter()
