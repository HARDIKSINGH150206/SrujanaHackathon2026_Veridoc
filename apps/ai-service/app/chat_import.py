"""Reads a WhatsApp text export (Android or iPhone) into numbered messages.

Every entry gets a number, counting media-omitted, deleted and system lines, so
`msg` in the model's output is simply a position in this list. Nothing here
touches the vault or the hash path (CLAUDE.md rule 2).
"""

import hashlib
import io
import re
from dataclasses import dataclass, field

from .transcriber import Segment, Transcriber, TranscriptNotFound

# Direction marks and similar invisible characters WhatsApp puts into exports.
_INVISIBLE = re.compile("[‎‏‪-‮﻿]")
_DATE = r"(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})"
_TIME = r"(\d{1,2}:\d{2}(?::\d{2})?)(?:\s?([AaPp][Mm]))?"
_ANDROID = re.compile(rf"^{_DATE},?\s{_TIME}\s-\s(.*)$")
_IPHONE = re.compile(rf"^\[{_DATE},?\s{_TIME}\]\s(.*)$")
_MEDIA = re.compile(
    r"^(?:<Media omitted>|<attached: .+>|(?:image|video|audio|sticker|GIF|document|contact card|video note) omitted)$",
    re.IGNORECASE,
)
_DELETED = re.compile(r"^(?:This message was deleted|You deleted this message)$", re.IGNORECASE)
_SYSTEM_TEXT = re.compile(r"^Messages and calls are end-to-end encrypted", re.IGNORECASE)
_EDITED = re.compile(r"\s*<This message was edited>$")


class ChatImportError(ValueError):
    pass


class ScannedPdfNotSupported(ChatImportError):
    pass


AUDIO_EXTENSIONS = (".opus", ".m4a", ".wav")
MAX_AUDIO_BYTES = 10_000_000
MAX_VOICE_NOTES = 20
_ATTACHED = re.compile(r"^<attached: (.+)>$")
_FILE_ATTACHED = re.compile(r"^(.+) \(file attached\)$")


@dataclass(frozen=True)
class Voice:
    """A voice note: the audio's own SHA-256 (of the raw bytes) and its transcript, a suggestion a person can correct."""

    name: str
    sha256: str
    size: int
    segments: tuple[Segment, ...]
    corrected: bool = False


@dataclass(frozen=True)
class Message:
    n: int
    kind: str  # "message", "voice", "media", "deleted" or "system"
    sender: str | None
    text: str
    timestamp: str | None
    voice: Voice | None = None

    @property
    def start_ms(self) -> int | None:
        return self.voice.segments[0].start_ms if self.voice and self.voice.segments else None

    @property
    def end_ms(self) -> int | None:
        return self.voice.segments[-1].end_ms if self.voice and self.voice.segments else None


@dataclass
class ParseResult:
    messages: list[Message]
    # (1-based line number, text) of lines that came before the first message and belong to none.
    problems: list[tuple[int, str]] = field(default_factory=list)
    # Plain-language notes about voice notes that could not be used (missing file, no transcript, too large).
    voice_problems: list[str] = field(default_factory=list)


def _header(line: str) -> tuple[str, str] | None:
    m = _ANDROID.match(line) or _IPHONE.match(line)
    if m is None:
        return None
    date, clock, ampm, rest = m.groups()
    return f"{date} {clock}" + (f" {ampm}" if ampm else ""), rest


def _classify(timestamp: str, rest: str) -> tuple[str, str | None, str]:
    sender, sep, text = rest.partition(": ")
    if not sep:
        return "system", None, rest.strip()
    text = _EDITED.sub("", text).strip()
    if _SYSTEM_TEXT.match(text):
        return "system", None, text
    if _MEDIA.match(text):
        return "media", sender.strip(), text
    if _DELETED.match(text):
        return "deleted", sender.strip(), text
    return "message", sender.strip(), text


def parse_chat(raw: str) -> ParseResult:
    """Parse an export. Raises ChatImportError if it holds no messages at all."""
    pending: list[list] = []  # [timestamp, rest]
    problems: list[tuple[int, str]] = []
    for number, line in enumerate(_INVISIBLE.sub("", raw).splitlines(), start=1):
        header = _header(line)
        if header is not None:
            pending.append([header[0], header[1]])
        elif pending:
            pending[-1][1] += "\n" + line
        elif line.strip():
            problems.append((number, line.strip()))
    if not pending:
        raise ChatImportError("no WhatsApp-style messages found (expected lines like '12/03/2026, 10:02 - Name: text')")
    messages = []
    for n, (timestamp, rest) in enumerate(pending, start=1):
        kind, sender, text = _classify(timestamp, rest.rstrip())
        messages.append(Message(n, kind, sender, text, timestamp))
    return ParseResult(messages, problems)


def format_numbered(messages: list[Message]) -> str:
    """`[n] Sender: text` per message; continuation lines are indented four spaces."""
    out: list[str] = []
    for m in messages:
        if m.kind == "system":
            body = f"(system) {m.text}"
        elif m.kind == "voice":
            body = f"{m.sender}: (voice note) {m.text}"
        elif m.kind == "deleted":
            body = f"{m.sender}: (deleted message)"
        else:
            body = f"{m.sender}: {m.text}"
        first, *rest = body.split("\n")
        out.append(f"[{m.n}] {first}")
        out.extend(f"    {line}" for line in rest)
    return "\n".join(out)


def attachment_name(text: str) -> str | None:
    """The file name of an audio attachment line (.opus, .m4a, .wav), or None. A name with a path is refused."""
    m = _ATTACHED.match(text.strip()) or _FILE_ATTACHED.match(text.strip())
    if m is None:
        return None
    name = m.group(1).strip()
    if "/" in name or "\\" in name or not name.lower().endswith(AUDIO_EXTENSIONS):
        return None
    return name


def import_export(
    chat_text: str,
    files: dict[str, bytes],
    transcriber: Transcriber,
    corrections: dict[str, str] | None = None,
    max_audio_bytes: int = MAX_AUDIO_BYTES,
    max_voice_notes: int = MAX_VOICE_NOTES,
) -> ParseResult:
    """Parse an export folder: the chat text plus its voice notes.

    Each voice note becomes one numbered message whose text is its transcript. The audio is hashed
    from its raw bytes. A voice note that cannot be used stays a media message and is explained in
    voice_problems; nothing here raises for a bad voice note.
    """
    parsed = parse_chat(chat_text)
    out: list[Message] = []
    problems: list[str] = []
    seen = 0
    for m in parsed.messages:
        name = attachment_name(m.text) if m.kind in ("media", "message") else None
        if name is None:
            out.append(m)
            continue
        seen += 1
        audio = files.get(name)
        if seen > max_voice_notes:
            problems.append(f"Voice note {name} was skipped: too many voice notes (the limit is {max_voice_notes}).")
        elif audio is None:
            problems.append(f"Voice note {name} is not in the export folder.")
        elif len(audio) > max_audio_bytes:
            problems.append(f"Voice note {name} is too large ({len(audio)} bytes; the limit is {max_audio_bytes}).")
        else:
            try:
                segments = list(transcriber.transcribe(audio, name))
            except TranscriptNotFound as exc:
                problems.append(f"Voice note {name}: {exc}.")
                segments = []
            except NotImplementedError as exc:
                problems.append(f"Voice note {name}: transcriber not implemented. {exc}")
                segments = []
            except Exception as exc:  # a transcriber is a model: any failure is its own, not ours
                problems.append(f"Voice note {name} could not be transcribed ({type(exc).__name__}).")
                segments = []
            fixed = (corrections or {}).get(name, "").strip()
            corrected = bool(fixed) and bool(segments)
            if corrected:
                segments = [Segment(segments[0].start_ms, segments[-1].end_ms, fixed)]
            text = " ".join(s.text.strip() for s in segments).strip()
            if text:
                voice = Voice(name, hashlib.sha256(audio).hexdigest(), len(audio), tuple(segments), corrected)
                out.append(Message(m.n, "voice", m.sender, text, m.timestamp, voice))
                continue
            if segments:
                problems.append(f"Voice note {name} has an empty transcript.")
        out.append(m)
    return ParseResult(out, parsed.problems, problems)


def text_from_pdf(data: bytes) -> str:
    """Text of a text PDF. A PDF with no extractable text (a scan) is refused: ADR-040."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except ImportError as exc:  # pragma: no cover - pypdf is in requirements.txt
        raise ChatImportError("pypdf is not installed") from exc
    except Exception as exc:
        raise ChatImportError(f"not a readable PDF: {exc}") from exc
    if not text.strip():
        raise ScannedPdfNotSupported("this PDF has no text (it looks scanned): scanned PDFs are not supported yet")
    return text


def chat_from_pdf(data: bytes) -> ParseResult:
    return parse_chat(text_from_pdf(data))
