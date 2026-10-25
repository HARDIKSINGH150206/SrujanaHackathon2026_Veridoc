# VeriDoc — Trim Plan

How DigiVault becomes VeriDoc without touching the parts that make it trustworthy. Written from a read-only scan of the import commit (about 235 files). The scan searched for NCRB, police, court, victim, officer, FIR, BNSS, BSA, service number, investigating and similar wording.

Ground rules (ADR-037, ADR-039):
- Only words on screen change. Database columns, the `Role` enum and the audit action strings do not.
- No Prisma migration, no change to a hash, a proof format or an audit format.
- The front end and the redaction screens (tiles, preview, confirm, share link, verify page) stay as they are.

## Status

**Step 1 (wording and seed data) is done** on branch `feat/veridoc-wording`: "case" reads "agreement" on every screen and in the messages the screens show; roles show as Party, Reviewer, Verifier and Admin; the landing, login, header and verify page no longer name NCRB, police, courts or the old case-file vocabulary; "victim_name" shows as "Person name"; the BNSS deadline badges, alerts and FIR fields are gone from the screens; both seed scripts use the synthetic VeriDoc samples (`prisma/seed-demo.ts` seeds two agreements and three documents from `samples/veridoc/`). Checked by reading the visible text of every page for every role in a browser, and by `e2e-part1.mjs`.

Still to do, in later steps:
- The certificate PDF still carries the BSA s.63 wording (`certificate.ts`, `certificate-text.ts` and their test); the screens call it "certificate" and the download file is `certificate-v<n>.pdf`. Step 6 replaces it with a receipt.
- The BNSS deadline code is unused by the screens but still exists (`lib/bnss-deadline.ts`, `_workspace/deadline.tsx`, the API fields, the `fir_registered_at` and `offence_sections` columns). `scripts/e2e-deadlines.mjs` and `scripts/seed-deadline-cases.mjs` test and seed it and are obsolete.
- The verify page still says "official DigiVault contract" in its trust messages. That is the name of the deployed anchor, and the demo scripts look for it.
- Code comments, the AI service's entity type names and redaction eval fixtures still use the old vocabulary.
- `docs/digivault-archive/` keeps the original wording.

## 1. Keep, unchanged

| Keep | Why |
|---|---|
| Hash chain, salted Merkle tree, proof format v2 (`packages/crypto-core`, `docs/03`) | This is the evidence vault (F6) |
| Anchoring: MinIO Object Lock and Polygon Amoy, `EvidenceAnchorV2.sol` | `CLAUDE.md` rule 3 |
| Server re-verification of every hash | `CLAUDE.md` rule 4 |
| Step-up authentication (WebAuthn, PIN fallback), HMAC sessions, rate limits | Protects confirmations and shares |
| Redaction engine and suggestion tiles, redaction proofs, `eval/` quality gate | Needed to redact names, numbers and addresses before sharing |
| Link sharing (`DocumentShare`), serving redacted versions only | ADR-009 |
| Insert-only, hash-chained, anchored audit log | ADR-010, ADR-020, ADR-030 |
| Verify page (public, stateless) | `CLAUDE.md` rule 5 |
| Audit action strings such as `CREATE_CASE`, `UPLOAD_DOCUMENT_VERSION`, `CONFIRM_REDACTIONS` | They are hashed into the audit chain |

## 2. Rename (words on screen only)

| Now | Becomes | Where |
|---|---|---|
| case, case file | agreement | Dashboard, case view, new-case form, upload view, landing page, share panel |
| Police Officer, Investigating Officer | Party | Role labels in `shell.tsx` and the dashboard |
| Court Official | Reviewer | Role labels |
| Forensic Lab | Verifier | Role labels |
| Admin | admin (unchanged) | |
| "Good morning, Officer." | a neutral greeting | `shell.tsx` |
| Court Verification Portal | Verify page | `apps/web/src/app/verify/page.tsx` text, docs |
| Service Number | the label stays unless it confuses; the field and API are unchanged | `login/page.tsx` |
| victim_name and similar entity labels shown in the redaction screen | neutral labels such as "person name" | UI text only; the stored `entityType` values do not change |
| Demo accounts and demo cases | agreement-style names | `seed-demo.ts`, `prisma/seed-for-testing.mjs` and the scripts that read them |

Role labels on screen (decided 2026-10-26, labels only): `POLICE_OFFICER` and `INVESTIGATING_OFFICER` show as "Party" (they can upload, confirm and share); `COURT_OFFICIAL` shows as "Reviewer" and `FORENSIC_LAB` as "Verifier" (both read-only). `ADMIN` is unchanged.

Files with the most old wording (counts from the scan): `prisma/seed-demo.ts`, `investigation-dashboard.tsx`, `smoke-test.mjs`, `eval/fixtures.py`, `landing.tsx`, `real_suggestions.py`, `golden-path.mjs`, `case-view.tsx`, `custody-graph.tsx`, `login/page.tsx`.

## 3. Remove

| Remove | Notes |
|---|---|
| BNSS s.193(2) deadline feature: `lib/bnss-deadline.ts` and test, `deadline.tsx`, the deadline fields in the case form and API, deadline scripts | The columns `firRegisteredAt` and `offenceSections` stay in the schema, unused. The audit action `UPDATE_CASE_DEADLINE_FIELDS` stays as history |
| BSA s.63 certificate wording (`certificate-text.ts`, the certificate route's text) | Replaced by a receipt using the same PDF and QR builder with VeriDoc wording. Needs its own test update |
| FIR-style eval fixtures and gold files | Replaced by synthetic redaction fixtures. The quality gate baseline must be regenerated deliberately (`eval:gate --update`) |
| Old demo documents and `public/sample-firs/` | Replaced by the synthetic samples |
| NCRB, police and court framing in README, `CLAUDE.md`, `AGENTS.md`, the kickoff prompt, `docs/PRD.md`, `docs/ARCHITECTURE.md` | Done in the docs pass. `docs/01`, `04` to `08` and `DEVELOPMENT.md` now live in `docs/digivault-archive/` and keep their DigiVault text as history; see section 6 |

## 4. Add

| Add | File |
|---|---|
| Chat import and parser | `apps/ai-service/app/chat_import.py`; an import screen in the dashboard workspace |
| Term extractor with grounding | `apps/ai-service/app/term_extractor.py` |
| Flags (four statuses) and recommendation | `apps/ai-service/app/flags.py`, `suggestion.py` |
| Recap and echo code | `apps/ai-service/app/recap.py`; a recap screen |
| Chat record builder | `apps/web`, using `pdf-lib` as `certificate.ts` does |
| Playbooks and templates | `playbooks/` |
| Local model adapter | replaces the stub in `apps/ai-service/app/model_adapter.py` |

Already added: settings, model adapter interface and fake adapter, model manifest and startup check, demo badge, synthetic samples.

## 5. Order, risk and what it would force

| # | Step | Risk | Forces a migration or a hash or audit format change? |
|---|---|---|---|
| 1 | UI wording and seed data (section 2) | Low. Text only. Scripts and tests that read the old demo names must change together | No |
| 2 | Chat import and term extraction with grounding | Low. New code outside the hash path | No |
| 3 | Flags, recommendation, recap, echo code | Medium. Wording and templates need review; the echo code needs vectors | No |
| 4 | Chat record builder, saving records as versions | Medium. Touches the upload flow, which is on the integrity path; no change to what is hashed | No, if the record is an ordinary PDF (ADR-040) |
| 5 | Local model behind the adapter | Medium. Needs a pinned model and hardware testing | No |
| 6 | Remove the BNSS and BSA features (section 3) | Medium. Touches routes and the certificate tests. The unused columns stay | No |
| 7 | Role and schema rename | **High. Skipped** (ADR-039) | Would need a migration for the `Role` enum. Renaming audit action strings would make new audit rows differ from the strings in old rows and break verification of the old chain |

If a later change would alter a hash, an audit format or a migration, stop and decide it explicitly in a new ADR first.

## 6. Documents kept as DigiVault history

`docs/digivault-archive/` holds the pre-event DigiVault documents: `01-problem-and-novelty.md`, `04-api-spec.md`, `05-demo-golden-path.md`, `06-frontend-agent-plan.md`, `07-v2-build-plan.md`, `08-redaction-recall.md` and `DEVELOPMENT.md`. They still carry the NCRB, police, court and victim framing. They describe the inherited vault and redaction engine accurately; only the framing is old. `docs/02` and `docs/03` stay in `docs/` as the integrity references and apply as they are. Rewriting the framing in the archived files is a later step.
