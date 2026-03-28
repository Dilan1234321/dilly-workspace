"""
File-based audit history. Audits stored in memory/dilly_profiles/{uid}/audit_history.json.
No Postgres required.
"""

import hashlib
import json
import os
import threading
import time

_WORKSPACE_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
_PROFILES_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")

_lock = threading.Lock()


def _user_id(email: str) -> str:
    e = (email or "").strip().lower()
    return hashlib.sha256(e.encode("utf-8")).hexdigest()[:16] if e else ""


def _history_path(email: str) -> str:
    uid = _user_id(email)
    if not uid:
        return ""
    return os.path.join(_PROFILES_DIR, uid, "audit_history.json")


def append_audit(email: str, summary: dict) -> None:
    email = (email or "").strip().lower()
    if not email:
        return
    path = _history_path(email)
    if not path:
        return
    with _lock:
        try:
            with open(path) as f:
                history = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            history = []
        entry = {**summary, "ts": summary.get("ts", time.time())}
        history.append(entry)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(history, f, indent=2)


def get_audits(email: str) -> list:
    email = (email or "").strip().lower()
    if not email:
        return []
    path = _history_path(email)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path) as f:
            history = json.load(f)
        return sorted(history, key=lambda x: x.get("ts", 0), reverse=True)
    except Exception:
        return []


def normalize_audit_id_key(val: object) -> str:
    if val is None:
        return ""
    return str(val).strip().lower().replace("-", "")
