"""
Per-user ATS score history for tracking over time.

Stores ATS readiness score (0-100) when each scan completes.
Capped at 50 entries; oldest dropped.
Also appends to a global cohort log (no PII) for peer percentile.
"""

import json
import os
import time

from .profile_store import get_profile_folder_path

_ATS_SCORES_FILENAME = "ats_scores.json"
_MAX_ENTRIES = 50

_WORKSPACE_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
_COHORT_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "ats_score_cohort.jsonl")
_MIN_COHORT_FOR_PERCENTILE = 10


def _append_to_cohort(score: int) -> None:
    """Append one score to the global cohort log (no PII)."""
    score = max(0, min(100, score))
    os.makedirs(os.path.dirname(_COHORT_PATH), exist_ok=True)
    try:
        with open(_COHORT_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": time.time(), "score": score}) + "\n")
    except Exception:
        pass


def _load_cohort_scores() -> list[int]:
    """Load all scores from cohort log (for percentile)."""
    if not os.path.isfile(_COHORT_PATH):
        return []
    scores: list[int] = []
    try:
        with open(_COHORT_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                s = entry.get("score")
                if s is not None:
                    try:
                        scores.append(max(0, min(100, int(s))))
                    except (TypeError, ValueError):
                        pass
    except Exception:
        pass
    return scores


def percentile_of(value: int, sorted_values: list[int]) -> int:
    """Return approximate percentile 0-100: % of cohort with score <= value. Higher score = higher percentile."""
    if not sorted_values:
        return 50
    n = len(sorted_values)
    count = sum(1 for v in sorted_values if v <= value)
    return min(100, max(0, int(round(100 * count / n))))


def get_ats_score_percentile(score: int) -> int | None:
    """
    Return this score's percentile vs the global ATS cohort (0-100).
    Used to show "Top X%" where X = 100 - percentile.
    Returns None if cohort is too small.
    """
    scores = _load_cohort_scores()
    if len(scores) < _MIN_COHORT_FOR_PERCENTILE:
        return None
    score = max(0, min(100, score))
    sorted_scores = sorted(scores)
    return percentile_of(score, sorted_scores)


def append_ats_score(email: str, score: int, audit_id: str | None = None) -> None:
    """
    Append one ATS score for this user.

    Args:
        email: User email (lowercase)
        score: ATS readiness score 0-100
        audit_id: Optional audit ID this score is associated with
    """
    email = (email or "").strip().lower()
    if not email:
        return
    folder = get_profile_folder_path(email)
    if not folder:
        return
    path = os.path.join(folder, _ATS_SCORES_FILENAME)
    entry = {"ts": time.time(), "score": max(0, min(100, score)), "audit_id": audit_id}
    os.makedirs(folder, exist_ok=True)
    existing = []
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            existing = []
    if not isinstance(existing, list):
        existing = []
    existing.append(entry)
    if len(existing) > _MAX_ENTRIES:
        existing = sorted(existing, key=lambda x: x.get("ts") or 0, reverse=True)[:_MAX_ENTRIES]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2)
    _append_to_cohort(max(0, min(100, score)))


def get_ats_scores(email: str) -> list:
    """Return list of ATS score entries for this user, newest first (by ts desc)."""
    email = (email or "").strip().lower()
    if not email:
        return []
    folder = get_profile_folder_path(email)
    if not folder:
        return []
    path = os.path.join(folder, _ATS_SCORES_FILENAME)
    if not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return sorted(data, key=lambda x: x.get("ts") or 0, reverse=True)
