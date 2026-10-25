# DigiVault archive

These are the **pre-event DigiVault documents**: written for DigiVault, our earlier project, before the hackathon (`docs/PRIOR_WORK.md`, ADR-036). They were moved here unchanged when the project became VeriDoc. Their police, court and victim wording is original and does not apply to VeriDoc.

They are kept because they still describe the inherited vault and redaction engine accurately.

| File | What it is |
|---|---|
| `01-problem-and-novelty.md` | DigiVault's original problem statement and legal context |
| `04-api-spec.md` | The REST API contract of the vault (still the reference for the upload, proof, anchor, redaction and share routes) |
| `05-demo-golden-path.md` | DigiVault's scripted demo and its accounts, seeds and gas figures |
| `06-frontend-agent-plan.md` | The brief used to build the original UI |
| `07-v2-build-plan.md` | DigiVault's v2 build plan and phase status |
| `08-redaction-recall.md` | Measured redaction recall and precision on synthetic forms |
| `DEVELOPMENT.md` | The developer guide: setup, commands, database and contract changes, troubleshooting. The VeriDoc README links here for setup details |

Still in `docs/` and still current: `02-architecture-and-dataflow.md` and `03-crypto-and-merkle-spec.md` (the integrity references), `DECISIONS.md` (ADR-001 to 035 are DigiVault origin), and the VeriDoc documents (`PRD.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `AI_SPEC.md`, `TRIM_PLAN.md`, `DEMO_RUNBOOK.md`, `PRIOR_WORK.md`).

Code comments and scripts elsewhere in the repository still cite these files by their old paths (for example `docs/07 Phase 6` or `docs/04`). Read those as `docs/digivault-archive/...`. They were not changed because this move touched documentation only.
