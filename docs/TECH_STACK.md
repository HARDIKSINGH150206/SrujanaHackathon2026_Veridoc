# VeriDoc — Tech Stack

What runs today, what we add, and what is still only planned. Anything in "planned" is not installed and must not be described as working.

## 1. The stack as it is

Inherited from DigiVault and working (`docs/digivault-archive/DEVELOPMENT.md` has the commands).

| Layer | Technology | Notes |
|---|---|---|
| Web app | Next.js 14 (App Router), React 18, TypeScript | UI and REST API routes in `apps/web` |
| Database | PostgreSQL 17 with Prisma | Schema in `prisma/schema.prisma`. The app connects as `digivault_app`, which cannot update or delete audit rows |
| File storage | MinIO (S3 compatible) | Page PNGs; a separate bucket with Object Lock (Compliance mode) for anchor records |
| Integrity | `packages/crypto-core` | PDF.js page rendering, lossless PNG, salted per-tile SHA-256, RFC 6962 Merkle trees, hash chain. Browser computes first; server recomputes |
| Anchoring | Solidity `EvidenceAnchorV2.sol`, Hardhat, ethers v6, Polygon Amoy (chain 80002) | Every version anchored in MinIO and on chain |
| Sign-in | Service number and PIN (bcrypt), HMAC session tokens, WebAuthn step-up | The login screen's words change; the mechanism does not (ADR-037) |
| AI service | Python, FastAPI, spaCy, Tesseract, regular expressions | `apps/ai-service`. Today it returns redaction tile suggestions only |
| Receipt PDF | `pdf-lib` and a QR code in `apps/web/src/lib/certificate.ts` | Reused for the receipt (`TRIM_PLAN.md`) |
| Workspace | pnpm monorepo, Vitest, Python `unittest` | |

## 2. What we add

| Piece | Where | Status |
|---|---|---|
| Typed settings: `MODEL_MODE`, `MODEL_FILE_PATH`, `MODEL_SHA256`, `LLAMA_SERVER_PATH`, `PLAYBOOK_DIR`, `REDACTION_RULES_FILE`, `SHARE_LINK_TTL_HOURS`, `DATA_DIR`, `DEMO_MODE_BADGE` | `apps/web/src/lib/settings.ts`, `apps/ai-service/app/settings.py` | Built, tested |
| Model adapter (`extract(numbered_chat, playbook_id)`), `FakeModelAdapter`, `LocalModelAdapter` stub | `apps/ai-service/app/model_adapter.py`, `apps/ai-service/recorded/` | Built; local adapter is a stub |
| Model manifest and startup hash check | `models/manifest.json`, `apps/ai-service/app/model_manifest.py` | Built; the manifest entry is a placeholder |
| Demo-mode badge | `apps/web/src/app/_components/demo-badge.tsx` | Built |
| Synthetic samples | `samples/veridoc/` | Built |
| Chat parser, text-PDF reader (`pypdf`) | `apps/ai-service/app/chat_import.py` | Built |
| Term extractor with grounding, value check and rule flags | `apps/ai-service/app/term_extractor.py` | Built (rules for amounts, dates and the seven flags; number words not yet) |
| Terms endpoints | `apps/ai-service/app/terms_router.py`, `apps/web/src/app/api/v1/evidence/terms/route.ts`, `apps/web/src/lib/terms.ts`; plus `GET /v1/playbooks` and `GET /api/v1/evidence/playbooks` | Built |
| Terms screen | `apps/web/src/app/dashboard/terms/page.tsx`, `_workspace/terms-view.tsx` (playbook list loaded from the endpoint) | Built, checked in a browser |
| Recap and suggested messages from fixed templates | `apps/ai-service/app/recap.py`, `recap_router.py`, `playbooks/recap/*.json`; proxy `apps/web/src/app/api/v1/evidence/recap/route.ts`, `apps/web/src/lib/recap.ts` | Built |
| Echo code and reply check | `apps/web/src/lib/echo-code.ts` | Built |
| Recap PDF (embedded font, Hindi shaped) | `apps/web/src/lib/recap-pdf.ts`, `apps/web/public/fonts/` | Built |
| Recap screen, confirm boxes on Chat terms | `apps/web/src/app/dashboard/recap/page.tsx`, `_workspace/recap-view.tsx` | Built, checked in a browser |
| Playbooks (JSON, no code) | `playbooks/` (path set by `PLAYBOOK_DIR`) | Built (two) |
| Recap and suggestion templates | `playbooks/recap/` | Built |
| Transcriber interface, recorded transcripts, local stub | `apps/ai-service/app/transcriber.py`, `recorded/transcripts.json` | Built; local (faster-whisper) is a stub |
| Voice notes in an export folder, chat record PDF with the audio SHA-256 | `chat_import.py` (`import_export`), `apps/web/src/lib/chat-record.ts`, `terms-view.tsx` | Built |
| Chat record builder (chat to PDF in the browser, then the normal upload) | `apps/web/src/lib/chat-record.ts` | Built (ADR-040, accepted) |

Python libraries added: `pypdf` (text PDFs) and `httpx` (route tests). The rules use only the standard library; `dateparser` and `rapidfuzz` are not used.

## 3. The local model on the pendrive

The model runs offline from a pendrive. Two things must be kept apart: the **offline engine** (separate codebase, model chosen and measured, `PROJECT_REPORT.md`) and the **application's adapter** (`LocalModelAdapter`, a stub, with the manifest still a placeholder).

| Part | Choice |
|---|---|
| Runtime | `llama-server` from llama.cpp, called over `127.0.0.1`. In the application its path is `LLAMA_SERVER_PATH` and the AI service starts it. The engine bundles release b11869 for macOS (Metal), Windows and Linux (Vulkan or CPU) |
| Model | Qwen3-0.6B (Apache 2.0), LoRA fine-tuned (v4), GGUF Q8_0, file `veridoc-small-v4-Q8_0.gguf` (ADR-043). Its path in the application would be `MODEL_FILE_PATH`. Weights are never committed (`models/*`, `*.gguf` are in `.gitignore`) |
| Integrity check | `models/manifest.json` pins the SHA-256 of each allowed model file. At startup in `local` mode the service hashes the file and refuses to start if it is missing, unlisted, unpinned or different by one byte. If `MODEL_SHA256` is set it must also agree with the manifest |
| Manifest today | A placeholder entry (`PLACEHOLDER-model.gguf`, all-zero hash) that is always refused. The v4 file's hash must be pinned before `local` mode can start |
| Output | JSON that matches a schema (grammar-constrained decoding in llama.cpp; valid JSON 88.9% without it, 100% with it, ADR-044) |
| Network | None. The model has no tools, no file access and no write access |
| Tiers | 0.6B shipped; 1.7B and 4B defined in the engine's `config/models.json`, untested. The earlier 7B, 3B and 1.5B proposals are superseded |

Until `LocalModelAdapter` is implemented and a model is pinned, `MODEL_MODE` stays `fake` and the app says "Demo mode: recorded model output".

### 3.1 The offline engine stack (separate codebase)

| Layer | Choice |
|---|---|
| Application code | Python 3.12, standard library only |
| Runtime | python-build-standalone 3.12.15 per OS, bundled; nothing to install on the host |
| Inference | llama.cpp `llama-server` b11869 (Metal, Vulkan, CPU) |
| Drive | exFAT, readable by macOS, Windows and Linux; per-OS launchers |
| API | Standard-library HTTP server on `127.0.0.1:8765`; no database |
| Training | PyTorch, Hugging Face transformers 5.20.2, PEFT, accelerate on a Kaggle T4; MLX on a Mac for v1 to v3 |
| Evaluation | `evaluate.py` on 36 held-out realistic chats |
| Platforms | macOS Apple Silicon tested; Windows and Linux packaged, untested |

### 3.2 Licences

| Component | Licence |
|---|---|
| Qwen3-0.6B | Apache 2.0 |
| llama.cpp | MIT |
| PyTorch, transformers, PEFT | BSD-3 / Apache 2.0 |
| python-build-standalone | PSF and bundled licences |
| CraigslistBargains (1,500 training chats) | Listed as unknown; research and demo use only. Retrain without it, or get permission, before commercial release (ADR-046) |

### 3.3 Engine environment variables

| Variable | Purpose |
|---|---|
| `VERIDOC_CPU_ONLY` | `1` forces the CPU engine instead of Vulkan |
| `PYTHONUTF8` | Set to `1` by the Windows launcher so chats with emoji read correctly |

The engine has no keys, secrets or accounts.

## 4. Configuration

| Setting | Read by | Default | Meaning |
|---|---|---|---|
| `MODEL_MODE` | web, ai-service | `fake` | `fake` replays recorded output; `local` uses the local model |
| `MODEL_FILE_PATH` | ai-service | none | GGUF file; required when `local` |
| `MODEL_SHA256` | ai-service | none | Optional extra check; must equal the manifest |
| `LLAMA_SERVER_PATH` | ai-service | none | `llama-server` binary; required when `local` |
| `PLAYBOOK_DIR` | web, ai-service | `playbooks` | Playbook files |
| `REDACTION_RULES_FILE` | web, ai-service | none | Redaction rules file (unset means built-in) |
| `SHARE_LINK_TTL_HOURS` | web | 72 | Share link lifetime. Parsed, not yet used |
| `DATA_DIR` | web, ai-service | `data` | Working data (git-ignored) |
| `TRANSCRIBER_MODE` | web, ai-service | `fake` | `fake` replays recorded transcripts and the badge says so; `local` is the faster-whisper stub |
| `DEMO_MODE_BADGE` | web, ai-service | "Demo mode: recorded model output" | Badge wording; cannot switch the badge off while the model is fake |

No real values or secrets belong in the repository. See the `.env.example` files.
