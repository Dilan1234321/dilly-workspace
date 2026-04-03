"""Natural-language date resolution for Dilly agent intents."""

from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta
from typing import Any

_MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
_MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_abbr) if m})


def _ordinal_day(raw: str) -> int | None:
    m = re.search(r"\b([0-3]?\d)(?:st|nd|rd|th)?\b", raw, flags=re.IGNORECASE)
    if not m:
        return None
    d = int(m.group(1))
    if d < 1 or d > 31:
        return None
    return d


def _weekday_index(name: str) -> int | None:
    n = name.strip().lower()[:3]
    mapping = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
    return mapping.get(n)


def _next_weekday(today: date, target: int) -> date:
    delta = (target - today.weekday()) % 7
    if delta == 0:
        delta = 7
    return today + timedelta(days=delta)


def _resolve_relative(raw: str, today: date) -> date | None:
    text = raw.lower().strip()
    if text == "tomorrow":
        return today + timedelta(days=1)
    if text == "today":
        return today
    m = re.search(r"\bin\s+(\d+)\s+day", text)
    if m:
        return today + timedelta(days=int(m.group(1)))
    m = re.search(r"\bin\s+(\d+)\s+week", text)
    if m:
        return today + timedelta(days=7 * int(m.group(1)))
    m = re.search(r"\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", text)
    if m:
        idx = _weekday_index(m.group(1))
        if idx is not None:
            return _next_weekday(today, idx)
    return None


def resolve_natural_date(raw: str, today: date | str | datetime | None = None) -> dict[str, Any]:
    t = today.date() if isinstance(today, datetime) else (today if isinstance(today, date) else date.today())
    if isinstance(today, str):
        try:
            t = datetime.fromisoformat(today.replace("Z", "+00:00")).date()
        except Exception:
            t = date.today()
    text = str(raw or "").strip()
    if not text:
        return {
            "iso": "",
            "confidence": "ambiguous",
            "assumption": None,
            "needs_clarification": True,
            "clarification_question": "When exactly? I want to save the right date.",
        }

    lower = text.lower()
    # Vague terms.
    if re.search(r"\b(soon|this month|sometime|later)\b", lower):
        return {
            "iso": "",
            "confidence": "ambiguous",
            "assumption": None,
            "needs_clarification": True,
            "clarification_question": "When exactly? I want to save the right date.",
        }

    # Full date with year.
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%B %d %Y", "%b %d %Y"):
        try:
            dt = datetime.strptime(text, fmt).date()
            return {
                "iso": dt.isoformat(),
                "confidence": "certain",
                "assumption": None,
                "needs_clarification": False,
                "clarification_question": None,
            }
        except Exception:
            pass

    # Relative.
    rel = _resolve_relative(lower, t)
    if rel is not None:
        return {
            "iso": rel.isoformat(),
            "confidence": "certain",
            "assumption": None,
            "needs_clarification": False,
            "clarification_question": None,
        }

    # Month + day.
    mm = re.search(
        r"\b(january|february|march|april|may|june|july|august|september|october|november|december|"
        r"jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+([0-3]?\d)(?:st|nd|rd|th)?\b",
        lower,
    )
    if mm:
        month_raw = mm.group(1)
        day = int(mm.group(2))
        if month_raw == "sept":
            month_raw = "sep"
        month = _MONTHS.get(month_raw, 0)
        if month and 1 <= day <= 31:
            try:
                this_year = date(t.year, month, day)
            except Exception:
                this_year = None
            if this_year is not None:
                if this_year >= t:
                    return {
                        "iso": this_year.isoformat(),
                        "confidence": "certain",
                        "assumption": None,
                        "needs_clarification": False,
                        "clarification_question": None,
                    }
                days_ago = (t - this_year).days
                if days_ago <= 30:
                    next_year = date(t.year + 1, month, day)
                    return {
                        "iso": "",
                        "confidence": "ambiguous",
                        "assumption": None,
                        "needs_clarification": True,
                        "clarification_question": f"Did you mean {this_year.isoformat()} or {next_year.isoformat()}?",
                    }
                next_year = date(t.year + 1, month, day)
                return {
                    "iso": next_year.isoformat(),
                    "confidence": "assumed",
                    "assumption": f"Assumed {next_year.isoformat()}",
                    "needs_clarification": False,
                    "clarification_question": None,
                }

    # Day only.
    day_only = _ordinal_day(lower)
    if day_only is not None and not mm:
        year = t.year
        month = t.month
        if day_only <= t.day:
            month += 1
            if month > 12:
                month = 1
                year += 1
        try:
            dt = date(year, month, day_only)
        except Exception:
            return {
                "iso": "",
                "confidence": "ambiguous",
                "assumption": None,
                "needs_clarification": True,
                "clarification_question": "When exactly? I want to save the right date.",
            }
        return {
            "iso": dt.isoformat(),
            "confidence": "assumed",
            "assumption": f"Assumed {dt.isoformat()}",
            "needs_clarification": False,
            "clarification_question": None,
        }

    return {
        "iso": "",
        "confidence": "ambiguous",
        "assumption": None,
        "needs_clarification": True,
        "clarification_question": "When exactly? I want to save the right date.",
    }

