import json
import unittest
from pathlib import Path

from app.model_adapter import (
    ExtractionResult,
    FakeModelAdapter,
    LocalModelAdapter,
    ModelAdapter,
    RecordingNotFound,
    build_adapter,
    chat_fingerprint,
    number_chat,
)
from app.settings import settings_from_env

SAMPLES = Path(__file__).resolve().parents[3] / "samples" / "veridoc"


def sample(name: str) -> str:
    return number_chat((SAMPLES / "chats" / f"{name}.txt").read_text(encoding="utf-8"))


def gold(name: str) -> dict[str, dict]:
    data = json.loads((SAMPLES / "expected" / f"{name}.json").read_text(encoding="utf-8"))
    return {t["kind"]: t for t in data["terms"]}


class NumberChatTests(unittest.TestCase):
    def test_numbers_lines_from_one_and_skips_blanks(self):
        self.assertEqual(number_chat("a\n\n b \nc\n"), "[1] a\n[2] b\n[3] c")

    def test_empty_chat_is_rejected(self):
        with self.assertRaises(ValueError):
            number_chat("\n \n")


class FakeAdapterTests(unittest.TestCase):
    def setUp(self):
        self.adapter = FakeModelAdapter()

    def test_satisfies_the_interface(self):
        self.assertIsInstance(self.adapter, ModelAdapter)

    def test_replays_a_recording_as_a_result(self):
        result = self.adapter.extract(sample("supply-order"), "supply-order")
        self.assertIsInstance(result, ExtractionResult)
        self.assertEqual(result.playbook_id, "supply-order")
        self.assertTrue(result.terms)

    def test_replay_is_deterministic(self):
        a = self.adapter.extract(sample("supply-order"), "supply-order")
        b = self.adapter.extract(sample("supply-order"), "supply-order")
        self.assertEqual(a, b)

    def test_unrecorded_chat_or_playbook_is_an_error_not_a_guess(self):
        with self.assertRaises(RecordingNotFound):
            self.adapter.extract(number_chat("some other chat"), "supply-order")
        with self.assertRaises(RecordingNotFound):
            self.adapter.extract(sample("supply-order"), "freelance-job")

    def test_recorded_source_lines_exist_in_the_chat(self):
        for name in ("supply-order", "freelance-job"):
            n_lines = len(sample(name).splitlines())
            for term in self.adapter.extract(sample(name), name).terms:
                self.assertTrue(term.source_lines, term)
                self.assertTrue(all(1 <= n <= n_lines for n in term.source_lines), term)


class RecordedMistakesTests(unittest.TestCase):
    """The recordings must keep the two errors real models make, no more."""

    def setUp(self):
        self.adapter = FakeModelAdapter()

    def test_supply_order_has_one_wrong_price_and_nothing_missing(self):
        expected = gold("supply-order")
        got = {t.kind: t for t in self.adapter.extract(sample("supply-order"), "supply-order").terms}
        self.assertEqual(set(got), set(expected))
        wrong = [k for k in expected if got[k].value != expected[k]["value"]]
        self.assertEqual(wrong, ["unit_price"])
        self.assertEqual(expected["unit_price"]["value"], "45")
        self.assertEqual(got["unit_price"].value, "54")

    def test_freelance_job_misses_the_advance_and_has_no_wrong_value(self):
        expected = gold("freelance-job")
        got = {t.kind: t for t in self.adapter.extract(sample("freelance-job"), "freelance-job").terms}
        self.assertEqual(set(expected) - set(got), {"advance"})
        self.assertEqual(set(got) - set(expected), set())
        self.assertEqual([k for k in got if got[k].value != expected[k]["value"]], [])


class LocalAdapterStubTests(unittest.TestCase):
    def test_raises_not_implemented(self):
        with self.assertRaises(NotImplementedError):
            LocalModelAdapter().extract(sample("supply-order"), "supply-order")


class BuildAdapterTests(unittest.TestCase):
    def test_fake_mode_builds_the_fake_adapter(self):
        self.assertIsInstance(build_adapter(settings_from_env({})), FakeModelAdapter)


class FingerprintTests(unittest.TestCase):
    def test_changes_when_the_chat_changes(self):
        self.assertNotEqual(chat_fingerprint("[1] a"), chat_fingerprint("[1] b"))
        self.assertEqual(len(chat_fingerprint("[1] a")), 64)


if __name__ == "__main__":
    unittest.main()
