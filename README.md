# VeriDoc

**From handshake to contract.** Two people agree on a deal in a WhatsApp chat. VeriDoc reads the chat, proposes the terms with the exact message each one came from, says what is unclear, contradicted or missing, suggests the next message to send, and writes a short plain-language recap that the other person confirms by replying with a code. The chat, the confirmed terms and the recap are saved in a hash-based evidence vault, and the receipt can be checked by anyone on a public page, with no account.

VeriDoc is a drafting and record-keeping aid, not legal advice. It makes a record **tamper-evident**: it shows that a record was not changed after it was saved. It cannot prove that the original chat was genuine.

Problem: LS-06, *From Handshake to Contract* (informal agreements between two people), Srujana Hackathon.

## Two components

| Component | What it is | Where | Status |
|---|---|---|---|
| **Application and evidence vault** | Web app, AI service (chat import, terms, flags, recap, echo code), hash-based vault, anchoring, public verify page | This repository | Built and tested. Runs on recorded model output |
| **Offline engine** | A small model fine-tuned by the team (Qwen3-0.6B, 8-bit), a rules engine, terminal tools and a local API, run from a pendrive with no internet | A separate codebase, **not in this repository**, not yet connected to the app | Run on macOS (Apple Silicon). Windows and Linux packaged, untested |

The planned connection is `LocalModelAdapter` (a stub today). Full product report: `docs/PROJECT_REPORT.md`.

## At a glance (offline engine, own measurements)

| | |
|---|---|
| Internet needed | None |
| Speed | About 2 s per chat on a MacBook M4 |
| Terms correct | 72.0% strict, 78.0% lenient |
| Deal type correct | 91.7% |
| Chats fully correct | 2.8% strict, 16.7% lenient |
| Test set | 36 held-out, realistic, **synthetic** chats, 25 to 26 Oct 2026 |

These are the engine's figures, not this repository's recorded demo, and they are a target until measured on real Indian chats. Only a few chats come out fully correct, so a person confirms every term.

## The flow

**Handshake** (import the chat, see proposed terms and flags) → **Recap** (plain-language recap, confirmed with an echo code) → **Receipt** (saved in the vault, anchored, checkable).

Example, from the synthetic supply-order sample (`samples/veridoc/chats/supply-order.txt`): Dev orders 200 notebooks from Kavi at ₹45 each, ₹9,000 in total, with ₹3,000 advance and ₹6,000 on delivery on 20 March, and the school logo free of charge. The recorded model output used in the demo contains a deliberate mistake: it reads the price as 54 while quoting "₹45 per piece". VeriDoc checks the value against the quote, so that term is marked **needs review**, not stated, and the recap lists it as an open point. The only flag it raises is **unconfirmed** on the logo term: Kavi said it last and Dev did not reply. The other terms come out **stated**, each with its source message.

A second sample with a voice note (`samples/veridoc/voice-export/`): the text says ₹45 per piece and the voice note says 50 rupees, so the price is **contradicted**, and a text-versus-voice flag names both messages. The voice is synthetic text-to-speech and its transcript is recorded.

## The six features

1. **Chat and voice note import**
2. **Term extractor**: rules first, model second; every term has a verbatim source quote and a human confirmation
3. **Ambiguity and missing-term flags**: stated, unclear, contradicted, missing
4. **Chat recommendation**: the one next message that closes the biggest gap
5. **Plain-language agreement**: a recap confirmed with an echo code
6. **Hash-based evidence vault**: salted Merkle tree, hash chain, anchored on Polygon Amoy and in MinIO (Object Lock), with a public verify page

## What is real today

Honest status (full table in `docs/PRD.md` section 8):

- **Real:** the evidence vault (feature 6), anchoring, the verify page, redaction and share links, the audit log, typed settings, the model adapter interface, and the model-file hash check.
- **Demo:** model output is **recorded** for the synthetic samples (two chats and one voice-note export) and replayed by a fake adapter. While `MODEL_MODE=fake` (the default) every page shows "Demo mode: recorded model output"; while `TRANSCRIBER_MODE=fake` (the default) it also says "recorded transcript".
- **Built, on recorded model output:** the chat parser (WhatsApp exports, text PDFs), the term extractor with quote and value checks, the seven rule flags, and a Chat terms screen. Everything that fails a check shows as needs review.
- **Built:** confirming stated terms, a recap in English and Hindi (fixed templates, no model text), suggested next messages in three tones, saving the recap through the normal upload, and an echo code with a reply check (`docs/RECAP_DESIGN.md`).
- **Built, on recorded transcripts:** voice notes in a WhatsApp export folder (numbered with time spans, audio SHA-256, play the moment, text-versus-voice contradiction). The transcript is recorded, not speech recognition, and the badge says "recorded transcript".
- **Not built yet:** saving the pasted reply as a further version; correcting a term before confirming it; real speech recognition (`LocalTranscriber` is a stub); the live local model (`LocalModelAdapter` is a stub, and no model is pinned in `models/manifest.json`).

The offline engine (above) is a separate component and is not wired into the app. The model only suggests, rules check it, and a human confirms every term.

The AI only suggests. It never writes to the vault, the audit log or the hash path.

## Documents

| | |
|---|---|
| `docs/PROJECT_REPORT.md` | The full product report: problem, solution, architecture, benchmark, limits, viability, future scope |
| `docs/PRD.md` | Problem, example, users and market, flow, six features, offline engine requirements, MVP versus later, real versus demo, risks |
| `docs/TECH_STACK.md` | The stack, what we add, the local model and the offline engine stack, licences |
| `docs/ARCHITECTURE.md` | Parts, data flow from chat to receipt, the AI boundary, the offline engine |
| `docs/AI_SPEC.md` | Extraction, grounding, flags, injection defence, runtime, the engine's model, data and benchmark |
| `docs/TRIM_PLAN.md` | What is kept, renamed and removed from DigiVault, and in what order |
| `docs/DECISIONS.md` | Decision log (ADR-036 onwards are VeriDoc) |
| `docs/DEMO_RUNBOOK.md` | Click-by-click demo, one-command start, offline fallback, offline engine demo |
| `docs/PRIOR_WORK.md` | What was imported from DigiVault, what was built, third-party material and licences |
| `docs/02`, `docs/03` | Integrity references (data flow, hashing and Merkle spec) |
| `docs/digivault-archive/` | Pre-event DigiVault documents: developer guide (`DEVELOPMENT.md`), API spec, demo path, redaction measurements, and the rest (see its README) |

The documents in `docs/digivault-archive/` are DigiVault's, written before the hackathon. They are accurate for the inherited vault and still carry its original wording.

## Tech stack

Next.js 14 and React 18 (TypeScript), PostgreSQL 17 with Prisma, MinIO, a Python FastAPI AI service, `packages/crypto-core` (PDF.js, lossless PNG, salted per-tile SHA-256, RFC 6962 Merkle trees), Solidity `EvidenceAnchorV2.sol` on Polygon Amoy (Hardhat, ethers v6), WebAuthn step-up, pnpm workspace. Details in `docs/TECH_STACK.md`.

## Repository layout

```
apps/web/            Next.js app: screens, REST API, hash re-verification, anchoring, audit log, /verify
apps/ai-service/     FastAPI service: redaction suggestions, settings, model adapter, model manifest check
packages/crypto-core Browser/Node library: PDF to PNG, tiles, Merkle tree
packages/contracts   EvidenceAnchorV2.sol (and legacy v1), tests, deployment records
prisma/              schema.prisma and migrations
models/manifest.json Pinned SHA-256 of allowed model files (weights are never committed)
samples/veridoc/     Synthetic chats, reference terms and a text PDF
docs/                Documentation
docker-compose.yml   PostgreSQL and MinIO for local development
```

## Run it

### Prerequisites

- Node.js 20 or later and pnpm
- Docker (PostgreSQL and MinIO)
- Python 3 with `venv`, and Tesseract OCR with English and Hindi data (`sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin`)
- For anchoring only: an Amoy RPC endpoint and the key of an account on `EvidenceAnchorV2`'s anchorer list, funded with Amoy test POL

### One-time setup

```bash
pnpm install
cp .env.example .env                  # names the local stack: project veridoc, Postgres :5440, MinIO :9100
docker compose up -d --wait          # its own containers, ports and volumes; the old DigiVault ones can keep running
cp apps/web/.env.example apps/web/.env.local
cp packages/contracts/.env.example packages/contracts/.env
```

Fill in `apps/web/.env.local` (`DATABASE_URL` for the `digivault_app` role, `AUTH_SESSION_SECRET`, `AMOY_RPC_URL`, `SALT_ENCRYPTION_KEY`) and `packages/contracts/.env` (`AMOY_RPC_URL`, `DEPLOYER_PRIVATE_KEY`; never commit it). `docs/digivault-archive/DEVELOPMENT.md` section 3 lists every variable. Leave `MODEL_MODE=fake`. The AI service reads plain environment variables (it has no `.env` loader), so export any of its settings before starting it, as the start command below does for `MODEL_MODE`.

```bash
pnpm exec prisma migrate deploy
docker exec veridoc-postgres psql -U veridoc -d veridoc \
  -c "ALTER ROLE digivault_app PASSWORD '<password from apps/web/.env.local>'"
cd apps/ai-service && python3 -m venv .venv \
  && .venv/bin/pip install -r requirements.txt \
  && .venv/bin/python -m spacy download en_core_web_sm && cd ../..
```

### Start

```bash
docker compose up -d --wait && (cd apps/ai-service && MODEL_MODE=fake .venv/bin/uvicorn app.main:app --port 8001 &) && MODEL_MODE=fake pnpm --filter @digivault/web dev
```

Open http://localhost:3000. The "Demo mode: recorded model output and recorded transcript" badge should show on every page. WebAuthn needs a secure context: use `http://localhost` or HTTPS.

With the web app running, seed the demo accounts and data in another terminal. The seed goes through the real upload pipeline, so it needs the web app up; without an Amoy RPC the anchors show as failed and can be retried from the version page:

```bash
cd apps/web && node --experimental-strip-types prisma/seed-demo.ts
```

It creates these accounts (development values, from `apps/web/prisma/seed-demo.ts`):

| Sign-in ID | PIN | Shown as |
|---|---|---|
| `ADMIN-ASHA` | `112233` | Admin |
| `PARTY-DEV` | `224466` | Party |
| `PARTY-IRA` | `335577` | Party |
| `REVIEWER-1` | `446688` | Reviewer (read-only) |
| `VERIFIER-1` | `557799` | Verifier (read-only) |

and two agreements: `AGR/2026/0001` (the supply-order chat export and the order confirmation) and `AGR/2026/0002` (the freelance-job chat export). For the click-by-click demo, see `docs/DEMO_RUNBOOK.md`.

### Tests

```bash
pnpm test                                                   # crypto-core, contracts and web unit tests
cd apps/ai-service && python3 -m unittest tests.test_settings tests.test_model_adapter \
  tests.test_model_manifest tests.test_samples              # settings, adapter, manifest, samples
```

The other AI-service tests (`tests/test_patterns.py` and friends) need the virtual environment: `.venv/bin/python -m unittest discover -s tests -t .`. End-to-end scripts are in `docs/digivault-archive/DEVELOPMENT.md` section 4.

Settings (`MODEL_MODE`, `MODEL_FILE_PATH`, `MODEL_SHA256`, `LLAMA_SERVER_PATH`, `PLAYBOOK_DIR`, `REDACTION_RULES_FILE`, `SHARE_LINK_TTL_HOURS`, `DATA_DIR`, `DEMO_MODE_BADGE`) are documented in the `.env.example` files and `docs/TECH_STACK.md`.

## Smart Contract

- Network: Polygon Amoy (testnet, chainId 80002)
- Both contracts below were deployed before the hackathon, as part of DigiVault (the deployment records are dated 26 September and 18 October 2026).
- **Current — EvidenceAnchorV2:** `0x01e7e6f83f55873E906465d3447cB43434D4ee67` ([explorer](https://amoy.polygonscan.com/address/0x01e7e6f83f55873E906465d3447cB43434D4ee67)), deployed in block 50527642. Owner and first anchorer: `0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873`. Two-step ownership transfer, anchorer allow-list with retire/revoke, audit-log heads (ADR-028). Source `packages/contracts/contracts/EvidenceAnchorV2.sol`; record `packages/contracts/deployments/amoy-v2.json`.
- **Legacy — EvidenceAnchor v1:** `0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b` ([explorer](https://amoy.polygonscan.com/address/0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b)), block 48603680, owner-only writes. Anchors written before contract v2 stay here and still verify; nothing new is written. Source `packages/contracts/contracts/EvidenceAnchor.sol`; record `packages/contracts/deployments/amoy.json`.

## Limits

- Tamper-evident, not tamper-proof. A record that was changed after saving is detected; nothing stops the change.
- The vault shows a record is unchanged since it was saved. It does not show the original chat export was genuine.
- The echo code ties a reply to one recap text. It does not show who typed the reply.
- Drafting aid, not legal advice.
- Accuracy and speed figures are targets until measured. The engine's figures come from 36 synthetic chats and are not a claim about real chats.
- The offline engine is not integrated with the app, and Windows and Linux builds of it are untested.
- Chats saved on the pendrive are not encrypted.

## Origins

VeriDoc is built on **DigiVault**, our earlier project, written before the hackathon. It was imported into this repository as one commit, `e3a0496` ("chore: import DigiVault as the project base (pre-event project, reuse approved by organiser)"), without its old Git history. The organiser approved the reuse. `docs/PRIOR_WORK.md` records what was imported and what changed.

**Reused from DigiVault.** Between the import and now, `git diff --stat e3a0496..main` shows no change to `packages/crypto-core`, `packages/contracts`, `prisma/schema.prisma` or the migrations, and only wording and default-port edits in the upload route and `storage.ts`:
- the evidence vault, with the client-first and server re-verified hashing
- the hash chain and the salted Merkle tree
- anchoring in MinIO (Object Lock) and on Polygon Amoy, and the two contracts
- redaction suggestions and tiles
- share links
- the insert-only, hash-chained audit trail
- the PDF builder behind the integrity record (reworded: it is now a draft integrity record, not a legal certificate)

**Built during the event** (`git log --oneline e3a0496..main`: 40 commits; `git diff --stat`: 131 files changed):
- chat and voice-note import (`chat_import.py`, `transcriber.py`, recorded transcripts) and the synthetic samples
- the term extractor with quote and value-versus-quote grounding (`term_extractor.py`), the model adapter and model-file check (`model_adapter.py`, `model_manifest.py`), and the Chat terms screen
- the rule flags, including text-versus-voice contradiction, and playbooks (`playbooks/`)
- the recap, echo code and recap PDF (`recap.py`, `echo-code.ts`, `recap-pdf.ts`, the Recap screen) and the chat recommendation (suggested messages, in `recap.py`)
- typed settings, the demo badge, and the chat record saved with the voice note's audio fingerprint (`chat-record.ts`)
- the wording pass (agreement, Party, Reviewer, Verifier, on the landing page, login, dashboards and verify page)
- VeriDoc's own compose stack (`docker-compose.yml`, `scripts/check-compose-isolation.sh`)
- the documentation, with the DigiVault documents moved to `docs/digivault-archive/`

## Contributors

- **Hardik Singh** ([HARDIKSINGH150206](https://github.com/HARDIKSINGH150206)): author of this repository.
- **Abhishek** ([absksync](https://github.com/absksync)): trained the local model (the weights are not in the repository).
- **Samanway** ([notorious1337](https://github.com/notorious1337)) and **Jhashank** ([NYN-05](https://github.com/NYN-05)): built part of the earlier Python version, which is reference only.

DigiVault's original authors are listed in `docs/PRIOR_WORK.md`.
