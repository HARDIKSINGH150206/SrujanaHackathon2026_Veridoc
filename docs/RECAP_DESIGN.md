# VeriDoc — Recap Design

Feature 5, *Plain-language agreement*, and feature 4, *Chat recommendation*. One page. It needs **no Prisma migration and no new audit action**: the recap is saved through the normal evidence upload, which already writes `UPLOAD_DOCUMENT_VERSION`. If a later change needs either, it needs a new ADR first (ADR-039).

## Flow

1. **Confirm.** On *Chat terms* the person ticks **Confirm** on each term they agree with. Only terms with status **stated** can be ticked. Unclear, contradicted, missing and needs-review terms cannot be confirmed; they become open points. (Correcting a value and then confirming it is a later step.) Nothing leaves the browser until the next step.
2. **Recap text.** The browser sends the terms and the person's ticks to `POST /api/v1/evidence/recap`, which asks the AI service (`POST /v1/recap`). The text comes from **fixed templates** in `playbooks/recap/<playbook>.json`, English and Hindi, filled only from confirmed terms. **No model text is in the recap.** The service refuses a confirmed term that is not stated, has no value, or is not in the playbook. Every other term is listed as an open point in plain words: "Delivery date is not clear yet", "Advance paid has not been discussed yet".
3. **Save the recap document.** The browser builds a one-or-two-page PDF of the recap (title, the recap text, the line "Drafting aid, not legal advice") and uploads it with the **same code path as the Upload screen**: `hashDocumentV2` in the browser, then `POST /api/v1/evidence/upload`, into an agreement the person chooses. The server recomputes every hash. The hash chain, redaction tiles, audit trail and anchoring then cover the recap exactly as for any other document. The code line is **not** in this document.
4. **Echo code.** After the upload, the code is derived from the stored hash of the recap document, `client_hash` (SHA-256 over the page images; the server returns it and stores it as `DocumentVersion.clientHash`). It is **domain-separated**, six characters, easy to type:

   ```
   code = first 30 bits of SHA-256( "veridoc/echo/v1" ‖ 0x00 ‖ clientHash as 32 bytes ),
          written as 6 characters of 0123456789ABCDEFGHJKMNPQRSTVWXYZ  (Crockford: no I, L, O, U)
   ```
   Example shape: `CONFIRM 4F7K9X`. The WhatsApp message is the recap text plus `If all correct, reply: CONFIRM <code>`. Because the code comes from the document's hash, **changing any line changes the code**, and a code can always be re-derived from the stored version.
5. **Reply check.** The person pastes the other side's reply. The check finds `CONFIRM` (any case), reads the next six characters (spaces and hyphens ignored; `O` read as 0, `I` and `L` as 1), and compares them with the code. Results: **match**, **no code found**, **wrong code** ("it may be for an older recap").

## What a matching code proves, and what it does not

- **Proves:** the reply refers to this exact recap. A different recap has a different hash and so a different code; guessing one is about 1 in a billion.
- **Does not prove:** who sent the reply, that the chat export was genuine, that anyone read the recap, or that the agreement is enforceable. Anyone who saw the message could type the code. The screen says so, always.

## Recommendation (feature 4)

One suggested next message per open point, from fixed templates in three tones: **friendly, neutral, firm** (firm stays courteous). Templates use the term's label and quote the chat (two quotes for a contradicted term). A needs-review term is asked about by quoting the chat, never by repeating the value that failed its check; only a stated term the person has not yet confirmed is asked about by its value. The person copies a message and sends it themselves; VeriDoc sends nothing.

## Where things live

| Part | File |
|---|---|
| Templates (en, hi) | `playbooks/recap/*.json` |
| Recap and recommendation text | `apps/ai-service/app/recap.py`, `recap_router.py` |
| Proxy route | `apps/web/src/app/api/v1/evidence/recap/route.ts` |
| Echo code and reply check | `apps/web/src/lib/echo-code.ts` |
| Recap PDF | `apps/web/src/lib/recap-pdf.ts` (Hindi uses a subset of Noto Sans Devanagari, SIL OFL, in `apps/web/public/fonts/`) |
| Screen | `apps/web/src/app/dashboard/recap/page.tsx` |

## Not in this step

Saving the pasted reply as a further version of the agreement; correcting a term before confirming it; native-speaker review of the Hindi templates (the screen labels Hindi "draft").
