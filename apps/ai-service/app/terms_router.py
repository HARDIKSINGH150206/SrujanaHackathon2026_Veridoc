"""POST /v1/terms: chat text or a text PDF in, terms with source links out.

Read-only (CLAUDE.md rule 2): it holds no database or storage credentials and
calls no vault route. The web app shows the result; only a person's
confirmation, uploaded by the browser, ever reaches the vault.
"""

import base64
import binascii

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .chat_import import (
    MAX_AUDIO_BYTES,
    MAX_VOICE_NOTES,
    ChatImportError,
    ScannedPdfNotSupported,
    attachment_name,
    chat_from_pdf,
    format_numbered,
    import_export,
    parse_chat,
)
from .model_adapter import adapter_from_env
from .playbooks import PlaybookError, list_playbooks, load_playbook
from .settings import demo_badge_text, settings_from_env
from .transcriber import build_transcriber
from .term_extractor import extract_terms

MAX_CHAT_CHARS = 2_000_000
MAX_PDF_BYTES = 10_000_000
MAX_VOICE_TOTAL_BYTES = 30_000_000

router = APIRouter()


class VoiceNoteIn(BaseModel):
    name: str
    audio_base64: str


class TermsRequest(BaseModel):
    playbook_id: str
    chat_text: str | None = None
    pdf_base64: str | None = None
    # The voice notes of a WhatsApp export folder, with the chat text. Transcripts are suggestions; a
    # person can correct one by file name in voice_corrections.
    voice_notes: list[VoiceNoteIn] = Field(default_factory=list, max_length=MAX_VOICE_NOTES)
    voice_corrections: dict[str, str] = Field(default_factory=dict)


def _bad(code: str, message: str, status: int = 422) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@router.get("/v1/playbooks")
def playbooks() -> dict:
    return {
        "playbooks": [
            {
                "id": p.id,
                "title": p.title,
                "terms": [{"key": t.key, "label": t.label, "type": t.type, "required": t.required} for t in p.terms.values()],
            }
            for p in list_playbooks()
        ]
    }


@router.post("/v1/terms")
def terms(req: TermsRequest, request: Request) -> dict:
    if (req.chat_text is None) == (req.pdf_base64 is None):
        raise _bad("one_source", "Send exactly one of chat_text or pdf_base64.")
    try:
        playbook = load_playbook(req.playbook_id)
    except PlaybookError as exc:
        raise _bad("unknown_playbook", str(exc)) from exc

    if req.voice_notes and req.chat_text is None:
        raise _bad("voice_needs_chat_text", "Voice notes go with the chat text of an export folder, not with a PDF.")

    adapter = getattr(request.app.state, "model_adapter", None) or adapter_from_env()
    settings = settings_from_env(getattr(request.app.state, "settings_env", None))

    files: dict[str, bytes] = {}
    total = 0
    for note in req.voice_notes:
        if attachment_name(f"<attached: {note.name}>") != note.name:
            raise _bad("bad_voice_note", f"{note.name!r} is not a plain .opus, .m4a or .wav file name.")
        try:
            audio = base64.b64decode(note.audio_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise _bad("bad_voice_note", f"{note.name}: audio_base64 is not valid base64.") from exc
        total += len(audio)
        if total > MAX_VOICE_TOTAL_BYTES:
            raise _bad("too_large", "The voice notes are too large.", 413)
        files[note.name] = audio

    try:
        if req.chat_text is not None:
            if len(req.chat_text) > MAX_CHAT_CHARS:
                raise _bad("too_large", "The chat is too large.", 413)
            transcriber = getattr(request.app.state, "transcriber", None) or build_transcriber(settings)
            parsed = import_export(req.chat_text, files, transcriber, req.voice_corrections)
        else:
            if len(req.pdf_base64 or "") > MAX_PDF_BYTES * 4 // 3 + 4:
                raise _bad("too_large", "The PDF is too large.", 413)
            try:
                data = base64.b64decode(req.pdf_base64 or "", validate=True)
            except (binascii.Error, ValueError) as exc:
                raise _bad("bad_pdf", "pdf_base64 is not valid base64.") from exc
            parsed = chat_from_pdf(data)
    except ScannedPdfNotSupported as exc:
        raise _bad("scanned_pdf_not_supported", str(exc)) from exc
    except ChatImportError as exc:
        raise _bad("bad_chat", str(exc)) from exc

    numbered = format_numbered(parsed.messages)
    report = extract_terms(parsed.messages, playbook, adapter, numbered)
    badge = demo_badge_text(settings)
    return {
        "playbook_id": playbook.id,
        "model_mode": settings.model_mode,
        "transcriber_mode": settings.transcriber_mode,
        "demo_mode": badge is not None,
        "demo_badge": badge,
        "numbered_chat": numbered,
        "messages": [
            {
                "n": m.n, "kind": m.kind, "sender": m.sender, "text": m.text, "timestamp": m.timestamp,
                "voice": None if m.voice is None else {
                    "name": m.voice.name, "sha256": m.voice.sha256, "size": m.voice.size, "corrected": m.voice.corrected,
                    "segments": [{"start_ms": s.start_ms, "end_ms": s.end_ms, "text": s.text} for s in m.voice.segments],
                },
            }
            for m in parsed.messages
        ],
        "import_problems": [{"line": n, "text": t} for n, t in parsed.problems],
        "voice_problems": parsed.voice_problems,
        "report": report.to_dict(),
    }
