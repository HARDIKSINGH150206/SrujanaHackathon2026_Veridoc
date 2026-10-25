import base64
import binascii
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .model_adapter import adapter_from_env
from .real_suggestions import generate_suggestions
from .recap_router import router as recap_router
from .schemas import SuggestionRequest, SuggestionResponse
from .terms_router import router as terms_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuses to start on bad model settings or a model file that fails models/manifest.json.
    app.state.model_adapter = adapter_from_env()
    yield


app = FastAPI(title="DigiVault AI Service", lifespan=lifespan, description=(
        "Multilingual (English + Hindi/Devanagari + Kannada) NER redaction service. "
        "Suggests grid tiles to redact; suggestion-only, never touches the Merkle hash."
    ),
)

app.include_router(terms_router)
app.include_router(recap_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/redaction-suggestions", response_model=SuggestionResponse)
def redaction_suggestions(req: SuggestionRequest) -> SuggestionResponse:
    for page in req.pages:
        try:
            if len(base64.b64decode(page.png_base64, validate=True)) == 0:
                raise ValueError("empty PNG")
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status_code=422, detail=f"page {page.page_index}: invalid png_base64 ({exc})"
            ) from exc

    if req.gazetteer is not None:
        try:
            if len(base64.b64decode(req.gazetteer.case_key, validate=True)) != 32:
                raise ValueError("must be 32 bytes")
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"gazetteer.case_key: invalid ({exc})") from exc

    suggestions = generate_suggestions(req.document_version_id, req.grid_size, req.pages, req.gazetteer)
    return SuggestionResponse(document_version_id=req.document_version_id, status="ready", suggestions=suggestions)
