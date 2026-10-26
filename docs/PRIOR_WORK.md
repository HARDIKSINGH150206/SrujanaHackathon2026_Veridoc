# Prior work and third-party material

This document states what VeriDoc reuses, what was built for the event, and what comes from outside. It is the disclosure required for the hackathon.

## 1. DigiVault (imported with approval)

This repository starts from DigiVault, our own earlier project, written before the hackathon (repo: https://github.com/HARDIKSINGH150206/digivault-BFB).
The organiser approved reusing it on 25 Oct 2026. Organiser name: the organisers of Srujana Hackathon (individual name to be added). Written confirmation: to be attached.

**Imported:** the DigiVault code as of the import commit (`e3a0496`), without its Git history: hash chain, salted Merkle trees and proof format, anchoring (MinIO Object Lock and the Polygon Amoy contract `EvidenceAnchorV2.sol`, deployed 26 Sep and 18 Oct 2026, before the event), role-based access with step-up authentication, insert-only audit trail, redaction engine and suggestion tiles, link sharing, public verify page.

**Original authors:** hardik.

## 2. Built during the event (this repository)

Everything needed to turn the vault into VeriDoc (problem LS-06): chat and voice-note import, term extractor with source links, seven ambiguity flags, chat recommendation, plain-language recap (English and a Hindi draft) with echo code, recap PDF, chat record PDF, draft integrity record, model adapter, model manifest check, settings, demo badge, synthetic samples and the rewritten documents. The commit history after the import commit shows this work. `docs/TRIM_PLAN.md` lists what was kept, renamed and removed.

## 3. The offline engine (separate codebase)

The team also built an offline engine: a fine-tuned small model, a rules engine, terminal tools, a local API and the pendrive packaging (`docs/PROJECT_REPORT.md`). It is **not in this repository** and is not yet connected to it. The idea was presented in the idea round under the working name *Vachan*; it is the same product.

| Item | Status |
|---|---|
| Model training, data generator, evaluation, engine code and packaging | Separate codebase; which parts fall inside the hackathon window is **[to confirm]** |
| Model weights | Never committed here (`models/*`, `*.gguf` are git-ignored) |
| Connection to this application | Not done; planned through `LocalModelAdapter` (ADR-042) |

## 4. Third-party material

| Material | Used for | Licence |
|---|---|---|
| Qwen3-0.6B (Alibaba Qwen team) | Base model of the engine | Apache 2.0 |
| llama.cpp (ggml-org) | Inference, GGUF export, JSON grammar | MIT |
| PyTorch, Hugging Face transformers and PEFT | Fine-tuning | BSD-3 / Apache 2.0 |
| python-build-standalone (Astral) | Portable Python on the drive | PSF and bundled licences |
| CraigslistBargains (He et al., 2018) | 1,500 of 6,480 training chats | Listed as unknown; research and demo use only (ADR-046) |
| Brazilian E-Commerce Public Dataset by Olist (Kaggle) | Reference only, not used in training or code | Per Kaggle |
| Kaggle Notebooks (T4 GPU) | Training only | Kaggle terms |
| Application libraries (Next.js, Prisma, MinIO client, pdf-lib, FastAPI and others) | This repository | See `docs/TECH_STACK.md` |

## 5. Earlier Python version

An earlier Python version of the idea was started by Samanway (notorious1337) and Jhashank (NYN-05). It is reference only; its code is not part of this repository.

## 6. AI assistance

AI coding assistants (Claude, by Anthropic) helped write code, tests and documents. The team reviewed and tested the results. **[to confirm]** Any other AI tools used.
