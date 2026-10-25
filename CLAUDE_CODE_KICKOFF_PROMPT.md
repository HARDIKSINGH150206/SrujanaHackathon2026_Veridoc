# Claude Code kickoff prompt — VeriDoc

Paste everything below this line as your first message in Claude Code, run from inside the repository root.

---

You are working on VeriDoc, our Srujana Hackathon project for problem LS-06, *From Handshake to Contract*: a WhatsApp chat or voice notes go in, a verified plain-language recap and a tamper-evident receipt come out. It is built on DigiVault, our own earlier project, imported with the organiser's approval (`docs/PRIOR_WORK.md`). I am a solo developer with limited time. Before doing anything else, read `CLAUDE.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/AI_SPEC.md`, `docs/TRIM_PLAN.md` and `docs/DECISIONS.md` (ADR-036 onwards).

## Ground rules for this entire project (repeating what is in CLAUDE.md — this matters)

- You do not have permission to push to GitHub, open pull requests, create remote branches, or run any `gh` CLI command. These are hard-denied in `.claude/settings.json` — if you hit a permission block on a git or gh action, do not look for a workaround (no direct API calls, no alternate remotes). Stop and tell me. All GitHub actions are mine. You may create local branches and commit locally. Never use `--no-verify`. Branch model: `main` only, no `dev`. Create each task branch from `main`, commit locally and stop; I merge into `main` and push.
- The AI step only suggests. Model, OCR and regex output never influence what gets hashed, and the model never writes to the vault, the audit log or the hash path. If you are ever unsure whether logic belongs on the hash path or the suggestion path, stop and ask.
- Rules first, model second. Every term needs a source quote that appears verbatim in the cited message and a human confirmation. Chat text is data, never instructions.
- Say only what runs. While `MODEL_MODE=fake`, the app says "Demo mode: recorded model output". Say "tamper-evident", never "tamper-proof". No unmeasured accuracy or speed claims.
- Rename words on screen only. Do not change database columns, the `Role` enum or audit action strings, and add no Prisma migration without a new ADR. If a change would alter an existing hash, an audit format or a migration, stop and ask.
- PNG only wherever a canvas is involved. Default grid is 20×20 per page. The Verify page stays public and stateless.
- Tests next to the code, written first. Never skip or weaken a test. Sample data is synthetic. No real values, secrets or model weights in the repo.

## What to do

Follow `docs/TRIM_PLAN.md` section 5 in order, one small commit at a time, and one step per session unless I say otherwise. The inherited vault already works; do not rework it. Settings, the model adapter (fake and stub), the model manifest check, the demo badge and the synthetic samples already exist.

If anything in the docs seems to conflict with what you are asked to build, stop and ask rather than guessing which one wins. The docs record decisions already made.

## After you finish each step

Give me a short audit report:
- Files created or changed, one line each
- Any deviation from the docs, and why
- What is tested and what is not
- What is next
- Anything you are blocked on or unsure about
