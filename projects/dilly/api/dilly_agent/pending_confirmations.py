"""Pending confirmation persistence for high-stakes Dilly intents."""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
import re

from projects.dilly.api.profile_store import get_profile_folder_path

_FILENAME = "pending_confirmations.json"
_MAX_ROWS = 200


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat().replace("+00:00", "Z")


def _safe_dt(value: Any) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return datetime.fromtimestamp(0, tz=timezone.utc)


def _path(uid: str) -> str:
    folder = get_profile_folder_path(uid)
    if not folder:
        return ""
    return os.path.join(folder, _FILENAME)


class _Lock:
    def __init__(self, path: str):
        self._path = path
        self._f = None

    def __enter__(self):
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        self._f = open(self._path, "w")
        fcntl.flock(self._f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *_):
        if self._f:
            fcntl.flock(self._f, fcntl.LOCK_UN)
            self._f.close()


def _load(uid: str) -> list[dict[str, Any]]:
    path = _path(uid)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [x for x in data if isinstance(x, dict)]


def _save(uid: str, rows: list[dict[str, Any]]) -> None:
    path = _path(uid)
    if not path:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(rows[:_MAX_ROWS], f, indent=2)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def save_pending_confirmation(uid: str, conv_id: str, intent: dict[str, Any]) -> dict[str, Any]:
    path = _path(uid)
    if not path:
        return {}
    lock = path + ".lock"
    now = _now()
    row = {
        "id": str(uuid.uuid4()),
        "uid": uid,
        "conv_id": conv_id,
        "intent": intent,
        "created_at": now.isoformat().replace("+00:00", "Z"),
        "expires_at": (now + timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
        "resolved": False,
        "unclear_attempts": 0,
    }
    with _Lock(lock):
        rows = _load(uid)
        rows.insert(0, row)
        _save(uid, rows)
    return row


def get_active_pending_confirmation(uid: str, conv_id: str) -> dict[str, Any] | None:
    rows = _load(uid)
    now = _now()
    changed = False
    active: dict[str, Any] | None = None
    for row in rows:
        if bool(row.get("resolved")):
            continue
        if _safe_dt(row.get("expires_at")) <= now:
            row["resolved"] = True
            changed = True
            continue
        if str(row.get("conv_id") or "").strip() == str(conv_id or "").strip():
            active = row
            break
    if changed:
        _save(uid, rows)
    return active


def bump_unclear_attempt(uid: str, confirmation_id: str) -> dict[str, Any] | None:
    rows = _load(uid)
    out = None
    for row in rows:
        if str(row.get("id") or "") != str(confirmation_id or ""):
            continue
        attempts = int(row.get("unclear_attempts") or 0) + 1
        row["unclear_attempts"] = attempts
        if attempts >= 2:
            row["resolved"] = True
        out = row
        break
    if out:
        _save(uid, rows)
    return out


def resolve_pending_confirmation(uid: str, confirmation_id: str, resolution: str) -> dict[str, Any] | None:
    rows = _load(uid)
    out = None
    res = str(resolution or "").strip().lower()
    for row in rows:
        if str(row.get("id") or "") != str(confirmation_id or ""):
            continue
        row["resolved"] = True
        row["resolution"] = "confirmed" if res == "confirmed" else "denied"
        row["resolved_at"] = _now_iso()
        out = row
        break
    if out:
        _save(uid, rows)
    return out


def detect_confirmation_resolution(message: str) -> str | None:
    msg = str(message or "").strip()
    if not msg:
        return None
    affirmative = re.search(r"\b(yes|yeah|yep|sure|do it|correct|right|go ahead|confirm|ok|okay)\b", msg, flags=re.IGNORECASE)
    negative = re.search(r"\b(no|nope|don't|cancel|stop|nevermind|never mind|forget it)\b", msg, flags=re.IGNORECASE)
    if affirmative:
        return "confirmed"
    if negative:
        return "denied"
    return None

