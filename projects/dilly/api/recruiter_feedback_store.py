"""
Recruiter feedback events for continuous learning.

Append-only log to memory/recruiter_feedback.jsonl. Each line is JSON:
{
  "candidate_id": "16-char hex",
  "role_id_or_search_id": "optional role/search identifier",
  "event": "view" | "shortlist" | "pass" | "contact",
  "ts": "ISO8601"
}

Used by POST /recruiter/feedback. Phase 1: log only. Phase 2+: feedback_score and re-ranking.
Ref: projects/dilly/docs/RECRUITER_SEMANTIC_MATCHING_SPEC.md §4, §5.3
"""

import json
import os
from datetime import datetime, timezone

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_FEEDBACK_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "recruiter_feedback.jsonl")

_VALID_EVENTS = frozenset({"view", "shortlist", "pass", "contact"})


def append_feedback(candidate_id: str, event: str, role_id_or_search_id: str | None = None) -> bool:
    """
    Append one feedback event. Returns True on success, False on error.
    candidate_id: 16-char hex profile uid.
    event: view | shortlist | pass | contact.
    role_id_or_search_id: optional identifier for the role or search context.
    """
    candidate_id = (candidate_id or "").strip()
    event = (event or "").strip().lower()
    if len(candidate_id) != 16 or not all(c in "0123456789abcdef" for c in candidate_id.lower()):
        return False
    if event not in _VALID_EVENTS:
        return False
    role_id_or_search_id = (role_id_or_search_id or "").strip() or None
    entry = {
        "candidate_id": candidate_id,
        "event": event,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    if role_id_or_search_id:
        entry["role_id_or_search_id"] = role_id_or_search_id[:256]
    try:
        os.makedirs(os.path.dirname(_FEEDBACK_PATH), exist_ok=True)
        with open(_FEEDBACK_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return True
    except Exception:
        return False


def get_feedback_scores() -> dict[str, float]:
    """
    Compute feedback_score per candidate_id from recruiter_feedback.jsonl.
    Formula: shortlists + contacts - passes. Normalized to 0-100 (50 = neutral).
    Returns dict candidate_id -> feedback_score.
    """
    scores: dict[str, float] = {}
    if not os.path.isfile(_FEEDBACK_PATH):
        return scores
    try:
        with open(_FEEDBACK_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                cid = (entry.get("candidate_id") or "").strip()
                if len(cid) != 16:
                    continue
                event = (entry.get("event") or "").strip().lower()
                if event == "shortlist" or event == "contact":
                    scores[cid] = scores.get(cid, 0) + 1
                elif event == "pass":
                    scores[cid] = scores.get(cid, 0) - 1
                # view: neutral, skip
    except Exception:
        pass
    raw = scores
    if not raw:
        return {}
    # Normalize to 0-100: 50 + raw*5, clamped. +10 -> 100, -10 -> 0.
    out: dict[str, float] = {}
    for cid, delta in raw.items():
        s = 50 + delta * 5
        out[cid] = round(max(0, min(100, s)), 1)
    return out
