"""POST /v1/terms: chat text or a text PDF in, terms with source links out.

Read-only (CLAUDE.md rule 2): it holds no database or storage credentials and
calls no vault route. The web app shows the result; only a person's
confirmation, uploaded by the browser, ever reaches the vault.
"""

import base64
import binascii

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .chat_import import ChatImportError, ScannedPdfNotSupported, chat_from_pdf, format_numbered, parse_chat
from .model_adapter import adapter_from_env
from .playbooks import PlaybookError, list_playbooks, load_playbook
from .settings import settings_from_env
from .term_extractor import extract_terms

MAX_CHAT_CHARS = 2_000_000
MAX_PDF_BYTES = 10_000_000

router = APIRouter()


class TermsRequest(BaseModel):
    playbook_id: str
    chat_text: str | None = None
    pdf_base64: str | None = None


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

    try:
        if req.chat_text is not None:
            if len(req.chat_text) > MAX_CHAT_CHARS:
                raise _bad("too_large", "The chat is too large.", 413)
            parsed = parse_chat(req.chat_text)
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

    adapter = getattr(request.app.state, "model_adapter", None) or adapter_from_env()
    settings = settings_from_env(getattr(request.app.state, "settings_env", None))
    report = extract_terms(parsed.messages, playbook, adapter, format_numbered(parsed.messages))
    demo = settings.model_mode == "fake"
    return {
        "playbook_id": playbook.id,
        "model_mode": settings.model_mode,
        "demo_mode": demo,
        "demo_badge": settings.demo_mode_badge if demo else None,
        "messages": [
            {"n": m.n, "kind": m.kind, "sender": m.sender, "text": m.text, "timestamp": m.timestamp}
            for m in parsed.messages
        ],
        "import_problems": [{"line": n, "text": t} for n, t in parsed.problems],
        "report": report.to_dict(),
    }
