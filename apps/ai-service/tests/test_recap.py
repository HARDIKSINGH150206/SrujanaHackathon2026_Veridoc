import json
import re
import unittest
from pathlib import Path

from app.playbooks import load_playbook
from app.recap import RecapError, build_recap, format_value, indian_grouping

TEMPLATES = Path(__file__).resolve().parents[3] / "playbooks" / "recap"
SUPPLY = load_playbook("supply-order")
FREELANCE = load_playbook("freelance-job")


def t(key, status="stated", value="45", quote=("q",), msg=(1,), confirmed=True):
    return {"key": key, "status": status, "value": value, "quote": list(quote), "msg": list(msg), "confirmed": confirmed}


def full_supply(**overrides):
    base = [
        t("quantity", value="200", quote=("200 notebooks",), msg=(1,)),
        t("unit_price", value="45", quote=("₹45 per piece",), msg=(2,)),
        t("total_price", value="9000", quote=("₹9000",), msg=(2,)),
        t("advance", value="3000", quote=("₹3000 advance",), msg=(6,)),
        t("balance", value="6000", quote=("baaki ₹6000",), msg=(6,)),
        t("deadline", value="2026-03-20", quote=("20 March",), msg=(4,)),
    ]
    return [overrides.get(x["key"], x) for x in base]


class TemplateFileTests(unittest.TestCase):
    def test_every_playbook_term_has_a_label_and_a_line_in_both_languages(self):
        for pb in (SUPPLY, FREELANCE):
            data = json.loads((TEMPLATES / f"{pb.id}.json").read_text(encoding="utf-8"))
            for lang in ("en", "hi"):
                for key in pb.terms:
                    entry = data["languages"][lang]["terms"][key]
                    self.assertTrue(entry["label"] and "{value}" in entry["line"], (pb.id, lang, key))

    def test_every_language_has_all_open_point_and_suggestion_templates(self):
        for pb in (SUPPLY, FREELANCE):
            data = json.loads((TEMPLATES / f"{pb.id}.json").read_text(encoding="utf-8"))
            for lang in ("en", "hi"):
                block = data["languages"][lang]
                self.assertEqual(set(block["open"]), {"unclear", "contradicted", "missing", "needs_review", "unconfirmed"})
                self.assertEqual(set(block["suggest"]), {"missing", "unclear", "contradicted", "check", "review"})
                for tones in block["suggest"].values():
                    self.assertEqual(set(tones), {"friendly", "neutral", "firm"})
                self.assertIn("{code}", block["reply_line"])

    def test_firm_messages_stay_courteous_and_make_no_threat(self):
        banned = re.compile(r"legal|court|police|lawyer|sue|notice|penalt|action|report", re.I)
        for pb in (SUPPLY, FREELANCE):
            data = json.loads((TEMPLATES / f"{pb.id}.json").read_text(encoding="utf-8"))
            for tones in data["languages"]["en"]["suggest"].values():
                self.assertNotRegex(tones["firm"], banned)


class FormatValueTests(unittest.TestCase):
    def test_indian_grouping(self):
        for n, want in ((0, "0"), (45, "45"), (999, "999"), (1000, "1,000"), (9000, "9,000"), (100000, "1,00,000"), (12345678, "1,23,45,678")):
            self.assertEqual(indian_grouping(n), want)

    def test_money(self):
        self.assertEqual(format_value("money", "9000", "en", []), "₹9,000")
        self.assertEqual(format_value("money", "45.50", "en", []), "₹45.50")
        self.assertEqual(format_value("money", "₹3,000", "en", []), "₹3,000")
        self.assertEqual(format_value("money", "about much", "en", []), "about much")

    def test_dates(self):
        months_en = ["January", "February", "March"]
        self.assertEqual(format_value("date", "2026-03-20", "en", months_en), "20 March 2026")
        months_hi = ["जनवरी", "फ़रवरी", "मार्च"]
        self.assertEqual(format_value("date", "2026-03-05", "hi", months_hi), "5 मार्च 2026")
        self.assertEqual(format_value("date", "next week", "en", months_en), "next week")

    def test_text_and_quantity_pass_through(self):
        self.assertEqual(format_value("quantity", " 200 ", "en", []), "200")
        self.assertEqual(format_value("text", "logo + 3 posts", "en", []), "logo + 3 posts")


class RecapTextTests(unittest.TestCase):
    def test_only_confirmed_stated_terms_appear_as_lines(self):
        r = build_recap(SUPPLY, "en", full_supply(), "Dev")
        self.assertEqual([l["key"] for l in r["lines"]], ["quantity", "unit_price", "total_price", "advance", "balance", "deadline"])
        self.assertIn("Quantity: 200", r["text"])
        self.assertIn("Price per piece: ₹45", r["text"])
        self.assertIn("Delivery by 20 March 2026", r["text"])
        self.assertTrue(r["text"].startswith("Hi Dev, just confirming what we agreed so far:"))

    def test_lines_keep_their_message_numbers_for_source_links(self):
        r = build_recap(SUPPLY, "en", full_supply(), None)
        self.assertEqual({l["key"]: l["msg"] for l in r["lines"]}["advance"], [6])

    def test_stated_but_not_confirmed_is_an_open_point_not_a_line(self):
        r = build_recap(SUPPLY, "en", full_supply(advance=t("advance", value="3000", confirmed=False)), None)
        self.assertNotIn("advance", [l["key"] for l in r["lines"]])
        self.assertIn(("advance", "unconfirmed"), [(o["key"], o["status"]) for o in r["open_points"]])
        self.assertIn("Advance paid: not confirmed yet.", r["text"])

    def test_unclear_contradicted_missing_and_needs_review_are_open_points_in_plain_words(self):
        terms = full_supply(
            deadline=t("deadline", "unclear", None, ("next week",), (4,), False),
            unit_price=t("unit_price", "contradicted", None, ("₹45", "₹50"), (2, 5), False),
            total_price=t("total_price", "needs_review", "54", ("₹45 per piece",), (2,), False),
            balance=t("balance", "missing", None, (), (), False),
        )
        r = build_recap(SUPPLY, "en", terms, None)
        got = {o["key"]: o["status"] for o in r["open_points"]}
        self.assertEqual(got, {"deadline": "unclear", "unit_price": "contradicted", "total_price": "needs_review", "balance": "missing"})
        for line in ("Delivery date: not clear yet.", "Price per piece: said in two different ways.", "Order total: still to be checked.", "Balance due: not discussed yet."):
            self.assertIn(line, r["text"])
        self.assertIn("Still to settle:", r["text"])

    def test_required_terms_that_were_not_sent_are_missing_but_optional_ones_are_not(self):
        r = build_recap(SUPPLY, "en", [t("quantity", value="200")], None)
        missing = {o["key"] for o in r["open_points"] if o["status"] == "missing"}
        self.assertEqual(missing, {"unit_price", "total_price", "advance", "balance", "deadline"})
        self.assertNotIn("parties", missing)
        self.assertNotIn("inclusion", missing)

    def test_nothing_confirmed(self):
        r = build_recap(SUPPLY, "en", [], None)
        self.assertEqual(r["lines"], [])
        self.assertTrue(r["text"].startswith("Nothing has been confirmed yet."))

    def test_no_open_points_says_so(self):
        every = full_supply()
        r = build_recap(SUPPLY, "en", every + [t("parties", value="Dev and Kavi"), t("inclusion", value="logo")], None)
        self.assertEqual(r["open_points"], [])
        self.assertTrue(r["text"].rstrip().endswith("Nothing else is open."))

    def test_hindi_recap_uses_hindi_templates(self):
        r = build_recap(SUPPLY, "hi", full_supply(), "Dev")
        self.assertIn("डिलीवरी 20 मार्च 2026 तक", r["text"])
        self.assertIn("कुल राशि: ₹9,000", r["text"])
        self.assertRegex(r["reply_line"], "CONFIRM \\{code\\}")
        self.assertRegex(r["text"], "[ऀ-ॿ]")

    def test_reply_line_and_disclaimer_come_from_the_templates(self):
        r = build_recap(SUPPLY, "en", full_supply(), None)
        self.assertEqual(r["reply_line"], "If all correct, reply: CONFIRM {code}")
        self.assertEqual(r["disclaimer"], "Drafting aid, not legal advice.")
        self.assertNotIn("CONFIRM", r["text"])  # the code line is added later, after the document's hash exists

    def test_same_input_gives_the_same_text(self):
        self.assertEqual(build_recap(SUPPLY, "en", full_supply(), "Dev"), build_recap(SUPPLY, "en", full_supply(), "Dev"))

    def test_no_model_text_enters_the_recap(self):
        terms = [dict(x, reason="MODEL SAID HELLO", problems=["MODEL PROBLEM"]) for x in full_supply()]
        r = build_recap(SUPPLY, "en", terms, None)
        self.assertNotIn("MODEL", json.dumps(r))

    def test_values_are_inserted_literally_not_as_templates(self):
        r = build_recap(FREELANCE, "en", [t("deliverable", value="{label} {value} {code}")], None)
        self.assertIn("To be delivered: {label} {value} {code}", r["text"])

    def test_works_for_the_freelance_playbook(self):
        terms = [t("deliverable", value="logo + 3 posts"), t("total_price", value="6000"), t("revision_limit", value="2")]
        r = build_recap(FREELANCE, "en", terms, "Ira")
        self.assertIn("Package price: ₹6,000", r["text"])
        self.assertIn("advance", {o["key"] for o in r["open_points"]})


class RefusalTests(unittest.TestCase):
    def test_a_confirmed_term_must_be_stated_and_have_a_value(self):
        bad = [
            t("deadline", "unclear", None, ("next week",), (4,), True),
            t("unit_price", "needs_review", "54", ("₹45",), (2,), True),
            t("advance", "stated", None, ("x",), (1,), True),
            t("advance", "stated", "  ", ("x",), (1,), True),
            t("balance", "missing", None, (), (), True),
        ]
        for term in bad:
            with self.assertRaises(RecapError, msg=term):
                build_recap(SUPPLY, "en", [term], None)

    def test_unknown_and_duplicate_keys_and_bad_status_and_language_are_refused(self):
        with self.assertRaises(RecapError):
            build_recap(SUPPLY, "en", [t("secret")], None)
        with self.assertRaises(RecapError):
            build_recap(SUPPLY, "en", [t("advance"), t("advance")], None)
        with self.assertRaises(RecapError):
            build_recap(SUPPLY, "en", [t("advance", "maybe")], None)
        with self.assertRaises(RecapError):
            build_recap(SUPPLY, "fr", [], None)

    def test_a_long_name_is_refused(self):
        with self.assertRaises(RecapError):
            build_recap(SUPPLY, "en", [], "x" * 200)


class SuggestionTests(unittest.TestCase):
    def terms(self):
        return full_supply(
            deadline=t("deadline", "unclear", None, ("next week",), (4,), False),
            unit_price=t("unit_price", "contradicted", None, ("₹45", "₹50"), (2, 5), False),
            total_price=t("total_price", "needs_review", "54", ("₹45 per piece",), (2,), False),
            balance=t("balance", "missing", None, (), (), False),
            advance=t("advance", "stated", "3000", ("₹3000 advance",), (6,), False),
        )

    def setUp(self):
        r = build_recap(SUPPLY, "en", self.terms(), "Kavi")
        self.by_key = {s["key"]: s for s in r["suggestions"]}

    def test_one_suggestion_per_open_point_with_three_tones(self):
        self.assertEqual(set(self.by_key), {"deadline", "unit_price", "total_price", "balance", "advance"})
        for s in self.by_key.values():
            self.assertEqual(set(s["messages"]), {"friendly", "neutral", "firm"})
            self.assertTrue(all(m.strip() for m in s["messages"].values()))

    def test_unclear_quotes_the_chat(self):
        self.assertIn('"next week"', self.by_key["deadline"]["messages"]["neutral"])
        self.assertTrue(self.by_key["deadline"]["messages"]["friendly"].startswith("Hi Kavi,"))

    def test_contradicted_quotes_both_sides(self):
        m = self.by_key["unit_price"]["messages"]["neutral"]
        self.assertIn('"₹45"', m)
        self.assertIn('"₹50"', m)

    def test_missing_needs_no_quote(self):
        self.assertIn("Balance due", self.by_key["balance"]["messages"]["firm"])

    def test_a_stated_but_unconfirmed_term_is_checked_with_its_value(self):
        self.assertIn("₹3,000", self.by_key["advance"]["messages"]["neutral"])

    def test_a_needs_review_term_quotes_the_chat_and_never_repeats_the_unchecked_value(self):
        # the model said 54; the chat says "₹45 per piece". Asking the other person about 54 would spread the mistake.
        for tone, message in self.by_key["total_price"]["messages"].items():
            self.assertNotIn("54", message, tone)
            self.assertIn("₹45 per piece", message, tone)
            self.assertNotIn("not specific enough", message, tone)  # the quote is fine; the value could not be checked

    def test_a_needs_review_term_with_no_quote_asks_as_if_missing(self):
        r = build_recap(SUPPLY, "en", full_supply(total_price=t("total_price", "needs_review", "54", (), (), False)), None)
        m = {s["key"]: s for s in r["suggestions"]}["total_price"]["messages"]["neutral"]
        self.assertNotIn("54", m)

    def test_unclear_without_a_quote_falls_back_to_the_missing_wording(self):
        r = build_recap(SUPPLY, "en", full_supply(deadline=t("deadline", "unclear", None, (), (), False)), None)
        m = {s["key"]: s for s in r["suggestions"]}["deadline"]["messages"]["neutral"]
        self.assertNotIn('""', m)
        self.assertTrue(m.startswith("Delivery date has not been discussed"))

    def test_without_a_name_the_greeting_has_no_name(self):
        r = build_recap(SUPPLY, "en", self.terms(), None)
        self.assertTrue({s["key"]: s for s in r["suggestions"]}["balance"]["messages"]["friendly"].startswith("Hi, "))

    def test_hindi_suggestions(self):
        r = build_recap(SUPPLY, "hi", self.terms(), None)
        self.assertRegex({s["key"]: s for s in r["suggestions"]}["balance"]["messages"]["friendly"], "[ऀ-ॿ]")


if __name__ == "__main__":
    unittest.main()
