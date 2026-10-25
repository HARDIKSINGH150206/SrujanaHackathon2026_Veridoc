"""Turns a model's output into terms a person can check.

Suggestion-only (CLAUDE.md rule 2): this module reads messages and a model
output and returns a report. It writes nothing, imports nothing from the vault
and never raises on a bad model output: a term that fails a check, or an output
that cannot be read, becomes `needs_review` and says why (docs/AI_SPEC.md).

Rules first, model second: flags come from rules over the cited messages; the
model's status is accepted only where the rules agree.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from .chat_import import Message
from .model_adapter import STATUSES, ModelAdapter, check_model_output, check_term
from .playbooks import Playbook

NEEDS_REVIEW = "needs_review"
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

# ---- flags (rules) ---------------------------------------------------------

_MONTHS = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_WEEKDAYS = r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
_I = re.IGNORECASE

_RELATIVE_DATE = re.compile(
    rf"\b(?:(?:next|this|last|coming)\s+(?:week|month|weekend|year|{_WEEKDAYS})"
    r"|tomorrow|tmrw|today|tonight|day after tomorrow|kal|parso|aaj|agle hafte|agle mahine|is hafte|is mahine"
    r"|in\s+(?:a|an|\d+)\s+(?:day|days|week|weeks|month|months)"
    r"|within\s+(?:a|an|\d+)\s+(?:day|days|week|weeks)"
    r"|(?:end of (?:the )?|)(?:week|month)\s*end|end of (?:the )?(?:week|month))\b",
    _I,
)
_APPROX_WORD = re.compile(r"(?:\b(?:approx\.?|approximately|around|about|roughly|lagbhag|nearly|almost)|~)\s*(?:rs\.?|₹|inr)?\s*\d", _I)
_RANGE = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(?:k|lakhs?|lacs?)?\s*(?:-|–|—|to)\s*(\d[\d,]*(?:\.\d+)?)\s*(?:k|lakhs?|lacs?)?", _I)
_VAGUE_TIMING = re.compile(r"\b(?:soon|later|asap|as soon as|baad mein|baad me|jaldi|whenever|when i can|when possible|some ?time|eventually)\b", _I)
_CONDITIONAL = re.compile(r"\b(?:if|unless|depends? on|depending on|subject to|provided that|agar|jab tak|yadi)\b", _I)
_CURRENCY = re.compile(r"₹|\brs\b\.?|\brupees?\b|\binr\b|/-|\$|\busd\b", _I)
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
_VAGUE_SPEC = re.compile(r"\b(?:some|few|a few|several|various|kuch|thoda|etc|and so on|something like|similar|as needed|as required|anything)\b", _I)

# Flags that make a term unclear. `unconfirmed` is about acknowledgement and does not.
UNCLEAR_FLAGS = ("relative_date", "approximate_amount", "vague_timing", "conditional", "unspecified_unit", "vague_spec")

_REASONS = {
    "relative_date": "The date is relative ('next week', 'kal'), so it is not a fixed day.",
    "approximate_amount": "The amount is approximate or a range, so it is not a fixed number.",
    "vague_timing": "The timing is vague ('soon', 'later'), so no date is agreed.",
    "conditional": "This depends on a condition ('if', 'unless'), so it is not firm yet.",
    "unspecified_unit": "The number has no currency or unit next to it.",
    "vague_spec": "The description is vague ('some', 'a few', 'etc'), so it does not say exactly what.",
}


def _is_range(text: str) -> bool:
    for m in _RANGE.finditer(text):
        before, after = text[: m.start()], text[m.end() :]
        in_date = re.search(r"\d[-/.]$", before) or re.match(r"[-/.]\d", after)
        if not in_date:
            return True
    return False


def detect_flags(term_type: str, message_text: str, quote: str) -> list[tuple[str, str]]:
    """Rule flags for one term: [(flag id, plain reason)]. `unconfirmed` is added by the extractor."""
    found: list[str] = []
    if term_type == "date" and _RELATIVE_DATE.search(message_text):
        found.append("relative_date")
    if term_type in ("money", "quantity") and (_APPROX_WORD.search(message_text) or _is_range(message_text)):
        found.append("approximate_amount")
    if term_type in ("money", "date", "text") and _VAGUE_TIMING.search(message_text):
        found.append("vague_timing")
    if _CONDITIONAL.search(message_text):
        found.append("conditional")
    if term_type == "money" and _NUMBER.search(quote) and not _CURRENCY.search(quote):
        found.append("unspecified_unit")
    if term_type == "quantity" and _NUMBER.search(quote):
        if not re.search(r"[^\W\d_]", _NUMBER.sub(" ", quote)):
            found.append("unspecified_unit")
    if term_type in ("quantity", "text") and _VAGUE_SPEC.search(message_text):
        found.append("vague_spec")
    return [(f, _REASONS[f]) for f in found]


# ---- value versus quote ----------------------------------------------------

_MULTIPLIERS = {"k": 1000, "thousand": 1000, "hazaar": 1000, "lakh": 100000, "lakhs": 100000, "lac": 100000, "lacs": 100000, "crore": 10_000_000}
_QUOTE_NUMBER = re.compile(r"(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|thousand|hazaar|crore)?\b", _I)
_ORDINAL_DAY = r"(\d{1,2})(?:st|nd|rd|th)?"


def _number(text: str) -> Decimal | None:
    cleaned = re.sub(r"₹|\brs\b\.?|\binr\b|/-|,|\s", "", text.translate(_DEVANAGARI_DIGITS), flags=_I)
    try:
        return Decimal(cleaned) if re.fullmatch(r"\d+(?:\.\d+)?", cleaned) else None
    except InvalidOperation:  # pragma: no cover - the pattern above already guards this
        return None


def _quote_numbers(quote: str) -> set[Decimal]:
    out: set[Decimal] = set()
    for m in _QUOTE_NUMBER.finditer(quote.translate(_DEVANAGARI_DIGITS)):
        n = _number(m.group(1))
        if n is not None:
            out.add(n * _MULTIPLIERS.get((m.group(2) or "").lower(), 1))
    return out


def _month(name: str) -> int:
    return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].index(name[:3].lower()) + 1


def _quote_days(quote: str) -> list[tuple[int, int, int | None]]:
    """(day, month, year or None) readings of the quote."""
    q = quote.translate(_DEVANAGARI_DIGITS)
    out: list[tuple[int, int, int | None]] = []
    for m in re.finditer(rf"\b{_ORDINAL_DAY}\s*(?:of\s+)?{_MONTHS}\b", q, _I):
        out.append((int(m.group(1)), _month(m.group(2)), None))
    for m in re.finditer(rf"\b{_MONTHS}\b\.?\s+{_ORDINAL_DAY}\b", q, _I):
        out.append((int(m.group(2)), _month(m.group(1)), None))
    for m in re.finditer(r"(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?![\d/.-]*\d)", q):
        year = int(m.group(3)) if m.group(3) else None
        if year is not None and year < 100:
            year += 2000
        out.append((int(m.group(1)), int(m.group(2)), year))
    return out


def value_follows_quote(term_type: str, value: str, quote: str) -> tuple[bool, str]:
    """Where code can check it, does `value` follow from `quote`? Text and party values are not checked."""
    if term_type in ("money", "quantity"):
        want = _number(value)
        if want is None:
            return False, f"the value {value!r} is not a number"
        if want in _quote_numbers(quote):
            return True, ""
        return False, f"the value {value} does not follow from the quote {quote!r}"
    if term_type == "date":
        m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value or "")
        if m is None:
            return False, f"the value {value!r} is not a date written YYYY-MM-DD"
        try:
            want = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return False, f"the value {value!r} is not a real date"
        for day, month, year in _quote_days(quote):
            if (day, month) == (want.day, want.month) and year in (None, want.year):
                return True, ""
        return False, f"the date {value} does not follow from the quote {quote!r}"
    return True, ""


# ---- prompt-injection sniffing --------------------------------------------

_INSTRUCTION = re.compile(
    r"\b(?:ignore|disregard|forget)\b.{0,40}\b(?:previous|above|prior|earlier|instructions?|rules?)\b"
    r"|^\s*(?:system|assistant|developer)\s*:"
    r"|\byou are (?:an?|the) (?:ai|assistant|language model|model)\b|\bas an ai\b|\bnew instructions?\b",
    _I | re.DOTALL,
)

# ---- report ----------------------------------------------------------------


@dataclass(frozen=True)
class Source:
    msg: int
    sender: str | None
    text: str
    quote: str


@dataclass(frozen=True)
class Flag:
    id: str
    term: str
    msg: tuple[int, ...]
    reason: str


@dataclass
class Term:
    key: str
    label: str
    type: str
    required: bool
    status: str  # stated, unclear, contradicted, missing or needs_review
    model_status: str | None
    value: str | None
    quote: tuple[str, ...]
    msg: tuple[int, ...]
    reason: str
    problems: list[str] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)


@dataclass
class Report:
    terms: dict[str, Term]
    flags: list[Flag] = field(default_factory=list)
    ignored_keys: list[str] = field(default_factory=list)
    output_problems: list[str] = field(default_factory=list)
    model_error: str | None = None

    def to_dict(self) -> dict:
        return {
            "terms": [
                {
                    "key": t.key, "label": t.label, "type": t.type, "required": t.required,
                    "status": t.status, "model_status": t.model_status, "value": t.value,
                    "quote": list(t.quote), "msg": list(t.msg), "reason": t.reason, "problems": t.problems,
                    "sources": [{"msg": s.msg, "sender": s.sender, "text": s.text, "quote": s.quote} for s in t.sources],
                }
                for t in self.terms.values()
            ],
            "flags": [{"id": f.id, "term": f.term, "msg": list(f.msg), "reason": f.reason} for f in self.flags],
            "ignored_keys": self.ignored_keys,
            "output_problems": self.output_problems,
            "model_error": self.model_error,
        }


def _norm(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).split())


def _blank_term(pt, status: str, reason: str, problems: list[str] | None = None, model_status: str | None = None) -> Term:
    return Term(pt.key, pt.label, pt.type, pt.required, status, model_status, None, (), (), reason, problems or [])


def _unusable(playbook: Playbook, why: str) -> Report:
    reason = f"The model's answer could not be used ({why}). Please read the chat yourself."
    terms = {k: _blank_term(pt, NEEDS_REVIEW, reason, [why]) for k, pt in playbook.terms.items()}
    return Report(terms)


def _check_quotes(pt, status: str, quote: tuple[str, ...], msg: tuple[int, ...], messages: list[Message], problems: list[str]) -> None:
    """Quote checks: the message exists, can be quoted, and holds the quote verbatim."""
    for q, n in zip(quote, msg):
        if not 1 <= n <= len(messages):
            problems.append(f"message {n} does not exist (the chat has {len(messages)})")
            continue
        m = messages[n - 1]
        if m.kind != "message":
            problems.append(f"message {n} is a {m.kind} entry, not something a person wrote")
            continue
        if not _norm(q):
            problems.append(f"the quote for message {n} is empty")
        elif _norm(q) in _norm(m.text):
            pass
        elif pt.type == "party" and m.sender is not None and _norm(q) == _norm(m.sender):
            pass
        else:
            problems.append(f"the quote {q!r} is not in message {n}")
        if _INSTRUCTION.search(m.text):
            problems.append(f"message {n} reads like an instruction to an AI, not like a term")


def _numeric_sets(term_type: str, quote: tuple[str, ...]) -> list[set[Decimal]]:
    return [_quote_numbers(q) for q in quote] if term_type in ("money", "quantity") else []


def _build_term(pt, raw, messages: list[Message]) -> tuple[Term, list[Flag]]:
    bad = check_term(raw)
    if bad:
        return _blank_term(pt, NEEDS_REVIEW, "The model's answer for this term was not in the expected format. Please check the chat.", bad), []
    model_status = raw["status"]
    quote, msg = tuple(raw["quote"]), tuple(raw["msg"])
    value = raw["value"].strip() if isinstance(raw["value"], str) and raw["value"].strip() else None
    model_reason = raw["reason"].strip() or "No reason given."
    problems: list[str] = []
    flags: list[Flag] = []
    sources: list[Source] = []

    if model_status == "missing":
        if quote or msg:
            problems.append("the model says this is missing but also cites messages")
            status = NEEDS_REVIEW
        else:
            status = "missing"
    else:
        status = model_status
        if not quote:
            problems.append("no quote: the term does not point at any message")
        if model_status == "stated" and value is None:
            problems.append("the term is marked stated but has no value")
        _check_quotes(pt, model_status, quote, msg, messages, problems)

        if value is not None:
            checks = [value_follows_quote(pt.type, value, q) for q in quote]
            if checks and not any(ok for ok, _ in checks):
                problems.append(checks[0][1] if len(checks) == 1 else f"the value {value} does not follow from any of the quotes")

        sets = _numeric_sets(pt.type, quote)
        if model_status == "contradicted":
            if len(set(msg)) < 2:
                problems.append("contradicted needs quotes from at least two different messages")
            elif sets and not any(a != b for a in sets for b in sets):
                problems.append("the quotes carry the same number, so they do not contradict each other")
        elif model_status == "stated" and len(sets) > 1 and any(a.isdisjoint(b) for a in sets for b in sets if a and b):
            problems.append("the quotes carry different numbers, so the term is not simply stated")

        # Rule flags over the cited messages (valid ones only).
        seen: set[tuple[str, int]] = set()
        for q, n in zip(quote, msg):
            if 1 <= n <= len(messages) and messages[n - 1].kind == "message":
                m = messages[n - 1]
                sources.append(Source(n, m.sender, m.text, q))
                for fid, reason in detect_flags(pt.type, m.text, q):
                    if (fid, n) not in seen:
                        seen.add((fid, n))
                        flags.append(Flag(fid, pt.key, (n,), reason))
        cited = [n for n in msg if 1 <= n <= len(messages) and messages[n - 1].kind == "message"]
        if cited:
            last = max(cited)
            who = messages[last - 1].sender
            if not any(m.kind == "message" and m.n > last and m.sender != who for m in messages):
                flags.append(Flag("unconfirmed", pt.key, (last,), f"{who} said this and nobody has replied to it."))

        unclear_ids = sorted({f.id for f in flags if f.id in UNCLEAR_FLAGS})
        if model_status == "stated" and unclear_ids:
            problems.append(f"the model says stated, but the rules see {', '.join(unclear_ids)}")
        if model_status == "unclear" and not unclear_ids:
            problems.append("the model says unclear, but no rule sees why")
        if problems:
            status = NEEDS_REVIEW

    reason = model_reason if not problems else "Please check this one: " + "; ".join(problems) + "."
    term = Term(pt.key, pt.label, pt.type, pt.required, status, model_status, value, quote, msg, reason, problems, sources)
    return term, flags


def extract_terms(messages: list[Message], playbook: Playbook, adapter: ModelAdapter, numbered_chat: str | None = None) -> Report:
    """Ask the adapter, check every term. Never raises on bad model output or a failing adapter."""
    from .chat_import import format_numbered

    chat = numbered_chat if numbered_chat is not None else format_numbered(messages)
    try:
        output = adapter.extract(chat, playbook.id)
    except Exception as exc:  # the adapter is a model: any failure is the model's, not ours
        report = _unusable(playbook, "the model could not be run")
        report.model_error = f"{type(exc).__name__}: {exc}"
        return report

    whole = check_model_output(output)
    if not isinstance(output, dict) or not isinstance(output.get("terms"), dict):
        report = _unusable(playbook, "the answer is not in the expected format")
        report.output_problems = whole
        return report

    raw_terms = output["terms"]
    report = Report({}, ignored_keys=sorted(str(k) for k in raw_terms if k not in playbook.terms))
    for key, pt in playbook.terms.items():
        if key not in raw_terms:
            report.terms[key] = _blank_term(pt, "missing", "No message states this.")
            continue
        term, flags = _build_term(pt, raw_terms[key], messages)
        report.terms[key] = term
        report.flags.extend(flags)
    return report
