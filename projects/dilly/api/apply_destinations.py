"""
Meridian Apply destinations: which jobs support "Apply on Meridian."
Maps job_id (from meridian_jobs.db) -> application_email.
Fill via career center pipeline or employer opt-in; then we show "Apply on Meridian" and send to this email.
"""

import json
import os

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_DEST_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "meridian_apply_destinations.json")


def _load() -> dict[str, str]:
    """job_id -> application_email. Empty dict if file missing."""
    if not os.path.isfile(_DEST_PATH):
        return {}
    try:
        with open(_DEST_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("destinations", data) if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save(destinations: dict[str, str]) -> None:
    os.makedirs(os.path.dirname(_DEST_PATH), exist_ok=True)
    with open(_DEST_PATH, "w", encoding="utf-8") as f:
        json.dump({"destinations": destinations}, f, indent=2)


def get_application_email(job_id: str) -> str | None:
    """Return application email for this job_id if configured, else None."""
    key = str(job_id).strip()
    if not key:
        return None
    return _load().get(key)


def get_all_destinations() -> dict[str, str]:
    """Return all job_id -> application_email (for admin/debug)."""
    return dict(_load())


def set_application_email(job_id: str, application_email: str) -> None:
    """Set application email for a job. Use empty string to remove."""
    dest = _load()
    key = str(job_id).strip()
    email = (application_email or "").strip().lower()
    if not key:
        return
    if email:
        dest[key] = email
    else:
        dest.pop(key, None)
    _save(dest)
