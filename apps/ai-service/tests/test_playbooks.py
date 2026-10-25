import json
import tempfile
import unittest
from pathlib import Path

from app.playbooks import Playbook, PlaybookError, load_playbook

REPO_PLAYBOOKS = Path(__file__).resolve().parents[3] / "playbooks"


class LoadPlaybookTests(unittest.TestCase):
    def test_shipped_playbooks_load(self):
        for pid in ("supply-order", "freelance-job"):
            pb = load_playbook(pid, REPO_PLAYBOOKS)
            self.assertEqual(pb.id, pid)
            self.assertTrue(pb.required_keys())

    def test_default_directory_is_the_repo_playbooks_even_from_another_cwd(self):
        self.assertEqual(load_playbook("supply-order").id, "supply-order")

    def test_term_types_are_known(self):
        for pid in ("supply-order", "freelance-job"):
            for term in load_playbook(pid, REPO_PLAYBOOKS).terms.values():
                self.assertIn(term.type, ("party", "quantity", "money", "date", "text"))

    def test_unknown_playbook_is_an_error(self):
        with self.assertRaises(PlaybookError):
            load_playbook("nope", REPO_PLAYBOOKS)

    def test_playbook_id_cannot_escape_the_directory(self):
        with self.assertRaises(PlaybookError):
            load_playbook("../README", REPO_PLAYBOOKS)

    def test_malformed_playbook_is_an_error(self):
        with tempfile.TemporaryDirectory() as d:
            for name, body in {"a": "not json", "b": json.dumps({"id": "b"}), "c": json.dumps({"id": "c", "terms": [{"key": "k", "type": "weird", "label": "L", "required": True}]})}.items():
                (Path(d) / f"{name}.json").write_text(body, encoding="utf-8")
                with self.assertRaises(PlaybookError, msg=name):
                    load_playbook(name, Path(d))

    def test_duplicate_keys_are_an_error(self):
        with tempfile.TemporaryDirectory() as d:
            term = {"key": "k", "type": "text", "label": "L", "required": True}
            (Path(d) / "x.json").write_text(json.dumps({"id": "x", "terms": [term, term]}), encoding="utf-8")
            with self.assertRaises(PlaybookError):
                load_playbook("x", Path(d))

    def test_playbook_is_a_value_object(self):
        pb = load_playbook("supply-order", REPO_PLAYBOOKS)
        self.assertIsInstance(pb, Playbook)
        self.assertEqual(pb.terms["unit_price"].type, "money")


if __name__ == "__main__":
    unittest.main()
