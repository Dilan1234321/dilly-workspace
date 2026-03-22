"""Fallback non-LLM verdict generation for ReadyCheck."""

from __future__ import annotations

import math
import uuid
from typing import Any


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(round(float(value)))
    except Exception:
        return default


def _map_action_type(text: str) -> tuple[str, dict[str, str]]:
    t = (text or "").lower()
    if "cert" in t or "bloomberg" in t:
        return "open_certifications", {}
    if "ats" in t or "keyword" in t or "parser" in t:
        return "open_ats", {}
    if "gpa" in t:
        return "open_voice", {"prompt": "Help me present my GPA and coursework better"}
    if "interview" in t:
        return "open_interview_prep", {}
    return "open_bullet_practice", {}


def _fallback_actions(recommendations: list[dict], smart_gap: int, grit_gap: int, build_gap: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    recs = [r for r in recommendations if isinstance(r, dict)]
    for idx, rec in enumerate(recs[:4]):
        title = str(rec.get("title") or rec.get("action") or "Improve resume evidence").strip()
        desc = str(rec.get("suggested_line") or rec.get("diagnosis") or rec.get("action") or "").strip()[:220]
        lower = f"{title} {desc}".lower()
        dim = "grit"
        pts = 4
        if "smart" in lower or "quant" in lower or "gpa" in lower:
            dim = "smart"
            pts = 3 + max(0, min(8, abs(smart_gap)))
        elif "build" in lower or "project" in lower or "cert" in lower or "ats" in lower:
            dim = "build"
            pts = 3 + max(0, min(8, abs(build_gap)))
        else:
            dim = "grit"
            pts = 3 + max(0, min(8, abs(grit_gap)))
        action_type, payload = _map_action_type(lower)
        out.append(
            {
                "id": str(uuid.uuid4()),
                "priority": idx + 1,
                "title": title[:110] or "Improve one critical gap",
                "description": desc or "Focus this week on the highest-impact improvement from your audit.",
                "dimension": dim,
                "estimated_pts": int(max(2, min(12, pts))),
                "effort": "medium",
                "action_type": action_type,
                "action_payload": payload,
                "completed": False,
                "completed_at": None,
            }
        )
    while len(out) < 2:
        out.append(
            {
                "id": str(uuid.uuid4()),
                "priority": len(out) + 1,
                "title": "Quantify one resume bullet",
                "description": "Add a measurable outcome to one bullet tied to your target role.",
                "dimension": "grit",
                "estimated_pts": 6,
                "effort": "low",
                "action_type": "open_bullet_practice",
                "action_payload": {},
                "completed": False,
                "completed_at": None,
            }
        )
    out.sort(key=lambda x: x.get("estimated_pts", 0), reverse=True)
    for i, row in enumerate(out, start=1):
        row["priority"] = i
    return out[:4]


def build_ready_check_fallback(
    *,
    company: str,
    role: str | None,
    user_scores: dict[str, int],
    company_bars: dict[str, int],
    recommendations: list[dict],
) -> dict[str, Any]:
    smart_gap = _to_int(user_scores.get("smart")) - _to_int(company_bars.get("smart_min"))
    grit_gap = _to_int(user_scores.get("grit")) - _to_int(company_bars.get("grit_min"))
    build_gap = _to_int(user_scores.get("build")) - _to_int(company_bars.get("build_min"))
    final_gap = _to_int(user_scores.get("final")) - _to_int(company_bars.get("final_min"))
    negatives = [g for g in (smart_gap, grit_gap, build_gap, final_gap) if g < 0]

    if not negatives:
        verdict = "ready"
        verdict_label = "Ready"
    elif min(negatives) >= -5:
        verdict = "almost"
        verdict_label = "Almost ready"
    elif min(negatives) >= -12:
        verdict = "stretch"
        verdict_label = "Stretch"
    else:
        verdict = "not_yet"
        verdict_label = "Not yet"

    summary = (
        f"For {company}, your final score is {_to_int(user_scores.get('final'))} versus a bar of "
        f"{_to_int(company_bars.get('final_min'))}. "
    )
    if verdict == "ready":
        summary += "You meet the baseline across dimensions and can apply now while tightening execution."
    elif verdict == "almost":
        summary += "You are close; one focused sprint on your biggest gap can move you into apply-now range."
    elif verdict == "stretch":
        summary += "This is a stretch today, but a targeted two-step plan can make you competitive soon."
    else:
        summary += "You need a stronger foundation before this target is realistic, but progress can be planned."

    dim_narratives: dict[str, str] = {"smart": "", "grit": "", "build": ""}
    if smart_gap < 0:
        dim_narratives["smart"] = f"Smart is {-smart_gap} points below this company's bar."
    if grit_gap < 0:
        dim_narratives["grit"] = f"Grit is {-grit_gap} points below the expected level."
    if build_gap < 0:
        dim_narratives["build"] = f"Build is {-build_gap} points under the bar; evidence depth is the issue."

    timeline_weeks = None
    timeline_note = None
    if verdict != "ready":
        weeks = int(max(2, min(14, math.ceil(abs(min(negatives)) / 2.5))))
        timeline_weeks = weeks
        timeline_note = f"If you complete the roadmap, a realistic re-check window is about {weeks} weeks."

    actions = _fallback_actions(recommendations, smart_gap, grit_gap, build_gap)
    return {
        "verdict": verdict,
        "verdict_label": verdict_label,
        "summary": summary[:360],
        "dimension_narratives": dim_narratives,
        "timeline_weeks": timeline_weeks,
        "timeline_note": timeline_note,
        "actions": actions,
        "dimension_gaps": {
            "smart": smart_gap,
            "grit": grit_gap,
            "build": build_gap,
            "final": final_gap,
        },
    }

