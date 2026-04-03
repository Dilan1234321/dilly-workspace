"""Score-impact estimation for conversation-derived action items."""

from __future__ import annotations

from typing import Any


def estimate_conversation_score_impact(
    action_items: list[dict[str, Any]],
    latest_audit: dict[str, Any] | None,
    track: str | None,
) -> dict[str, Any] | None:
    _ = latest_audit
    _ = track
    if not isinstance(action_items, list) or not action_items:
        return None

    breakdown = {"smart": 0.0, "grit": 0.0, "build": 0.0}
    scored_low_effort = 0
    scored_count = 0
    for item in action_items:
        if not isinstance(item, dict):
            continue
        dim = str(item.get("dimension") or "").strip().lower()
        if dim not in breakdown:
            continue
        pts_raw = item.get("estimated_pts")
        if not isinstance(pts_raw, (int, float)):
            continue
        pts = max(0.0, float(pts_raw))
        if pts <= 0:
            continue
        existing = breakdown[dim]
        multiplier = max(0.4, 1.0 - (existing / 30.0))
        gain = pts * multiplier
        breakdown[dim] += gain
        scored_count += 1
        if str(item.get("effort") or "").strip().lower() == "low":
            scored_low_effort += 1

    total = breakdown["smart"] + breakdown["grit"] + breakdown["build"]
    if total <= 0:
        return None

    if scored_low_effort >= 2:
        confidence = "high"
    elif scored_low_effort >= 1:
        confidence = "medium"
    else:
        confidence = "low"

    dominant = max(breakdown.keys(), key=lambda k: breakdown[k])
    note = (
        "Estimate confidence is lower because gains depend on execution quality."
        if confidence == "low"
        else f"Most potential is in {dominant.title()} this week."
    )
    return {
        "total_pts": int(round(total)),
        "dimension_breakdown": {
            "smart": int(round(breakdown["smart"])),
            "grit": int(round(breakdown["grit"])),
            "build": int(round(breakdown["build"])),
        },
        "confidence": confidence,
        "qualifying_note": note,
    }

