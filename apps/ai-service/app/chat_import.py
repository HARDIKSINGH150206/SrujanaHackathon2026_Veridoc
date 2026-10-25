"""Reads a WhatsApp text export (Android or iPhone) into numbered messages.

Every entry gets a number, counting media-omitted, deleted and system lines, so
`msg` in the model's output is simply a position in this list. Nothing here
touches the vault or the hash path (CLAUDE.md rule 2).
"""

import io
import re
from dataclasses import dataclass, field

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


@dataclass(frozen=True)
class Message:
    n: int
    kind: str  # "message", "media", "deleted" or "system"
    sender: str | None
    text: str
    timestamp: str | None


@dataclass
class ParseResult:
    messages: list[Message]
    # (1-based line number, text) of lines that came before the first message and belong to none.
    problems: list[tuple[int, str]] = field(default_factory=list)


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
        elif m.kind == "deleted":
            body = f"{m.sender}: (deleted message)"
        else:
            body = f"{m.sender}: {m.text}"
        first, *rest = body.split("\n")
        out.append(f"[{m.n}] {first}")
        out.extend(f"    {line}" for line in rest)
    return "\n".join(out)


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
