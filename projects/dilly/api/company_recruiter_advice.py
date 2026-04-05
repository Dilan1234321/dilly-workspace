"""
Company recruiter advice — real tips from recruiters for Dilly users, keyed by company slug.

Stored in memory/company_recruiter_advice.json. Structure:
{
  "stripe": [ {"text": "...", "created_at": "ISO8601", "source": "recruiter"} ],
  "figma": [ ... ]
}

When recruiters personally give Dilly users advice, it can be added here (manually or via recruiter UI).
"""

import json
import os
from datetime import datetime, timezone

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_ADVICE_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "company_recruiter_advice.json")


def _normalize_slug(company_slug: str) -> str:
    return (company_slug or "").strip().lower().replace(" ", "-")


def get_recruiter_advice_for_company(company_slug: str) -> list[dict]:
    """
    Return list of recruiter advice entries for this company.
    Each entry: { "text": str, "created_at": str, "source": str }.
    """
    slug = _normalize_slug(company_slug)
    if not slug:
        return []
    if not os.path.isfile(_ADVICE_PATH):
        return []
    try:
        with open(_ADVICE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        entries = data.get(slug) if isinstance(data, dict) else []
        return list(entries) if isinstance(entries, list) else []
    except Exception:
        return []


def add_recruiter_advice(company_slug: str, text: str, source: str = "recruiter") -> bool:
    """
    Append one advice entry for the company. Creates file/dict key if missing.
    Returns True on success, False on error.
    """
    slug = _normalize_slug(company_slug)
    text = (text or "").strip()
    if not slug or not text:
        return False
    entry = {
        "text": text[:2000],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": (source or "recruiter").strip() or "recruiter",
    }
    try:
        os.makedirs(os.path.dirname(_ADVICE_PATH), exist_ok=True)
        data: dict = {}
        if os.path.isfile(_ADVICE_PATH):
            with open(_ADVICE_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            if isinstance(raw, dict):
                data = dict(raw)
        existing = data.get(slug)
        if not isinstance(existing, list):
            existing = []
        data[slug] = existing + [entry]
        with open(_ADVICE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception:
        return False
