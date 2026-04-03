"""
Store recruiter JD fit corrections for learning.

Append-only log to memory/jd_fit_corrections.jsonl. Each line is JSON:
{
  "job_description": "JD text",
  "job_title": "optional title",
  "original_smart_min": 78,
  "original_grit_min": 82,
  "original_build_min": 80,
  "corrected_smart_min": 80,
  "corrected_grit_min": 85,
  "corrected_build_min": 82,
  "track": "Tech",
  "ts": "ISO8601"
}

Used by jd_to_meridian_scores to load corrections as few-shot examples.
"""

import json
import os
from datetime import datetime, timezone

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_CORRECTIONS_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "jd_fit_corrections.jsonl")


def append_jd_fit_correction(
    job_description: str,
    job_title: str | None,
    original_smart_min: int,
    original_grit_min: int,
    original_build_min: int,
    corrected_smart_min: int,
    corrected_grit_min: int,
    corrected_build_min: int,
    track: str | None,
) -> bool:
    """Append one JD fit correction. Returns True on success."""
    jd = (job_description or "").strip()[:8000]
    if not jd:
        return False
    try:
        os.makedirs(os.path.dirname(_CORRECTIONS_PATH), exist_ok=True)
        entry = {
            "job_description": jd,
            "job_title": (job_title or "").strip() or None,
            "original_smart_min": int(original_smart_min),
            "original_grit_min": int(original_grit_min),
            "original_build_min": int(original_build_min),
            "corrected_smart_min": int(corrected_smart_min),
            "corrected_grit_min": int(corrected_grit_min),
            "corrected_build_min": int(corrected_build_min),
            "track": (track or "").strip() or None,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        with open(_CORRECTIONS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return True
    except Exception:
        return False


def load_corrections(track: str | None = None, limit: int = 20) -> list[dict]:
    """
    Load corrections from the log. Optionally filter by track.
    Returns most recent first, up to limit.
    """
    if not os.path.isfile(_CORRECTIONS_PATH):
        return []
    entries = []
    try:
        with open(_CORRECTIONS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if track and entry.get("track") != track:
                        continue
                    entries.append(entry)
                except json.JSONDecodeError:
                    continue
    except Exception:
        return []
    entries.reverse()
    return entries[:limit]
