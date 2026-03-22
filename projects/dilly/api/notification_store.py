"""
Per-user notification storage and preferences.

Data is stored in each user's profile folder:
- notifications.json      (notification log)
- profile.json fields:
    - push_token
    - notification_prefs
"""

from __future__ import annotations

import json
import os
import tempfile
import time
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from .profile_store import get_profile, get_profile_folder_path, save_profile

_NOTIFICATIONS_FILENAME = "notifications.json"
_MAX_NOTIFICATIONS = 500

_DEFAULT_PREFS = {
    "enabled": True,
    "quiet_hours_start": 22,
    "quiet_hours_end": 8,
    "timezone": "America/New_York",
}


def _notifications_path(email: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        return ""
    return os.path.join(folder, _NOTIFICATIONS_FILENAME)


def _normalize_timezone(value: str | None) -> str:
    tz = (value or "").strip() or _DEFAULT_PREFS["timezone"]
    try:
        ZoneInfo(tz)
        return tz
    except Exception:
        return _DEFAULT_PREFS["timezone"]


def normalize_preferences(raw: dict | None) -> dict:
    data = raw if isinstance(raw, dict) else {}
    enabled = bool(data.get("enabled", _DEFAULT_PREFS["enabled"]))
    try:
        q_start = int(data.get("quiet_hours_start", _DEFAULT_PREFS["quiet_hours_start"]))
    except (TypeError, ValueError):
        q_start = _DEFAULT_PREFS["quiet_hours_start"]
    try:
        q_end = int(data.get("quiet_hours_end", _DEFAULT_PREFS["quiet_hours_end"]))
    except (TypeError, ValueError):
        q_end = _DEFAULT_PREFS["quiet_hours_end"]
    q_start = max(0, min(23, q_start))
    q_end = max(0, min(23, q_end))
    timezone_name = _normalize_timezone(data.get("timezone"))
    return {
        "enabled": enabled,
        "quiet_hours_start": q_start,
        "quiet_hours_end": q_end,
        "timezone": timezone_name,
    }


def get_preferences(email: str) -> dict:
    profile = get_profile(email) or {}
    prefs = normalize_preferences(profile.get("notification_prefs"))
    # Backfill profile defaults for old users.
    if profile.get("notification_prefs") != prefs:
        try:
            save_profile(email, {"notification_prefs": prefs})
        except Exception:
            pass
    return prefs


def update_preferences(email: str, patch: dict) -> dict:
    profile = get_profile(email) or {}
    current = normalize_preferences(profile.get("notification_prefs"))
    next_prefs = dict(current)
    if "enabled" in patch:
        next_prefs["enabled"] = bool(patch.get("enabled"))
    if "quiet_hours_start" in patch:
        try:
            next_prefs["quiet_hours_start"] = max(0, min(23, int(patch.get("quiet_hours_start"))))
        except (TypeError, ValueError):
            pass
    if "quiet_hours_end" in patch:
        try:
            next_prefs["quiet_hours_end"] = max(0, min(23, int(patch.get("quiet_hours_end"))))
        except (TypeError, ValueError):
            pass
    if "timezone" in patch:
        next_prefs["timezone"] = _normalize_timezone(str(patch.get("timezone") or ""))
    normalized = normalize_preferences(next_prefs)
    save_profile(email, {"notification_prefs": normalized})
    return normalized


def get_push_token(email: str) -> str | None:
    profile = get_profile(email) or {}
    token = profile.get("push_token")
    if token is None:
        return None
    value = str(token).strip()
    return value or None


def set_push_token(email: str, token: str | None) -> str | None:
    clean = None if token is None else str(token).strip()
    save_profile(email, {"push_token": clean or None})
    return clean or None


def _load_notifications(email: str) -> list[dict]:
    path = _notifications_path(email)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    rows = [row for row in data if isinstance(row, dict)]
    rows.sort(key=lambda x: (x.get("sent_at") or "", x.get("id") or ""), reverse=True)
    return rows


def _save_notifications(email: str, rows: list[dict]) -> None:
    path = _notifications_path(email)
    if not path:
        raise ValueError("Invalid email")
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(rows[:_MAX_NOTIFICATIONS], f, indent=2)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def list_notifications(email: str, limit: int = 7) -> list[dict]:
    rows = _load_notifications(email)
    limit = max(1, min(100, int(limit)))
    return rows[:limit]


def list_notifications_since_days(email: str, days: int) -> list[dict]:
    cutoff = time.time() - max(1, days) * 86400
    out: list[dict] = []
    for row in _load_notifications(email):
        try:
            sent = datetime.fromisoformat(str(row.get("sent_at", "")).replace("Z", "+00:00"))
            if sent.timestamp() >= cutoff:
                out.append(row)
        except Exception:
            continue
    return out


def get_last_trigger_notification(email: str, trigger_id: str) -> dict | None:
    trigger = (trigger_id or "").strip()
    if not trigger:
        return None
    for row in _load_notifications(email):
        if str(row.get("trigger_id") or "").strip() == trigger:
            return row
    return None


def log_notification(
    email: str,
    *,
    notification_id: str | None = None,
    trigger_id: str,
    message: str,
    sent_at: str | None = None,
    data_snapshot: dict | None = None,
    deep_link: str | None = None,
) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    row = {
        "id": (notification_id or "").strip() or str(uuid.uuid4()),
        "uid": email,
        "trigger_id": str(trigger_id or "").strip(),
        "message": str(message or "").strip(),
        "sent_at": sent_at or now_iso,
        "opened": False,
        "opened_at": None,
        "data_snapshot": data_snapshot or {},
        "deep_link": (deep_link or "").strip() or "/dashboard",
    }
    rows = _load_notifications(email)
    rows.insert(0, row)
    _save_notifications(email, rows)
    return row


def mark_notification_opened(email: str, notification_id: str) -> dict | None:
    target_id = (notification_id or "").strip()
    if not target_id:
        return None
    rows = _load_notifications(email)
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    updated: dict | None = None
    for row in rows:
        if str(row.get("id") or "") == target_id:
            row["opened"] = True
            row["opened_at"] = now_iso
            updated = row
            break
    if updated is None:
        return None
    _save_notifications(email, rows)
    return updated

