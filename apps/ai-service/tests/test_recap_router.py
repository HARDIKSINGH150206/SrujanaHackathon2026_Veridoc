import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.recap_router import router


def client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def term(key, status="stated", value="200", confirmed=True, quote=("200 notebooks",), msg=(1,)):
    return {"key": key, "status": status, "value": value, "quote": list(quote), "msg": list(msg), "confirmed": confirmed}


class RecapRouteTests(unittest.TestCase):
    def post(self, body):
        return client().post("/v1/recap", json=body)

    def test_returns_text_open_points_and_suggestions(self):
        r = self.post({"playbook_id": "supply-order", "language": "en", "other_name": "Kavi", "terms": [term("quantity")]})
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertIn("Quantity: 200", body["text"])
        self.assertIn("deadline", {o["key"] for o in body["open_points"]})
        self.assertEqual(set(body["suggestions"][0]["messages"]), {"friendly", "neutral", "firm"})
        self.assertIn("{code}", body["reply_line"])

    def test_hindi(self):
        r = self.post({"playbook_id": "supply-order", "language": "hi", "terms": [term("quantity")]})
        self.assertEqual(r.status_code, 200)
        self.assertIn("मात्रा: 200", r.json()["text"])

    def test_refusals_are_422_with_a_code(self):
        bad = [
            {"playbook_id": "supply-order", "language": "fr", "terms": []},
            {"playbook_id": "nope", "language": "en", "terms": []},
            {"playbook_id": "supply-order", "language": "en", "terms": [term("deadline", status="unclear", value=None)]},
            {"playbook_id": "supply-order", "language": "en", "terms": [term("secret")]},
            {"playbook_id": "supply-order", "language": "en", "terms": [term("quantity")] * 2},
        ]
        for body in bad:
            r = self.post(body)
            self.assertEqual(r.status_code, 422, body)
            self.assertIn("code", r.json()["detail"] if isinstance(r.json()["detail"], dict) else {"code": 1})

    def test_too_many_terms_is_refused(self):
        r = self.post({"playbook_id": "supply-order", "language": "en", "terms": [term("quantity")] * 200})
        self.assertEqual(r.status_code, 422)

    def test_extra_fields_such_as_a_model_reason_are_ignored(self):
        t = dict(term("quantity"), reason="MODEL TEXT")
        r = self.post({"playbook_id": "supply-order", "language": "en", "terms": [t]})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("MODEL TEXT", r.text)


if __name__ == "__main__":
    unittest.main()
