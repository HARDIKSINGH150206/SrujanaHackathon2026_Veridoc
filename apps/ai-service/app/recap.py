"""Recap text and suggested messages from fixed templates.

Suggestion-only and text-only (CLAUDE.md rule 2): this builds strings from
confirmed terms and templates in playbooks/recap/. No model text enters the
recap, it writes nothing to the vault, and the echo code is added later, in the
browser, after the recap document's hash exists (docs/RECAP_DESIGN.md).
"""

import json
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .playbooks import Playbook, playbook_dir

LANGUAGES = ("en", "hi")
STATUSES = ("stated", "unclear", "contradicted", "missing", "needs_review")
MAX_NAME_CHARS = 60
TONES = ("friendly", "neutral", "firm")


class RecapError(ValueError):
    pass


def indian_grouping(n: int) -> str:
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return ("-" if n < 0 else "") + s


def format_value(term_type: str, value: str, language: str, months: list[str]) -> str:
    value = value.strip()
    if term_type == "money":
        cleaned = re.sub(r"₹|\brs\b\.?|\binr\b|/-|,|\s", "", value, flags=re.IGNORECASE)
        if re.fullmatch(r"\d+(?:\.\d+)?", cleaned):
            try:
                whole, _, frac = Decimal(cleaned).to_eng_string().partition(".")
            except InvalidOperation:  # pragma: no cover - guarded by the pattern
                return value
            return "₹" + indian_grouping(int(whole)) + (("." + frac) if frac else "")
        return value
    if term_type == "date":
        m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value)
        if m and 1 <= int(m.group(2)) <= len(months):
            return f"{int(m.group(3))} {months[int(m.group(2)) - 1]} {m.group(1)}"
    return value


def _fill(template: str, **values: str) -> str:
    """One pass, so a value that looks like {label} is inserted literally."""
    return re.sub(r"\{(\w+)\}", lambda m: values.get(m.group(1), m.group(0)), template)


def _templates(playbook: Playbook, language: str, directory: str | Path | None) -> dict:
    path = playbook_dir(str(directory) if directory is not None else None) / "recap" / f"{playbook.id}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))["languages"][language]
    except (OSError, ValueError, KeyError) as exc:
        raise RecapError(f"no recap templates for playbook {playbook.id!r} in {language!r}") from exc


def _clean_terms(playbook: Playbook, raw_terms: list[dict]) -> dict[str, dict]:
    seen: dict[str, dict] = {}
    for raw in raw_terms:
        key = raw.get("key")
        if key not in playbook.terms:
            raise RecapError(f"unknown term {key!r} for playbook {playbook.id!r}")
        if key in seen:
            raise RecapError(f"term {key!r} was sent twice")
        status = raw.get("status")
        if status not in STATUSES:
            raise RecapError(f"term {key!r} has unknown status {status!r}")
        value = raw.get("value")
        value = value.strip() if isinstance(value, str) and value.strip() else None
        quote, msg = raw.get("quote") or [], raw.get("msg") or []
        if not (isinstance(quote, list) and all(isinstance(q, str) for q in quote)):
            raise RecapError(f"term {key!r}: quote must be a list of text")
        confirmed = bool(raw.get("confirmed"))
        if confirmed and (status != "stated" or value is None):
            raise RecapError(f"term {key!r} cannot be confirmed: only stated terms with a value can be")
        seen[key] = {"status": status, "value": value, "quote": quote, "msg": [n for n in msg if isinstance(n, int) and not isinstance(n, bool)], "confirmed": confirmed}
    return seen


def _suggestion_key(status: str, term: dict) -> str:
    quotes = [q for q in term["quote"] if q.strip()]
    if status == "contradicted" and len(quotes) >= 2:
        return "contradicted"
    if status in ("contradicted", "unclear") and quotes:
        return "unclear"
    # A needs_review value failed a check, so it is never put in a message: quote the chat instead.
    if status == "unconfirmed" and term["value"] is not None:
        return "check"
    if status in ("needs_review", "unconfirmed") and quotes:
        return "review"
    return "missing"


def build_recap(
    playbook: Playbook,
    language: str,
    raw_terms: list[dict],
    other_name: str | None = None,
    directory: str | Path | None = None,
) -> dict:
    """Recap text, open points and one suggested message (three tones) per open point."""
    if language not in LANGUAGES:
        raise RecapError(f"language must be one of {LANGUAGES}")
    name = " ".join((other_name or "").split())
    if len(name) > MAX_NAME_CHARS:
        raise RecapError("the other person's name is too long")
    tpl = _templates(playbook, language, directory)
    terms = _clean_terms(playbook, raw_terms)

    lines, open_points, suggestions = [], [], []
    for key, pt in playbook.terms.items():
        entry = tpl["terms"][key]
        term = terms.get(key)
        if term is None:
            status = "missing" if pt.required else None
            term = {"status": status, "value": None, "quote": [], "msg": [], "confirmed": False}
        elif term["confirmed"]:
            text = _fill(entry["line"], value=format_value(pt.type, term["value"], language, tpl["months"]), label=entry["label"])
            lines.append({"key": key, "label": entry["label"], "text": text, "msg": term["msg"]})
            continue
        else:
            status = "unconfirmed" if term["status"] == "stated" else term["status"]
            if status == "missing" and not pt.required:
                status = None
        if status is None:
            continue
        open_points.append({"key": key, "label": entry["label"], "status": status, "text": _fill(tpl["open"][status], label=entry["label"])})
        quotes = [q for q in term["quote"] if q.strip()]
        greeting = _fill(tpl["greeting"], other_name=name) if name else tpl["greeting_anon"]
        values = {
            "label": entry["label"],
            "greeting": greeting,
            "quote": quotes[0] if quotes else "",
            "quote2": next((q for q in quotes[1:] if q != quotes[0]), quotes[0] if quotes else ""),
            "value": format_value(pt.type, term["value"], language, tpl["months"]) if term["value"] else "",
        }
        templates = tpl["suggest"][_suggestion_key(status, term)]
        suggestions.append({"key": key, "label": entry["label"], "status": status, "messages": {tone: _fill(templates[tone], **values) for tone in TONES}})

    intro = _fill(tpl["intro"], other_name=name) if name else tpl["intro_anon"]
    parts = [intro if lines else tpl["none_confirmed"]]
    parts += [f"• {l['text']}" for l in lines]
    if open_points:
        parts += ["", tpl["open_title"]] + [f"• {o['text']}" for o in open_points]
    elif lines:
        parts += ["", tpl["no_open"]]
    return {
        "language": language,
        "title": tpl["title"],
        "text": "\n".join(parts),
        "lines": lines,
        "open_points": open_points,
        "suggestions": suggestions,
        "reply_line": tpl["reply_line"],
        "disclaimer": tpl["disclaimer"],
    }
