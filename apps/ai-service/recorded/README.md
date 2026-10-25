# Recorded model output

Replayed by `FakeModelAdapter` when `MODEL_MODE=fake`. Hand-written to look like
real model output, for the two sample chats in `samples/veridoc/` only. Keyed by
playbook id and the SHA-256 of the numbered chat, so editing a chat makes its
recording stop matching (on purpose).

Each recording's `output` is in the model's own format:

    {"terms": {key: {"status": "stated|unclear|contradicted|missing",
                     "value": str | null, "quote": [str], "msg": [int], "reason": str}}}

`quote[i]` is text copied from message `msg[i]` (1-based position in the numbered chat).

Two planted mistakes, pinned by `tests/test_model_adapter.py`:
- `supply-order`: `unit_price` is recorded as `54`. The quote ("₹45 per piece") is real and
  in the cited message; the value does not follow from it. Only a value-versus-quote check catches it.
- `freelance-job`: `advance` is recorded as `missing`, although messages 4 to 6 state it.

The UI shows "Demo mode: recorded model output" while this is in use.

## Voice note sample

`samples/veridoc/voice-export/` has a third recording: the text says ₹45 per piece
(message 1) and the voice note says 50 rupees per piece (message 3), so the model
output marks `unit_price` as `contradicted`, quoting both. The voice note's
transcript is itself recorded (`transcripts.json`, keyed by the SHA-256 of the
audio file); no speech recognition ran. While `TRANSCRIBER_MODE=fake` the app says
"recorded transcript".
