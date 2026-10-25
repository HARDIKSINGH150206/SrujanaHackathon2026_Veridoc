# VeriDoc

**From handshake to contract.** Two people agree on a deal in a WhatsApp chat. VeriDoc reads the chat, proposes the terms with the exact message each one came from, says what is unclear, contradicted or missing, suggests the next message to send, and writes a short plain-language recap that the other person confirms by replying with a code. The chat, the confirmed terms and the recap are saved in a hash-based evidence vault, and the receipt can be checked by anyone on a public page, with no account.

VeriDoc is a drafting and record-keeping aid, not legal advice. It makes a record **tamper-evident**: it shows that a record was not changed after it was saved. It cannot prove that the original chat was genuine.

Problem: LS-06, *From Handshake to Contract* (informal agreements between two people), Srujana Hackathon.

## The flow

**Handshake** (import the chat, see proposed terms and flags) → **Recap** (plain-language recap, confirmed with an echo code) → **Receipt** (saved in the vault, anchored, checkable).

Example: Raju and Meena agree on 200 shirts at ₹480, with half paid in advance and delivery "next week". VeriDoc marks delivery **unclear** and the final payment and late penalty **missing**, and suggests asking about them.

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
- **Demo:** model output is **recorded** for two synthetic chats and replayed by a fake adapter. While `MODEL_MODE=fake` (the default) every page shows "Demo mode: recorded model output".
- **Not built yet:** chat parser, rules engine and term extractor, flags, recommendation, recap and echo code, voice notes, the local model (a stub; no model is pinned).

The AI only suggests. It never writes to the vault, the audit log or the hash path.

## Documents

| | |
|---|---|
| `docs/PRD.md` | Problem, example, flow, six features with acceptance criteria, MVP versus later, real versus demo |
| `docs/TECH_STACK.md` | The stack, what we add, the local model on the pendrive |
| `docs/ARCHITECTURE.md` | Parts, data flow from chat to receipt, the AI boundary |
| `docs/AI_SPEC.md` | Extraction, grounding, flags, injection defence, hardware tiers |
| `docs/TRIM_PLAN.md` | What is kept, renamed and removed from DigiVault, and in what order |
| `docs/DECISIONS.md` | Decision log (ADR-036 onwards are VeriDoc) |
| `docs/DEMO_RUNBOOK.md` | Click-by-click demo, one-command start, offline fallback |
| `docs/PRIOR_WORK.md` | What was imported from DigiVault |
| `docs/02`, `docs/03` | Integrity references (data flow, hashing and Merkle spec) |
| `docs/DEVELOPMENT.md` | Full developer guide |

`docs/01`, `04`, `05`, `06`, `07`, `08` and `DEVELOPMENT.md` are DigiVault documents and still carry its original wording (`docs/TRIM_PLAN.md` section 6).

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
docker compose up -d                 # PostgreSQL on :5434, MinIO on :9000
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp packages/contracts/.env.example packages/contracts/.env
```

Fill in `apps/web/.env.local` (`DATABASE_URL` for the `digivault_app` role, `AUTH_SESSION_SECRET`, `AMOY_RPC_URL`, `SALT_ENCRYPTION_KEY`) and `packages/contracts/.env` (`AMOY_RPC_URL`, `DEPLOYER_PRIVATE_KEY`; never commit it). `docs/DEVELOPMENT.md` section 3 lists every variable. Leave `MODEL_MODE=fake`. The AI service reads plain environment variables (it has no `.env` loader), so export any of its settings before starting it, as the start command below does for `MODEL_MODE`.

```bash
pnpm exec prisma migrate deploy
docker exec digivault-postgres psql -U digivault -d digivault \
  -c "ALTER ROLE digivault_app PASSWORD '<password from apps/web/.env.local>'"
cd apps/ai-service && python3 -m venv .venv \
  && .venv/bin/pip install -r requirements.txt \
  && .venv/bin/python -m spacy download en_core_web_sm && cd ../..
cd apps/web && node --experimental-strip-types prisma/seed-demo.ts && cd ../..   # demo accounts
```

### Start

```bash
docker compose up -d && (cd apps/ai-service && MODEL_MODE=fake .venv/bin/uvicorn app.main:app --port 8001 &) && MODEL_MODE=fake pnpm --filter @digivault/web dev
```

Open http://localhost:3000. The "Demo mode: recorded model output" badge should show on every page. WebAuthn needs a secure context: use `http://localhost` or HTTPS. Demo accounts are listed in `docs/05-demo-golden-path.md` section 1.

### Tests

```bash
pnpm test                                                   # crypto-core, contracts and web unit tests
cd apps/ai-service && python3 -m unittest tests.test_settings tests.test_model_adapter \
  tests.test_model_manifest tests.test_samples              # settings, adapter, manifest, samples
```

The other AI-service tests (`tests/test_patterns.py` and friends) need the virtual environment: `.venv/bin/python -m unittest discover -s tests -t .`. End-to-end scripts are in `docs/DEVELOPMENT.md` section 4.

Settings (`MODEL_MODE`, `MODEL_FILE_PATH`, `MODEL_SHA256`, `LLAMA_SERVER_PATH`, `PLAYBOOK_DIR`, `REDACTION_RULES_FILE`, `SHARE_LINK_TTL_HOURS`, `DATA_DIR`, `DEMO_MODE_BADGE`) are documented in the `.env.example` files and `docs/TECH_STACK.md`.

## Smart Contract

- Network: Polygon Amoy (testnet, chainId 80002)
- **Current — EvidenceAnchorV2:** `0x01e7e6f83f55873E906465d3447cB43434D4ee67` ([explorer](https://amoy.polygonscan.com/address/0x01e7e6f83f55873E906465d3447cB43434D4ee67)), deployed in block 50527642. Owner and first anchorer: `0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873`. Two-step ownership transfer, anchorer allow-list with retire/revoke, audit-log heads (ADR-028). Source `packages/contracts/contracts/EvidenceAnchorV2.sol`; record `packages/contracts/deployments/amoy-v2.json`.
- **Legacy — EvidenceAnchor v1:** `0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b` ([explorer](https://amoy.polygonscan.com/address/0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b)), block 48603680, owner-only writes. Anchors written before contract v2 stay here and still verify; nothing new is written. Source `packages/contracts/contracts/EvidenceAnchor.sol`; record `packages/contracts/deployments/amoy.json`.

## Limits

- Tamper-evident, not tamper-proof. A record that was changed after saving is detected; nothing stops the change.
- The vault shows a record is unchanged since it was saved. It does not show the original chat export was genuine.
- The echo code ties a reply to one recap text. It does not show who typed the reply.
- Drafting aid, not legal advice.
- Accuracy and speed figures are targets until measured.

## Origins
VeriDoc is built on DigiVault, our earlier project written before the hackathon. The reuse was approved by the organiser. See docs/PRIOR_WORK.md for what was imported and what changed during the event.
