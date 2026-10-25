import unittest
from pathlib import Path

from app.chat_import import (
    ChatImportError,
    ScannedPdfNotSupported,
    format_numbered,
    parse_chat,
    text_from_pdf,
)

SAMPLES = Path(__file__).resolve().parents[3] / "samples" / "veridoc"

ANDROID = """\
12/03/2026, 10:00 - Messages and calls are end-to-end encrypted. Only people in this chat can read them.
12/03/2026, 10:02 - Dev: Hi Kavi, need 200 notebooks
12/03/2026, 10:05 - Kavi: Sure.
Rate is 45 each
and delivery by 20 March
12/03/2026, 10:06 - Dev: <Media omitted>
12/03/2026, 10:07 - Kavi: This message was deleted
12/03/2026, 10:08 - Dev: Ok deal
"""

IPHONE = (
    "‎[12/03/2026, 10:00:01] Dev: ‎Messages and calls are end-to-end encrypted.\n"
    "[12/03/2026, 10:02:11] Dev: Hi Kavi, need 200 notebooks\n"
    "[12/03/2026, 10:05:30 PM] Kavi: Sure.\n"
    "Rate is 45 each\n"
    "‎[12/03/2026, 10:06:00] Dev: ‎image omitted\n"
    "[12/03/2026, 10:07:00] Kavi: You deleted this message\n"
    "[12/03/2026, 10:08:00] Dev: ‎<attached: 00000012-PHOTO-2026-03-12-10-08-00.jpg>\n"
    "[12/03/2026, 10:09:00] Kavi created group “Notebooks”\n"
)


def kinds(messages):
    return [m.kind for m in messages]


class AndroidFormatTests(unittest.TestCase):
    def setUp(self):
        self.result = parse_chat(ANDROID)
        self.messages = self.result.messages

    def test_every_line_kind_gets_a_number_from_one(self):
        self.assertEqual([m.n for m in self.messages], [1, 2, 3, 4, 5, 6])
        self.assertEqual(kinds(self.messages), ["system", "message", "message", "media", "deleted", "message"])

    def test_sender_and_text(self):
        m = self.messages[1]
        self.assertEqual((m.sender, m.text), ("Dev", "Hi Kavi, need 200 notebooks"))
        self.assertEqual(m.timestamp, "12/03/2026 10:02")

    def test_multi_line_message_is_one_message(self):
        m = self.messages[2]
        self.assertEqual(m.sender, "Kavi")
        self.assertEqual(m.text, "Sure.\nRate is 45 each\nand delivery by 20 March")

    def test_system_media_and_deleted_have_no_content_to_quote(self):
        self.assertIsNone(self.messages[0].sender)
        self.assertEqual(self.messages[3].text, "<Media omitted>")
        self.assertEqual(self.messages[4].sender, "Kavi")

    def test_nothing_is_reported_as_a_problem(self):
        self.assertEqual(self.result.problems, [])


class IphoneFormatTests(unittest.TestCase):
    def setUp(self):
        self.result = parse_chat(IPHONE)
        self.messages = self.result.messages

    def test_kinds_and_numbers(self):
        self.assertEqual([m.n for m in self.messages], list(range(1, 8)))
        self.assertEqual(kinds(self.messages), ["system", "message", "message", "media", "deleted", "media", "system"])

    def test_invisible_marks_are_removed(self):
        for m in self.messages:
            self.assertNotIn("‎", m.text)
            self.assertNotIn("‎", m.sender or "")

    def test_the_encryption_notice_is_system_even_though_iphone_gives_it_a_sender(self):
        self.assertEqual(self.messages[0].kind, "system")
        self.assertIsNone(self.messages[0].sender)

    def test_multi_line_and_12_hour_clock(self):
        m = self.messages[2]
        self.assertEqual(m.text, "Sure.\nRate is 45 each")
        self.assertEqual(m.timestamp, "12/03/2026 10:05:30 PM")

    def test_group_notice_without_a_colon_is_system(self):
        self.assertEqual(self.messages[6].kind, "system")
        self.assertIsNone(self.messages[6].sender)
        self.assertIn("created group", self.messages[6].text)


class EdgeCaseTests(unittest.TestCase):
    def test_lines_before_the_first_message_are_reported_not_dropped(self):
        result = parse_chat("stray line\n12/03/2026, 10:02 - Dev: hi\n")
        self.assertEqual([m.n for m in result.messages], [1])
        self.assertEqual(result.problems, [(1, "stray line")])

    def test_text_that_is_not_a_chat_is_an_error(self):
        with self.assertRaises(ChatImportError):
            parse_chat("Order Confirmation\nQuantity: 200\n")

    def test_empty_input_is_an_error(self):
        with self.assertRaises(ChatImportError):
            parse_chat("  \n")

    def test_windows_line_endings_and_bom(self):
        result = parse_chat("﻿12/03/2026, 10:02 - Dev: hi\r\n12/03/2026, 10:03 - Kavi: yo\r\n")
        self.assertEqual([m.text for m in result.messages], ["hi", "yo"])

    def test_two_digit_year_dots_and_dashes(self):
        result = parse_chat("12.03.26, 10:02 - Dev: a\n12-03-26, 10:03 am - Kavi: b\n")
        self.assertEqual([m.sender for m in result.messages], ["Dev", "Kavi"])

    def test_a_date_inside_a_message_does_not_start_a_new_message(self):
        result = parse_chat("12/03/2026, 10:02 - Dev: meet on\nthe 14/03/2026, 11:00 maybe\n")
        self.assertEqual(len(result.messages), 1)

    def test_edited_marker_is_removed_from_the_text(self):
        result = parse_chat("12/03/2026, 10:02 - Dev: price is 45 <This message was edited>\n")
        self.assertEqual(result.messages[0].text, "price is 45")


class FormatNumberedTests(unittest.TestCase):
    def test_numbers_count_every_message_kind(self):
        text = format_numbered(parse_chat(ANDROID).messages)
        lines = text.split("\n")
        self.assertEqual(lines[0], "[1] (system) Messages and calls are end-to-end encrypted. Only people in this chat can read them.")
        self.assertEqual(lines[1], "[2] Dev: Hi Kavi, need 200 notebooks")
        self.assertEqual(lines[2], "[3] Kavi: Sure.")
        self.assertEqual(lines[3], "    Rate is 45 each")
        self.assertEqual(lines[4], "    and delivery by 20 March")
        self.assertEqual(lines[5], "[4] Dev: <Media omitted>")
        self.assertEqual(lines[6], "[5] Kavi: (deleted message)")
        self.assertEqual(lines[7], "[6] Dev: Ok deal")

    def test_sample_chat_is_one_numbered_message_per_line(self):
        raw = (SAMPLES / "chats" / "supply-order.txt").read_text(encoding="utf-8")
        text = format_numbered(parse_chat(raw).messages)
        self.assertEqual(len(text.splitlines()), 10)
        self.assertTrue(text.startswith("[1] Dev: Hi Kavi, need 200 notebooks for the school camp."))


class PdfTests(unittest.TestCase):
    def test_text_pdf_gives_its_text(self):
        data = (SAMPLES / "order-confirmation.pdf").read_bytes()
        text = text_from_pdf(data)
        self.assertIn("Order Confirmation", text)
        self.assertIn("Rs 9000", text)

    def test_pdf_without_text_is_not_supported_yet(self):
        with self.assertRaisesRegex(ScannedPdfNotSupported, "not supported yet"):
            text_from_pdf(blank_pdf())

    def test_not_a_pdf_is_an_import_error(self):
        with self.assertRaises(ChatImportError):
            text_from_pdf(b"hello")

    def test_a_chat_inside_a_text_pdf_can_be_parsed(self):
        from app.chat_import import chat_from_pdf

        result = chat_from_pdf(chat_pdf(["12/03/2026, 10:02 - Dev: hi", "12/03/2026, 10:03 - Kavi: yo"]))
        self.assertEqual([m.text for m in result.messages], ["hi", "yo"])


def _pdf(content: bytes) -> bytes:
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def blank_pdf() -> bytes:
    return _pdf(b"0.9 g 50 50 100 100 re f")  # a grey square, no text


def chat_pdf(lines: list[str]) -> bytes:
    ops = [f"BT /F1 10 Tf 40 {800 - 14 * i} Td ({line}) Tj ET" for i, line in enumerate(lines)]
    return _pdf("\n".join(ops).encode("latin-1"))


if __name__ == "__main__":
    unittest.main()
