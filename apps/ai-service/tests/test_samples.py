import json
import re
import unittest
from pathlib import Path

SAMPLES = Path(__file__).resolve().parents[3] / "samples" / "veridoc"
CHATS = sorted((SAMPLES / "chats").glob("*.txt"))
LINE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}, \d{2}:\d{2} - [A-Za-z]+: .+$")


class SampleChatTests(unittest.TestCase):
    def test_two_chats_exist(self):
        self.assertEqual([p.name for p in CHATS], ["freelance-job.txt", "supply-order.txt"])

    def test_every_line_is_a_chat_line(self):
        for path in CHATS:
            for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                self.assertRegex(line, LINE_RE, f"{path.name}:{n}")

    def test_no_contact_details_or_long_numbers(self):
        for path in [*CHATS, *(SAMPLES / "expected").glob("*.json")]:
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(text, r"\d{6,}", path.name)  # phone / account / id numbers
            self.assertNotIn("@", text, path.name)
            self.assertNotIn("http", text, path.name)

    def test_chats_mix_in_hinglish(self):
        for path in CHATS:
            self.assertRegex(path.read_text(encoding="utf-8"), r"\b(hai|hoga|chahiye|baaki|abhi)\b", path.name)


class ExpectedTermsTests(unittest.TestCase):
    def test_source_lines_point_at_real_lines_and_quote_the_value(self):
        for path in CHATS:
            lines = path.read_text(encoding="utf-8").splitlines()
            gold = json.loads((SAMPLES / "expected" / f"{path.stem}.json").read_text(encoding="utf-8"))
            self.assertEqual(gold["playbook_id"], path.stem)
            for term in gold["terms"]:
                self.assertTrue(term["source_lines"], term)
                for n in term["source_lines"]:
                    self.assertTrue(1 <= n <= len(lines), f"{path.name}: {term['kind']} line {n}")
                if term["value"].isdigit():
                    cited = " ".join(lines[n - 1] for n in term["source_lines"])
                    self.assertIn(term["value"], cited, f"{path.name}: {term['kind']}")


class SamplePdfTests(unittest.TestCase):
    pdf = SAMPLES / "order-confirmation.pdf"

    def test_is_a_text_pdf_marked_synthetic(self):
        data = self.pdf.read_bytes()
        self.assertTrue(data.startswith(b"%PDF-"))
        self.assertTrue(data.rstrip().endswith(b"%%EOF"))
        self.assertIn(b"SYNTHETIC SAMPLE", data)  # uncompressed text: it is not a scan
        self.assertNotIn(b"/Image", data)

    def test_amounts_agree_with_the_supply_chat_gold(self):
        data = self.pdf.read_bytes()
        for needle in (b"Rs 45", b"Rs 9000", b"Rs 3000", b"Rs 6000", b"20 March 2026"):
            self.assertIn(needle, data)


if __name__ == "__main__":
    unittest.main()
