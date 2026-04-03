"""Quality guardrails for proactive notification copy."""

from __future__ import annotations

import re

_BANNED_PHRASES = (
    "don't forget",
    "hey ",
    "hi ",
    "check in",
    "your career",
    "time to",
    "reminder",
    "update your",
    "could be higher",
    "!",
)


def validate_message(message: str) -> bool:
    text = (message or "").strip()
    if len(text) > 120 or len(text) < 30:
        return False
    lower = text.lower()
    if any(phrase in lower for phrase in _BANNED_PHRASES):
        return False
    has_number = bool(re.search(r"\d", text))
    has_timeframe = bool(re.search(r"(day|week|month|yesterday|today|ago|left|closes)", text, re.IGNORECASE))
    if not has_number and not has_timeframe:
        return False
    return True

