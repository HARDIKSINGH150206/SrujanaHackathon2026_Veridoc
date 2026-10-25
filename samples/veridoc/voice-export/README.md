# Sample export folder with a voice note

A WhatsApp export folder, as WhatsApp writes it: the chat text and the voice note
it refers to. **Everything is synthetic.**

- `WhatsApp Chat with Kavi.txt`: four messages. Message 3 is the voice note
  (`<attached: PTT-20260315-WA0001.wav>`).
- `PTT-20260315-WA0001.wav`: about 5 seconds of speech made by **ffmpeg's flite
  text-to-speech engine**, not by a person. No real voice is used. Regenerate with
  `make_sample_voice.py` (needs ffmpeg built with libflite).
- **The transcript is recorded, not speech.** It is written by hand from the two
  sentences the engine speaks and kept in `apps/ai-service/recorded/transcripts.json`,
  keyed by the SHA-256 of the audio file. No speech recognition ran. While
  `TRANSCRIBER_MODE=fake` (the default) the app says "recorded transcript".

What the sample is for: the text says **₹45** per piece (message 1) and the voice
note says **50 rupees** per piece (message 3), so the price is a text-versus-voice
contradiction.
