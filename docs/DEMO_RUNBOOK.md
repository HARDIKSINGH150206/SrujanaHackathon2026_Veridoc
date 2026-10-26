# VeriDoc — Demo Runbook

A click-by-click demo script, a one-command start, and what to do when the network or something else fails. Every step is marked **[built]** or **[planned]** (`PRD.md` section 8). Skip a planned step or show recorded screens, and say so. Never present a recording as live.

Demo data is synthetic: `samples/veridoc/` (a supply-order chat, a freelance chat, and `order-confirmation.pdf`).

## 1. What to say and not say

| Say | Do not say |
|---|---|
| "tamper-evident" | "tamper-proof", "cannot be changed" |
| "Demo mode: recorded model output" (the badge on screen says it too) | "the AI found this" while the badge is showing |
| "the record was not changed after it was saved" | "this proves the chat is real" |
| "drafting aid, not legal advice" | any statement about whether the deal is enforceable |
| "this is a target until measured" for any speed or accuracy figure | an accuracy number we have not measured |
| "the offline engine, a separate component, scored 72% on 36 synthetic test chats" (section 7) | "VeriDoc is 72% accurate", or any engine figure while showing the app's recorded demo |

## 2. One-command start

One-time setup first (`docs/digivault-archive/DEVELOPMENT.md` sections 1 and 3): `pnpm install`, the `.env` files, `prisma migrate deploy`, the `digivault_app` password, the AI service virtual environment, and the demo seed.

Then, from the repository root:

```bash
docker compose up -d --wait && (cd apps/ai-service && MODEL_MODE=fake .venv/bin/uvicorn app.main:app --port 8001 &) && MODEL_MODE=fake pnpm --filter @digivault/web dev
```

This starts PostgreSQL and MinIO, the AI service on :8001 and the web app on :3000, all in fake-model mode. Open `http://localhost:3000`. The yellow "Demo mode: recorded model output" badge must be visible at the bottom of every page. If it is not, stop: `MODEL_MODE` is not `fake`.

The AI service's startup (`MODEL_MODE=fake`) and the Chat terms screen were run end to end on 2026-10-26: AI service and web app up, the supply-order sample analysed, no browser console errors, and no horizontal overflow at 390 px or 1440 px wide.

The stack has its own identity so it never collides with the old DigiVault containers: project name `veridoc`, containers `veridoc-postgres` and `veridoc-minio`, volumes `veridoc_postgres_data` and `veridoc_minio_data`, and host ports Postgres `5440`, MinIO `9100` and its console `9101` (the old ones use `5434`, `9000` and `9001`). Ports and credentials come from `.env` (copy `.env.example`). Run `scripts/check-compose-isolation.sh --live` to check it: it starts the stack beside any running `digivault-*` containers and fails if they were touched. Point `apps/web/.env.local` at these ports (`apps/web/.env.example` already does). If a default port is taken on your machine, change it in `.env`.

A single wrapper script for this command is a later item.

Anchoring needs `AMOY_RPC_URL` in `apps/web/.env.local` and a funded anchoring key (`docs/digivault-archive/DEVELOPMENT.md` section 6, `docs/digivault-archive/05-demo-golden-path.md` for gas figures).

## 3. Before the demo (T minus 30 minutes)

| # | Check |
|---|---|
| 1 | Start with the command in section 2. Badge visible. |
| 2 | Demo accounts exist (`cd apps/web && node --experimental-strip-types prisma/seed-demo.ts`). Sign in as `PARTY-DEV` / `224466` (a Party who can share), `REVIEWER-1` / `446688` or `VERIFIER-1` / `557799` (read-only), `ADMIN-ASHA` / `112233`. The screens show the roles as Party, Reviewer, Verifier and Admin. |
| 3 | Wallet has Amoy test POL (about 0.003 per document anchor; `docs/digivault-archive/05`). |
| 4 | **Pre-anchor one record** (section 4, steps 8 to 10) so a verified receipt is ready before going on stage. |
| 5 | Save the receipt files for that record in a known folder, and a copy of one page with a single pixel changed for the tamper test (the command is in `docs/digivault-archive/05-demo-golden-path.md`, section 3). |
| 6 | Open three tabs: the dashboard (party), a private window on `/verify`, and the explorer page for the anchor. |
| 7 | Record the screen of the whole flow once, with the network on. |

## 4. The demo script

Roughly 6 minutes. Accounts are the seeded demo accounts (`docs/digivault-archive/05-demo-golden-path.md`, section 1).

| # | Status | Click or do | The audience sees | Say |
|---|---|---|---|---|
| 1 | built | Show `samples/veridoc/chats/supply-order.txt` | A short chat in English and Hinglish: price per piece, a total, an advance, a delivery date | "A real-style deal on WhatsApp. Price, advance and date are all in there, scattered across messages. Synthetic data." |
| 2 | built | Log in as the party account, **New agreement** | The empty agreement | "Nobody has to install anything on the other side." |
| 3 | built | **Import chat**, choose `supply-order.txt` | The chat shown back, messages numbered 1 to 10 | "VeriDoc numbers every message so every term can point at one." |
| 4 | built | Open **Terms** | Terms with a quote and message numbers each. The badge says "Demo mode: recorded model output" | "This model output is recorded, and the badge says so. The rules read the amounts and dates first." |
| 5 | built | Point at the price per notebook | The recorded model said 54 and quoted "₹45 per piece". The term shows **needs review**: the value 54 does not follow from the quote, and the page says so | "Models make mistakes. A term must quote the message verbatim and its value must follow from the quote. 54 does not, so a person has to look." |
| 6 | built | Click **Confirm** on each stated term | Terms turn confirmed. Nothing is saved until this click | "A person confirms every term. The AI only suggests." |
| 7 | built | Click **Write the recap**, then on the Recap screen open **What to ask next**, pick a tone, **Copy this message** | The open points (the needs-review price, anything unclear or missing) each have one suggested message in three tones | "VeriDoc never sends a message. It tells you what to ask next." |
| 8 | built | Choose an agreement, **Save recap and get the code**, then **Copy the WhatsApp message** | The recap saved through the normal upload, a 6-character code such as `4F7K9X`, and the WhatsApp message ending in the reply line | "The recap is built from fixed templates, not free AI text." |
| 9 | built | In **Check a reply**, paste the prepared reply `CONFIRM <code>` | "Confirmed". Then paste a wrong code to show it refused | "The code ties a reply to this exact recap. It does not show who typed it." |
| 10 | built | **Upload document**, choose `samples/veridoc/order-confirmation.pdf` (until step 4 of `TRIM_PLAN.md` builds the record automatically) | "Rendering pages and computing fingerprints in your browser", then the version page with the anchor pending | "The browser hashes every page. The server recomputes every hash and refuses a mismatch." |
| 11 | built | Wait for **Anchored**, open the explorer link | The anchor transaction on Polygon Amoy | "Only a 32-byte fingerprint goes on chain. No content." |
| 12 | built | Download the verification files, open the private window on `/verify`, drop them in | **Verified**, with each check listed | "Anyone can check this without an account and without our server." |
| 13 | built | Drop the copy with one pixel changed | **Mismatch**, naming the tile | "Any change, however small, is found and located. That is tamper-evident: it shows a change, it does not prevent one." |
| 14 | built | Redaction screen: show the suggested tiles, confirm, create the redacted version, make a share link | A new anchored version, and a link that serves only that version | "Names and numbers can be hidden before sharing, and the redacted copy is checkable too." |
| 15 | built | Close on the receipt | | "Handshake, Recap, Receipt. Drafting aid, not legal advice." |

Steps 1 to 15 are built. Step 8 already saves the recap through the normal upload, so step 10 (uploading the sample PDF) is only needed if the recap steps are skipped. The terms and recap steps run on recorded model output; say so, as the badge does. They were run end to end in a browser on 2026-10-26.

## 5. Offline fallback

What needs the network and what does not.

| Part | Needs the network? |
|---|---|
| Web app, database, MinIO, AI service, fake model | No. All run on this machine |
| Chat import, terms, flags, recommendation, recap, echo code (when built) | No |
| Hashing in the browser and server re-verification | No |
| Anchoring on Polygon Amoy | **Yes** (an RPC endpoint) |
| The on-chain check on the verify page | **Yes** (it reads the chain). It cannot be run offline |
| The local model (when built) | No |

If the Wi-Fi fails or the RPC is slow:

1. Keep going. A failed anchor shows as `FAILED` and never invalidates the upload; it can be retried after a step-up when the network returns. Say so.
2. For steps 11 to 13 use the record you **pre-anchored** (section 3, step 4) and its saved receipt files. Drop them in `/verify` only if the network is back; otherwise
3. play the screen recording of steps 11 to 13 and say it is a recording.
4. Do not claim the verify page works offline. It does not.

Other failures:

| Failure | Do |
|---|---|
| AI service not starting | Run the web app alone; skip steps 3 to 9 and say why |
| Badge missing | Stop. `MODEL_MODE` is wrong. Restart with the command in section 2 |
| Anchor takes too long | Use the pre-anchored record |
| A planned step is not built | Skip it; do not mock it live |
| Total failure | Play the recording and narrate it |

## 6. After the demo

- Note every question asked and who answered it.
- If a figure was quoted, check it against a measured result or retract it.

## 7. Demo of the offline engine (separate component)

The engine runs from a pendrive and is **not part of the application demo above**. Show it as its own demo and say so: it is a separate codebase, not connected to the app, tested on macOS (Apple Silicon) only. Windows and Linux are packaged but untested, so do not demo them. Figures are the team's own, on 36 synthetic chats, and about 2 s per chat is from a MacBook M4.

### 7.1 Before

| Check | Detail |
|---|---|
| Laptop | macOS, Apple Silicon |
| Drive | VeriDoc pendrive plugged in; Wi-Fi turned off on stage |
| Launcher | If macOS blocks it, right-click `Start VeriDoc.command` and choose Open |
| Shell | In zsh run `setopt NO_BANG_HIST` before pasting chats that contain `!` |
| Drive files copied from a Mac | `dot_clean -m /Volumes/<drive>` removes `._` files |
| Health | `curl http://127.0.0.1:8765/api/health` answers |

### 7.2 Script (about four minutes)

| Time | Step | What the audience sees |
|---|---|---|
| 0:00 | The problem | The shirt-deal chat (`data/samples/shirt-deal.txt`): vague delivery, no payment date |
| 0:30 | Offline start | Wi-Fi off, pendrive in, one double-click |
| 0:50 | Analysis | `<python> app/veridoc_extract.py --root "$(pwd)" --chat data/samples/shirt-deal.txt`: terms with source messages, delivery unclear, balance date missing |
| 1:50 | Live chat | Three terminal windows: two with `veridoc_live.py --as <Name>`, one with `--watch`; the deal sheet fills in as they type |
| 3:00 | Hard case | A Hinglish chat and the price-conflict chat from `data/samples/tests/` |
| 3:40 | Close | "A promise made in chat should be a promise you can prove." |

`<python>` is the bundled `runtime/python/mac-arm64/bin/python3`. Optional API call:

```bash
curl -X POST http://127.0.0.1:8765/api/analyse \
  -H "Content-Type: application/json" \
  -d '{"text": "Raju: 200 shirts at 480 each ok?\nMeena: ok, delivery next week", "me": "Meena"}'
```

### 7.3 Say honestly

- Say the receipt step is planned in the engine; the application's vault is where records are hashed, chained and anchored today.
- If a term is wrong on stage (a negotiated price, an advance read as the total, an unsupported deal type such as catering), say it is a known failure and that this is why every term shows its quote and a person confirms it. Do not hide or rerun it.
- Do not say Windows or Linux work, that it reads real Indian chats at a measured rate, or that it is integrated with the app.
