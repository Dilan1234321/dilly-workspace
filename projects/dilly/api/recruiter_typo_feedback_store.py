"""
Store recruiter typo correction feedback for learning.

Append-only log to memory/recruiter_typo_feedback.jsonl. Each line is JSON:
{
  "input": "original JD with typos",
  "corrected": "what Dilly interpreted",
  "feedback": "correct" | "wrong",
  "ts": "ISO8601"
}

When feedback is "correct", Dilly takes note that it successfully figured out what they meant.
Future: could use this to skip showing "Showing results for" for validated corrections.
"""

import json
import os
from datetime import datetime, timezone

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_FEEDBACK_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "recruiter_typo_feedback.jsonl")


def append_typo_feedback(input_text: str, corrected: str, feedback: str) -> bool:
    """
    Append one typo feedback event. Returns True on success.
    feedback: "correct" | "wrong"
    """
    input_text = (input_text or "").strip()
    corrected = (corrected or "").strip()
    feedback = (feedback or "").strip().lower()
    if feedback not in ("correct", "wrong"):
        return False
    entry = {
        "input": input_text[:2000],
        "corrected": corrected[:2000],
        "feedback": feedback,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    try:
        os.makedirs(os.path.dirname(_FEEDBACK_PATH), exist_ok=True)
        with open(_FEEDBACK_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return True
    except Exception:
        return False
