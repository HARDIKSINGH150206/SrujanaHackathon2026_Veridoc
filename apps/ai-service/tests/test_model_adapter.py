import json
import unittest
from pathlib import Path

from app.model_adapter import (
    STATUSES,
    FakeModelAdapter,
    LocalModelAdapter,
    ModelAdapter,
    RecordingNotFound,
    adapter_from_env,
    build_adapter,
    chat_fingerprint,
    check_model_output,
    number_chat,
)
from app.settings import settings_from_env

SAMPLES = Path(__file__).resolve().parents[3] / "samples" / "veridoc"


def sample(name: str) -> str:
    return number_chat((SAMPLES / "chats" / f"{name}.txt").read_text(encoding="utf-8"))


def gold(name: str) -> dict[str, dict]:
    data = json.loads((SAMPLES / "expected" / f"{name}.json").read_text(encoding="utf-8"))
    return {t["kind"]: t for t in data["terms"]}  # the gold file calls the term key "kind"


class NumberChatTests(unittest.TestCase):
    def test_numbers_lines_from_one_and_skips_blanks(self):
        self.assertEqual(number_chat("a\n\n b \nc\n"), "[1] a\n[2] b\n[3] c")

    def test_empty_chat_is_rejected(self):
        with self.assertRaises(ValueError):
            number_chat("\n \n")


class OutputFormatTests(unittest.TestCase):
    """Pins the model's real output format: terms{key:{status, value, quote[], msg[], reason}}."""

    def good(self) -> dict:
        return {
            "terms": {
                "price": {"status": "stated", "value": "45", "quote": ["₹45 per piece"], "msg": [2], "reason": "Stated once."},
                "advance": {"status": "missing", "value": None, "quote": [], "msg": [], "reason": "No message states it."},
            }
        }

    def test_statuses_are_the_four_agreed_words(self):
        self.assertEqual(STATUSES, ("stated", "unclear", "contradicted", "missing"))

    def test_accepts_the_documented_shape(self):
        self.assertEqual(check_model_output(self.good()), [])

    def test_rejects_anything_that_is_not_an_object_with_terms(self):
        for bad in (None, [], "text", {}, {"terms": []}, {"terms": "x"}):
            self.assertTrue(check_model_output(bad), bad)

    def test_rejects_a_bad_term(self):
        cases = {
            "unknown status": {"status": "maybe"},
            "no status": {},
            "quote not a list": {"quote": "₹45"},
            "msg not a list of ints": {"msg": ["2"]},
            "msg is a bool": {"msg": [True]},
            "msg below 1": {"msg": [0]},
            "quote and msg differ in length": {"quote": ["a", "b"], "msg": [2]},
            "quote item not text": {"quote": [45], "msg": [2]},
            "reason not text": {"reason": 5},
            "value not text or null": {"value": 45},
        }
        for name, patch in cases.items():
            out = self.good()
            out["terms"]["price"].update(patch)
            if name == "no status":
                del out["terms"]["price"]["status"]
            self.assertTrue(check_model_output(out), name)

    def test_extra_fields_are_not_an_error(self):
        out = self.good()
        out["terms"]["price"]["confidence"] = 0.9
        self.assertEqual(check_model_output(out), [])


class FakeAdapterTests(unittest.TestCase):
    def setUp(self):
        self.adapter = FakeModelAdapter()

    def test_satisfies_the_interface(self):
        self.assertIsInstance(self.adapter, ModelAdapter)

    def test_replays_a_recording_in_the_model_format(self):
        out = self.adapter.extract(sample("supply-order"), "supply-order")
        self.assertEqual(check_model_output(out), [])
        self.assertTrue(out["terms"])

    def test_every_recording_is_well_formed(self):
        for name in ("supply-order", "freelance-job"):
            self.assertEqual(check_model_output(self.adapter.extract(sample(name), name)), [], name)

    def test_replay_is_deterministic_and_callers_cannot_change_the_recording(self):
        a = self.adapter.extract(sample("supply-order"), "supply-order")
        a["terms"]["unit_price"]["value"] = "changed"
        b = self.adapter.extract(sample("supply-order"), "supply-order")
        self.assertNotEqual(b["terms"]["unit_price"]["value"], "changed")

    def test_unrecorded_chat_or_playbook_is_an_error_not_a_guess(self):
        with self.assertRaises(RecordingNotFound):
            self.adapter.extract(number_chat("some other chat"), "supply-order")
        with self.assertRaises(RecordingNotFound):
            self.adapter.extract(sample("supply-order"), "freelance-job")

    def test_msg_numbers_exist_and_each_quote_is_in_its_message(self):
        for name in ("supply-order", "freelance-job"):
            lines = sample(name).splitlines()
            for key, term in self.adapter.extract(sample(name), name)["terms"].items():
                for quote, n in zip(term["quote"], term["msg"]):
                    self.assertTrue(1 <= n <= len(lines), f"{name}.{key}: msg {n}")
                    self.assertIn(quote, lines[n - 1], f"{name}.{key}")


class RecordedMistakesTests(unittest.TestCase):
    """The recordings must keep the two errors real models make, no more."""

    def setUp(self):
        self.adapter = FakeModelAdapter()

    def test_supply_order_has_one_wrong_price_and_nothing_else_wrong(self):
        expected = gold("supply-order")
        got = self.adapter.extract(sample("supply-order"), "supply-order")["terms"]
        self.assertEqual(set(got), set(expected))
        self.assertEqual({k: t["status"] for k, t in got.items()}, {k: "stated" for k in expected})
        wrong = [k for k in expected if got[k]["value"] != expected[k]["value"]]
        self.assertEqual(wrong, ["unit_price"])
        self.assertEqual(expected["unit_price"]["value"], "45")
        self.assertEqual(got["unit_price"]["value"], "54")
        # the quote is real; only the value is wrong, so the value-versus-quote check is what catches it
        self.assertEqual(got["unit_price"]["quote"], ["₹45 per piece"])

    def test_freelance_job_misses_the_advance_and_has_no_wrong_value(self):
        expected = gold("freelance-job")
        got = self.adapter.extract(sample("freelance-job"), "freelance-job")["terms"]
        self.assertEqual(set(got), set(expected))
        missed = [k for k, t in got.items() if t["status"] == "missing"]
        self.assertEqual(missed, ["advance"])
        self.assertEqual(got["advance"]["quote"], [])
        self.assertEqual(got["advance"]["msg"], [])
        for k, t in got.items():
            if k != "advance":
                self.assertEqual((t["status"], t["value"]), ("stated", expected[k]["value"]), k)


class LocalAdapterStubTests(unittest.TestCase):
    def test_raises_not_implemented(self):
        with self.assertRaises(NotImplementedError):
            LocalModelAdapter().extract(sample("supply-order"), "supply-order")


class BuildAdapterTests(unittest.TestCase):
    def test_fake_mode_builds_the_fake_adapter(self):
        self.assertIsInstance(build_adapter(settings_from_env({})), FakeModelAdapter)


class StartupTests(unittest.TestCase):
    def test_fake_mode_is_the_default_at_startup(self):
        self.assertIsInstance(adapter_from_env({}), FakeModelAdapter)

    def test_local_mode_without_a_model_file_stops_startup(self):
        with self.assertRaises(ValueError):
            adapter_from_env({"MODEL_MODE": "local"})


class FingerprintTests(unittest.TestCase):
    def test_changes_when_the_chat_changes(self):
        self.assertNotEqual(chat_fingerprint("[1] a"), chat_fingerprint("[1] b"))
        self.assertEqual(len(chat_fingerprint("[1] a")), 64)


if __name__ == "__main__":
    unittest.main()
