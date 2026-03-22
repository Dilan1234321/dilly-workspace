"""
Family plan: one parent payment for up to N students. Stored in memory/meridian_families.json.
Schema: list of { id, parent_email, slots, student_emails: [], stripe_subscription_id?, created_at }.
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
_FAMILY_FILE = os.path.join(_WORKSPACE_ROOT, "memory", "meridian_families.json")
_LOCK_FILE = _FAMILY_FILE + ".lock"


def _load() -> list:
    if not os.path.isfile(_FAMILY_FILE):
        return []
    try:
        with open(_FAMILY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save(records: list) -> None:
    dirpath = os.path.dirname(_FAMILY_FILE)
    os.makedirs(dirpath, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dirpath, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
        os.replace(tmp, _FAMILY_FILE)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def create_family(parent_email: str, slots: int = 3, stripe_subscription_id: str | None = None) -> str:
    """Create a family account. Returns family_id. Also sets family_add_token for secure add-student link."""
    parent_email = (parent_email or "").strip().lower()
    if not parent_email:
        raise ValueError("parent_email required")
    if slots < 1 or slots > 5:
        slots = 3
    family_id = secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:12]
    family_add_token = secrets.token_urlsafe(24)
    record = {
        "id": family_id,
        "parent_email": parent_email,
        "slots": slots,
        "student_emails": [],
        "stripe_subscription_id": stripe_subscription_id,
        "family_add_token": family_add_token,
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
    return family_id


def add_student_to_family(family_id: str, student_email: str) -> bool:
    """Add a student to the family. Returns True if added (consumes one slot)."""
    family_id = (family_id or "").strip()
    student_email = (student_email or "").strip().lower()
    if not family_id or not student_email:
        return False
    with open(_LOCK_FILE, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            records = _load()
            for r in records:
                if r.get("id") == family_id:
                    students = r.get("student_emails") or []
                    if student_email in students:
                        return True
                    if len(students) >= (r.get("slots") or 3):
                        return False
                    students.append(student_email)
                    r["student_emails"] = students
                    _save(records)
                    return True
            return False
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


def get_family_by_id(family_id: str) -> dict | None:
    """Return family record or None."""
    family_id = (family_id or "").strip()
    if not family_id:
        return None
    for r in _load():
        if r.get("id") == family_id:
            return r
    return None


def get_family_by_parent_email(parent_email: str) -> dict | None:
    """Return first family for this parent email."""
    parent_email = (parent_email or "").strip().lower()
    if not parent_email:
        return None
    for r in _load():
        if (r.get("parent_email") or "").strip().lower() == parent_email:
            return r
    return None


def is_student_in_any_family(email: str) -> bool:
    """Return True if this email is a student in any family (so they get subscription via family)."""
    email = (email or "").strip().lower()
    if not email:
        return False
    for r in _load():
        if email in (r.get("student_emails") or []):
            return True
    return False


def get_family_by_add_token(token: str) -> dict | None:
    """Return family record if token matches family_add_token."""
    token = (token or "").strip()
    if not token:
        return None
    for r in _load():
        if (r.get("family_add_token") or "").strip() == token:
            return r
    return None


def add_student_by_token(family_add_token: str, student_email: str) -> bool:
    """Add student to family identified by family_add_token. Returns True if added."""
    family = get_family_by_add_token(family_add_token)
    if not family:
        return False
    return add_student_to_family(family["id"], student_email)
