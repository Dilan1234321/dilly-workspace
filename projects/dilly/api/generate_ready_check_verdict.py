"""LLM verdict generation for ReadyCheck."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from dilly_core.llm_client import get_chat_completion, is_llm_available
from projects.dilly.api.ready_check_fallback import build_ready_check_fallback


def _strip_fences(text: str) -> str:
    return re.sub(r"```(?:json)?|```", "", text or "", flags=re.IGNORECASE).strip()


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(round(float(value)))
    except Exception:
        return default


def _safe_action(row: dict[str, Any], idx: int) -> dict[str, Any]:
    dimension = str(row.get("dimension") or "grit").strip().lower()
    if dimension not in {"smart", "grit", "build"}:
        dimension = "grit"
    effort = str(row.get("effort") or "medium").strip().lower()
    if effort not in {"low", "medium", "high"}:
        effort = "medium"
    action_type = str(row.get("action_type") or "").strip()
    if action_type not in {
        "open_bullet_practice",
        "open_certifications",
        "open_voice",
        "open_ats",
        "open_interview_prep",
    }:
        action_type = "open_bullet_practice"
    payload = row.get("action_payload") if isinstance(row.get("action_payload"), dict) else {}
    return {
        "id": str(row.get("id") or uuid.uuid4()),
        "priority": int(row.get("priority") or idx + 1),
        "title": str(row.get("title") or "High-impact improvement").strip()[:120],
        "description": str(row.get("description") or "").strip()[:360],
        "dimension": dimension,
        "estimated_pts": max(1, min(20, _to_int(row.get("estimated_pts"), 5))),
        "effort": effort,
        "action_type": action_type,
        "action_payload": payload,
        "completed": False,
        "completed_at": None,
    }


def generate_ready_check_verdict(
    *,
    company: str,
    role: str | None,
    profile: dict[str, Any],
    user_scores: dict[str, int],
    company_bars: dict[str, int],
    cohort_stats: dict[str, Any] | None,
    company_signals: str,
    top_recommendations: list[dict],
) -> dict[str, Any]:
    dimension_gaps = {
        "smart": _to_int(user_scores.get("smart")) - _to_int(company_bars.get("smart_min")),
        "grit": _to_int(user_scores.get("grit")) - _to_int(company_bars.get("grit_min")),
        "build": _to_int(user_scores.get("build")) - _to_int(company_bars.get("build_min")),
        "final": _to_int(user_scores.get("final")) - _to_int(company_bars.get("final_min")),
    }
    fallback = build_ready_check_fallback(
        company=company,
        role=role,
        user_scores=user_scores,
        company_bars=company_bars,
        recommendations=top_recommendations,
    )
    if not is_llm_available():
        return fallback

    system = """You are a senior recruiter giving a private readiness verdict.

Use the candidate and company signals to return a strict JSON object:
{
  "verdict": "ready" | "almost" | "stretch" | "not_yet",
  "verdict_label": "short title",
  "summary": "2-3 sentences, concrete, numeric",
  "dimension_narratives": { "smart": "...", "grit": "...", "build": "..." },
  "timeline_weeks": number | null,
  "timeline_note": string | null,
  "actions": [
    {
      "priority": 1,
      "title": "short",
      "description": "specific",
      "dimension": "smart|grit|build",
      "estimated_pts": number,
      "effort": "low|medium|high",
      "action_type": "open_bullet_practice|open_certifications|open_voice|open_ats|open_interview_prep",
      "action_payload": {}
    }
  ]
}

Rules:
- Cite actual numbers from the input.
- Max 4 actions, sorted highest estimated_pts first.
- If verdict is ready, timeline fields should be null and actions may be empty.
- Dimension narratives should be meaningful for below-bar dimensions.
- Output JSON only, no markdown."""
    payload = {
        "student": {
            "name": profile.get("name"),
            "track": profile.get("track"),
            "major": profile.get("major"),
            "school": profile.get("school_name"),
        },
        "target": {"company": company, "role": role},
        "user_scores": user_scores,
        "company_bars": company_bars,
        "dimension_gaps": dimension_gaps,
        "cohort": cohort_stats or {},
        "company_signals": company_signals,
        "top_recommendations": top_recommendations[:3],
    }
    raw = get_chat_completion(
        system,
        json.dumps(payload, ensure_ascii=True),
        model="claude-sonnet-4-6",
        temperature=0.2,
        max_tokens=1000,
    )
    if not raw:
        return fallback
    try:
        parsed = json.loads(_strip_fences(raw))
    except (ValueError, json.JSONDecodeError, TypeError):
        return fallback
    if not isinstance(parsed, dict):
        return fallback

    verdict = str(parsed.get("verdict") or "").strip().lower()
    if verdict not in {"ready", "almost", "stretch", "not_yet"}:
        return fallback
    actions_raw = parsed.get("actions") if isinstance(parsed.get("actions"), list) else []
    actions = [_safe_action(row, idx) for idx, row in enumerate(actions_raw[:4]) if isinstance(row, dict)]
    actions.sort(key=lambda x: int(x.get("estimated_pts") or 0), reverse=True)
    for i, row in enumerate(actions, start=1):
        row["priority"] = i

    narratives = parsed.get("dimension_narratives") if isinstance(parsed.get("dimension_narratives"), dict) else {}
    dim_narratives = {
        "smart": str(narratives.get("smart") or ""),
        "grit": str(narratives.get("grit") or ""),
        "build": str(narratives.get("build") or ""),
    }
    return {
        "verdict": verdict,
        "verdict_label": str(parsed.get("verdict_label") or fallback.get("verdict_label") or "").strip()[:40],
        "summary": str(parsed.get("summary") or fallback.get("summary") or "").strip()[:500],
        "dimension_narratives": dim_narratives,
        "timeline_weeks": parsed.get("timeline_weeks"),
        "timeline_note": parsed.get("timeline_note"),
        "actions": actions,
        "dimension_gaps": dimension_gaps,
    }

