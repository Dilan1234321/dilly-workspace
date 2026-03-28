"""
File-based auth store: verification codes, users, sessions.
Stores data in memory/auth/ as JSON. No Postgres required.
"""

import json
import os
import secrets
import threading
import time

_WORKSPACE_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
_AUTH_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "auth")
_CODES_FILE = os.path.join(_AUTH_DIR, "verification_codes.json")
_USERS_FILE = os.path.join(_AUTH_DIR, "users.json")
_SESSIONS_FILE = os.path.join(_AUTH_DIR, "sessions.json")

_VERIFICATION_CODE_EXPIRY_SEC = 600
_SESSION_EXPIRY_SEC = 30 * 86400
_MAGIC_LINK_EXPIRY_SEC = 900

_lock = threading.Lock()


def _ensure_dir() -> None:
    os.makedirs(_AUTH_DIR, exist_ok=True)


def _load(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save(path: str, data: dict) -> None:
    _ensure_dir()
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ── Verification codes ────────────────────────────────────────────────────────

def create_verification_code(email: str) -> str:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    expires_at = time.time() + _VERIFICATION_CODE_EXPIRY_SEC
    with _lock:
        codes = _load(_CODES_FILE)
        codes[email] = {"code": code, "expires_at": expires_at, "used": False}
        _save(_CODES_FILE, codes)
    return code


def verify_verification_code(email: str, code: str) -> bool:
    email = (email or "").strip().lower()
    code = (code or "").strip()
    if not email or not code or len(code) != 6 or not code.isdigit():
        return False
    with _lock:
        codes = _load(_CODES_FILE)
        entry = codes.get(email)
        if not entry or entry.get("used") or entry.get("expires_at", 0) < time.time():
            return False
        if entry.get("code") != code:
            return False
        codes[email]["used"] = True
        _save(_CODES_FILE, codes)
    return True


# ── Users ─────────────────────────────────────────────────────────────────────

def _upsert_user(email: str) -> dict:
    users = _load(_USERS_FILE)
    if email not in users:
        users[email] = {"email": email, "subscribed": False, "created_at": time.time()}
        _save(_USERS_FILE, users)
    return users[email]


def set_subscribed(email: str, subscribed: bool) -> None:
    email = (email or "").strip().lower()
    if not email:
        return
    with _lock:
        users = _load(_USERS_FILE)
        users.setdefault(email, {"email": email, "created_at": time.time()})["subscribed"] = subscribed
        _save(_USERS_FILE, users)


def list_active_subscribed_users() -> list:
    return [e for e, u in _load(_USERS_FILE).items() if u.get("subscribed")]


# ── Sessions ──────────────────────────────────────────────────────────────────

def create_session(email: str) -> str:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    token = secrets.token_urlsafe(32)
    expires_at = time.time() + _SESSION_EXPIRY_SEC
    with _lock:
        _upsert_user(email)
        sessions = _load(_SESSIONS_FILE)
        sessions[token] = {"email": email, "expires_at": expires_at}
        _save(_SESSIONS_FILE, sessions)
    return token


def get_session(token: str) -> dict | None:
    if not token or not token.strip():
        return None
    sessions = _load(_SESSIONS_FILE)
    entry = sessions.get(token.strip())
    if not entry or entry.get("expires_at", 0) < time.time():
        return None
    email = entry.get("email", "")
    subscribed = _load(_USERS_FILE).get(email, {}).get("subscribed", False)
    return {"email": email, "subscribed": bool(subscribed)}


def delete_session(token: str) -> bool:
    if not token or not token.strip():
        return False
    with _lock:
        sessions = _load(_SESSIONS_FILE)
        if token.strip() in sessions:
            del sessions[token.strip()]
            _save(_SESSIONS_FILE, sessions)
            return True
    return False


def delete_user_and_sessions(email: str) -> None:
    email = (email or "").strip().lower()
    if not email:
        return
    with _lock:
        users = _load(_USERS_FILE)
        users.pop(email, None)
        _save(_USERS_FILE, users)
        sessions = _load(_SESSIONS_FILE)
        for t in [t for t, s in sessions.items() if s.get("email") == email]:
            del sessions[t]
        _save(_SESSIONS_FILE, sessions)


# ── Magic tokens (in-memory, short-lived) ─────────────────────────────────────

_MAGIC_TOKENS: dict = {}


def create_magic_token(email: str) -> str:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    token = secrets.token_urlsafe(32)
    _MAGIC_TOKENS[token] = {"email": email, "expires_at": time.time() + _MAGIC_LINK_EXPIRY_SEC}
    return token


def verify_magic_token(token: str) -> str | None:
    if not token:
        return None
    entry = _MAGIC_TOKENS.pop(token, None)
    if not entry or entry["expires_at"] < time.time():
        return None
    return entry["email"]
