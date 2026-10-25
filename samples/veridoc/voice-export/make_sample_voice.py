"""Makes PTT-20260315-WA0001.wav and prints its recorded transcript.

The "voice" is ffmpeg's flite text-to-speech, not a person: no real voice is
used. Each sentence is synthesised on its own so its start and end time in the
clip is exact. The transcript in apps/ai-service/recorded/transcripts.json is
written from the same sentences; it is recorded, not produced by speech
recognition. Needs ffmpeg built with libflite. Standard library otherwise.

    python3 make_sample_voice.py
"""

import hashlib
import json
import subprocess
import tempfile
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "PTT-20260315-WA0001.wav"
RATE = 16000
GAP_MS = 400
# (what the voice says, what the recorded transcript shows)
SENTENCES = [
    ("Dev, small correction.", "Dev, small correction."),
    ("The price is fifty rupees per piece.", "The price is 50 rupees per piece."),
]


def synth(text: str, path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"flite=text='{text}':voice=slt",
         "-ar", str(RATE), "-ac", "1", "-c:a", "pcm_s16le", str(path)],
        check=True,
    )


def main() -> None:
    frames = bytearray()
    segments = []
    with tempfile.TemporaryDirectory() as d:
        for spoken, shown in SENTENCES:
            clip = Path(d) / "clip.wav"
            synth(spoken, clip)
            with wave.open(str(clip)) as w:
                data = w.readframes(w.getnframes())
            start = len(frames) // 2 * 1000 // RATE
            frames += data
            end = len(frames) // 2 * 1000 // RATE
            segments.append({"start_ms": start, "end_ms": end, "text": shown})
            frames += b"\x00\x00" * (RATE * GAP_MS // 1000)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()
    print(json.dumps({"audio_sha256": digest, "name": OUT.name, "segments": segments}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
