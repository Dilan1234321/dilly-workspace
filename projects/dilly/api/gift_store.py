"""
Gift Meridian: parent buys 6 or 12 months for a student. Redemption by student .edu email.
Stored in memory/meridian_gift_redemptions.json. Schema: list of { recipient_email, months, code, expires_at, redeemed_at?, created_at }.
"""

import fcntl
import json
import os
import secrets
import tempfile
import time

_WORKSPACE_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
_GIFT_FILE = os.path.join(_WORKSPACE_ROOT, "memory", "meridian_gift_redemptions.json")
_LOCK_FILE = _GIFT_FILE + ".lock"


def _load() -> list:
    if not os.path.isfile(_GIFT_FILE):
        return []
    try:
        with open(_GIFT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save(records: list) -> None:
    dirpath = os.path.dirname(_GIFT_FILE)
    os.makedirs(dirpath, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dirpath, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
        os.replace(tmp, _GIFT_FILE)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def create_gift(recipient_email: str, months: int) -> str:
    """Create a gift for recipient_email (must be .edu). months is 6 or 12. Returns redemption code."""
    recipient_email = (recipient_email or "").strip().lower()
    if not recipient_email or ".edu" not in recipient_email:
        raise ValueError("recipient_email must be a .edu address")
    if months not in (6, 12):
        raise ValueError("months must be 6 or 12")
    code = secrets.token_urlsafe(10).replace("-", "").replace("_", "")[:12].upper()
    expires_at = time.time() + (months * 30 * 86400)  # rough: 30 days per month
    record = {
        "recipient_email": recipient_email,
        "months": months,
        "code": code,
        "expires_at": expires_at,
        "redeemed_at": None,
        "created_at": time.time(),
    }
    with open(_LOCK_FILE, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            records = _load()
            records.append(record)
            _save(records)
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)
    return code


def redeem_gift(code: str, recipient_email: str) -> bool:
    """Redeem a gift code for this recipient_email. Returns True if redeemed (and caller should set user subscribed)."""
    code = (code or "").strip().upper()
    recipient_email = (recipient_email or "").strip().lower()
    if not code or not recipient_email:
        return False
    with open(_LOCK_FILE, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            records = _load()
            now = time.time()
            for r in records:
                if (r.get("code") or "").upper() == code and not r.get("redeemed_at"):
                    if (r.get("recipient_email") or "").strip().lower() != recipient_email:
                        return False
                    if (r.get("expires_at") or 0) < now:
                        return False
                    r["redeemed_at"] = now
                    _save(records)
                    return True
            return False
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)
