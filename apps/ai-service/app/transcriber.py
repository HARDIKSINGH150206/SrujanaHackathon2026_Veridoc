"""Transcriber: voice note audio in, timed transcript segments out.

Suggestion-only (CLAUDE.md rule 2): a transcript is a proposal a person can
correct. Nothing here touches the vault, the audit log or the hash path; the
audio's own SHA-256 is taken elsewhere, from the raw bytes.
"""

import hashlib
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from .settings import Settings

TRANSCRIPTS_FILE = Path(__file__).resolve().parent.parent / "recorded" / "transcripts.json"


@dataclass(frozen=True)
class Segment:
    start_ms: int
    end_ms: int
    text: str


class TranscriptNotFound(LookupError):
    pass


class Transcriber(ABC):
    @abstractmethod
    def transcribe(self, audio: bytes, name: str) -> list[Segment]: ...


def _segments(raw: list) -> list[Segment]:
    out = []
    for s in raw:
        start, end, text = s["start_ms"], s["end_ms"], s["text"]
        if not (isinstance(start, int) and isinstance(end, int) and isinstance(text, str) and 0 <= start < end):
            raise ValueError(f"bad transcript segment: {s!r}")
        out.append(Segment(start, end, text))
    if any(a.end_ms > b.start_ms for a, b in zip(out, out[1:])):
        raise ValueError("transcript segments overlap or are out of order")
    return out


class FakeTranscriber(Transcriber):
    """Replays recorded transcripts, found by the SHA-256 of the audio bytes. This is the default.

    The transcript is recorded, not produced by speech recognition (see recorded/README.md).
    """

    def __init__(self, transcripts_file: Path = TRANSCRIPTS_FILE) -> None:
        try:
            data = json.loads(transcripts_file.read_text(encoding="utf-8"))
            self._by_hash = {t["audio_sha256"]: _segments(t["segments"]) for t in data["transcripts"]}
        except (KeyError, TypeError) as exc:
            raise ValueError(f"malformed transcripts file {transcripts_file}: {exc!r}") from exc

    def transcribe(self, audio: bytes, name: str) -> list[Segment]:
        found = self._by_hash.get(hashlib.sha256(audio).hexdigest())
        if found is None:
            raise TranscriptNotFound(f"no recorded transcript for {name!r}")
        return list(found)


class LocalTranscriber(Transcriber):
    # STUB: replaced by a later issue
    def transcribe(self, audio: bytes, name: str) -> list[Segment]:
        raise NotImplementedError(
            "The local transcriber (faster-whisper) is not implemented yet. Set TRANSCRIBER_MODE=fake to use recorded transcripts."
        )


def build_transcriber(settings: Settings) -> Transcriber:
    return FakeTranscriber() if settings.transcriber_mode == "fake" else LocalTranscriber()
