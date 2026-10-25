import base64
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.model_adapter import FakeModelAdapter, LocalModelAdapter
from app.terms_router import router
from tests.test_chat_import import blank_pdf, chat_pdf

SAMPLES = Path(__file__).resolve().parents[3] / "samples" / "veridoc"
SUPPLY = (SAMPLES / "chats" / "supply-order.txt").read_text(encoding="utf-8")


def client(adapter=None, env=None) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.state.model_adapter = adapter or FakeModelAdapter()
    if env is not None:
        app.state.settings_env = env
    return TestClient(app)


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


class TermsRouteTests(unittest.TestCase):
    def post(self, body, **kw):
        return client(**kw).post("/v1/terms", json=body)

    def test_chat_text_returns_numbered_messages_and_terms_with_sources(self):
        r = self.post({"playbook_id": "supply-order", "chat_text": SUPPLY})
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual([m["n"] for m in body["messages"]], list(range(1, 11)))
        terms = {t["key"]: t for t in body["report"]["terms"]}
        self.assertEqual(terms["unit_price"]["status"], "needs_review")
        self.assertEqual(terms["total_price"]["sources"][0]["msg"], 2)
        self.assertEqual(terms["total_price"]["sources"][0]["sender"], "Kavi")

    def test_response_says_demo_mode_while_the_model_is_fake(self):
        body = self.post({"playbook_id": "supply-order", "chat_text": SUPPLY}).json()
        self.assertTrue(body["demo_mode"])
        self.assertEqual(body["demo_badge"], "Demo mode: recorded model output and recorded transcript")

    def test_text_pdf_is_accepted(self):
        pdf = chat_pdf([line.replace("₹", "Rs ") for line in SUPPLY.splitlines()])  # the PDF font has no rupee sign
        r = self.post({"playbook_id": "supply-order", "pdf_base64": b64(pdf)})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(len(r.json()["messages"]), 10)

    def test_scanned_pdf_says_not_supported_yet(self):
        r = self.post({"playbook_id": "supply-order", "pdf_base64": b64(blank_pdf())})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["detail"]["code"], "scanned_pdf_not_supported")
        self.assertIn("not supported yet", r.json()["detail"]["message"])

    def test_exactly_one_source_is_required(self):
        self.assertEqual(self.post({"playbook_id": "supply-order"}).status_code, 422)
        both = {"playbook_id": "supply-order", "chat_text": SUPPLY, "pdf_base64": b64(blank_pdf())}
        self.assertEqual(self.post(both).status_code, 422)

    def test_bad_input_is_a_clean_422(self):
        for body in (
            {"playbook_id": "supply-order", "chat_text": "not a chat"},
            {"playbook_id": "supply-order", "pdf_base64": "%%%"},
            {"playbook_id": "supply-order", "pdf_base64": b64(b"hello")},
            {"playbook_id": "nope", "chat_text": SUPPLY},
            {"playbook_id": "../x", "chat_text": SUPPLY},
        ):
            self.assertEqual(self.post(body).status_code, 422, body)

    def test_unrecorded_chat_is_still_a_200_with_needs_review(self):
        raw = "12/03/2026, 10:00 - A: hello\n12/03/2026, 10:01 - B: hi\n"
        r = self.post({"playbook_id": "supply-order", "chat_text": raw})
        self.assertEqual(r.status_code, 200)
        statuses = {t["status"] for t in r.json()["report"]["terms"]}
        self.assertEqual(statuses, {"needs_review"})
        self.assertIn("RecordingNotFound", r.json()["report"]["model_error"])

    def test_stub_local_adapter_gives_needs_review_not_a_crash(self):
        r = self.post({"playbook_id": "supply-order", "chat_text": SUPPLY}, adapter=LocalModelAdapter())
        self.assertEqual(r.status_code, 200)
        self.assertTrue(all(t["status"] == "needs_review" for t in r.json()["report"]["terms"]))

    def test_oversized_input_is_refused(self):
        r = self.post({"playbook_id": "supply-order", "chat_text": "x" * 3_000_000})
        self.assertEqual(r.status_code, 413)


class PlaybooksRouteTests(unittest.TestCase):
    def test_lists_the_playbooks_with_their_terms(self):
        r = client().get("/v1/playbooks")
        self.assertEqual(r.status_code, 200)
        books = {b["id"]: b for b in r.json()["playbooks"]}
        self.assertEqual(set(books), {"supply-order", "freelance-job"})
        self.assertEqual(books["supply-order"]["title"], "Supply or order")
        keys = [t["key"] for t in books["supply-order"]["terms"]]
        self.assertIn("unit_price", keys)
        self.assertEqual(books["supply-order"]["terms"][0].keys(), {"key", "label", "type", "required"})


if __name__ == "__main__":
    unittest.main()
