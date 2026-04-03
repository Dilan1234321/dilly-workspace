"""LLM-based intent detection for Dilly agentic control."""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

from dilly_core.llm_client import get_chat_completion
from projects.dilly.api.dilly_agent.action_types import ALL_ACTIONS
from projects.dilly.api.dilly_agent.resolve_dates import resolve_natural_date
from projects.dilly.api.dilly_agent.stake_levels import get_stake_level


def _strip_fences(text: str) -> str:
    return re.sub(r"```(?:json)?|```", "", text or "", flags=re.IGNORECASE).strip()


def _to_date(value: date | str | datetime | None) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except Exception:
            pass
    return date.today()


def _resolve_date_fields(extracted: dict[str, Any], today: date) -> tuple[dict[str, Any], bool, str | None]:
    out = dict(extracted)
    needs_clar = False
    question: str | None = None
    for k in list(out.keys()):
        if "date" not in k.lower():
            continue
        raw = out.get(k)
        if not isinstance(raw, str) or not raw.strip():
            continue
        resolved = resolve_natural_date(raw, today)
        out[f"{k}_raw"] = raw
        out[k] = resolved.get("iso")
        out[f"{k}_resolved"] = resolved
        if bool(resolved.get("needs_clarification")):
            needs_clar = True
            question = resolved.get("clarification_question") or question
    return out, needs_clar, question


def detect_intents(
    message: str,
    today: date | str | datetime,
    profile: dict[str, Any] | None,
    conversation_history: list[dict[str, Any]] | None,
    existing_deadlines: list[dict[str, Any]] | None,
    existing_applications: list[dict[str, Any]] | None,
    existing_action_items: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    msg = str(message or "").strip()
    if not msg:
        return []
    t = _to_date(today)
    history_lines = []
    for row in (conversation_history or [])[-6:]:
        if not isinstance(row, dict):
            continue
        role = str(row.get("role") or "").strip().upper()
        content = str(row.get("content") or "").strip()
        if role and content:
            history_lines.append(f"{role}: {content}")
    sys_prompt = f"""You detect user intents for Dilly's app control layer.
Today is {t.isoformat()}.
Allowed action types: {sorted(list(ALL_ACTIONS))}

Date resolution rules (must follow exactly):
- Day only ("the 2nd", "the 14th"): day > today day => this month; else next month. Never past date. confidence assumed.
- Month + day ("March 1st"): if future/today => this year certain. if passed <=30 days => needs clarification with this-year or next-year options. if passed >30 days => next year assumed.
- Relative ("next Friday", "in two weeks", "tomorrow"): compute exactly, confidence certain.
- Full date with year: parse directly, confidence certain.
- Vague ("soon", "this month"): needs clarification.

Return JSON array only. Each item:
{{
  "action": string,
  "confidence": "high"|"medium"|"low",
  "extracted_data": {{}},
  "needs_clarification": boolean,
  "clarification_question": string|null
}}
Only include medium/high confidence intents."""
    user_prompt = json.dumps(
        {
            "message": msg,
            "profile": {
                "name": (profile or {}).get("name"),
                "track": (profile or {}).get("track"),
                "major": (profile or {}).get("major"),
                "career_goal": (profile or {}).get("career_goal"),
            },
            "recent_conversation": history_lines,
            "existing_deadlines": [
                {"id": d.get("id"), "label": d.get("label"), "date": d.get("date")}
                for d in (existing_deadlines or [])[:20]
                if isinstance(d, dict)
            ],
            "existing_applications": [
                {"id": a.get("id"), "company": a.get("company"), "role": a.get("role"), "status": a.get("status")}
                for a in (existing_applications or [])[:20]
                if isinstance(a, dict)
            ],
            "existing_action_items": [
                {"id": a.get("id"), "text": a.get("text"), "done": a.get("done")}
                for a in (existing_action_items or [])[:20]
                if isinstance(a, dict)
            ],
        },
        ensure_ascii=True,
    )
    raw = get_chat_completion(sys_prompt, user_prompt, model="claude-sonnet-4-20250514", max_tokens=600, temperature=0.1)
    if not raw:
        return []
    try:
        parsed = json.loads(_strip_fences(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    out: list[dict[str, Any]] = []
    for row in parsed:
        if not isinstance(row, dict):
            continue
        action = str(row.get("action") or "").strip().upper()
        confidence = str(row.get("confidence") or "").strip().lower()
        if action not in ALL_ACTIONS:
            continue
        if confidence not in {"high", "medium", "low"}:
            continue
        if confidence == "low":
            continue
        extracted = row.get("extracted_data") if isinstance(row.get("extracted_data"), dict) else {}
        extracted, date_needs_clar, date_question = _resolve_date_fields(extracted, t)
        needs_clarification = bool(row.get("needs_clarification")) or date_needs_clar
        clarification_question = row.get("clarification_question") if isinstance(row.get("clarification_question"), str) else None
        if date_question:
            clarification_question = date_question
        out.append(
            {
                "action": action,
                "confidence": confidence,
                "extracted_data": extracted,
                "needs_clarification": needs_clarification,
                "clarification_question": clarification_question,
                "stake_level": get_stake_level(action),
            }
        )
    return out

