"""Playbooks: which terms a kind of deal needs. Data files, no code (PLAYBOOK_DIR)."""

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .settings import DEFAULT_PLAYBOOK_DIR

REPO_ROOT = Path(__file__).resolve().parents[3]
TERM_TYPES = ("party", "quantity", "money", "date", "text")
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


class PlaybookError(ValueError):
    pass


@dataclass(frozen=True)
class PlaybookTerm:
    key: str
    label: str
    type: str
    required: bool


@dataclass(frozen=True)
class Playbook:
    id: str
    title: str
    terms: dict[str, PlaybookTerm]

    def required_keys(self) -> list[str]:
        return [k for k, t in self.terms.items() if t.required]


def playbook_dir(configured: str | None = None) -> Path:
    """A relative PLAYBOOK_DIR is relative to the repository root, not the working directory."""
    path = Path(configured or DEFAULT_PLAYBOOK_DIR)
    return path if path.is_absolute() else REPO_ROOT / path


def load_playbook(playbook_id: str, directory: Path | str | None = None) -> Playbook:
    if not _ID_RE.match(playbook_id):
        raise PlaybookError(f"invalid playbook id {playbook_id!r}")
    base = playbook_dir(str(directory) if directory is not None else None)
    path = base / f"{playbook_id}.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PlaybookError(f"unknown playbook {playbook_id!r}") from exc
    except (OSError, ValueError) as exc:
        raise PlaybookError(f"playbook {playbook_id!r} is unreadable: {exc}") from exc
    try:
        if str(data["id"]) != playbook_id:
            raise PlaybookError(f"playbook file {playbook_id!r} declares id {data['id']!r}")
        terms: dict[str, PlaybookTerm] = {}
        for t in data["terms"]:
            if t["type"] not in TERM_TYPES:
                raise PlaybookError(f"term {t['key']!r} has unknown type {t['type']!r}")
            if t["key"] in terms:
                raise PlaybookError(f"duplicate term key {t['key']!r}")
            terms[t["key"]] = PlaybookTerm(t["key"], t["label"], t["type"], bool(t["required"]))
        return Playbook(str(data["id"]), str(data.get("title", data["id"])), terms)
    except (KeyError, TypeError) as exc:
        raise PlaybookError(f"playbook {playbook_id!r} is malformed: {exc!r}") from exc


def list_playbooks(directory: Path | str | None = None) -> list[Playbook]:
    """Every readable playbook in the directory, sorted by id. A broken file is skipped, not fatal."""
    base = playbook_dir(str(directory) if directory is not None else None)
    found: list[Playbook] = []
    for path in sorted(base.glob("*.json")):
        try:
            found.append(load_playbook(path.stem, base))
        except PlaybookError:
            continue
    return sorted(found, key=lambda p: p.id)
