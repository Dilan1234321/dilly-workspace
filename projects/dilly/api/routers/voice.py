"""
Voice router: Dilly chat, stream, onboarding, tools.
Voice acts as a data-capturing layer: actively prompts for skills/experiences not on the resume
and stores them in the user's profile (beyond_resume, experience_expansion).
"""

import json
import os
import re
import sys
import time
import uuid
from typing import Any

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.normpath(os.path.join(_ROUTER_DIR, ".."))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Request, Body
from fastapi.responses import JSONResponse, StreamingResponse

from projects.dilly.api import deps, errors
from projects.dilly.api.voice_helpers import (
    build_voice_system_prompt,
    format_voice_user_content,
    extract_suggestions_from_reply,
    extract_beyond_resume_with_llm,
    extract_deadlines_from_conversation,
    get_initial_onboarding_message,
    get_initial_onboarding_messages,
    is_deep_dive_topic,
    is_onboarding_topic,
    extract_experience_expansion_with_llm,
    append_experience_expansion_and_save,
    extract_onboarding_profile_updates,
)
from projects.dilly.api.memory_queue import enqueue_memory_extraction
from projects.dilly.api.memory_surface_store import add_memory_item, get_memory_surface
from projects.dilly.api.voice_output_queue import enqueue_voice_output_extraction
from projects.dilly.api.output_safety import (
    REDIRECT_MESSAGE,
    json_contains_blocked_slur,
    sanitize_user_visible_assistant_text,
    sanitize_voice_reply_and_suggestions,
)
from projects.dilly.api.profile_store import get_profile, save_profile
from projects.dilly.api.routers.applications import _load_applications
from projects.dilly.api.conversation_output_store import list_actions
from projects.dilly.api.dilly_agent.detect_intents import detect_intents
from projects.dilly.api.dilly_agent.execute_action import execute_action
from projects.dilly.api.dilly_agent.execute_intents import execute_intents, confirmation_prompt_for_intent
from projects.dilly.api.dilly_agent.pending_confirmations import (
    bump_unclear_attempt,
    detect_confirmation_resolution,
    get_active_pending_confirmation,
    resolve_pending_confirmation,
)
from projects.dilly.api.dilly_agent.build_agent_context import build_agent_context_for_response
from dilly_core.ats_company_lookup import lookup_company_ats

router = APIRouter(tags=["voice"])


def _sse(data: dict) -> str:
    return "data: " + json.dumps(data, ensure_ascii=False) + "\n"


def _persist_voice_detected_deadlines(email: str, detected: list[dict]) -> list[dict]:
    """Merge extracted deadlines into the user's profile. Returns saved rows (id, label, date, createdBy)."""
    email = (email or "").strip().lower()
    if not email or not detected:
        return []
    try:
        profile = get_profile(email) or {}
        current = profile.get("deadlines") or []
        if not isinstance(current, list):
            current = []
        existing_keys: set[str] = set()
        for d in current:
            if isinstance(d, dict):
                lbl = (d.get("label") or "").strip()
                dt = (d.get("date") or "").strip()
                if lbl and dt:
                    existing_keys.add(f"{lbl.lower()}|{dt}")
        new_rows: list[dict] = []
        for item in detected[:8]:
            if not isinstance(item, dict):
                continue
            label = (item.get("label") or "").strip()[:200]
            date_str = (item.get("date") or "").strip()
            if not label or not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
                continue
            key = f"{label.lower()}|{date_str}"
            if key in existing_keys:
                continue
            existing_keys.add(key)
            new_rows.append(
                {"id": str(uuid.uuid4()), "label": label, "date": date_str, "createdBy": "dilly"}
            )
        if not new_rows:
            return []
        save_profile(email, {"deadlines": [*current, *new_rows]})
        return new_rows
    except Exception:
        return []


def _voice_client_local_date(context: Any) -> str | None:
    """YYYY-MM-DD from the app (browser local date) for resolving 'on the 24th'."""
    if not isinstance(context, dict):
        return None
    for key in ("client_local_date", "local_date"):
        v = context.get(key)
        if isinstance(v, str):
            s = v.strip()[:10]
            if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
                return s
    return None


def _reindex_candidate_for_voice(email: str) -> None:
    """Re-index candidate for recruiter search after Voice saves beyond_resume or experience_expansion."""
    if not email or not (email or "").strip():
        return
    try:
        from projects.dilly.api.candidate_index import index_candidate_after_audit
        from projects.dilly.api.audit_history import get_audits
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        audits = get_audits(email)
        latest_audit = audits[0] if audits else {}
        index_candidate_after_audit(email, profile=profile, audit=latest_audit, resume_text=None)
    except Exception:
        pass


def _maybe_enqueue_memory_extract(
    *,
    email: str,
    conv_id: str,
    history: list[dict] | None,
    user_message: str,
    assistant_reply: str,
    is_session_ending: bool = False,
) -> None:
    """Queue memory extraction every 6 messages or session ending.

    This must never block voice responses. Was every 4 msgs but that
    fired twice in a typical 8-msg session and dominated the cost.
    Every 6 keeps mid-session capture working without doubling up.
    """
    if not email or not conv_id:
        return
    hist = history if isinstance(history, list) else []
    # Include this completed turn in count.
    message_count = len(hist) + 2
    if message_count < 6 and not is_session_ending:
        return
    if not is_session_ending and (message_count % 6 != 0):
        return
    recent_messages: list[dict[str, str]] = []
    for row in hist[-6:]:
        if not isinstance(row, dict):
            continue
        role = str(row.get("role") or "").strip().lower()
        content = str(row.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            recent_messages.append({"role": role, "content": content[:1500]})
    if user_message.strip():
        recent_messages.append({"role": "user", "content": user_message.strip()[:1500]})
    if assistant_reply.strip():
        recent_messages.append({"role": "assistant", "content": assistant_reply.strip()[:1500]})
    if not recent_messages:
        return
    enqueue_memory_extraction(email, conv_id, recent_messages[-8:])


def _maybe_enqueue_voice_output_extract(
    *,
    email: str,
    conv_id: str,
    history: list[dict] | None,
    user_message: str,
    assistant_reply: str,
    is_session_ending: bool = False,
) -> None:
    """Queue conversation output extraction at session end only.

    Was running every 6 messages, but the output it produces overlaps
    heavily with what memory_extraction (every 4 messages) already
    captures. End-of-session only halves the per-conversation cost
    without losing data — the user closes the chat and the same
    extraction still fires once over the full transcript.
    """
    if not email or not conv_id:
        return
    if not is_session_ending:
        return
    hist = history if isinstance(history, list) else []
    recent_messages: list[dict[str, str]] = []
    for row in hist[-12:]:
        if not isinstance(row, dict):
            continue
        role = str(row.get("role") or "").strip().lower()
        content = str(row.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            recent_messages.append({"role": role, "content": content[:1500]})
    if user_message.strip():
        recent_messages.append({"role": "user", "content": user_message.strip()[:1500]})
    if assistant_reply.strip():
        recent_messages.append({"role": "assistant", "content": assistant_reply.strip()[:1500]})
    if not recent_messages:
        return
    enqueue_voice_output_extraction(email, conv_id, recent_messages[-14:])


def _maybe_capture_target_company_from_message(email: str, message: str) -> str | None:
    msg = (message or "").strip()
    if not email or len(msg) < 3:
        return None
    hit = lookup_company_ats(msg)
    if not hit:
        return None
    company = str(hit[0] or "").strip()
    if not company:
        return None
    try:
        existing = get_memory_surface(email).get("items") or []
        norm = " ".join(company.lower().split())
        already = any(
            str(i.get("category") or "") == "target_company"
            and " ".join(str(i.get("label") or i.get("value") or "").lower().split()) == norm
            for i in existing
            if isinstance(i, dict)
        )
        if already:
            return None
        row = add_memory_item(
            email,
            {
                "category": "target_company",
                "label": company,
                "value": company,
                "source": "voice",
                "action_type": "open_am_i_ready",
                "action_payload": {"company": company},
                "confidence": "medium",
                "shown_to_user": False,
            },
        )
        if row:
            return company
    except Exception:
        return None
    return None


def _run_agentic_layer(
    *,
    email: str,
    conv_id: str,
    message: str,
    history: list[dict] | None,
) -> tuple[list[dict[str, Any]], str]:
    if not email or not message.strip():
        return [], ""
    profile = get_profile(email) or {}
    deadlines = profile.get("deadlines") if isinstance(profile.get("deadlines"), list) else []
    applications = _load_applications(email)
    action_items = list_actions(email)
    results: list[dict[str, Any]] = []

    pending = get_active_pending_confirmation(email, conv_id) if conv_id else None
    if pending:
        resolution = detect_confirmation_resolution(message)
        if resolution in {"confirmed", "denied"}:
            resolved = resolve_pending_confirmation(email, str(pending.get("id") or ""), resolution)
            if resolved:
                intent = resolved.get("intent") if isinstance(resolved.get("intent"), dict) else {}
                action = str(intent.get("action") or "").strip().upper()
                if resolution == "confirmed":
                    extracted = intent.get("extracted_data") if isinstance(intent.get("extracted_data"), dict) else {}
                    out = execute_action(action, extracted, email, conv_id=conv_id or "voice", confirmed=True)
                    results.append({"action": action, "status": "executed", "result": out})
                else:
                    results.append({"action": action, "status": "skipped", "result": {"reason": "User denied confirmation."}})
        else:
            bumped = bump_unclear_attempt(email, str(pending.get("id") or ""))
            if bumped and not bool(bumped.get("resolved")):
                intent = pending.get("intent") if isinstance(pending.get("intent"), dict) else {}
                action = str(intent.get("action") or "").strip().upper()
                extracted = intent.get("extracted_data") if isinstance(intent.get("extracted_data"), dict) else {}
                results.append(
                    {
                        "action": action,
                        "status": "pending_confirmation",
                        "confirmation_prompt": confirmation_prompt_for_intent(action, extracted),
                    }
                )

    intents = detect_intents(
        message=message,
        today=time.strftime("%Y-%m-%d", time.gmtime()),
        profile=profile,
        conversation_history=history if isinstance(history, list) else [],
        existing_deadlines=deadlines,
        existing_applications=applications,
        existing_action_items=action_items,
    )
    if intents:
        results.extend(
            execute_intents(
                intents=intents,
                uid=email,
                conv_id=conv_id or "voice",
                today=time.strftime("%Y-%m-%d", time.gmtime()),
                profile=profile,
            )
        )

    context = build_agent_context_for_response(results, time.strftime("%Y-%m-%d", time.gmtime()))
    return results, context


def _compute_profile_updates(
    email: str,
    message: str,
    context: dict,
    history: list[dict] | None = None,
    *,
    conv_id: str | None = None,
) -> dict | None:
    """Compute and save profile updates from a user's voice message.
    Handles three modes:
    - resume_deep_dive: extract experience_expansion for current role
    - voice_onboarding: save step answer to profile fields
    - general: extract beyond_resume items (context-aware — passes history)
    Returns profile_updates dict (for frontend merge) or None.
    Skips all persistence when voice_save_to_profile is False (user opted out).
    """
    if not email or not (message or "").strip():
        return None
    if context.get("voice_save_to_profile") is False:
        return None

    updates: dict = {}

    if is_deep_dive_topic(context):
        # Extract experience_expansion for the current role
        experiences = context.get("deep_dive_experiences") or []
        idx = int(context.get("deep_dive_current_idx") or 0)
        role_label = experiences[idx] if experiences and idx < len(experiences) else ""
        if role_label and len(message.strip()) >= 10:
            entry = extract_experience_expansion_with_llm(message, role_label)
            if entry:
                saved = append_experience_expansion_and_save(email, entry)
                if saved:
                    updates.update(saved)
                    _reindex_candidate_for_voice(email)
        return updates or None

    if is_onboarding_topic(context):
        step = int(context.get("onboarding_step") or 0)
        if len(message.strip()) >= 3:
            raw_updates = extract_onboarding_profile_updates(step, message)
            # Build voice_onboarding_answers list
            try:
                from projects.dilly.api.profile_store import get_profile, save_profile
                profile = get_profile(email) or {}
                answers: list[str] = profile.get("voice_onboarding_answers") or []
                if not isinstance(answers, list):
                    answers = []
                answer_text = raw_updates.pop("_onboarding_answer_text", "")
                raw_updates.pop("_onboarding_answer_step", None)
                if answer_text:
                    # answers list keeps one item per step
                    while len(answers) <= step:
                        answers.append("")
                    answers[step] = answer_text[:300]
                save_dict = {k: v for k, v in raw_updates.items() if v is not None}
                save_dict["voice_onboarding_answers"] = answers
                # Mark done when step 4 (last) is answered
                if step >= 4:
                    save_dict["voice_onboarding_done"] = True
                save_profile(email, save_dict)
                try:
                    from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
                    write_dilly_profile_txt(email)
                except Exception:
                    pass
                updates.update(save_dict)
                return updates
            except Exception:
                return None
        return None

    # General chat: context-aware extraction (passes history + already_captured so nothing is re-extracted)
    if len(message) >= 8:
        already_captured: list[dict] | None = None
        try:
            from projects.dilly.api.profile_store import get_profile
            _p = get_profile(email) or {}
            raw_br = _p.get("beyond_resume")
            if isinstance(raw_br, list):
                already_captured = raw_br
        except Exception:
            pass
        extracted = extract_beyond_resume_with_llm(
            message, history=history, already_captured=already_captured,
            log_email=email, log_session_id=conv_id,
        )
        if extracted:
            res = _append_beyond_resume_and_save(email, extracted)
            if res and res.get("beyond_resume"):
                _reindex_candidate_for_voice(email)
            return res
    return None


@router.get("/voice/proactive-nudges")
async def voice_proactive_nudges(request: Request):
    """Proactive nudges for Voice: app funnel, relationship check-ins, seasonal, score wins. Respects nudge_preferences."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        from projects.dilly.api.profile_store import get_profile
        from projects.dilly.api.proactive_nudges import compute_proactive_nudges, format_proactive_for_voice
        from projects.dilly.api.routers.applications import _load_applications
        profile = get_profile(email) or {}
        apps = _load_applications(email)
        deadlines = profile.get("deadlines") or []
        audits = []
        try:
            from projects.dilly.api.audit_history import get_audits
            audits = get_audits(email)
        except Exception:
            pass
        latest = audits[0] if audits else {}
        prev = audits[1] if len(audits) >= 2 else {}
        scores = latest.get("scores") if isinstance(latest.get("scores"), dict) else None
        prev_scores = prev.get("scores") if isinstance(prev.get("scores"), dict) else None
        nudges = compute_proactive_nudges(
            profile=profile,
            applications=apps,
            deadlines=deadlines,
            scores=scores,
            prev_scores=prev_scores,
        )
        lines = format_proactive_for_voice(nudges)
        return {"proactive_nudges": nudges, "proactive_lines": lines}
    except Exception:
        return {"proactive_nudges": {}, "proactive_lines": []}


@router.get("/voice/conv-cost")
async def voice_conv_cost(request: Request):
    """Return actual measured cost (in USD) for a given voice conversation.

    Pulls straight from llm_usage_log Postgres rows, no estimation. The
    UI uses this to show real-time cost in the chat overlay so cost
    claims are verifiable instead of taking my word for it.

    Query params: conv_id (required).
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    conv_id = (request.query_params.get("conv_id") or "").strip()
    if not conv_id:
        return JSONResponse(content={"total_usd": 0.0, "calls": 0, "by_feature": []})
    try:
        from projects.dilly.api.llm_usage_log import get_session_cost
        sc = get_session_cost(email, conv_id)
        return JSONResponse(content={
            "total_usd": round(float(sc.get("total_usd", 0.0)), 6),
            "total_cents": round(float(sc.get("total_usd", 0.0)) * 100, 4),
            "calls": int(sc.get("calls", 0)),
            "by_feature": sc.get("by_feature", []),
        })
    except Exception as e:
        return JSONResponse(content={"total_usd": 0.0, "calls": 0, "by_feature": [], "error": str(e)[:200]})


@router.get("/voice/onboarding-state")
async def voice_onboarding_state(request: Request):
    """Return the initial message for Voice.
    - First-time users: kick off the 5-question onboarding flow.
    - Returning users: data-capture nudge.
    Returns { initialMessage, conversation_topic } so the frontend can set context.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        return JSONResponse(content={
            "initialMessage": "What's one thing not on your resume you'd like me to save?",
            "initialMessages": ["What's one thing not on your resume you'd like me to save?"],
            "conversation_topic": None,
        })
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        onboarding_done = profile.get("voice_onboarding_done") or False
        if not onboarding_done:
            return JSONResponse(content={
                "initialMessage": get_initial_onboarding_message(profile),
                "initialMessages": get_initial_onboarding_messages(profile),
                "conversation_topic": "voice_onboarding",
            })
        return JSONResponse(content={
            "initialMessage": get_initial_onboarding_message(profile),
            "initialMessages": get_initial_onboarding_messages(profile),
            "conversation_topic": None,
        })
    except Exception:
        return JSONResponse(content={
            "initialMessage": "What's one skill or experience you have that didn't make it onto your resume? I'll save it to your profile.",
            "initialMessages": ["What's one skill or experience you have that didn't make it onto your resume? I'll save it to your profile."],
            "conversation_topic": None,
        })


def _extract_experience_labels_from_resume(resume_text: str) -> list[str]:
    """Extract role/project labels from parsed resume text for the deep-dive flow.
    Looks for lines that look like job titles or project names (heuristic).
    Returns up to 8 labels.
    """
    if not resume_text:
        return []
    labels = []
    seen: set[str] = set()
    # Heuristic: lines that start with a capital and contain a role-like word, or are short and standalone
    role_words = re.compile(
        r"\b(intern|analyst|engineer|developer|manager|associate|researcher|coordinator|"
        r"assistant|consultant|lead|director|officer|designer|specialist|supervisor|project|"
        r"founder|co-founder|president|vp|ceo|cto|coo)\b",
        re.IGNORECASE,
    )
    for line in resume_text.splitlines():
        stripped = line.strip()
        if not stripped or len(stripped) < 5 or len(stripped) > 120:
            continue
        if role_words.search(stripped):
            key = stripped.lower()
            if key not in seen:
                seen.add(key)
                labels.append(stripped)
                if len(labels) >= 8:
                    break
    return labels


def _append_beyond_resume_and_save(email: str, new_items: list[dict]) -> dict | None:
    """Load profile, append new beyond_resume items, save. Returns profile_updates dict or None."""
    if not email or not new_items:
        return None
    try:
        from projects.dilly.api.profile_store import get_profile, save_profile
        profile = get_profile(email) or {}
        existing = profile.get("beyond_resume") or []
        if not isinstance(existing, list):
            existing = []
        seen = { (x.get("text") or "").strip().lower() for x in existing if isinstance(x, dict) }
        to_append = []
        for item in new_items:
            if not isinstance(item, dict):
                continue
            text = (item.get("text") or "").strip()[:500]
            if not text or text.lower() in seen:
                continue
            seen.add(text.lower())
            t = (item.get("type") or "other").strip().lower()
            valid = ("skill", "experience", "project", "person", "company", "event", "emotion", "other")
            if t not in valid:
                t = "other"
            to_append.append({
                "type": t,
                "text": text,
                "captured_at": item.get("captured_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
        if not to_append:
            return None
        merged = existing + to_append
        merged = merged[-50:]
        save_profile(email, {"beyond_resume": merged})
        try:
            from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
            write_dilly_profile_txt(email)
        except Exception:
            pass
        return {"beyond_resume": merged}
    except Exception:
        return None


@router.post("/voice/chat")
async def voice_chat(request: Request, body: dict = Body(...)):
    """Non-streaming chat. Returns reply, suggestions, profile_updates (when we save beyond_resume)."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    message = (body.get("message") or "").strip()
    if not message:
        return JSONResponse(content={"reply": "Send a message to get started.", "suggestions": []}, status_code=400)
    history = body.get("history") or []
    context = body.get("context") or {}
    conv_id = str(body.get("conv_id") or "").strip()
    is_session_ending = bool(body.get("is_session_ending"))

    agent_results, agent_context = _run_agentic_layer(
        email=email,
        conv_id=conv_id,
        message=message,
        history=history if isinstance(history, list) else [],
    )
    system = build_voice_system_prompt(context)
    user_content = format_voice_user_content(message, history, context)
    # agent_context is dynamic per message (intent results, calendar
    # adds, action confirmations). Concatenating into `system` would
    # invalidate Anthropic's prompt cache on every turn — cache key
    # is byte-exact match. Stick it in user_content instead so the
    # 5k-8k-token system prompt stays cached at 90% off.
    if agent_context:
        user_content = f"{agent_context}\n\n{user_content}"

    reply = "I'm having trouble responding right now. Try again in a moment."
    suggestions: list[str] = []
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if is_llm_available():
            raw = get_chat_completion(
                system, user_content,
                model=get_light_model(), temperature=0.5, max_tokens=500,
                log_email=email, log_feature="chat", log_session_id=conv_id or None,
            )
            if raw:
                reply, suggestions = extract_suggestions_from_reply(raw.strip())
                reply, suggestions = sanitize_voice_reply_and_suggestions(reply, suggestions)
    except Exception:
        pass

    profile_updates = _compute_profile_updates(email, message, context, history=history, conv_id=conv_id)
    target_company_added = _maybe_capture_target_company_from_message(email, message)
    if target_company_added and "ready for them" not in reply.lower():
        reply = (reply.rstrip() + " Want me to check if you're ready for them?").strip()
    # For onboarding: include voice_onboarding_complete flag when done
    voice_onboarding_complete = bool(
        is_onboarding_topic(context) and
        profile_updates and
        profile_updates.get("voice_onboarding_done")
    )

    # Extract deadlines from natural conversation
    detected_deadlines: list[dict] = []
    if not is_onboarding_topic(context) and not is_deep_dive_topic(context):
        try:
            existing = context.get("deadlines") or []
            if isinstance(existing, list):
                detected_deadlines = extract_deadlines_from_conversation(
                    user_message=message,
                    assistant_reply=reply,
                    existing_deadlines=existing,
                    client_local_date=_voice_client_local_date(context),
                )
        except Exception:
            pass

    res: dict = {"reply": reply, "suggestions": suggestions}
    if profile_updates:
        res["profile_updates"] = profile_updates
    if voice_onboarding_complete:
        res["voice_onboarding_complete"] = True
    if detected_deadlines:
        auto_saved = _persist_voice_detected_deadlines(email, detected_deadlines)
        if auto_saved:
            res["deadlines_auto_saved"] = auto_saved
    if agent_results:
        res["agent_results"] = agent_results
    # Running cost-of-this-conversation. Read straight from the
    # llm_usage_log Postgres table so the user can verify costs
    # themselves instead of taking my word for it.
    if conv_id:
        try:
            from projects.dilly.api.llm_usage_log import get_session_cost
            sc = get_session_cost(email, conv_id)
            res["conv_cost_usd"] = round(float(sc.get("total_usd", 0.0)), 6)
            res["conv_cost_breakdown"] = sc.get("by_feature", [])
        except Exception:
            pass
    _maybe_enqueue_memory_extract(
        email=email,
        conv_id=conv_id,
        history=history,
        user_message=message,
        assistant_reply=reply,
        is_session_ending=is_session_ending,
    )
    _maybe_enqueue_voice_output_extract(
        email=email,
        conv_id=conv_id,
        history=history,
        user_message=message,
        assistant_reply=reply,
        is_session_ending=is_session_ending,
    )
    return JSONResponse(content=res)


@router.post("/voice/stream")
async def voice_stream(request: Request, body: dict = Body(...)):
    """Stream assistant reply then send done event with suggestions, profile_updates."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    message = (body.get("message") or "").strip()
    if not message:
        async def _err():
            yield _sse({"done": True, "error": "Send a message to get started."})
        return StreamingResponse(_err(), media_type="text/event-stream")

    history = body.get("history") or []
    context = body.get("context") or {}
    conv_id = str(body.get("conv_id") or "").strip()
    is_session_ending = bool(body.get("is_session_ending"))
    agent_results, agent_context = _run_agentic_layer(
        email=email,
        conv_id=conv_id,
        message=message,
        history=history if isinstance(history, list) else [],
    )
    system = build_voice_system_prompt(context)
    user_content = format_voice_user_content(message, history, context)
    # Same prompt-cache rationale as the non-streaming path: keep
    # agent_context out of the cached system block.
    if agent_context:
        user_content = f"{agent_context}\n\n{user_content}"

    async def _stream():
        full_reply = []
        try:
            from dilly_core.llm_client import is_llm_available, get_light_model
            if is_llm_available():
                from openai import OpenAI
                api_key = os.environ.get("OPENAI_API_KEY", "").strip()
                base_url = os.environ.get("OPENAI_BASE_URL", "").strip() or None
                model = (os.environ.get("DILLY_LLM_MODEL_LIGHT") or "gpt-4o-mini").strip()
                client = OpenAI(api_key=api_key, base_url=base_url)
                stream = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_content},
                    ],
                    stream=True,
                    temperature=0.5,
                    max_tokens=800,
                )
                for chunk in stream:
                    delta = chunk.choices[0].delta.content if chunk.choices else None
                    if delta:
                        full_reply.append(delta)
        except Exception:
            pass

        raw_final = "".join(full_reply).strip() if full_reply else "I'm having trouble responding right now. Try again."
        final_text, suggestions = extract_suggestions_from_reply(raw_final)
        profile_updates = _compute_profile_updates(email, message, context, history=history)
        target_company_added = _maybe_capture_target_company_from_message(email, message)
        if target_company_added and "ready for them" not in final_text.lower():
            extra = " Want me to check if you're ready for them?"
            final_text = (final_text.rstrip() + extra).strip()
        final_text, suggestions = sanitize_voice_reply_and_suggestions(final_text, suggestions)
        # Emit only after safety check so slurs never stream token-by-token to the client.
        if final_text:
            yield _sse({"t": final_text})
        voice_onboarding_complete = bool(
            is_onboarding_topic(context) and
            profile_updates and
            profile_updates.get("voice_onboarding_done")
        )

        # Extract deadlines from natural conversation (user message + assistant reply)
        detected_deadlines: list[dict] = []
        if not is_onboarding_topic(context) and not is_deep_dive_topic(context):
            try:
                existing = context.get("deadlines") or []
                if isinstance(existing, list):
                    detected_deadlines = extract_deadlines_from_conversation(
                        user_message=message,
                        assistant_reply=final_text,
                        existing_deadlines=existing,
                        client_local_date=_voice_client_local_date(context),
                    )
            except Exception:
                pass

        done: dict = {"done": True, "suggestions": suggestions}
        if profile_updates:
            done["profile_updates"] = profile_updates
        if voice_onboarding_complete:
            done["voice_onboarding_complete"] = True
        if detected_deadlines:
            auto_saved = _persist_voice_detected_deadlines(email, detected_deadlines)
            if auto_saved:
                done["deadlines_auto_saved"] = auto_saved
        if agent_results:
            done["agent_results"] = agent_results
        _maybe_enqueue_memory_extract(
            email=email,
            conv_id=conv_id,
            history=history,
            user_message=message,
            assistant_reply=final_text,
            is_session_ending=is_session_ending,
        )
        _maybe_enqueue_voice_output_extract(
            email=email,
            conv_id=conv_id,
            history=history,
            user_message=message,
            assistant_reply=final_text,
            is_session_ending=is_session_ending,
        )
        yield _sse(done)

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.post("/voice/rewrite-bullet")
async def voice_rewrite_bullet(request: Request, body: dict = Body(...)):
    """Rewrite a single bullet; optional instruction. Returns { rewritten }."""
    deps.require_subscribed(request)
    bullet = (body.get("bullet") or "").strip()
    if not bullet:
        return JSONResponse(content={"rewritten": ""}, status_code=400)
    instruction = (body.get("instruction") or "").strip()
    context = body.get("context") or {}
    track = (context.get("track") or "").strip() or None

    rewritten = bullet
    try:
        from dilly_core.ats_rewrites import rewrite_bullets
        results = rewrite_bullets([bullet], track=track)
        if results and len(results) > 0:
            rewritten = sanitize_user_visible_assistant_text((results[0].rewritten or bullet).strip()) or bullet
        if instruction:
            from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
            if is_llm_available():
                system = "You rewrite a single resume bullet. Keep it one line, under 120 characters when possible. Use strong action verbs and numbers if relevant."
                user_content = f"Bullet: {rewritten}\nInstruction: {instruction}\nOutput only the rewritten bullet, nothing else."
                raw = get_chat_completion(system, user_content, model=get_light_model(), temperature=0.3, max_tokens=200)
                if raw:
                    rewritten = sanitize_user_visible_assistant_text(raw.strip())[:200]
    except Exception:
        pass
    rewritten = sanitize_user_visible_assistant_text(rewritten)
    return JSONResponse(content={"rewritten": rewritten})


def _context_to_audit_like(context: dict) -> dict:
    """Map voice context to audit-like shape for interview_prep."""
    return {
        "scores": context.get("scores") or {},
        "detected_track": context.get("track") or "",
        "audit_findings": context.get("audit_findings") or [],
        "evidence": context.get("evidence") or {},
    }


@router.post("/voice/interview-prep")
async def voice_interview_prep(request: Request, body: dict = Body(...)):
    """Generate interview prep questions from context. Returns { questions: [{ question, dimension, hint, why }] }."""
    deps.require_subscribed(request)
    context = body.get("context") or {}
    audit_like = _context_to_audit_like(context)

    questions = []
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if is_llm_available():
            system = """You are a career coach. Given resume/audit context, generate 3-5 interview prep items.
For each: "question" (one clear question), "dimension" (Smart, Grit, or Build), "hint" (how to answer in 1-2 sentences), "why" (why recruiters ask this, one sentence).
Output JSON: {"questions": [{"question": "...", "dimension": "...", "hint": "...", "why": "..."}]}. Output ONLY the JSON object."""
            scores = audit_like.get("scores") or {}
            track = audit_like.get("detected_track") or "General"
            findings = audit_like.get("audit_findings") or []
            user_content = f"Track: {track}\nScores: Smart {scores.get('smart', 0):.0f}, Grit {scores.get('grit', 0):.0f}, Build {scores.get('build', 0):.0f}\n"
            if findings:
                user_content += "Findings:\n" + "\n".join(f"- {f[:200]}" for f in findings[:6])
            raw = get_chat_completion(system, user_content, model=get_light_model(), temperature=0.4, max_tokens=700)
            if raw:
                parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
                if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list):
                    for q in parsed["questions"][:8]:
                        if isinstance(q, dict) and q.get("question"):
                            questions.append({
                                "question": sanitize_user_visible_assistant_text((q.get("question") or "").strip())[:300],
                                "dimension": (q.get("dimension") or "General").strip()[:40],
                                "hint": sanitize_user_visible_assistant_text((q.get("hint") or "").strip())[:400],
                                "why": sanitize_user_visible_assistant_text((q.get("why") or "").strip())[:300],
                            })
    except Exception:
        pass
    return JSONResponse(content={"questions": questions})


@router.post("/voice/gap-scan")
async def voice_gap_scan(request: Request, body: dict = Body(...)):
    """Gap analysis from context. Returns { gaps: [{ gap, dimension, severity, fix, impact }], overall_readiness, readiness_summary }."""
    deps.require_subscribed(request)
    context = body.get("context") or {}
    recommendations = context.get("recommendations") or []
    scores = context.get("scores") or {}
    company = (context.get("company") or "").strip()

    gaps = []
    for r in (recommendations[:6] if isinstance(recommendations, list) else []):
        if isinstance(r, dict):
            title = (r.get("title") or r.get("text") or str(r))[:200]
            dimension = (r.get("score_target") or "").strip() or "General"
            gaps.append({
                "gap": title,
                "dimension": dimension,
                "severity": "minor",
                "fix": (r.get("suggested_line") or r.get("fix") or "Address this to strengthen your profile.")[:200],
                "impact": "Improves your score and fit.",
            })
        else:
            gaps.append({"gap": str(r)[:200], "dimension": "", "severity": "minor", "fix": "", "impact": ""})

    if not gaps:
        gaps = [{"gap": "Run a resume audit to see specific gaps.", "dimension": "", "severity": "minor", "fix": "Upload your resume in Resume Review.", "impact": ""}]

    smart = float(scores.get("smart") or 0)
    grit = float(scores.get("grit") or 0)
    build = float(scores.get("build") or 0)
    avg = (smart + grit + build) / 3 if (smart or grit or build) else 0
    if avg >= 75:
        overall_readiness = "ready"
        readiness_summary = "Your scores look strong. Keep refining and applying."
    elif avg >= 50:
        overall_readiness = "stretch"
        readiness_summary = "You're in range for some roles. Focus on the gaps above."
    else:
        overall_readiness = "not_yet"
        readiness_summary = "Address the gaps above to improve your readiness."

    if company:
        try:
            from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
            if is_llm_available():
                system = "Given a student's gaps and readiness, output a JSON object with: overall_readiness (ready/stretch/not_yet), readiness_summary (one sentence). Output ONLY the JSON."
                user_content = f"Target: {company}\nGaps: {json.dumps([g.get('gap') for g in gaps[:4]])}\nCurrent readiness: {overall_readiness}\nProvide a one-sentence summary."
                raw = get_chat_completion(system, user_content, model=get_light_model(), temperature=0.3, max_tokens=150)
                if raw:
                    p = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
                    if isinstance(p, dict):
                        overall_readiness = p.get("overall_readiness") or overall_readiness
                        readiness_summary = (p.get("readiness_summary") or readiness_summary)[:300]
        except Exception:
            pass

    return JSONResponse(content={
        "gaps": gaps,
        "overall_readiness": overall_readiness,
        "readiness_summary": readiness_summary,
    })


@router.post("/voice/firm-deadlines")
async def voice_firm_deadlines(request: Request, body: dict = Body(...)):
    """Return application deadlines for a firm.
    Two sources:
    - saved: deadlines already in the user's calendar that mention the firm
    - suggested: LLM-generated typical application cycle dates with an "estimate" flag
    Returns { firm, saved: [...], suggested: [...] }
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    firm = (body.get("firm") or "").strip()
    application_target = (body.get("application_target") or "").strip().lower()  # "internship" | "full_time" | ""

    if not firm:
        return JSONResponse(content={"firm": "", "saved": [], "suggested": []})

    firm_lower = firm.lower()

    # 1. Scan user's saved deadlines for fuzzy matches on firm name
    saved: list[dict] = []
    if email:
        try:
            from projects.dilly.api.profile_store import get_profile
            profile = get_profile(email) or {}
            deadlines: list[dict] = profile.get("deadlines") or []
            firm_words = set(w for w in firm_lower.split() if len(w) > 2)
            for dl in deadlines:
                if not isinstance(dl, dict):
                    continue
                label = (dl.get("label") or "").lower()
                # Match if firm name (or any significant word) appears in label
                if firm_lower in label or (firm_words and any(w in label for w in firm_words)):
                    saved.append({
                        "id": dl.get("id"),
                        "label": dl.get("label"),
                        "date": dl.get("date"),
                        "sub_deadlines": dl.get("subDeadlines") or [],
                        "source": "calendar",
                    })
        except Exception:
            pass

    # 2. LLM-generated typical deadlines with estimate disclaimer
    suggested: list[dict] = []
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if is_llm_available():
            target_line = ""
            if application_target in ("internship", "full_time"):
                target_line = f"Application type: {application_target.replace('_', ' ')}."

            system = """You are a knowledgeable career resource. Given a company name, return typical annual application deadlines for that company.
Focus on: early application / priority deadline, regular deadline, final/rolling deadline.
For well-known companies (Goldman, Google, McKinsey, etc.) give historically accurate months and dates.
For lesser-known companies, give reasonable estimates based on industry norms.

Output a JSON object:
{
  "deadlines": [
    {
      "label": "short label, e.g. 'Summer Internship – Early Application'",
      "typical_date": "YYYY-MM-DD using current year (2026) or next cycle year (2027)",
      "notes": "1-sentence context, e.g. 'Opens in August; rolling after this date.'",
      "cycle": "internship" | "full_time" | "general"
    }
  ],
  "disclaimer": "one sentence noting these are typical/estimated dates and the student should verify on the company's careers page"
}
Return 2-5 deadlines. Output ONLY the JSON object. No markdown."""

            user_content = f"Company: {firm}\n{target_line}\nToday's date: 2026-03-17. Give deadlines for the upcoming cycle (2026-2027 recruiting season)."
            raw = get_chat_completion(system, user_content, model=get_light_model(), temperature=0.2, max_tokens=600)
            if raw:
                parsed = json.loads(
                    raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                )
                if isinstance(parsed, dict) and isinstance(parsed.get("deadlines"), list):
                    disclaimer = (parsed.get("disclaimer") or "Verify dates on the company's official careers page.").strip()[:300]
                    for item in parsed["deadlines"][:6]:
                        if not isinstance(item, dict) or not item.get("label"):
                            continue
                        suggested.append({
                            "label": (item.get("label") or "").strip()[:150],
                            "typical_date": (item.get("typical_date") or "").strip()[:20],
                            "notes": (item.get("notes") or "").strip()[:300],
                            "cycle": (item.get("cycle") or "general").strip().lower()[:30],
                            "source": "estimate",
                            "disclaimer": disclaimer,
                        })
    except Exception:
        pass

    return JSONResponse(content={"firm": firm, "saved": saved, "suggested": suggested})


@router.post("/voice/feedback")
async def voice_feedback(request: Request, body: dict = Body(...)):
    """Store thumbs up/down feedback. Fire-and-forget."""
    deps.require_auth(request)
    try:
        feedback_dir = os.path.join(_WORKSPACE_ROOT, "memory", "voice_feedback")
        os.makedirs(feedback_dir, exist_ok=True)
        date_str = time.strftime("%Y-%m-%d", time.gmtime())
        path = os.path.join(feedback_dir, f"feedback_{date_str}.jsonl")
        line = json.dumps({**body, "ts": time.time()}, ensure_ascii=False) + "\n"
        with open(path, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass
    return JSONResponse(content={"ok": True})


# ---------------------------------------------------------------------------
# Mock Interview — structured turn-by-turn session
# ---------------------------------------------------------------------------

_INTERVIEW_SYSTEM_PROMPT = """You are Dilly, a world-class interview preparation AI.
Never put a "Dilly:" or speaker label in JSON string fields — output plain coaching text only.
You conduct structured behavioral mock interviews using the STAR format (Situation, Task, Action, Result).

Your role in each turn:
1. Ask ONE behavioral or situational question at a time (never multiple questions at once).
2. When the user answers, give a concise score and feedback, then ask the next question.
3. At the end of the session (after all questions), give a session summary with top 2 improvements.

SCORING per answer (return as JSON):
- score: 1-5 (1=weak, 5=excellent)
- strengths: list of 1-2 specific strengths observed in the answer
- improvements: list of 1-2 specific, actionable improvements
- next_question: the next interview question to ask (or null if session is done)
- is_final: true only after the last question feedback

Question selection rules:
- Mix behavioral ("Tell me about a time…") and situational ("What would you do if…")
- Pull from the candidate's actual experience when resume data is available
- Questions should match the target track (Tech → system design + behavioral; Business → leadership + results; Pre-Health → empathy + teamwork; etc.)
- Never repeat a question

Output format: JSON object only.
{
  "score": 1-5,
  "label": "Excellent" | "Strong" | "Good" | "Needs work" | "Weak",
  "feedback": "2-3 sentence honest feedback",
  "strengths": ["..."],
  "improvements": ["..."],
  "next_question": "Question text or null",
  "is_final": false,
  "session_score": null  (only set on is_final=true: average score 1-5, rounded)
}

Never include slurs, hate speech, or derogatory epithets in any JSON field — even if the candidate used them or asked you to repeat them. Use professional coaching language only.

When starting (question_index=0, no answer yet): output the FIRST question only.
{
  "score": null,
  "label": null,
  "feedback": null,
  "strengths": [],
  "improvements": [],
  "next_question": "First question text",
  "is_final": false,
  "session_score": null
}"""


@router.post("/voice/mock-interview")
async def mock_interview_turn(request: Request, body: dict = Body(...)):
    """
    Structured mock interview turn.
    Send: { question_index, answer (or null for first), session_context (resume summary, track), total_questions }
    Returns: score, feedback, next_question, is_final, session_score.
    """
    from projects.dilly.api import deps, errors as _errors
    from dilly_core.llm_client import get_chat_completion, is_llm_available

    if not is_llm_available():
        return JSONResponse(content={"error": "LLM not available."}, status_code=503)

    user = deps.require_auth(request)
    if not user:
        return JSONResponse(content={"error": "Unauthorized"}, status_code=401)
    if not user.get("subscribed"):
        return JSONResponse(content={"error": "Subscription required."}, status_code=403)

    question_index = int(body.get("question_index", 0))
    answer = (body.get("answer") or "").strip()
    session_context = (body.get("session_context") or "").strip()
    total_questions = min(int(body.get("total_questions", 5)), 7)
    history = body.get("history") or []  # list of {q, a, score, feedback}
    # Company-specific persona — when the user is interviewing for a
    # specific firm, the mock interviewer adopts THAT firm's interview
    # style. No competitor (BigInterview, Yoodli, Pramp) does this —
    # they all use generic behavioral. Goldman's behavioral is faster
    # and more numbers-driven than Google's; consulting firms case-
    # heavy; design firms portfolio-walkthrough. Naming the company
    # gives Haiku enough context to shift the question pattern, the
    # rubric weights, and the follow-up style. Falls back gracefully
    # when no company is provided (generic mock).
    company = (body.get("company") or "").strip()
    role_target = (body.get("role") or "").strip()
    persona_block = ""
    if company:
        persona_block = (
            f"\n\nCOMPANY-SPECIFIC PERSONA: You are role-playing a "
            f"{company} interviewer for a {role_target or 'target'} role. "
            f"Conduct this mock the way {company} actually interviews. "
            f"Use {company}'s interview style — their typical question "
            f"types, the bar they hold for this role level, and the "
            f"specific signals their recruiters look for. If {company} "
            f"is known for case interviews, behavioral 'tell me about a "
            f"time' chains, system design, leadership-principle stories "
            f"(Amazon LP-style), or technical deep-dives, lean into "
            f"that. Reference {company} by name in your follow-up "
            f"questions when natural ('At {company} we'd push on this — "
            f"can you give me a number?'). End-of-session feedback "
            f"should be calibrated to {company}'s actual hiring bar — "
            f"a 4/5 at one firm is a 3/5 at a tier-1 firm. This is what "
            f"makes Dilly different from generic mock-interview tools."
        )

    # Build user message
    if question_index == 0 and not answer:
        user_msg = f"Start the session. Total questions: {total_questions}.\n{session_context}\nCompany: {company or '(generic — no specific firm)'}.\nRole: {role_target or '(unspecified)'}.\nAsk the first question."
    elif question_index >= total_questions:
        user_msg = f"The session is complete ({total_questions} questions answered). Give the final session summary. Set is_final=true and session_score to the average score."
    else:
        history_text = ""
        for turn in history[-4:]:  # last 4 turns for context
            history_text += f"Q: {turn.get('q', '')}\nA: {turn.get('a', '')}\n\n"
        user_msg = f"{session_context}\n\nSession history (last {len(history[-4:])} turns):\n{history_text}Question index: {question_index} of {total_questions}.\nUser's answer to the last question: {answer}\n\nScore this answer and ask question {question_index + 1}."

    try:
        # Append the company persona block to the base system prompt
        # (does not invalidate the prompt cache because the cache is
        # only set on >4000 char prompts via cache_control wrapping;
        # this prompt is shorter and rebuilds per-request anyway).
        full_system = _INTERVIEW_SYSTEM_PROMPT + persona_block
        raw = get_chat_completion(
            full_system,
            user_msg,
            temperature=0.4,
            max_tokens=700,
            log_email=(user.get("email") or "").lower(),
            log_feature="interview_feedback",
        )
        if not raw:
            return JSONResponse(content={"error": "No response from LLM."}, status_code=500)
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(clean)
        if json_contains_blocked_slur(result):
            result = {
                "score": None,
                "label": None,
                "feedback": REDIRECT_MESSAGE,
                "strengths": [],
                "improvements": [],
                "next_question": "Tell me about a time you solved a concrete problem under pressure.",
                "is_final": False,
                "session_score": None,
            }
        return JSONResponse(content=result)
    except json.JSONDecodeError:
        return JSONResponse(content={"error": "Invalid response format."}, status_code=500)
    except Exception as exc:
        return JSONResponse(content={"error": str(exc)[:200]}, status_code=500)


@router.post("/voice/execute-action")
async def execute_action_endpoint(request: Request):
    """Execute a dilly_agent action from desktop AI tools.

    Accepts: { action: str, data: dict }
    Returns: { success: bool, message: str, data?: dict }
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            content={"success": False, "message": "Invalid JSON body."},
            status_code=400,
        )

    action = str(body.get("action") or "").strip()
    params = body.get("data") if isinstance(body.get("data"), dict) else {}

    if not action:
        return JSONResponse(
            content={"success": False, "message": "Missing 'action' field."},
            status_code=400,
        )

    from projects.dilly.api.dilly_agent.action_types import ALL_ACTIONS

    if action.upper() not in ALL_ACTIONS:
        return JSONResponse(
            content={"success": False, "message": f"Unknown action: {action}"},
            status_code=400,
        )

    try:
        result = execute_action(
            action=action,
            extracted_data=params,
            uid=email,
            conv_id="desktop",
            confirmed=bool(body.get("confirmed", False)),
        )
    except Exception as exc:
        return JSONResponse(
            content={"success": False, "message": f"Action failed: {str(exc)[:200]}"},
            status_code=500,
        )

    if isinstance(result, dict) and result.get("guarded"):
        return JSONResponse(
            content={
                "success": False,
                "message": result.get("reason", "Action requires confirmation."),
                "data": result,
            },
        )

    if isinstance(result, dict) and result.get("skipped"):
        return JSONResponse(
            content={
                "success": False,
                "message": result.get("reason", "Action skipped."),
                "data": result,
            },
        )

    return JSONResponse(
        content={
            "success": True,
            "message": f"Action {action} executed successfully.",
            "data": result if isinstance(result, dict) else {},
        },
    )
