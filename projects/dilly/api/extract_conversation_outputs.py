"""Conversation-to-action extraction pipeline for Voice sessions."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from dilly_core.llm_client import get_chat_completion
from projects.dilly.api.audit_history import get_audits
from projects.dilly.api.build_summary_lines import build_summary_lines
from projects.dilly.api.conversation_output_store import create_action_items, save_conversation_output
from projects.dilly.api.estimate_conversation_score_impact import estimate_conversation_score_impact
from projects.dilly.api.memory_surface_store import get_session_capture
from projects.dilly.api.profile_store import get_profile, save_profile

_TOPICS = {"interview_prep", "resume_feedback", "job_search", "company_research", "general"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _strip_fences(text: str) -> str:
    return re.sub(r"```(?:json)?|```", "", text or "", flags=re.IGNORECASE).strip()


def _normalize_action_item(raw: dict[str, Any], uid: str, conv_id: str) -> dict[str, Any] | None:
    text = str(raw.get("text") or "").strip()
    if not text:
        return None
    dim = str(raw.get("dimension") or "").strip().lower()
    if dim not in {"smart", "grit", "build"}:
        dim = None
    effort = str(raw.get("effort") or "medium").strip().lower()
    if effort not in {"low", "medium", "high"}:
        effort = "medium"
    pts = raw.get("estimated_pts")
    estimated_pts = float(pts) if isinstance(pts, (int, float)) else None
    action_type = str(raw.get("action_type") or "").strip() or None
    payload = raw.get("action_payload") if isinstance(raw.get("action_payload"), dict) else {}
    return {
        "id": str(uuid.uuid4()),
        "uid": uid,
        "conv_id": conv_id,
        "text": text[:220],
        "dimension": dim,
        "estimated_pts": estimated_pts,
        "effort": effort,
        "action_type": action_type,
        "action_payload": payload,
        "done": False,
        "done_at": None,
        "created_at": _now_iso(),
        "snoozed_until": None,
        "dismissed": False,
        "acted": False,
        "acted_at": None,
    }


def _normalize_deadline(raw: dict[str, Any]) -> dict[str, Any] | None:
    label = str(raw.get("label") or "").strip()
    date_iso = str(raw.get("date") or "").strip()
    if not label or not date_iso:
        return None
    return {"id": str(uuid.uuid4()), "label": label[:120], "date": date_iso[:32]}


def _normalize_profile_update(raw: dict[str, Any]) -> dict[str, Any] | None:
    field = str(raw.get("field") or "").strip()
    if not field:
        return None
    return {
        "id": str(uuid.uuid4()),
        "field": field,
        "old_value": raw.get("old_value"),
        "new_value": raw.get("new_value"),
        "confirmed": bool(raw.get("confirmed", False)),
    }


def _session_topic_from(raw_topic: Any) -> str:
    t = str(raw_topic or "").strip().lower()
    return t if t in _TOPICS else "general"


def extract_conversation_outputs(
    uid: str,
    conv_id: str,
    messages: list[dict[str, Any]],
    profile: dict[str, Any],
    latest_audit: dict[str, Any] | None,
) -> dict[str, Any]:
    system = """You extract conversation outputs from a student coaching session.
Return JSON object only:
{
  "action_items": [{ "text": str, "dimension": "smart|grit|build|null", "estimated_pts": number|null, "effort": "low|medium|high", "action_type": str|null, "action_payload": object }],
  "deadlines": [{ "label": str, "date": "YYYY-MM-DD" }],
  "profile_updates": [{ "field": str, "old_value": any, "new_value": any, "confirmed": bool }],
  "memory_items_added": [str],
  "companies_added": [str],
  "session_title": "3-5 words",
  "session_topic": "interview_prep|resume_feedback|job_search|company_research|general"
}

Points rubric for estimated_pts:
- Quantify leadership bullet (grit): 5-8
- Add certification (build): 6-10
- Fix ATS headers: 4-8
- Add projects section (build): 6-10
- Strengthen GPA (smart): 3-6
- Add LinkedIn: 2-4
- Mock interview (grit): 3-5
- Quantified impact bullet (grit): 4-7
- Follow up with contact: 0
Extract only meaningful items."""
    convo = []
    for row in messages or []:
        if not isinstance(row, dict):
            continue
        role = str(row.get("role") or "").strip().upper()
        content = str(row.get("content") or "").strip()
        if role and content:
            convo.append(f"{role}: {content}")
    scores = (latest_audit or {}).get("scores") if isinstance((latest_audit or {}).get("scores"), dict) else {}
    user_prompt = json.dumps(
        {
            "profile": {
                "name": profile.get("name"),
                "track": profile.get("track"),
                "career_goal": profile.get("career_goal"),
            },
            "latest_audit": {
                "final_score": (latest_audit or {}).get("final_score"),
                "smart": scores.get("smart"),
                "grit": scores.get("grit"),
                "build": scores.get("build"),
                "recommendations": (latest_audit or {}).get("recommendations"),
            },
            "messages": convo[-14:],
        },
        ensure_ascii=True,
    )
    raw = get_chat_completion(
        system,
        user_prompt,
        model="claude-sonnet-4-6",
        max_tokens=1200,
        temperature=0.2,
    )
    if not raw:
        return {
            "action_items": [],
            "deadlines": [],
            "profile_updates": [],
            "memory_items_added": [],
            "companies_added": [],
            "session_title": "Voice session",
            "session_topic": "general",
        }
    try:
        parsed = json.loads(_strip_fences(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {
            "action_items": [],
            "deadlines": [],
            "profile_updates": [],
            "memory_items_added": [],
            "companies_added": [],
            "session_title": "Voice session",
            "session_topic": "general",
        }
    if not isinstance(parsed, dict):
        return {
            "action_items": [],
            "deadlines": [],
            "profile_updates": [],
            "memory_items_added": [],
            "companies_added": [],
            "session_title": "Voice session",
            "session_topic": "general",
        }
    actions = []
    for raw_item in parsed.get("action_items") or []:
        if not isinstance(raw_item, dict):
            continue
        norm = _normalize_action_item(raw_item, uid, conv_id)
        if norm:
            actions.append(norm)
    deadlines = []
    for raw_item in parsed.get("deadlines") or []:
        if not isinstance(raw_item, dict):
            continue
        norm = _normalize_deadline(raw_item)
        if norm:
            deadlines.append(norm)
    updates = []
    for raw_item in parsed.get("profile_updates") or []:
        if not isinstance(raw_item, dict):
            continue
        norm = _normalize_profile_update(raw_item)
        if norm:
            updates.append(norm)
    memory_items_added = [
        str(x).strip()
        for x in (parsed.get("memory_items_added") or [])
        if str(x).strip()
    ][:20]
    companies_added = [
        str(x).strip()
        for x in (parsed.get("companies_added") or [])
        if str(x).strip()
    ][:20]
    session_title = str(parsed.get("session_title") or "Voice session").strip()[:80]
    if not session_title:
        session_title = "Voice session"
    session_topic = _session_topic_from(parsed.get("session_topic"))
    return {
        "action_items": actions[:12],
        "deadlines": deadlines[:6],
        "profile_updates": updates[:8],
        "memory_items_added": memory_items_added,
        "companies_added": companies_added,
        "session_title": session_title,
        "session_topic": session_topic,
    }


def _save_deadlines_from_voice(uid: str, deadlines_created: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not deadlines_created:
        return []
    profile = get_profile(uid) or {}
    existing = profile.get("deadlines")
    rows = existing if isinstance(existing, list) else []
    keys = {
        (
            str(d.get("label") or "").strip().lower(),
            str(d.get("date") or "").strip(),
        )
        for d in rows
        if isinstance(d, dict)
    }
    added: list[dict[str, Any]] = []
    for item in deadlines_created:
        label = str(item.get("label") or "").strip()
        date_iso = str(item.get("date") or "").strip()
        if not label or not date_iso:
            continue
        key = (label.lower(), date_iso)
        if key in keys:
            continue
        keys.add(key)
        row = {
            "id": str(item.get("id") or uuid.uuid4()),
            "label": label,
            "date": date_iso,
            "createdBy": "voice",
            "source": "voice",
            "completedAt": None,
        }
        rows.append(row)
        added.append(row)
    if added:
        save_profile(uid, {"deadlines": rows})
    return added


def run_extract_outputs(uid: str, conv_id: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
    profile = get_profile(uid) or {}
    latest_audit = (get_audits(uid) or [None])[0]
    extracted = extract_conversation_outputs(uid, conv_id, messages, profile, latest_audit)
    created_actions = create_action_items(uid, conv_id, extracted.get("action_items") or [])
    deadlines_created = _save_deadlines_from_voice(uid, extracted.get("deadlines") or [])
    track = str(profile.get("track") or (latest_audit or {}).get("detected_track") or "general").strip()
    score_impact = estimate_conversation_score_impact(created_actions, latest_audit, track)
    summary_lines = build_summary_lines(
        created_actions,
        deadlines_created,
        extracted.get("profile_updates") or [],
        score_impact,
    )
    try:
        capture = get_session_capture(uid, conv_id) or {}
        if isinstance(capture, dict):
            conv_memory_ids = capture.get("items_added") if isinstance(capture.get("items_added"), list) else []
        else:
            conv_memory_ids = []
    except Exception:
        conv_memory_ids = []
    output = save_conversation_output(
        uid,
        {
            "uid": uid,
            "conv_id": conv_id,
            "generated_at": _now_iso(),
            "action_items_created": created_actions,
            "deadlines_created": deadlines_created,
            "profile_updates": extracted.get("profile_updates") or [],
            "memory_items_added": conv_memory_ids or extracted.get("memory_items_added") or [],
            "companies_added": extracted.get("companies_added") or [],
            "score_impact": score_impact,
            "summary_lines": summary_lines,
            "session_title": extracted.get("session_title") or "Voice session",
            "session_topic": extracted.get("session_topic") or "general",
        },
    )
    return {
        "action_items_created": len(created_actions),
        "deadlines_created": len(deadlines_created),
        "score_impact": score_impact,
        "output": output,
    }

