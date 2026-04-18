"""
Per-user daily chat quota. Counts outgoing Dilly chat responses per
UTC day and enforces a tier-specific cap. Tier caps are set in code
so we can tune without a migration.

Stored as a tiny JSON blob per user in the profile folder. Zero new
infra. Counter resets at 00:00 UTC.

Economics context: $9.99/mo nets ~$6.50 after Stripe + processing.
Haiku 4.5 chat with our prompt size runs ~$0.006/turn average.
At 50/day (the 'dilly' tier cap), worst-case monthly LLM is ~$9,
but p50 user will burn 5-15/day, so average cost is well under
$3/mo. Starter at 20/day is bounded at ~$3.60/mo, again p50 far
lower. Without this, an engaged user doing 100 chats/day was
single-handedly negative on their subscription.
"""

from __future__ import annotations
import json
import os
from datetime import datetime, timezone
from typing import Any

from projects.dilly.api.profile_store import get_profile_folder_path

_FILENAME = "chat_quota.json"


# Per-plan daily chat caps. Starter is tight, dilly is generous,
# pro is effectively unlimited. Tuned to keep unit economics positive
# at each tier — if any of these need to change, change this dict.
DAILY_CAPS: dict[str, int] = {
    "starter":  20,
    "building": 30,
    "dilly":    50,
    "pro":      500,   # de-facto unlimited for paying users
}


def _path(email: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        return ""
    return os.path.join(folder, _FILENAME)


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _load(email: str) -> dict[str, Any]:
    p = _path(email)
    if not p or not os.path.isfile(p):
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save(email: str, data: dict[str, Any]) -> None:
    p = _path(email)
    if not p:
        return
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, p)
    except Exception:
        pass


def cap_for_plan(plan: str) -> int:
    """Return the daily chat cap for the given plan, default starter."""
    p = (plan or "starter").lower().strip()
    return DAILY_CAPS.get(p, DAILY_CAPS["starter"])


def get_daily_usage(email: str) -> tuple[int, str]:
    """
    (used_today, today_key). If the stored day != today, we treat it
    as 0 — the caller records via record_chat() which handles the reset.
    """
    if not email:
        return (0, _today_utc())
    data = _load(email)
    today = _today_utc()
    if data.get("day") == today:
        return (int(data.get("count") or 0), today)
    return (0, today)


def record_chat(email: str) -> tuple[int, str]:
    """Increment today's counter. Returns (new_count, today_key)."""
    if not email:
        return (0, _today_utc())
    today = _today_utc()
    data = _load(email)
    if data.get("day") != today:
        data = {"day": today, "count": 0}
    data["count"] = int(data.get("count") or 0) + 1
    _save(email, data)
    return (int(data["count"]), today)


def is_over_cap(email: str, plan: str) -> tuple[bool, int, int]:
    """(over, used, cap) — used BEFORE the pending chat is counted."""
    used, _ = get_daily_usage(email)
    cap = cap_for_plan(plan)
    return (used >= cap, used, cap)
