"""POST /v1/recap: confirmed terms in, fixed-template recap and suggested messages out.

Text only (CLAUDE.md rule 2): no vault, database or storage access, no model.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .playbooks import PlaybookError, load_playbook
from .recap import RecapError, build_recap

router = APIRouter()

MAX_TERMS = 50


class RecapTerm(BaseModel):
    key: str
    status: str
    value: str | None = None
    quote: list[str] = Field(default_factory=list)
    msg: list[int] = Field(default_factory=list)
    confirmed: bool = False


class RecapRequest(BaseModel):
    playbook_id: str
    language: str
    other_name: str | None = None
    terms: list[RecapTerm] = Field(default_factory=list, max_length=MAX_TERMS)


@router.post("/v1/recap")
def recap(req: RecapRequest) -> dict:
    try:
        playbook = load_playbook(req.playbook_id)
        return build_recap(playbook, req.language, [t.model_dump() for t in req.terms], req.other_name)
    except PlaybookError as exc:
        raise HTTPException(status_code=422, detail={"code": "unknown_playbook", "message": str(exc)}) from exc
    except RecapError as exc:
        raise HTTPException(status_code=422, detail={"code": "bad_recap_request", "message": str(exc)}) from exc
