import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from app.settings import settings_from_env
from app.transcriber import (
    FakeTranscriber,
    LocalTranscriber,
    Segment,
    Transcriber,
    TranscriptNotFound,
    build_transcriber,
)

SAMPLE = Path(__file__).resolve().parents[3] / "samples" / "veridoc" / "voice-export"
AUDIO = (SAMPLE / "PTT-20260315-WA0001.wav").read_bytes()


class FakeTranscriberTests(unittest.TestCase):
    def setUp(self):
        self.t = FakeTranscriber()

    def test_satisfies_the_interface(self):
        self.assertIsInstance(self.t, Transcriber)

    def test_replays_the_recorded_transcript_of_the_sample_voice_note(self):
        segments = self.t.transcribe(AUDIO, "PTT-20260315-WA0001.wav")
        self.assertEqual([s.text for s in segments], ["Dev, small correction.", "The price is 50 rupees per piece."])
        self.assertTrue(all(isinstance(s, Segment) for s in segments))

    def test_spans_are_in_milliseconds_ordered_and_inside_the_clip(self):
        segments = self.t.transcribe(AUDIO, "x.wav")
        self.assertEqual(segments[0].start_ms, 0)
        for a, b in zip(segments, segments[1:]):
            self.assertLess(a.start_ms, a.end_ms)
            self.assertLessEqual(a.end_ms, b.start_ms)
        self.assertLessEqual(segments[-1].end_ms, 5130)  # the clip is 5.13 s

    def test_it_is_keyed_by_the_audio_bytes_not_the_name(self):
        self.assertEqual(self.t.transcribe(AUDIO, "renamed.wav"), self.t.transcribe(AUDIO, "PTT-20260315-WA0001.wav"))

    def test_unknown_audio_is_an_error_not_a_guess(self):
        with self.assertRaises(TranscriptNotFound):
            self.t.transcribe(AUDIO + b"x", "PTT-20260315-WA0001.wav")

    def test_the_recorded_hash_matches_the_sample_file(self):
        data = json.loads((Path(__file__).resolve().parents[1] / "recorded" / "transcripts.json").read_text(encoding="utf-8"))
        self.assertEqual(data["transcripts"][0]["audio_sha256"], hashlib.sha256(AUDIO).hexdigest())

    def test_a_malformed_recording_file_is_refused_at_load(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "t.json"
            for bad in ({}, {"transcripts": [{"audio_sha256": "x", "segments": [{"start_ms": 5, "end_ms": 1, "text": "a"}]}]},
                        {"transcripts": [{"audio_sha256": "x", "segments": [{"start_ms": 0, "end_ms": 1}]}]}):
                f.write_text(json.dumps(bad), encoding="utf-8")
                with self.assertRaises(ValueError, msg=bad):
                    FakeTranscriber(f)


class LocalTranscriberStubTests(unittest.TestCase):
    def test_raises_a_clear_not_implemented_error(self):
        with self.assertRaises(NotImplementedError) as ctx:
            LocalTranscriber().transcribe(AUDIO, "x.wav")
        self.assertIn("faster-whisper", str(ctx.exception))
        self.assertIn("TRANSCRIBER_MODE=fake", str(ctx.exception))


class BuildTranscriberTests(unittest.TestCase):
    def test_fake_is_the_default(self):
        self.assertIsInstance(build_transcriber(settings_from_env({})), FakeTranscriber)

    def test_local_builds_the_stub(self):
        self.assertIsInstance(build_transcriber(settings_from_env({"TRANSCRIBER_MODE": "local"})), LocalTranscriber)


if __name__ == "__main__":
    unittest.main()
