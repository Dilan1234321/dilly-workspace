"""
Recruiter outreach events (email relay).

Append-only log to memory/recruiter_outreach.jsonl. Each line is JSON:
{
  "candidate_id": "16-char hex",
  "candidate_email": "student@school.edu",
  "recruiter_email": "recruiter@company.com",
  "recruiter_name": "Optional",
  "company": "Optional",
  "job_title": "Optional",
  "message_preview": "First 240 chars",
  "status": "sent" | "failed",
  "error": "Optional short error",
  "ts": "ISO8601"
}

Also provides simple throttles:
- per recruiter_email per day
- per candidate_id per day
"""

import json
import os
from datetime import datetime, timezone

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_OUTREACH_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "recruiter_outreach.jsonl")


def _utc_day_prefix(ts_iso: str) -> str:
    # "2026-03-17T..." -> "2026-03-17"
    return (ts_iso or "")[:10]


def append_outreach(
    *,
    candidate_id: str,
    candidate_email: str,
    recruiter_email: str,
    recruiter_name: str | None = None,
    company: str | None = None,
    job_title: str | None = None,
    message: str,
    status: str,
    error: str | None = None,
) -> bool:
    candidate_id = (candidate_id or "").strip()
    candidate_email = (candidate_email or "").strip().lower()
    recruiter_email = (recruiter_email or "").strip().lower()
    recruiter_name = (recruiter_name or "").strip() or None
    company = (company or "").strip() or None
    job_title = (job_title or "").strip() or None
    msg = (message or "").strip()
    status = (status or "").strip().lower()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        return False
    if not candidate_email or "@" not in candidate_email:
        return False
    if not recruiter_email or "@" not in recruiter_email:
        return False
    if status not in ("sent", "failed"):
        return False
    ts = datetime.now(timezone.utc).isoformat()
    entry = {
        "candidate_id": candidate_id,
        "candidate_email": candidate_email,
        "recruiter_email": recruiter_email,
        "ts": ts,
        "status": status,
        "message_preview": msg[:240],
    }
    if recruiter_name:
        entry["recruiter_name"] = recruiter_name[:120]
    if company:
        entry["company"] = company[:120]
    if job_title:
        entry["job_title"] = job_title[:120]
    if error:
        entry["error"] = str(error).strip()[:200]
    try:
        os.makedirs(os.path.dirname(_OUTREACH_PATH), exist_ok=True)
        with open(_OUTREACH_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return True
    except Exception:
        return False


def check_throttle(
    *,
    candidate_id: str,
    recruiter_email: str,
    max_per_recruiter_per_day: int = 20,
    max_per_candidate_per_day: int = 3,
) -> tuple[bool, str | None]:
    """
    Returns (allowed, reason_if_blocked).
    Looks only at today's UTC day prefix.
    """
    candidate_id = (candidate_id or "").strip()
    recruiter_email = (recruiter_email or "").strip().lower()
    if max_per_recruiter_per_day < 1:
        max_per_recruiter_per_day = 1
    if max_per_candidate_per_day < 1:
        max_per_candidate_per_day = 1
    if not os.path.isfile(_OUTREACH_PATH):
        return True, None
    today = datetime.now(timezone.utc).date().isoformat()
    per_recruiter = 0
    per_candidate = 0
    try:
        with open(_OUTREACH_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ts = (entry.get("ts") or "").strip()
                if _utc_day_prefix(ts) != today:
                    continue
                cid = (entry.get("candidate_id") or "").strip()
                rem = (entry.get("recruiter_email") or "").strip().lower()
                status = (entry.get("status") or "").strip().lower()
                # Count attempts regardless of sent/failed to prevent brute forcing.
                if status not in ("sent", "failed"):
                    continue
                if rem and rem == recruiter_email:
                    per_recruiter += 1
                if cid and cid == candidate_id:
                    per_candidate += 1
        if per_recruiter >= max_per_recruiter_per_day:
            return False, "Daily outreach limit reached for this recruiter."
        if per_candidate >= max_per_candidate_per_day:
            return False, "Daily outreach limit reached for this candidate."
        return True, None
    except Exception:
        # If we can't read the file, fail open (don't block) but let caller log failures.
        return True, None

