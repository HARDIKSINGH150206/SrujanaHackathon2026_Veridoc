# VeriDoc: Project Report

**Date:** 26 Oct 2026 · **Author:** Akash Kumar Gupta

> A promise made in chat should be a promise you can prove. VeriDoc reads a business chat, lists the deal terms with their source messages, and flags what is vague or missing, all on the user's own laptop with no internet.

---

## How this report relates to this repository

VeriDoc has two components. This report describes the whole product; each document in `docs/` describes the part that is in its scope.

| Component | What it is | Where it lives | Status |
|---|---|---|---|
| **Offline engine** | The fine-tuned model, rules engine, terminal tools, local API and the pendrive packaging described in sections 5, 6, 9, 10 and 14 | Its own codebase and drive. **Not in this repository** (the weights are never committed) | Demonstrated on macOS (Apple Silicon); Windows and Linux packaged, untested |
| **Application and evidence vault** | The Next.js app, the Python AI service, the hash-based evidence vault, anchoring, the verify page, recap and echo code | This repository (`apps/`, `packages/`, `prisma/`) | Built and tested. It runs on recorded model output and recorded transcripts until the engine is connected |

The engine is **not yet integrated** with the application. The planned connection point is the model adapter (`LocalModelAdapter`, a stub today), which would call the engine. Where this report says "no database", "Receipt planned" or "terminal and local API only", it describes the engine; the vault in this repository already hashes, chains and anchors saved records (`ARCHITECTURE.md`). Figures in this report come from the engine's own evaluation runs and were **not** produced by this repository's code or its recorded demo.

Items the report could not state are marked **[to confirm]**.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Problem understanding](#2-problem-understanding)
3. [Proposed solution](#3-proposed-solution)
4. [Innovation and differentiation](#4-innovation-and-differentiation)
5. [System architecture](#5-system-architecture)
6. [Implementation details](#6-implementation-details)
7. [Achievements during the hackathon](#7-achievements-during-the-hackathon)
8. [Testing and validation](#8-testing-and-validation)
9. [AI, data and external dependencies](#9-ai-data-and-external-dependencies)
10. [User interface and demonstration](#10-user-interface-and-demonstration)
11. [Limitations and incomplete work](#11-limitations-and-incomplete-work)
12. [Real-world viability and impact](#12-real-world-viability-and-impact)
13. [Future scope](#13-future-scope)
14. [Setup and reproducibility](#14-setup-and-reproducibility)
15. [Team contributions and references](#15-team-contributions-and-references)

---

## 1. Project overview

| Field | Detail |
|---|---|
| Project title | VeriDoc (presented in the idea round under the working name *Vachan*, Hindi for "promise"; same product) |
| Team name | [to confirm] |
| Theme | Legal Services |
| Official problem statement | LS-06: Informal agreements [to confirm exact official wording; this repository uses "From Handshake to Contract"] |
| Core novelty | The AI runs entirely on the user's laptop from a pendrive, with no internet connection and no cloud service |

### VeriDoc at a glance: fully offline, about 2 seconds per chat

| Figure | Meaning |
|---|---|
| **0** | internet connections; AI runs on the laptop |
| **~2 s** | per chat analysed on a MacBook (M4) |
| **72%** | deal terms correct on 36 held-out chats (strict) |
| **0.6B** | parameter model, fine-tuned Qwen3, 8-bit |

*Headline figures are from the team's own runs, 25–26 Oct 2026, on synthetic held-out chats. They are a target until measured on real Indian chats (section 11).*

### Executive summary

VeriDoc turns business deals made over chat into clear records. A small language model, fine-tuned by the team and stored on a pendrive, reads a WhatsApp-style chat and lists each deal term (buyer, seller, item, quantity, price, delivery, advance, payment) with the exact message it came from. Deterministic rules then re-check every term against the chat and mark it **stated**, **unclear**, **contradicted** or **missing**, so the user knows what to confirm before the deal goes wrong. Everything runs offline on macOS today, with Windows and Linux runtimes packaged on the same drive. Business chats hold prices, names and phone numbers, so keeping them on the device is the point, not a constraint.

### The problem being addressed

In India, small deals are agreed on WhatsApp. The price and quantity are usually clear; the delivery date, the advance and the balance due date often are not. The gap shows up weeks later, when one side refuses to pay or deliver, and a chat screenshot is weak evidence. Asking a regular customer to sign a contract feels like distrust, so people don't. The law already accepts chat agreements; what fails is clarity at the time of the deal and proof afterwards.

---

## 2. Problem understanding

### Target users

| User | Typical chat deal | What usually goes unsaid |
|---|---|---|
| Small suppliers and shops | A tailor takes a 200-shirt order at ₹480 with 50% advance | Delivery date, balance due date |
| Freelancers | A designer agrees a ₹8,000 logo with "a few changes" | Number of revisions, deadline |
| Tutors and coaches | ₹3,000 a month, starting June | Fee due date, notice period |
| Contractors and landlords | A 2BHK paint job "around 45k"; a rent deposit | Exact price, start date, refund terms |
| Caterers and event vendors | 40 plates at ₹420, ₹5,000 advance | Final headcount, balance date |

### Pain points

1. **Terms are scattered.** Price in one message, deadline in a voice note, payment date never stated.
2. **Words are vague.** "Next week", "approx 50k" and "will pay soon" cannot be enforced.
3. **Contracts feel awkward.** Asking a regular customer to sign signals distrust.
4. **The gap surfaces too late.** Only when someone refuses to pay, and an edited export proves nothing.
5. **Privacy.** Pasting a business chat into a cloud chatbot shares prices, names and numbers with a third party, and many small traders work on weak mobile networks.

### Why the problem matters

| Figure | Value | Source |
|---|---|---|
| Delayed payments owed to MSMEs | ₹7.34 lakh crore (March 2024) | GAME–FISME Delayed Payments Report 3.0 |
| Pending MSME Samadhaan cases | ₹31,039 crore, from 2.5 lakh+ applications (Dec 2025) | MSME Samadhaan |
| Payment claims rejected by MSE councils | About 1 in 4 (39,409, to July 2023) | Lok Sabha answer AU2328 |
| Monthly WhatsApp users in India | About 535 million | Meta / Statista |
| Small-business owners using WhatsApp for business | 80% (India and Brazil) | Meta |
| Indian freelancers unpaid at least once | 61% of those surveyed | PayPal (2018) |

**Legal position** (as researched by the team; a lawyer must confirm it before anyone relies on it). The law already accepts chat agreements:
- Indian Contract Act **s.10** needs no writing.
- IT Act **s.10A** says an electronic contract is not invalid for being electronic.
- Under the Bharatiya Sakshya Adhiniyam (**s.61–63**) a chat printout needs a certificate.
- Under the MSMED Act (**s.15–16**) late-payment interest runs from the *agreed* date. If no date was agreed, both sides argue about what was said.

### Assumptions

- Deals are agreed in text chat (WhatsApp or similar) and can be exported or pasted as text.
- The user has an ordinary laptop (macOS, Windows or Linux) and a USB port, but not necessarily reliable internet.
- Chats are in English, Hinglish or Kannada-English written in Latin script.
- The user wants help noticing gaps, not a legal verdict; a person confirms every term.

### Specific needs addressed

- See every agreed term in one place, each linked to the message it came from.
- Know which terms are vague or missing *while the deal can still be fixed*.
- Keep the chat private: nothing uploaded, no account, no internet.
- Work on any common laptop by plugging in a drive, with no installation.

---

## 3. Proposed solution

### How it works: Handshake, Recap, Receipt

VeriDoc works inside the conversation people already have, instead of asking them to sign a contract.

1. **Handshake.** The two parties chat as usual. VeriDoc reads a WhatsApp "Export chat" file, a pasted chat, or messages typed live in the terminal.
2. **Recap.** The model lists each term, quotes the message it came from, and marks it stated, unclear, contradicted or missing. Rules re-check every term against the chat, and the user sees what still needs to be agreed.
3. **Receipt.** The confirmed record is saved with a hash, so anyone can later check it hasn't changed. *In the engine this step is planned. In the application in this repository it is built: the record is saved as a document, hash-chained and anchored, and a public verify page checks it (the check reads Polygon Amoy and so needs a network connection).*

### User journey: five steps, steps 1–4 built in the engine

| Step | Name | What happens |
|---|---|---|
| 1 | Start | Plug in pendrive, run the launcher |
| 2 | Add chat | Export, paste or type it live |
| 3 | Deal sheet | Terms + sources, gaps flagged |
| 4 | Close gaps | Ask about each flagged term |
| 5 | Receipt (engine: planned) | Hash the record |

Steps 1–4 work today. Step 4 loops back to step 3: new messages are re-analysed.

### Key features

| Feature | What it does | Status |
|---|---|---|
| Chat ingestion | Reads WhatsApp exports (Android and iOS formats), pasted text, or live typed messages | Built |
| Term extraction | Fills buyer, seller, item, quantity, unit price, total, advance, delivery date, balance payment date, and freelance equivalents | Built |
| Source linking | Every term quotes the message number and words it came from | Built |
| Gap detection | Lists required terms never mentioned ("Not in the chat yet: ask about these") | Built |
| Ambiguity and conflict flags | Marks vague values ("next week", "half") unclear and conflicting values contradicted | Built |
| Rules re-check and auto-repair | Fixes only what the quoted chat proves; never turns an unagreed offer into a price | Built |
| Deal-type playbooks | Classifies supply order vs freelance and applies that deal's roles and required terms | Built |
| Live mode | Two people type as themselves; a watch window updates the deal sheet after each message | Built |
| Local API | `POST /api/analyse` on `127.0.0.1:8765` for the team's own frontend | Built |
| Cross-platform pendrive | One drive with runtimes for macOS, Windows and Linux | macOS tested; Windows and Linux packaged |
| Suggested reply | One message that closes the top gap | Engine: planned. Application: built from fixed templates, three tones |
| Recap in English, Hindi, Kannada and one-tap confirm | Both sides confirm the same recap | Engine: planned. Application: English and Hindi recap with an echo-code confirmation; Hindi is an unreviewed draft; Kannada not built |
| Tamper-evident receipt | Hash of the confirmed record and its versions | Engine: planned. Application: built (hash chain, anchor, verify page) |

### Worked example

For:

```
Raju: 200 shirts at 480 each ok?
Meena: ok, delivery next week
Meena: please send half as advance
Raju: done, sent 48000
```

VeriDoc finds the buyer, seller, item, quantity and unit price; marks the advance ("half") and the delivery date ("next week") **unclear**; and lists the balance payment date as **missing**. It took about 2 seconds on a MacBook, offline.

### How it addresses the problem statement

Informal agreements fail because terms are left vague and nobody notices until a dispute. VeriDoc catches the vague and missing terms while the parties are still talking, without the social cost of a contract and without sending the chat anywhere.

---

## 4. Innovation and differentiation

### What is original

**A fine-tuned language model that runs from a pendrive, fully offline.** Most AI legal and contract tools send the text to a cloud model. VeriDoc carries its own 0.6-billion-parameter model, inference engine and Python runtime on a USB drive. Plug it into a laptop, double-click the launcher, and the analysis runs locally in about 2 seconds, with Wi-Fi off. No account, no API key, no upload, no running cost per chat.

The second idea is **prevention instead of explanation**: VeriDoc points out the missing terms while the deal is still being negotiated, rather than explaining a dispute after it has happened.

### How it differs from existing approaches

| Capability | AI chatbot | Contract or e-sign app | VeriDoc |
|---|---|---|---|
| Works with no internet | No | No | **Yes** |
| Chat data never leaves the device | No | No | **Yes** |
| Each term linked to its source message | No | No | **Yes** |
| Flags missing and vague terms during the chat | If asked | No | **Yes** |
| No contract or signature needed | Yes | No | **Yes** |
| Output always in a fixed, checkable format | No | Yes | **Yes** |
| Tamper-evident record | No | Online audit trail | Yes in the application (hash chain and public anchor); engine: planned |

| Similar product | What it does | What it leaves open |
|---|---|---|
| Pakka AI (India) | Chat terms into a contract with milestone escrow; 2.5% fee | Cloud and payment-led; pre-launch |
| Chat2Contract | WhatsApp export into a draft contract to sign | Still asks for a signature; pre-launch |
| ThreadRecap | Export into a dated report of terms, after the fact | No live warnings or confirmation |
| ProofSnap | Seals an export with SHA-256 and timestamps | Evidence only; reads no terms |
| Defellix, Riffit (India) | Freelance contract templates with OTP e-sign | Replaces the chat instead of working in it |

*Based on each product's public website, October 2026.*

### Design and technical decisions that make it useful

- **Small model, fine-tuned for one job.** Qwen3-0.6B fine-tuned with LoRA on 6,480 deal chats; 8-bit, so it runs on almost any laptop without a GPU.
- **Grammar-constrained JSON output.** llama.cpp forces the model's answer into a fixed schema, which raised valid output from 88.9% to 100%.
- **AI suggests, rules decide.** Deterministic rules re-check every term against the chat and auto-repair only what the quoted message proves. On the benchmark they caught 71.8% of model errors.
- **Every term carries its quote.** The user can check any value against the exact message instead of trusting the model.
- **Deal-type playbooks.** Roles and required terms change with the deal (buyer/seller for supply orders, client/freelancer for freelance work), so "missing" means missing *for this kind of deal*.
- **Localhost-only API.** The engine answers only requests from the same laptop and refuses web pages from other origins.
- **Portable runtimes, no installation.** Bundled Python 3.12 and llama.cpp builds for macOS (Metal), Windows and Linux (Vulkan or CPU); the launcher picks the right one.

---

## 5. System architecture

The offline engine is one self-contained program on a pendrive. Every component runs on the user's laptop; nothing calls the internet. The application in this repository is described in `ARCHITECTURE.md`.

### Pipeline (all steps run from the pendrive, no internet)

```
Chat in  ->  Parser  ->  Model  ->  Rule check  ->  Deal sheet  ->  (Receipt: planned in the engine)
```

| Stage | Detail |
|---|---|
| Chat in | WhatsApp export, paste or live typing |
| Parser | `wa_parse.py`: who said what |
| Model | Qwen3-0.6B via llama-server |
| Rule check | `config/playbooks` re-checks each term |
| Deal sheet | Terms + quotes, flags the gaps |
| Receipt | Hash the record (planned in the engine; built in the application) |

**How you use it:** terminal (`veridoc_extract` for a chat file, `veridoc_live` to type the chat live) and the local API (`127.0.0.1:8765/api/analyse`, answers only this laptop). Runtimes for macOS, Windows and Linux are bundled.

### Major components

| Component | File(s) | Role |
|---|---|---|
| Launchers | `Start VeriDoc.command` (macOS), `Start VeriDoc.bat` (Windows), `start-veridoc.sh` (Linux) | Pick the bundled Python for the OS and start the engine |
| Engine selector | `app/engine_path.py` | Chooses the llama.cpp build: Metal on Mac, Vulkan if the driver exists, else CPU |
| Chat parser | `app/wa_parse.py` | Splits WhatsApp exports and pasted text into numbered messages with sender names |
| Deal classifier and playbooks | `config/playbooks/` | Decide the deal type and its roles and required terms |
| Language model | `llama-server` + `veridoc-small-v4-Q8_0.gguf` | Reads the numbered chat and returns terms as schema-checked JSON |
| Rules engine | `app/` | Re-checks each term against its quoted message, auto-repairs what the chat proves, flags the rest |
| Engine API | `app/veridoc_serve.py` | HTTP server on `127.0.0.1:8765` for the team's frontend |
| Terminal tools | `app/veridoc_extract.py`, `app/veridoc_live.py` | Analyse a chat file, or chat live and watch the deal sheet |
| Model registry | `config/models.json` | Lists model tiers; the first installed one is used |

### Data flow

1. The user gives a chat: an export file (`--chat`), pasted text (`--paste`), live typed messages, or a `POST /api/analyse` request.
2. The parser numbers each message and records who sent it.
3. The classifier picks the deal type, which selects the playbook.
4. The chat and the playbook's term list go to `llama-server` on the same laptop; grammar-constrained decoding returns JSON with value, quote, message number and status per term.
5. The rules engine checks each term against its quoted message, repairs or flags it, and computes what is missing.
6. The result is printed as a deal sheet in the terminal, or returned as JSON by the API.

### Technology stack

| Layer | Choice | Why |
|---|---|---|
| Language model | Qwen3-0.6B, LoRA fine-tuned, GGUF Q8_0 | Small enough for any laptop; data stays local |
| Inference | llama.cpp `llama-server`, release b11869 | Fast on CPU, Metal and Vulkan; supports JSON grammar |
| Application code | Python 3.12 standard library only | No packages to install; runs from a folder |
| Runtime | Portable Python 3.12.15 (python-build-standalone) per OS | No Python install needed on the host |
| Training | PyTorch, Hugging Face transformers 5.20.2, PEFT, on a Kaggle T4 GPU | Standard, reproducible LoRA fine-tuning |
| Packaging | exFAT pendrive with per-OS launchers | exFAT is readable by macOS, Windows and Linux |

### APIs

| Method and path | Request | Response |
|---|---|---|
| `GET /api/health` | none | Engine status and the active model |
| `POST /api/analyse` | JSON: `text` (the chat, required), `me` (whose side the user is on, optional), `deal_type` (optional override) | JSON: deal type, each term with value, quote, message number and status, and the missing terms |

The server binds to `127.0.0.1` only and refuses requests that come from other hosts or from web pages on other origins, so a website cannot read the user's chats through it. Server flags: `--root`, `--port`, `--tier`, `--engine-url`.

### Database design

There is no database in the engine: it is stateless and keeps nothing between requests. Configuration lives in plain files on the pendrive (`config/models.json`, `config/playbooks/`). The planned engine-side Receipt step would add local storage on the pendrive (SQLite, one file) holding each confirmed record, its message hashes and its version chain. The application in this repository already stores records: PostgreSQL (versions, tiles, hash chain, audit log) and MinIO (page images, anchor records), described in `ARCHITECTURE.md`.

### How the components interact

The launcher starts the engine API, which starts `llama-server` as a child process on a local port. The terminal tools and the API share the same parser, model call and rules code, so a chat gives the same result through either. The team's frontend talks to the engine only through the local API.

---

## 6. Implementation details

### Features completed

- WhatsApp export parsing (Android and iOS date formats, multi-line messages) and pasted-text parsing.
- Deal-type classification (supply order, freelance) with per-type playbooks of roles and required terms.
- Term extraction by the fine-tuned model, with quote and message number for every term.
- Rules engine with auto-repair, and the four statuses: stated, unclear, contradicted, missing.
- Terminal tools: one-shot analysis of a chat file, and live two-person chat with a watching deal sheet.
- Local HTTP API with health and analyse endpoints, restricted to the same laptop.
- Pendrive packaging: per-OS launchers, portable Python, and llama.cpp builds for Metal, Vulkan and CPU.
- Training pipeline: synthetic data generator, Kaggle fine-tuning notebook, GGUF export, evaluation script.

The application side (evidence vault, anchoring, verify page, redaction, share links, audit trail, Chat terms and Recap screens, echo code, voice-note import) is documented in `PRD.md` section 8 and `ARCHITECTURE.md`.

### Important algorithms and logic

**Extraction with a locked format.** The chat is sent with numbered messages. llama.cpp's grammar-constrained decoding only lets the model emit JSON that matches the term schema: for each term a value, the quoted words, the message number and a status. Unparseable output is impossible by construction.

**Rules re-check and auto-repair.** Every model answer is checked against the chat text. The rules repair a term only when the quoted chat proves the fix:
- a value that does not match its own quote;
- a quote that points at the wrong message;
- a conflict where only one of the quoted messages actually holds a value;
- a term whose words appear nowhere in the chat (flagged, not trusted).

An offer that was never agreed (reason "unconfirmed", "conditional" or "approximate") stays unclear and is never turned into an agreed price. As a safety check, auto-repair was run on 5,406 chats with known correct answers and changed none of them.

**Missing terms.** After extraction, the playbook's required terms that have no value are listed as "Not in the chat yet (ask about these)".

**Engine and model selection.** `engine_path.py` picks `runtime/mac-arm64` on Apple Silicon; on Windows it uses the Vulkan build if `vulkan-1.dll` is present, on Linux if `libvulkan` is found, otherwise the CPU build. `VERIDOC_CPU_ONLY` forces CPU. The model is the first tier listed in `config/models.json` whose file exists on the drive.

**Live mode.** Each person runs `veridoc_live.py --as <Name>` and types messages into a shared transcript on the drive; a third window with `--watch` re-analyses the transcript after every new message, so the deal sheet fills in as the chat goes on.

### Major technical decisions

| Decision | Alternative considered | Why this way |
|---|---|---|
| 0.6B model, fine-tuned | 3B or 7B general model with prompting (the idea-round plan) | Runs on any laptop at about 2 s per chat; fine-tuning made a small model accurate enough for this one task |
| Grammar-constrained JSON | Free text, parsed afterwards | Valid output went from 88.9% to 100% |
| Rules after the model | Trusting the model's output | Catches most model errors and keeps a person in charge of every term |
| Standard-library Python | FastAPI and packages | Nothing to install; the same code runs on every OS |
| Terminal and local API, no bundled UI | A built-in browser UI | The team has its own frontend; the engine stays small and offline |

### How the solution was built

The team first wrote a generator for synthetic deal chats in English, Hinglish and Kannada-English with known correct answers, then trained successive model versions:

| Version | Training | Where |
|---|---|---|
| v1 | Template chats | MLX on a Mac |
| v2 | Template chats, more variety | MLX on a Mac |
| v3 | Templates plus realistic WhatsApp-style chats | MLX on a Mac, then GGUF for the pendrive |
| **v4 (shipped)** | 6,480 chats incl. negotiation chats and CraigslistBargains | Kaggle, one T4 GPU, 54 min |

v3 and v4 were exported to GGUF, run on the pendrive with the JSON constraint and the rules, and scored on the same 36 held-out realistic chats (section 8).

---

## 7. Achievements during the hackathon

> **[to confirm]** Which of the items below were completed inside the official hackathon window. The application in this repository started from DigiVault, an earlier project imported with the organiser's approval (`PRIOR_WORK.md`).

### What the team actually implemented

A working, offline deal-analysis engine on a pendrive: chat in, deal sheet out, with the team's own fine-tuned model, a rules engine, terminal tools, a local API and launchers for three operating systems.

### Working functionality (demonstrated on macOS)

- Analyse any chat file or pasted chat and get a deal sheet in about 2 seconds, with Wi-Fi off.
- Two people type a chat live in separate terminal windows while a third window updates the deal sheet.
- Call the engine from the team's frontend through `POST /api/analyse` on the same laptop.
- Run the nine bundled test chats and six realistic demo chats end to end.

### Milestones reached

| Milestone | Status |
|---|---|
| Idea, research and deck presented (as Vachan) | Done |
| Synthetic training-data generator (English, Hinglish, Kannada-English) | Done |
| Model v1 to v3 trained and evaluated | Done |
| Model v4 trained on 6,480 chats (Kaggle T4, 54 min) and shipped | Done |
| Rules engine with auto-repair | Done |
| Pendrive runs offline on macOS | Done |
| Windows and Linux runtimes on the same pendrive | Packaged, not yet tested on those machines |
| Old built-in browser UI removed; engine exposed via terminal and local API | Done |
| Engine receipt (hashing), suggested reply, multilingual recap | Not started in the engine; built separately in the application (`PRD.md`) |
| Engine connected to the application | Not done (the model adapter is a stub) |

### Measurable results: terms correct rose from 35% to 72% across model versions

Share of deal terms extracted correctly, same 36 held-out realistic chats.

| Model | Strict (exact match) | Lenient (words overlap ≥ half) |
|---|---|---|
| v2 (recorded) | 35.2% | 38.4% |
| v3 on pendrive | 54.2% | 58.7% |
| v3 + rules | 56.1% | 60.6% |
| **v4 + rules (shipped)** | **72.0%** | **78.0%** |

*VeriDoc Model Benchmark Report, 25 Oct 2026, 36 held-out realistic chats. All runs offline on the pendrive except v2.*

The shipped v4 model, with the rules, gets 72.0% of deal terms right on held-out realistic chats, up from 56.1% for v3. Valid JSON is 100% and the deal type is right in 91.7% of chats. Analysis takes about 2 seconds per chat on a MacBook. Fully correct chats remain rare (section 8).

---

## 8. Testing and validation

### Validation methods

| Method | What it checks |
|---|---|
| Benchmark (`evaluate.py`) on 36 held-out realistic chats | Terms correct (strict = exact match; lenient = free-text words overlap at least half, F1 ≥ 0.5), valid JSON, deal type, fully correct chats; run on the pendrive the way the demo runs |
| Held-out synthetic sets | 150 negotiation chats, 100 CraigslistBargains chats and 150 validation chats never seen in training |
| Rules-engine audit (v3, 378 terms) | How many model errors the rules catch, miss or wrongly flag |
| Auto-repair safety check | Auto-repair run on 5,406 chats with known answers, to confirm it never breaks a correct term |
| Nine bundled test chats | Each written to hit one hard case: Hinglish, Kannada-English, price conflict, vague terms, injected instruction, unsupported deal, no deal |
| Live manual tests | New chats typed by the team (e.g. a caterer deal) through the live model |

Tests of the application in this repository (unit, integration and browser checks) are described in `README.md` and are separate from the engine benchmark above.

### Model benchmark

| Model | Test set | How measured | Terms correct (strict / lenient) | Valid JSON | Deal type | Fully correct chats (strict / lenient) |
|---|---|---|---|---|---|---|
| **v4 + rules (shipped)** | Realistic, 36 | Pendrive, Q8_0, JSON constraint, rules | **72.0% / 78.0%** | 100% | 91.7% | 2.8% / 16.7% |
| v4 (Kaggle quick check) | Realistic, first 12 | No JSON constraint, no rules | 81.0% (strict) | 12/12 | 12/12 | – |
| v4 (Kaggle quick check) | Negotiation held-out, 12 | Same | 100% | 12/12 | 12/12 | – |
| v4 (Kaggle quick check) | CraigslistBargains held-out, 12 | Same | 100% | 12/12 | 12/12 | – |
| v3 + rules | Realistic, 36 | Pendrive, JSON constraint, rules | 56.1% / 60.6% | 100% | 75.0% | 5.6% / 11.1% |
| v3 | Realistic, 36 | Pendrive, JSON constraint | 54.2% / 58.7% | 100% | 75.0% | 5.6% / 8.3% |
| v3 | Realistic, 36 | MLX on Mac, no JSON constraint | 47.9% / 52.1% | 88.9% | 66.7% | 2.8% / 5.6% |
| v2 | Realistic, 36 | Recorded in manifest | 35.2% / 38.4% | 100% | 69.4% | 0.0% |
| v2 | Template, 300 | Recorded in manifest | – | 100% | 100% | 56.3% |
| v1 | Template, 100 | MLX on Mac | – | 100% | 100% | 31.0% |

Rows differ in test set and method, so compare only within the same test set. The full pendrive run (72.0%) is the number to quote; the Kaggle quick check skipped the constraint and the rules and used 12 chats.

### Rules engine (v3 on pendrive, 378 terms)

| Measure | Value |
|---|---|
| Terms right with no review needed | 57.4% |
| Model errors before the rules | 39.4% |
| Errors caught and sent to review | 71.8% |
| Errors not flagged | 11.1% |
| Correct terms wrongly flagged | 3.2% |
| Terms sent to a person to review | 31.5% |
| Terms changed by auto-repair | 9, of which 8 became correct |

### Bundled test chats (v4, observed 26 Oct)

| Chat | Deal type found | Stated / unclear / missing | Observation |
|---|---|---|---|
| 01 Hinglish supply | supply_order | 6 / 1 / 4 | Total of 4,750 is in the chat but was missed; "kal" correctly flagged unclear |
| 02 Kannada-English freelance | freelance | 5 / 1 / 4 | |
| 03 Price conflict | supply_order | 7 / 0 / 4 | No contradiction flagged; the chat ends on "40 is final", so this may be right. Needs a human check |
| 04 Complete deal | freelance | 8 / 0 / 2 | |
| 05 Everything vague | freelance | 3 / 3 / 4 | |
| 06 Trick message (injected instruction) | supply_order | 7 / 0 / 4 | |
| 07 Rent | freelance | 5 / 0 / 5 | Unsupported type forced into freelance |
| 08 No deal | freelance | 2 / 0 / 8 | False positive: casual chat treated as a deal |
| 09 WhatsApp export | supply_order | 7 / 1 / 3 | |

### Sample input and output: a live Hinglish test

**Input, typed by the team:**

```
[1] Priya: hii bhaiya
[2] Prakash Caterers: haan ji priya ji bolo
[3] Priya: mummy ka birthday hai 14 ko
[4] Priya: around 40 log honge
[5] Prakash Caterers: wah badhai ho
[6] Prakash Caterers: veg ya non veg?
[7] Priya: pure veg, paneer zaroor rakhna
[8] Prakash Caterers: 450 per plate padega
[9] Priya: thoda kam karo na, regular customer hu
[10] Prakash Caterers: chalo 420 kar dete hai aapke liye
[11] Priya: done, advance kitna
[12] Prakash Caterers: 5000 bhej do bas
[13] Priya: sent
```

**Output (v4, 2.0 s):**

```
DEAL TYPE: supply_order | model: veridoc-small-v4-Q8_0.gguf | 2.0s

Found in the chat:
  [OK] buyer            Priya             <- msg 1
  [OK] seller           Prakash Caterers  <- msg 2
  [OK] item             veg ya non veg?   <- msg 6
  [OK] unit_price       450               <- msg 8
  [OK] total_amount     5000              <- msg 12
  [UNCLEAR] advance_amount                <- msg 11: "advance kitna"

Not in the chat yet (ask about these): quantity, delivery_date,
balance_payment_date
```

**What this shows:** parties are right, and delivery date and balance date are correctly listed as missing. But four terms are wrong: the price should be the negotiated 420 (message 10), 5,000 is the advance rather than the total, the item should be veg catering, and "around 40" should be an unclear quantity. Catering is not one of the two trained deal types, and negotiated price changes are a known weakness. This is why every term carries its quote and a person confirms it.

### Edge cases tested

- Hinglish and Kannada-English in Latin script (chats 01, 02).
- Conflicting prices across messages (chat 03) and negotiated price changes (caterer test).
- Every term vague (chat 05).
- A message telling the model to ignore its instructions (chat 06); 236 training chats carry such injections.
- Unsupported deal type (chat 07) and a chat with no deal at all (chat 08).
- Real WhatsApp export format with timestamps (chat 09); macOS `._` metadata files on the drive (now skipped by the parser).

### Known failures

- Totals stated in the chat can be missed (chat 01).
- A casual chat with no deal is still read as a deal (chat 08).
- Unsupported deal types are forced into supply order or freelance (chat 07, caterer).
- The final negotiated price can lose to the first offer (caterer).
- Advance and total can be confused (caterer).
- Contradiction on chat 03 not flagged, pending a human check.
- Fully correct chats are rare: 2.8% strict, 16.7% lenient.

---

## 9. AI, data and external dependencies

### Model

| Item | Detail |
|---|---|
| Base model | Qwen/Qwen3-0.6B (606.1 million parameters), Apache 2.0 |
| Method | LoRA on all attention and MLP projections (q, k, v, o, gate, up, down), rank 16, alpha 32, dropout 0.05 |
| Trainable parameters | 10,092,544 (1.67%) |
| Training | 1 epoch, 405 optimiser steps, learning rate 2e-4 with cosine schedule and 3% warm-up, 2 per step × 8 accumulation = 16 chats per update, fp16, max length 2,048 tokens |
| Output | Adapter merged into the model, exported to GGUF and quantised to 8-bit (`veridoc-small-v4-Q8_0.gguf`) |
| Runtime | llama.cpp `llama-server` b11869 on the pendrive |

### Training curve

Validation loss fell from **0.0061 to 0.0004** and stayed below training loss (v4 fine-tune, 405 steps, 1 epoch, one Kaggle T4 GPU, 54 min 20 s; Kaggle notebook training log, 25 Oct 2026).

| Training step | Training loss (approx.) | Validation loss (approx.) |
|---|---|---|
| 100 | 0.013 | 0.0061 |
| 200 | 0.0043 | 0.0018 |
| 300 | 0.0044 | 0.0005 |
| 400 | 0.0022 | 0.0004 |

Loss measures the answer format too, so it is not an accuracy figure; accuracy is in section 8. *(Intermediate values are read off the report's chart and are approximate.)*

### Workflow and prompt

The model is trained on the answer only: the prompt tokens are masked out of the loss, and the training prompt matches what `llama-server` sends at run time. The prompt holds the numbered chat messages and asks for the deal terms; the answer is JSON with, for each term, the value, the quoted words, the message number and a status. At run time a JSON grammar restricts the model to that schema, and the rules engine checks the answer before anything is shown.

### Training data

| Source | Chats | Real or synthetic |
|---|---|---|
| Template chats (English, Hinglish, Kannada-English), from the team's generator `gen_dataset.py` | 3,000 | Synthetic |
| Realistic WhatsApp-style exports (120, each used 4 times) | 480 | Synthetic |
| Negotiation chats from `gen_negotiation.py`: seller speaks first, offer vs agreed price, no agreement, kg/gram/dozen | 1,500 | Synthetic |
| CraigslistBargains buyer–seller negotiations, converted to VeriDoc format | 1,500 | Real (US English) |
| **Total** | **6,480** | |

Held out from training: 36 realistic, 150 negotiation, 100 CraigslistBargains and 150 validation chats. In the template set, 294 of the 300 test chats use wording held out of training, and 236 training chats contain injected instructions the model learns to ignore. No public labelled dataset of Indian WhatsApp deal chats was found, which is why most data is synthetic.

The Kaggle Olist e-commerce dataset is stored on the pendrive as reference material only; it is not used in training or by the code.

### Libraries, tools and services

| Dependency | Used for | Licence |
|---|---|---|
| Qwen3-0.6B (Alibaba Qwen team) | Base model | Apache 2.0 |
| llama.cpp (ggml-org) | Inference, GGUF conversion, JSON grammar | MIT |
| PyTorch, Hugging Face transformers 5.20.2, PEFT, accelerate | Fine-tuning | BSD-3, Apache 2.0 |
| python-build-standalone (Astral) | Portable Python 3.12.15 on the pendrive | PSF and bundled licences |
| Python standard library | All engine application code | PSF |
| Kaggle Notebooks (T4 GPU) | Training only; not used at run time | Kaggle terms |
| CraigslistBargains (He et al., 2018, Stanford) | 1,500 training chats | Listed as unknown on Hugging Face; used for a research and hackathon demo |

At run time the engine uses no external API, cloud service or network connection. The application's own dependencies (Next.js, PostgreSQL, MinIO, Polygon Amoy and others) are listed in `TECH_STACK.md`.

### Attribution of AI assistance

AI coding assistants (Claude, by Anthropic) were used to help write code, launchers, the nine test chats and documentation. The team reviewed, ran and tested the results. **[to confirm]** Team to list any other AI tools used.

---

## 10. User interface and demonstration

The engine's interface is the terminal, plus the local API that the team's own frontend calls. The earlier built-in browser page was removed from the pendrive so the drive holds only the engine and the model. Section 8 shows a real terminal session (the caterer test). The web application in this repository is a separate interface (Chat terms, Recap and the evidence vault); its click-by-click demo is in `DEMO_RUNBOOK.md`.

### Example workflows

**A. Check a chat someone sent you.** Export the WhatsApp chat as a `.txt` file and run:

```bash
<python> app/veridoc_extract.py --root "$(pwd)" --chat "WhatsApp Chat.txt"
```

The terminal prints the numbered chat, the deal type, each term found with its source message, the unclear terms, and the list of terms to ask about.

**B. Chat live and watch the deal form.** Open three terminal windows in the `VeriDoc` folder:

```bash
# window 1 and window 2: each person types as themselves
<python> app/veridoc_live.py --root "$(pwd)" --as Raju
<python> app/veridoc_live.py --root "$(pwd)" --as Meena

# window 3: the deal sheet, refreshed after every message
<python> app/veridoc_live.py --root "$(pwd)" --watch
```

**C. Use it from the frontend.** Start the engine with the launcher, then send the chat to the local API:

```bash
curl http://127.0.0.1:8765/api/health
curl -X POST http://127.0.0.1:8765/api/analyse \
  -H "Content-Type: application/json" \
  -d '{"text": "Raju: 200 shirts at 480 each ok?\nMeena: ok, delivery next week", "me": "Meena"}'
```

### Demonstration script (about four minutes, Wi-Fi off)

| Time | Step | What the audience sees |
|---|---|---|
| 0:00 | The problem | The shirt-deal chat: vague delivery, no payment date |
| 0:30 | Offline start | Wi-Fi off, pendrive in, one double-click |
| 0:50 | Analysis | Terms appear with their source messages; delivery flagged unclear; balance date listed as missing |
| 1:50 | Live chat | Two windows type the deal; the deal sheet fills in as they chat |
| 3:00 | Hard case | A Hinglish chat and a chat with a price conflict |
| 3:40 | Close | "A promise made in chat should be a promise you can prove." |

Demo data on the pendrive: `data/samples/shirt-deal.txt`, nine test chats in `data/samples/tests/`, and six realistic chats in `data/demo_chats/`.

---

## 11. Limitations and incomplete work

### Demonstrated vs planned

| Item | State | Notes |
|---|---|---|
| Offline analysis from the pendrive (terminal) | **Demonstrated** on macOS (Apple Silicon) | Tested 26 Oct on the bundled and live chats |
| Local API (`/api/health`, `/api/analyse`) | **Demonstrated** on macOS | Same laptop only |
| Live two-person chat with watching deal sheet | **Demonstrated** on macOS | |
| Windows and Linux runtimes | **Packaged, not tested** | Launchers, portable Python and Vulkan/CPU engines are on the drive but have not been run on those machines |
| Engine connected to the application in this repository | **Not done** | The application runs on recorded model output until the model adapter is implemented |
| Deal types beyond supply orders and freelance work | **Not supported** | Rent, catering and others are forced into one of the two |
| "Not a deal" detection | **Not built** | A casual chat is still read as a deal |
| Receipt in the engine: hashing, version chain, offline verification | **Planned, not built** | The application's vault provides hashing, chain and anchoring; its public check needs a Polygon RPC |
| Suggested reply, recap and one-tap confirmation in the engine | **Planned, not built** | Built in the application (fixed templates, English and Hindi draft, echo code) |
| Kannada recap | **Not built** | |
| Evidence Strength score | **Planned, not built** | Shown only as a concept screen |
| Voice notes (speech to text) | **Not built in the engine** | Only transcript files are read. The application imports voice notes with recorded transcripts; real speech recognition is a stub |
| Encrypted vault on the pendrive | **Not built** | Chats on the drive are not encrypted today |
| Graphical interface on the pendrive | **Removed by design** | The team's own frontend calls the local API |

### Accuracy limits

- 72% of terms correct, but only 2.8% of realistic chats fully correct (16.7% lenient): VeriDoc is a checker that shows what to confirm, not a system that reads chats perfectly.
- The headline figure comes from 36 test chats that are synthetic, WhatsApp-style. Only CraigslistBargains is real human conversation, and it is US English. Treat 72% as a target until it is measured on real Indian chats.
- Weaker on casual Hinglish, retail chats and negotiated price changes (see the caterer test in section 8).
- English, Hinglish and Kannada-English in Latin script only; Devanagari or Kannada script is not trained.
- The small model reads about 2,000 tokens at once, roughly 40–60 short messages.
- The deal-type classifier improvement (75% to an estimated 94% on realistic chats) was checked offline only, not end to end.

---

## 12. Real-world viability and impact

### Intended users and practical benefits

Small suppliers, shops, freelancers, tutors, contractors and landlords who agree deals on WhatsApp. India has **8.8 crore+ enterprises** on Udyam platforms (June 2026), including **3.21 crore informal micro units**, and gig and platform workers are projected to grow from **1.2 to 2.35 crore by 2029–30**. For them VeriDoc:

- shows the missing terms while the deal can still be fixed, without asking for a contract;
- records which message each term came from, which helps if a dispute reaches an MSME council;
- costs nothing per use and needs no internet, account or installation.

### Feasibility

The model file is under 1 GB and runs on an ordinary laptop CPU; on a MacBook it answers in about 2 seconds. The engine's application code needs only the Python standard library, and the drive carries its own Python and inference engine, so nothing has to be installed on the host computer. All of this works today on macOS.

### Scalability

Each laptop runs its own copy, so there is no server to scale and no cost per user. Copying the drive is the distribution model. Supporting new deal types needs a new playbook and more training data, not new infrastructure. Larger model tiers (1.7B, 4B) are already defined in `config/models.json` for laptops with more memory.

### Security and privacy

- Chats never leave the laptop: no network calls at run time.
- The engine listens on `127.0.0.1` only and refuses requests from other hosts and from other websites' pages.
- No accounts, API keys or credentials exist anywhere in the engine.
- **Risk:** a lost pendrive exposes any chats saved on it. An encrypted vault (AES-GCM with a passphrase) is planned.

### Risks

| Risk | Mitigation |
|---|---|
| The model extracts a wrong term and the user relies on it | Every term shows its quote; rules flag 71.8% of errors; a person confirms each term |
| Users read the tool as legal advice | Stated clearly: a record-keeping aid, not legal advice; no verdict prediction |
| Edited or fake chats | VeriDoc cannot detect a fake chat. The record proves it is unchanged after it was saved, not that the original chat was genuine |
| Unsigned binaries blocked by macOS or Windows | Launcher clears the macOS quarantine flag; Windows shows a one-time "Run anyway" prompt |

### Financial and legal limitations

- **Business model (proposed):** free offline version for individuals; a paid team version with encrypted sync and shared deal history; an optional paid expert review by a CA or lawyer. Pricing to be set after user validation.
- **Legal grounding:** chat contracts are valid (Contract Act s.10, IT Act s.10A). A court copy of a chat still needs a BSA s.63 certificate, which VeriDoc does not produce. The integrity record in the application is explicitly a draft and not a legal certificate; a lawyer must check it before any legal use.
- **Licences:** Qwen3 (Apache 2.0) and llama.cpp (MIT) allow commercial use. The CraigslistBargains licence is listed as unknown, so the model would need retraining without it, or permission, before commercial release.

---

## 13. Future scope

### What the team would build next

1. **Connect the engine to the application:** implement the model adapter so the application's terms, flags and recap run on the real model instead of recorded output.
2. **Engine receipt:** hash each confirmed record and its versions into a local SQLite file, with an offline verification page.
3. **Suggested reply and one-tap confirmation** in the engine, and a recap both sides confirm.
4. **Recap in Hindi and Kannada,** with native-speaker review.
5. **Test and fix Windows and Linux** on real machines, so the same drive works on all three.
6. **More deal types and a "not a deal" class,** starting with rent, catering and services.
7. **Encrypted vault** for chats saved on the pendrive.
8. **Voice notes:** on-device speech to text, including Hindi.

### Improvements needed

- Collect and label real Indian deal chats (with consent) and measure accuracy on them; the current test set is synthetic.
- More training on negotiated prices, advance vs total, and casual Hinglish, where v4 still fails.
- Try the 1.7B model tier on laptops with enough memory.
- Retrain without CraigslistBargains, or get permission, before any commercial use.

### Required for real-world deployment

- Signed binaries for macOS and Windows so the launchers open without security prompts.
- User validation: interview about 20 traders, tutors and freelancers; success means most would send VeriDoc's recap unchanged.
- Accuracy targets met on real chats (term extraction 85%+, missing-term recall 90%+).
- Plain-language disclaimers and a privacy notice; legal review of how the record is presented.
- Distribution through trade associations, MSME facilitation centres, legal-aid clinics and freelancer communities.

---

## 14. Setup and reproducibility

### Requirements

- A laptop with macOS on Apple Silicon (tested), or 64-bit Windows or Linux (packaged, untested); 8 GB RAM is enough for the 0.6B model.
- The VeriDoc pendrive (exFAT). Nothing needs to be installed; no internet connection is needed at any point.

The application in this repository has its own setup (Node.js, Docker, Python virtual environment); see `README.md`.

### What is on the pendrive

```
VeriDoc/
  Start VeriDoc.command      macOS launcher
  Start VeriDoc.bat          Windows launcher
  start-veridoc.sh           Linux launcher
  app/                       Python code (parser, rules, server, terminal tools)
  config/                    models.json (model tiers), playbooks/ (deal types)
  runtime/
    mac-arm64/               llama.cpp for macOS (Metal)
    win-x64/vulkan, cpu/     llama.cpp for Windows
    linux-x64/vulkan, cpu/   llama.cpp for Linux
    python/                  portable Python 3.12 for each OS
  data/
    samples/                 shirt-deal.txt and tests/ (9 test chats)
    demo_chats/              6 realistic chats
    training/                train.jsonl (3,000 rows), train.meta.jsonl, report.json
  web/app.html               placeholder the server expects
```

The model file `veridoc-small-v4-Q8_0.gguf` is on the drive at the path listed in `config/models.json`.

### Commands

Run from the `VeriDoc` folder. `<python>` is `runtime/python/mac-arm64/bin/python3` on macOS, `runtime/python/linux-x64/bin/python3` on Linux, or `runtime\python\win-x64\python.exe` on Windows.

| To do | Command |
|---|---|
| Start the engine (macOS) | `./"Start VeriDoc.command"` or double-click it |
| Start the engine (Windows) | double-click `Start VeriDoc.bat` |
| Start the engine (Linux) | `bash start-veridoc.sh` |
| Check the engine | `curl http://127.0.0.1:8765/api/health` |
| Analyse a chat file | `<python> app/veridoc_extract.py --root "$(pwd)" --chat data/samples/shirt-deal.txt` |
| Analyse pasted text | `<python> app/veridoc_extract.py --root "$(pwd)" --paste` |
| JSON output | add `--json` |
| Chat live as one person | `<python> app/veridoc_live.py --root "$(pwd)" --as <Name>` |
| Watch the deal sheet | `<python> app/veridoc_live.py --root "$(pwd)" --watch` |

**First run on macOS:** if the system blocks the launcher, right-click it and choose Open. On zsh, run `setopt NO_BANG_HIST` before pasting chats that contain `!`. After copying files from a Mac, run `dot_clean -m /Volumes/<drive>` to remove `._` files.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VERIDOC_CPU_ONLY` | No | Set to `1` to force the CPU engine instead of Vulkan |
| `PYTHONUTF8` | No | Set to `1` by the Windows launcher so chats with emoji read correctly |

No API keys, secrets or test credentials exist in the engine: it has no accounts and no online services.

### Reproducing the model

1. Generate the data with `app/gen_dataset.py` and `gen_negotiation.py`, and convert CraigslistBargains with the notebook's first step.
2. Upload `train_base.jsonl`, `valid.jsonl`, `realistic_test.jsonl`, `nego_test.jsonl` and `people.json` to Kaggle as a dataset.
3. In the notebook "VeriDoc v4: fine-tune Qwen3-0.6B on Kaggle", set Accelerator to GPU T4 and Internet on, add the dataset, and Run All (about 30–60 minutes; seed 20261025).
4. Download `veridoc_v4_hf.zip`, convert to GGUF with llama.cpp's `convert_hf_to_gguf.py` at Q8_0, and place the file on the drive.
5. Score it with `evaluate.py` on the 36 realistic chats, and keep it only if it beats the current model.

---

## 15. Team contributions and references

### Team contributions

| Member | Role | Contribution |
|---|---|---|
| Akash Kumar Gupta | [to confirm] | Author of this report; [to confirm] |
| Hardik Singh (HARDIKSINGH150206) | [to confirm] | Author of this repository (the application and evidence vault) |
| Abhishek (absksync) | [to confirm] | Trained the local model; the weights are not in the repository |
| Samanway (notorious1337), Jhashank (NYN-05) | [to confirm] | Built part of the earlier Python version, which is reference only |

DigiVault's original authors are listed in `PRIOR_WORK.md`. **[to confirm]** The team to correct names, roles and contributions in this table.

### References

**Problem and law**
- GAME–FISME, *Delayed Payments Report 3.0* (MSME delayed payments, March 2024)
- Ministry of MSME, MSME Samadhaan portal (pending cases, December 2025) and Udyam registration data (June 2026)
- Lok Sabha unstarred question AU2328 (2023), MSE Facilitation Council rejections
- Meta and Statista, WhatsApp users and small-business use in India
- NITI Aayog (2022) and Economic Survey 2025–26, gig and platform workforce
- PayPal (2018), freelancer payment survey
- Indian Contract Act 1872 s.10; Information Technology Act 2000 s.10A; Bharatiya Sakshya Adhiniyam 2023 s.61–63; MSMED Act 2006 s.15–16

**Models, data and software**
- Qwen3-0.6B, Qwen team, Alibaba
- llama.cpp, ggml-org
- CraigslistBargains, He et al., 2018, *Decoupling Strategy and Generation in Negotiation Dialogues*, Stanford
- python-build-standalone, Astral
- Hugging Face transformers and PEFT
- Brazilian E-Commerce Public Dataset by Olist, Kaggle (reference only)

**Comparable products** (public websites, October 2026): Pakka AI, Chat2Contract, ThreadRecap, ProofSnap, Defellix, Riffit, Handshake.

*All accuracy and training figures come from the team's own evaluation runs (`evaluate.py`, the model manifest and the Kaggle notebook) on 25–26 October 2026.*
