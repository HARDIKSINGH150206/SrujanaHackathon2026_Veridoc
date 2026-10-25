# VeriDoc — Tech Stack

What runs today, what we add, and what is still only planned. Anything in "planned" is not installed and must not be described as working.

## 1. The stack as it is

Inherited from DigiVault and working (`docs/DEVELOPMENT.md` has the commands).

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
| Chat parser (`number_chat` exists; the full export parser does not) | `apps/ai-service/app/chat_import.py` | Planned |
| Rules engine and term extractor with grounding | `apps/ai-service/app/term_extractor.py` | Planned |
| Flags and recommendation | `apps/ai-service/app/flags.py`, `suggestion.py` | Planned |
| Recap, echo code | `apps/ai-service/app/recap.py` | Planned |
| Playbooks (YAML, no code) and message templates | `playbooks/` (path set by `PLAYBOOK_DIR`) | Planned |
| Import, review and recap screens | `apps/web/src/app/dashboard/_workspace/` | Planned |
| Chat record builder (chat to PDF in the browser, then the normal upload) | `apps/web` | Planned (ADR-040, proposed) |

New Python libraries are likely `dateparser` and `rapidfuzz` for the rules engine. They are not in `requirements.txt` yet.

## 3. The local model on the pendrive

The demo laptop runs Linux. The model runs offline from a pendrive.

| Part | Choice |
|---|---|
| Runtime | `llama-server` from llama.cpp, a Linux build, started by the AI service as a local process and called over `127.0.0.1`. Its path is `LLAMA_SERVER_PATH` |
| Model file | A GGUF file. Its path is `MODEL_FILE_PATH`. Weights are never committed (`models/*`, `*.gguf` are in `.gitignore`) |
| Integrity check | `models/manifest.json` pins the SHA-256 of each allowed model file. At startup in `local` mode the service hashes the file and refuses to start if it is missing, unlisted, unpinned or different by one byte. If `MODEL_SHA256` is set it must also agree with the manifest |
| Model choice | Not decided. The manifest holds a placeholder entry (`PLACEHOLDER-model.gguf`, all-zero hash) that is always refused |
| Output | The model is asked for JSON that matches a schema (grammar-constrained decoding in llama.cpp) |
| Network | None. The model has no tools, no file access and no write access |
| Tiers | Chosen by RAM at startup: about 7B, 3B or 1.5B, 4-bit; rules only below that (`AI_SPEC.md` section 8). Sizes are proposals until benchmarked |

Until a model is pinned and `LocalModelAdapter` is implemented, `MODEL_MODE` stays `fake` and the app says "Demo mode: recorded model output".

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
| `DEMO_MODE_BADGE` | web, ai-service | "Demo mode: recorded model output" | Badge wording; cannot switch the badge off while the model is fake |

No real values or secrets belong in the repository. See the `.env.example` files.
