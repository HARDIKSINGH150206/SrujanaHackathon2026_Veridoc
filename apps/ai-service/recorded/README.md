# Recorded model output

Replayed by `FakeModelAdapter` when `MODEL_MODE=fake`. Hand-written to look like
real model output, for the two sample chats in `samples/veridoc/` only. Keyed by
playbook id and the SHA-256 of the numbered chat, so editing a chat makes its
recording stop matching (on purpose).

Two planted mistakes, pinned by `tests/test_model_adapter.py`:
- `supply-order`: the price per notebook is recorded as 54; the chat says 45.
- `freelance-job`: the advance is missing.

The UI shows "Demo mode: recorded model output" while this is in use.
