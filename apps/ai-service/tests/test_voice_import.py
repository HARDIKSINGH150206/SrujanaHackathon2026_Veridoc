import base64
import hashlib
import unittest
import wave
from pathlib import Path

from app.chat_import import (
    AUDIO_EXTENSIONS,
    attachment_name,
    format_numbered,
    import_export,
    parse_chat,
)
from app.model_adapter import FakeModelAdapter
from app.playbooks import load_playbook
from app.term_extractor import extract_terms
from app.transcriber import FakeTranscriber, LocalTranscriber

SAMPLE = Path(__file__).resolve().parents[3] / "samples" / "veridoc" / "voice-export"
CHAT = (SAMPLE / "WhatsApp Chat with Kavi.txt").read_text(encoding="utf-8")
NAME = "PTT-20260315-WA0001.wav"
AUDIO = (SAMPLE / NAME).read_bytes()
FILES = {NAME: AUDIO}
TRANSCRIPT = "Dev, small correction. The price is 50 rupees per piece."


def imported(files=None, transcriber=None, **kw):
    return import_export(CHAT, FILES if files is None else files, transcriber or FakeTranscriber(), **kw)


class AttachmentNameTests(unittest.TestCase):
    def test_audio_attachments_in_both_export_styles(self):
        for text, want in (
            ("<attached: PTT-20260315-WA0001.opus>", "PTT-20260315-WA0001.opus"),
            ("PTT-20260315-WA0001.opus (file attached)", "PTT-20260315-WA0001.opus"),
            ("<attached: 00000012-AUDIO-2026-03-15-11-02-10.m4a>", "00000012-AUDIO-2026-03-15-11-02-10.m4a"),
            ("<attached: note.wav>", "note.wav"),
            ("<attached: NOTE.WAV>", "NOTE.WAV"),
        ):
            self.assertEqual(attachment_name(text), want, text)

    def test_only_opus_m4a_and_wav(self):
        self.assertEqual(AUDIO_EXTENSIONS, (".opus", ".m4a", ".wav"))
        for text in ("<attached: photo.jpg>", "<attached: doc.pdf>", "<attached: x.mp3>", "hello", "<Media omitted>", "see note.wav please", "<attached: noext>"):
            self.assertIsNone(attachment_name(text), text)

    def test_a_name_with_a_path_is_refused(self):
        for text in ("<attached: ../secret.wav>", "<attached: a/b.wav>", "<attached: a\\b.wav>", "<attached: /etc/x.opus>"):
            self.assertIsNone(attachment_name(text), text)


class ImportExportTests(unittest.TestCase):
    def setUp(self):
        self.result = imported()
        self.messages = self.result.messages

    def test_the_voice_note_is_one_numbered_message_among_the_others(self):
        self.assertEqual([m.n for m in self.messages], [1, 2, 3, 4])
        self.assertEqual([m.kind for m in self.messages], ["message", "message", "voice", "message"])
        self.assertEqual(self.messages[2].sender, "Kavi")

    def test_its_text_is_the_transcript(self):
        self.assertEqual(self.messages[2].text, TRANSCRIPT)

    def test_numbered_line_is_marked_as_a_voice_note(self):
        self.assertEqual(format_numbered(self.messages).splitlines()[2], f"[3] Kavi: (voice note) {TRANSCRIPT}")

    def test_it_keeps_the_spans_and_message_start_and_end(self):
        m = self.messages[2]
        self.assertEqual([(s.start_ms, s.end_ms) for s in m.voice.segments], [(0, 1820), (2220, 4730)])
        self.assertEqual((m.start_ms, m.end_ms), (0, 4730))

    def test_the_audio_is_hashed_from_its_raw_bytes(self):
        v = self.messages[2].voice
        self.assertEqual(v.sha256, hashlib.sha256(AUDIO).hexdigest())
        self.assertEqual((v.name, v.size, v.corrected), (NAME, len(AUDIO), False))
        changed = imported({NAME: AUDIO[:-1] + bytes([AUDIO[-1] ^ 1])}, transcriber=_AnyTranscriber()).messages[2].voice
        self.assertNotEqual(changed.sha256, v.sha256)

    def test_text_messages_are_untouched_and_have_no_voice(self):
        self.assertIsNone(self.messages[0].voice)
        self.assertEqual(self.messages[0].text, "Hi Kavi, confirming the notebook order: 200 pieces at ₹45 per piece.")
        self.assertIsNone(self.messages[0].start_ms)

    def test_nothing_is_reported_as_a_problem(self):
        self.assertEqual((self.result.problems, self.result.voice_problems), ([], []))

    def test_older_android_style_attachment_line(self):
        chat = "15/03/2026, 11:05 - Kavi: PTT-20260315-WA0001.wav (file attached)\n"
        r = import_export(chat, FILES, FakeTranscriber())
        self.assertEqual(r.messages[0].kind, "voice")

    def test_iphone_attachment_line(self):
        chat = "[15/03/2026, 11:05:10] Kavi: ‎<attached: 00000012-AUDIO-2026-03-15-11-05-10.wav>\n"
        r = import_export(chat, {"00000012-AUDIO-2026-03-15-11-05-10.wav": AUDIO}, FakeTranscriber())
        self.assertEqual(r.messages[0].kind, "voice")

    def test_a_missing_audio_file_stays_a_media_message_with_a_problem(self):
        r = imported({})
        self.assertEqual(r.messages[2].kind, "media")
        self.assertEqual(len(r.voice_problems), 1)
        self.assertIn(NAME, r.voice_problems[0])

    def test_audio_without_a_transcript_stays_media_with_a_problem(self):
        r = imported({NAME: AUDIO + b"x"})
        self.assertEqual(r.messages[2].kind, "media")
        self.assertIn("transcript", r.voice_problems[0])

    def test_the_local_stub_never_crashes_the_import(self):
        r = imported(transcriber=LocalTranscriber())
        self.assertEqual(r.messages[2].kind, "media")
        self.assertIn("not implemented", r.voice_problems[0])

    def test_a_non_audio_attachment_is_just_media(self):
        r = import_export("15/03/2026, 11:05 - Kavi: <attached: photo.jpg>\n", {"photo.jpg": b"x"}, FakeTranscriber())
        self.assertEqual((r.messages[0].kind, r.voice_problems), ("media", []))

    def test_too_large_audio_is_refused(self):
        r = imported(max_audio_bytes=1000)
        self.assertEqual(r.messages[2].kind, "media")
        self.assertIn("too large", r.voice_problems[0])

    def test_too_many_voice_notes_are_refused(self):
        chat = "\n".join(f"15/03/2026, 11:0{i} - Kavi: <attached: n{i}.wav>" for i in range(3)) + "\n"
        files = {f"n{i}.wav": AUDIO for i in range(3)}
        r = import_export(chat, files, FakeTranscriber(), max_voice_notes=2)
        self.assertEqual([m.kind for m in r.messages], ["voice", "voice", "media"])
        self.assertIn("too many", r.voice_problems[0])

    def test_a_correction_replaces_the_transcript_but_not_the_audio_hash(self):
        r = imported(corrections={NAME: "The price is 55 rupees per piece."})
        m = r.messages[2]
        self.assertEqual(m.text, "The price is 55 rupees per piece.")
        self.assertTrue(m.voice.corrected)
        self.assertEqual([(s.start_ms, s.end_ms) for s in m.voice.segments], [(0, 4730)])
        self.assertEqual(m.voice.sha256, hashlib.sha256(AUDIO).hexdigest())

    def test_a_blank_or_unknown_correction_is_ignored(self):
        self.assertEqual(imported(corrections={NAME: "   "}).messages[2].text, TRANSCRIPT)
        self.assertEqual(imported(corrections={"other.wav": "x"}).messages[2].text, TRANSCRIPT)

    def test_the_same_chat_without_audio_files_still_parses_as_before(self):
        self.assertEqual([m.kind for m in parse_chat(CHAT).messages], ["message", "message", "media", "message"])


class _AnyTranscriber(FakeTranscriber):
    def transcribe(self, audio, name):
        return FakeTranscriber().transcribe(AUDIO, name)


class VoiceExtractionTests(unittest.TestCase):
    def setUp(self):
        r = imported()
        self.messages = r.messages
        self.report = extract_terms(self.messages, load_playbook("supply-order"), FakeModelAdapter())
        self.price = self.report.terms["unit_price"]

    def test_the_sample_has_a_recorded_model_output(self):
        self.assertIsNone(self.report.model_error, self.report.model_error)

    def test_text_versus_voice_price_is_contradicted_with_both_sources(self):
        self.assertEqual(self.price.status, "contradicted", self.price.problems)
        self.assertEqual([(s.msg, s.sender) for s in self.price.sources], [(1, "Dev"), (3, "Kavi")])
        self.assertIn("45", self.price.sources[0].quote)
        self.assertIn("50", self.price.sources[1].quote)

    def test_the_voice_source_carries_the_audio_and_the_transcript_span(self):
        text_src, voice_src = self.price.sources
        self.assertIsNone(text_src.voice)
        self.assertEqual(
            voice_src.voice,
            {"name": NAME, "sha256": hashlib.sha256(AUDIO).hexdigest(), "start_ms": 2220, "end_ms": 4730},
        )

    def test_there_is_a_text_voice_contradiction_flag_naming_both_messages(self):
        flags = [f for f in self.report.flags if f.id == "text_voice_contradiction"]
        self.assertEqual([(f.term, f.msg) for f in flags], [("unit_price", (1, 3))])
        self.assertIn("45", flags[0].reason)
        self.assertIn("50", flags[0].reason)
        self.assertIn("voice note", flags[0].reason)

    def test_other_terms_cited_from_text_have_no_voice_source(self):
        q = self.report.terms["quantity"]
        self.assertEqual(q.status, "stated", q.problems)
        self.assertTrue(all(s.voice is None for s in q.sources))

    def test_a_voice_note_can_support_a_stated_term(self):
        class OneVoiceTerm(FakeModelAdapter):
            def extract(self, chat, pid):
                return {"terms": {"unit_price": {"status": "stated", "value": "50", "quote": ["50 rupees per piece"], "msg": [3], "reason": "Said in the voice note."}}}

        t = extract_terms(self.messages, load_playbook("supply-order"), OneVoiceTerm()).terms["unit_price"]
        self.assertEqual(t.status, "stated", t.problems)
        self.assertEqual(t.sources[0].voice["start_ms"], 2220)

    def test_a_quote_that_is_not_in_the_transcript_needs_review(self):
        class Wrong(FakeModelAdapter):
            def extract(self, chat, pid):
                return {"terms": {"unit_price": {"status": "stated", "value": "55", "quote": ["55 rupees per piece"], "msg": [3], "reason": "x"}}}

        t = extract_terms(self.messages, load_playbook("supply-order"), Wrong()).terms["unit_price"]
        self.assertEqual(t.status, "needs_review")

    def test_a_stated_term_whose_quotes_differ_still_names_the_voice_contradiction(self):
        class Agree(FakeModelAdapter):
            def extract(self, chat, pid):
                return {"terms": {"unit_price": {"status": "stated", "value": "45", "quote": ["₹45 per piece", "50 rupees per piece"], "msg": [1, 3], "reason": "x"}}}

        r = extract_terms(self.messages, load_playbook("supply-order"), Agree())
        # different numbers in a "stated" term: the extractor already refuses it, and still names the voice contradiction
        self.assertEqual(r.terms["unit_price"].status, "needs_review")
        self.assertIn("text_voice_contradiction", [f.id for f in r.flags])

    def test_the_voice_message_counts_for_an_unconfirmed_flag(self):
        flags = [f for f in self.report.flags if f.id == "unconfirmed"]
        self.assertEqual(flags, [])  # Dev replies after the voice note (message 4)


class SampleFileTests(unittest.TestCase):
    def test_the_sample_voice_note_is_a_real_wav_of_about_five_seconds(self):
        with wave.open(str(SAMPLE / NAME)) as w:
            seconds = w.getnframes() / w.getframerate()
        self.assertAlmostEqual(seconds, 5.13, delta=0.05)

    def test_the_readme_says_the_voice_is_synthetic_and_the_transcript_is_recorded(self):
        text = (SAMPLE / "README.md").read_text(encoding="utf-8").lower()
        self.assertIn("synthetic", text)
        self.assertIn("text-to-speech", text)
        self.assertIn("recorded, not speech", text)
        self.assertIn("no real voice", text)

    def test_the_chat_says_45_and_the_transcript_says_50(self):
        self.assertIn("₹45", CHAT)
        self.assertIn("50 rupees", TRANSCRIPT)
        self.assertIn(f"<attached: {NAME}>", CHAT)


class RouterVoiceTests(unittest.TestCase):
    def client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from app.terms_router import router

        app = FastAPI()
        app.include_router(router)
        app.state.model_adapter = FakeModelAdapter()
        app.state.transcriber = FakeTranscriber()
        return TestClient(app)

    def body(self, **extra):
        b = {"playbook_id": "supply-order", "chat_text": CHAT, "voice_notes": [{"name": NAME, "audio_base64": base64.b64encode(AUDIO).decode()}]}
        b.update(extra)
        return b

    def test_returns_the_voice_message_the_contradiction_and_the_numbered_chat(self):
        r = self.client().post("/v1/terms", json=self.body())
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        voice = out["messages"][2]
        self.assertEqual(voice["kind"], "voice")
        self.assertEqual(voice["voice"]["sha256"], hashlib.sha256(AUDIO).hexdigest())
        self.assertEqual([(s["start_ms"], s["end_ms"]) for s in voice["voice"]["segments"]], [(0, 1820), (2220, 4730)])
        terms = {t["key"]: t for t in out["report"]["terms"]}
        self.assertEqual(terms["unit_price"]["status"], "contradicted")
        self.assertEqual(terms["unit_price"]["sources"][1]["voice"]["start_ms"], 2220)
        self.assertIn("text_voice_contradiction", [f["id"] for f in out["report"]["flags"]])
        self.assertTrue(out["numbered_chat"].splitlines()[2].startswith("[3] Kavi: (voice note) "))

    def test_the_badge_says_recorded_transcript(self):
        out = self.client().post("/v1/terms", json=self.body()).json()
        self.assertIn("recorded transcript", out["demo_badge"])
        self.assertEqual(out["transcriber_mode"], "fake")

    def test_a_correction_is_applied_and_marked(self):
        out = self.client().post("/v1/terms", json=self.body(voice_corrections={NAME: "The price is 55 rupees per piece."})).json()
        v = out["messages"][2]
        self.assertTrue(v["voice"]["corrected"])
        self.assertIn("55", v["text"])

    def test_no_audio_means_a_problem_not_a_failure(self):
        out = self.client().post("/v1/terms", json=self.body(voice_notes=[])).json()
        self.assertEqual(out["messages"][2]["kind"], "media")
        self.assertEqual(len(out["voice_problems"]), 1)

    def test_bad_input_is_a_clean_422_or_413(self):
        c = self.client()
        cases = [
            (self.body(voice_notes=[{"name": NAME, "audio_base64": "%%%"}]), 422),
            (self.body(voice_notes=[{"name": "../x.wav", "audio_base64": "AAAA"}]), 422),
            (self.body(voice_notes=[{"name": "a.wav", "audio_base64": "AAAA"}] * 40), 422),
            ({"playbook_id": "supply-order", "pdf_base64": base64.b64encode(b"x").decode(), "voice_notes": [{"name": NAME, "audio_base64": "AAAA"}]}, 422),
        ]
        for body, status in cases:
            self.assertEqual(c.post("/v1/terms", json=body).status_code, status, str(body)[:80])

    def test_without_voice_notes_nothing_changes(self):
        plain = (SAMPLE.parent / "chats" / "supply-order.txt").read_text(encoding="utf-8")
        out = self.client().post("/v1/terms", json={"playbook_id": "supply-order", "chat_text": plain}).json()
        self.assertEqual({m["kind"] for m in out["messages"]}, {"message"})
        self.assertEqual(out["voice_problems"], [])
        self.assertTrue(all(m["voice"] is None for m in out["messages"]))


if __name__ == "__main__":
    unittest.main()
