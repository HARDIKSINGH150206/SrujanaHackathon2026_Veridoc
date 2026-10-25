# VeriDoc — Demo Runbook

A click-by-click demo script, a one-command start, and what to do when the network or something else fails. It is written for the finished flow, and every step is marked **[built]** or **[planned]** (`PRD.md` section 8). Until a step is built, skip it or show the recorded screens, and say so. Never present a recording as live.

Demo data is synthetic: `samples/veridoc/` (a supply-order chat, a freelance chat, and `order-confirmation.pdf`).

## 1. What to say and not say

| Say | Do not say |
|---|---|
| "tamper-evident" | "tamper-proof", "cannot be changed" |
| "Demo mode: recorded model output" (the badge on screen says it too) | "the AI found this" while the badge is showing |
| "the record was not changed after it was saved" | "this proves the chat is real" |
| "drafting aid, not legal advice" | any statement about whether the deal is enforceable |
| "this is a target until measured" for any speed or accuracy figure | an accuracy number we have not measured |

## 2. One-command start

One-time setup first (`docs/digivault-archive/DEVELOPMENT.md` sections 1 and 3): `pnpm install`, the `.env` files, `prisma migrate deploy`, the `digivault_app` password, the AI service virtual environment, and the demo seed.

Then, from the repository root:

```bash
docker compose up -d && (cd apps/ai-service && MODEL_MODE=fake .venv/bin/uvicorn app.main:app --port 8001 &) && MODEL_MODE=fake pnpm --filter @digivault/web dev
```

This starts PostgreSQL and MinIO, the AI service on :8001 and the web app on :3000, all in fake-model mode. Open `http://localhost:3000`. The yellow "Demo mode: recorded model output" badge must be visible at the bottom of every page. If it is not, stop: `MODEL_MODE` is not `fake`.

The AI service's startup check for `MODEL_MODE=fake` has not been run end to end on this branch (the service could not be started where it was written). Try it once before the day. A single wrapper script for this command is a later item.

Anchoring needs `AMOY_RPC_URL` in `apps/web/.env.local` and a funded anchoring key (`docs/digivault-archive/DEVELOPMENT.md` section 6, `docs/digivault-archive/05-demo-golden-path.md` for gas figures).

## 3. Before the demo (T minus 30 minutes)

| # | Check |
|---|---|
| 1 | Start with the command in section 2. Badge visible. |
| 2 | Demo accounts exist (`cd apps/web && node --experimental-strip-types prisma/seed-demo.ts`). The roles show as Party, Reviewer and Verifier after `TRIM_PLAN.md` step 1. |
| 3 | Wallet has Amoy test POL (about 0.003 per document anchor; `docs/digivault-archive/05`). |
| 4 | **Pre-anchor one record** (section 4, steps 8 to 10) so a verified receipt is ready before going on stage. |
| 5 | Save the receipt files for that record in a known folder, and a copy of one page with a single pixel changed for the tamper test (the command is in `docs/digivault-archive/05-demo-golden-path.md`, section 3). |
| 6 | Open three tabs: the dashboard (party), a private window on `/verify`, and the explorer page for the anchor. |
| 7 | Record the screen of the whole flow once, with the network on. |

## 4. The demo script

Roughly 6 minutes. Accounts are the seeded demo accounts (`docs/digivault-archive/05-demo-golden-path.md`, section 1). Until `TRIM_PLAN.md` step 1 is done, the screens still say "case" where this script says "agreement".

| # | Status | Click or do | The audience sees | Say |
|---|---|---|---|---|
| 1 | built | Show `samples/veridoc/chats/supply-order.txt` | A short chat in English and Hinglish: price per piece, a total, an advance, a delivery date | "A real-style deal on WhatsApp. Price, advance and date are all in there, scattered across messages. Synthetic data." |
| 2 | built | Log in as the party account, **New agreement** | The empty agreement | "Nobody has to install anything on the other side." |
| 3 | planned | **Import chat**, choose `supply-order.txt` | The chat shown back, messages numbered 1 to 10 | "VeriDoc numbers every message so every term can point at one." |
| 4 | planned | Open **Terms** | Terms with a quote and message numbers each. The badge says "Demo mode: recorded model output" | "This model output is recorded, and the badge says so. The rules read the amounts and dates first." |
| 5 | planned | Point at the price per notebook | The recorded model said 54 and quoted "₹45 per piece". The term shows **needs review**: the value 54 does not follow from the quote, and the page says so | "Models make mistakes. A term must quote the message verbatim and its value must follow from the quote. 54 does not, so a person has to look." |
| 6 | planned | Click **Confirm** on each stated term | Terms turn confirmed. Nothing is saved until this click | "A person confirms every term. The AI only suggests." |
| 7 | planned | Open **Flags**, then **Suggested message**, then **Use this** | Any term still unclear or missing is flagged with a reason; one suggested message is copied | "VeriDoc never sends a message. It tells you what to ask next." |
| 8 | planned | **Create recap**, then **Copy for WhatsApp** | A short plain recap with `CONFIRM` and a 4-character code | "The recap is built from fixed templates, not free AI text." |
| 9 | planned | Paste the prepared reply `CONFIRM <code>` | "Confirmed". Then paste a wrong code to show it refused | "The code ties a reply to this exact recap. It does not show who typed it." |
| 10 | built | **Upload document**, choose `samples/veridoc/order-confirmation.pdf` (until step 4 of `TRIM_PLAN.md` builds the record automatically) | "Rendering pages and computing fingerprints in your browser", then the version page with the anchor pending | "The browser hashes every page. The server recomputes every hash and refuses a mismatch." |
| 11 | built | Wait for **Anchored**, open the explorer link | The anchor transaction on Polygon Amoy | "Only a 32-byte fingerprint goes on chain. No content." |
| 12 | built | Download the verification files, open the private window on `/verify`, drop them in | **Verified**, with each check listed | "Anyone can check this without an account and without our server." |
| 13 | built | Drop the copy with one pixel changed | **Mismatch**, naming the tile | "Any change, however small, is found and located. That is tamper-evident: it shows a change, it does not prevent one." |
| 14 | built | Redaction screen: show the suggested tiles, confirm, create the redacted version, make a share link | A new anchored version, and a link that serves only that version | "Names and numbers can be hidden before sharing, and the redacted copy is checkable too." |
| 15 | built | Close on the receipt | | "Handshake, Recap, Receipt. Drafting aid, not legal advice." |

Steps 3 to 9 are planned. If they are not built on the day, run steps 1, 2, 10 to 15 and say clearly that the chat analysis is not part of today's live demo.

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
