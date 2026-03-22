"""
One resume, one audit, many doors.

Evaluate which "doors" (opportunity types) a user is eligible for based on
profile + latest audit. Doors are defined in knowledge/door_criteria.json.
"""

import json
import os
from typing import Any

_WORKSPACE_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
)
_CRITERIA_PATH = os.path.join(
    _WORKSPACE_ROOT, "projects", "dilly", "knowledge", "door_criteria.json"
)

_criteria_cache: dict | None = None


def _load_criteria() -> dict:
    global _criteria_cache
    if _criteria_cache is not None:
        return _criteria_cache
    if not os.path.isfile(_CRITERIA_PATH):
        _criteria_cache = {"doors": []}
        return _criteria_cache
    try:
        with open(_CRITERIA_PATH, "r", encoding="utf-8") as f:
            _criteria_cache = json.load(f)
        return _criteria_cache
    except Exception:
        _criteria_cache = {"doors": []}
        return _criteria_cache


def _normalize_track(t: str | None) -> str:
    if not t:
        return ""
    s = (t or "").strip().lower().replace(" ", "_").replace("-", "_")
    return s


def _get_audit_signals(audit: dict | None) -> dict[str, Any]:
    """Extract signals we need for door evaluation from audit."""
    if not audit:
        return {
            "track": "",
            "smart": 0,
            "grit": 0,
            "build": 0,
            "final_score": 0,
            "ats_ready": False,
        }
    scores = audit.get("scores") or {}
    track = (audit.get("detected_track") or "").strip()
    final = float(audit.get("final_score") or 0)
    # ATS: use audit field if present; else infer from final_score >= 60 for now
    ats_ready = audit.get("ats_ready")
    if ats_ready is None:
        ats_ready = final >= 60
    return {
        "track": _normalize_track(track),
        "smart": float(scores.get("smart") or 0),
        "grit": float(scores.get("grit") or 0),
        "build": float(scores.get("build") or 0),
        "final_score": final,
        "ats_ready": bool(ats_ready),
    }


def _evaluate_one_door(door: dict, signals: dict) -> tuple[bool, dict | None]:
    """
    Return (eligible, gap). gap is None if eligible; else dict of what's missing
    (e.g. {"min_build": 65, "current_build": 58}) for UI to say "Raise Build to 65."
    """
    required = door.get("required") or {}
    if not required:
        return True, None

    gap: dict[str, Any] = {}

    if "track" in required:
        want = _normalize_track(required["track"])
        if want and signals["track"] != want:
            gap["track"] = {"required": required["track"], "current": signals["track"]}

    for key, need in required.items():
        if key == "track":
            continue
        if key == "ats_ready":
            if need and not signals["ats_ready"]:
                gap["ats_ready"] = True
            continue
        if key == "min_smart":
            if signals["smart"] < need:
                gap["min_smart"] = need
                gap["current_smart"] = signals["smart"]
            continue
        if key == "min_grit":
            if signals["grit"] < need:
                gap["min_grit"] = need
                gap["current_grit"] = signals["grit"]
            continue
        if key == "min_build":
            if signals["build"] < need:
                gap["min_build"] = need
                gap["current_build"] = signals["build"]
            continue
        if key == "min_final_score":
            if signals["final_score"] < need:
                gap["min_final_score"] = need
                gap["current_final_score"] = signals["final_score"]
            continue

    eligible = len(gap) == 0
    return eligible, (None if eligible else gap)


def _gap_summary(gap: dict, door_id: str) -> str:
    """One short sentence for UI: what to do to unlock this door."""
    parts = []
    if gap.get("min_build") is not None:
        parts.append(f"Raise Build to {int(gap['min_build'])}")
    if gap.get("min_grit") is not None:
        parts.append(f"Raise Grit to {int(gap['min_grit'])}")
    if gap.get("min_smart") is not None:
        parts.append(f"Raise Smart to {int(gap['min_smart'])}")
    if gap.get("min_final_score") is not None:
        parts.append(f"Raise overall score to {int(gap['min_final_score'])}")
    if gap.get("ats_ready"):
        parts.append("Get ATS-ready")
    if gap.get("track"):
        parts.append("Match track for this door")
    return "; ".join(parts) if parts else "Complete the requirements above"


def get_door_criteria() -> list[dict]:
    """Return list of door definitions (from JSON, sorted by order)."""
    data = _load_criteria()
    doors = data.get("doors") or []
    return sorted(doors, key=lambda d: (d.get("order") or 999, d.get("id") or ""))


def evaluate_doors(profile: dict | None, audit: dict | None) -> dict:
    """
    Evaluate all doors for this user. profile unused for now; track could come from
    profile if no audit. Returns shape for API: doors (with eligible, gap, gap_summary),
    eligible_count, next_door (first ineligible with smallest gap for "unlock" nudge).
    """
    signals = _get_audit_signals(audit)
    criteria = get_door_criteria()
    out_doors: list[dict] = []
    eligible_count = 0
    next_door: dict | None = None
    next_door_gap_size: float = float("inf")

    for door in criteria:
        eligible, gap = _evaluate_one_door(door, signals)
        entry = {
            "id": door.get("id"),
            "label": door.get("label"),
            "short_label": door.get("short_label"),
            "description": door.get("description"),
            "eligible": eligible,
            "gap": gap,
            "cta_label": door.get("cta_label"),
            "cta_path": door.get("cta_path"),
        }
        if eligible:
            eligible_count += 1
        elif gap:
            gap_summary = _gap_summary(gap, door.get("id") or "")
            entry["gap_summary"] = gap_summary
            # Prefer "next" by fewest missing points (one dimension)
            gap_size = 0
            if gap.get("min_build") is not None:
                gap_size = (gap.get("min_build") or 0) - (gap.get("current_build") or 0)
            elif gap.get("min_grit") is not None:
                gap_size = (gap.get("min_grit") or 0) - (gap.get("current_grit") or 0)
            elif gap.get("min_smart") is not None:
                gap_size = (gap.get("min_smart") or 0) - (gap.get("current_smart") or 0)
            else:
                gap_size = 50
            if gap_size < next_door_gap_size:
                next_door_gap_size = gap_size
                next_door = {
                    "id": door.get("id"),
                    "short_label": door.get("short_label"),
                    "gap_summary": gap_summary,
                }
        out_doors.append(entry)

    return {
        "doors": out_doors,
        "eligible_count": eligible_count,
        "next_door": next_door,
    }
