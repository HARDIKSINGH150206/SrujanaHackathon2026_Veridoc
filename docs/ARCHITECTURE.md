# VeriDoc — Architecture

How the parts fit together and where the AI boundary sits. The hashing, anchoring and verification details are unchanged from DigiVault and live in `docs/02-architecture-and-dataflow.md` and `docs/03-crypto-and-merkle-spec.md`. This file covers how a chat reaches them.

Status markers: **built** runs in this repository today; **planned** does not exist yet (`PRD.md` section 8).

## 1. Main parts

| Part | Where | Does | Status |
|---|---|---|---|
| Web app | `apps/web` | Screens, REST API, sign-in, hash re-verification, hash chain, anchoring, audit log | built |
| Crypto core | `packages/crypto-core` | PDF page to PNG, tiles, salted Merkle tree. Shared by the browser, the server and the verify page | built |
| Chat record builder | `apps/web/src/lib/chat-record.ts` | Turns the imported chat into a PDF in the browser so the normal upload can hash it (ADR-040, accepted) | built |
| AI service | `apps/ai-service` | Redaction tile suggestions, chat import, term extraction, flags, recommendation and recap text from fixed templates | built |
| Model adapter | `apps/ai-service/app/model_adapter.py` | One interface, `extract(numbered_chat, playbook_id)`, returning terms with `status`, `value`, `quote[]`, `msg[]` and `reason`; fake or local behind it | built; local is a stub |
| Vault storage | PostgreSQL (Prisma), MinIO | Versions, tiles, hash chain, audit log, page PNGs, anchor records | built |
| Anchor | Polygon Amoy, `EvidenceAnchorV2.sol` | Public, append-only record of each version's commitment | built |
| Verify page | `apps/web/src/app/verify` | Public, stateless check against MinIO and Polygon. No sign-in, no database | built |

## 2. From chat to receipt

1. **Import (F1).** The browser reads the chat export. The messages are numbered from 1. Voice notes are stored with their SHA-256 and a transcript. Nothing leaves the machine.
2. **Analyse (F2, F3).** The numbered chat goes to the AI service as text. Rules run first. Then the model adapter proposes terms, each with a quote and message numbers. A grounding check drops any term whose quote is not verbatim in the cited message. Code builds the status of each term (stated, unclear, contradicted, missing) and the flags. Nothing is written anywhere. The result goes back to the browser.
3. **Confirm (F2).** The user confirms, corrects or rejects each term on screen. This is the only way a term becomes part of the record. A contradicted term needs a choice first.
4. **Recommend (F4).** Code picks the biggest gap and fills a fixed template. The user copies the text and sends it in WhatsApp. VeriDoc sends nothing.
5. **Recap (F5).** From confirmed terms only, a recap is built from fixed templates, with a 4-character echo code derived from the recap text. The user copies it to WhatsApp. The other person replies `CONFIRM <code>`. The user pastes the reply; VeriDoc checks code and sender.
6. **Save (F6).** The browser builds a PDF of the record (numbered chat, with the fingerprints of the original export and voice-note files; later the confirmed terms, recap and confirmation) and uploads it through the existing route, `POST /api/v1/evidence/upload`. Each step after the first is a new version of the same document (`document_id`), so the hash chain links them. The browser hashes first, the server recomputes, the version is anchored in MinIO and on Polygon Amoy, and the audit log records it.
7. **Receipt.** The user gets the verification files and a link to the verify page. A reviewer opens the link with no account. The page recomputes from the files and compares with the anchor.

The echo code is not part of any Merkle tree. It is derived from the recap text (an algorithm adapted from the earlier VeriDoc design: a hash of the text, the first 20 bits written as 4 characters from the Crockford base32 alphabet) and is only a binding check between a reply and one exact recap. It does not identify who typed the reply.

## 3. Diagram

```mermaid
flowchart TD
  subgraph Browser["Browser (apps/web)"]
    IMP["Import chat and voice notes (F1)"]
    REV["Review and confirm terms (F2, F3)"]
    REC["Recommendation and recap (F4, F5)"]
    BLD["Build record PDF, hash first (F6)"]
  end

  subgraph AI["AI boundary: suggestions only (apps/ai-service)"]
    RULES["Rules engine"]
    ADP["Model adapter: fake or local"]
    GRD["Grounding check: quote verbatim in cited message"]
    FLG["Status and flags, from code"]
  end

  subgraph Vault["Trusted path (apps/web server, crypto-core)"]
    UP["POST /api/v1/evidence/upload"]
    VER["Server recomputes every hash"]
    CHAIN["Hash chain and audit log"]
  end

  PG[("PostgreSQL")]
  S3[("MinIO, Object Lock for anchors")]
  POLY[("Polygon Amoy")]
  VP["Verify page: public, stateless"]

  IMP -->|numbered chat text| RULES
  RULES --> ADP
  ADP -->|proposed terms with quotes| GRD
  RULES --> GRD
  GRD --> FLG
  FLG -->|proposals and flags only| REV
  REV -->|human confirms| REC
  REC -->|confirmed terms and recap| BLD
  BLD -->|pages, tile hashes, salts| UP
  UP --> VER
  VER --> CHAIN
  CHAIN --> PG
  CHAIN --> S3
  CHAIN --> POLY
  POLY --> VP
  S3 --> VP
```

The only arrow out of the AI boundary goes to the review screen. Nothing from the AI boundary reaches the upload route, the hash path, the audit log or the stores.

## 4. Where the AI boundary sits

| Rule | How it is kept |
|---|---|
| The AI never writes to the vault, the audit log or the hash path | The AI service has no database or MinIO credentials and calls no vault route. It returns data to the web app, which shows it. A term reaches the vault only because a signed-in person confirmed it and the browser uploaded it |
| Merkle roots come from raw tile pixel hashes | Unchanged (`CLAUDE.md` rule 2). OCR or model failure cannot affect a proof |
| Every term needs a source quote and a human confirmation | Enforced in code before the term is shown as proposed (`AI_SPEC.md` sections 4–5) |
| Chat text is data, never instructions | The model sees chat only inside a fenced data block with a fixed system instruction, and its output is schema-constrained and grounded (`AI_SPEC.md` section 6) |
| Rules first, model second | The model is only asked about what rules did not settle, and a disagreement is shown as "needs review" (`AI_SPEC.md` section 3) |
| Recorded output is labelled | While `MODEL_MODE=fake` the web app shows "Demo mode: recorded model output" on every page |

## 5. Trust boundaries

| Boundary | Trusted for | Not trusted for |
|---|---|---|
| Browser | Producing pages and a first hash | The hash itself; the server recomputes |
| AI service and model | Suggestions | Anything on the hash path; anything final without a person |
| Chat text | Being the data to analyse | Being instructions |
| App server and database | Workflow, access control | Being the source of truth for integrity; the anchor is |
| Database owner | Operations | Changing evidence undetected (anchors) or the audit log undetected (chain plus anchored heads) |
| Polygon Amoy | A timestamped, append-only record of commitments | Holding any content (it holds none) |
| Pasted WhatsApp reply | Carrying the echo code | Proving who typed it |

## 6. What is not changed

- The data model, the `Role` enum and every audit action string (ADR-039).
- The 20×20 grid, PNG-only pages, the proof format (`docs/03`).
- The public, stateless verify page (`CLAUDE.md` rule 5).
- Dual anchoring of every version (`CLAUDE.md` rule 3).

## 7. The offline engine (separate component)

The team also built an offline engine that analyses a chat on the user's own laptop from a pendrive (`PROJECT_REPORT.md`, ADR-042, ADR-045). It is a separate codebase, **not in this repository and not connected to it**. The application runs on recorded output until `LocalModelAdapter` is implemented. Everything in this section describes the engine, not the vault.

### 7.1 Pipeline

```mermaid
flowchart LR
  A[Chat in: export, paste or live typing] --> B[Parser: wa_parse.py]
  B --> C[Deal classifier and playbook]
  C --> D[llama-server: Qwen3-0.6B Q8_0, JSON grammar]
  D --> E[Rules engine: re-check and auto-repair]
  E --> F[Deal sheet: terms, quotes, flags, missing]
  F -. planned .-> G[Receipt: local SQLite]
```

### 7.2 Components

| Component | File | Role |
|---|---|---|
| Launchers | `Start VeriDoc.command`, `Start VeriDoc.bat`, `start-veridoc.sh` | Pick the bundled Python for the OS and start the engine |
| Engine selector | `app/engine_path.py` | Metal on Apple Silicon; Vulkan if the driver exists; otherwise CPU. `VERIDOC_CPU_ONLY` forces CPU |
| Parser | `app/wa_parse.py` | Numbered messages with sender names from exports and pasted text |
| Playbooks | `config/playbooks/` | Deal type, roles, required terms |
| Model | `llama-server` + `veridoc-small-v4-Q8_0.gguf` | Terms as schema-checked JSON: value, quote, message number, status |
| Rules engine | `app/` | Checks each term against its quote; repairs or flags; lists missing terms |
| API | `app/veridoc_serve.py` | HTTP on `127.0.0.1:8765` |
| Terminal tools | `app/veridoc_extract.py`, `app/veridoc_live.py` | One-shot analysis; live two-person chat with a watching deal sheet |
| Model registry | `config/models.json` | Tiers 0.6B, 1.7B, 4B; the first installed one is used |

### 7.3 API

| Method and path | Request | Response |
|---|---|---|
| `GET /api/health` | none | Status and active model |
| `POST /api/analyse` | JSON: `text` (required), `me`, `deal_type` (optional) | Deal type; each term with value, quote, message number, status; missing terms |

The server binds to `127.0.0.1` only and refuses other hosts and other web origins, so a web page cannot read the user's chats through it.

### 7.4 State

The engine has no database and keeps nothing between requests; configuration is plain files on the drive. A local SQLite receipt is planned for the engine. The application's vault (section 1) is the part that stores, chains and anchors records today.

### 7.5 Intended integration

`LocalModelAdapter` would call the engine (or an equivalent `llama-server`) and return the adapter's term format. The application's own grounding check, human confirmation and the AI boundary (section 4) would apply unchanged to that output: the engine's rules are an extra layer, not a replacement. This is not built, and no hash, proof format, audit format or migration changes with it.
