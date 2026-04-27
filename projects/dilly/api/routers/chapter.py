"""
Chapter advisor endpoints — Phase 2.

Feature flag: FEATURE_CHAPTER_API=true (or 1/yes).
All 6 endpoints return 404 when flag is off.

No mobile changes. No startup migrations. No silent DB ops at import time.

Endpoints:
  POST /chapter/start
  POST /chapter/{id}/screen/{n}/message
  POST /chapter/{id}/screen/{n}/advance
  POST /chapter/{id}/complete
  GET  /chapter/recap/{id}
  GET  /chapter/upcoming
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from projects.dilly.api import deps, errors

router = APIRouter(tags=["chapter"])

_HAIKU_MODEL = "claude-haiku-4-5-20251001"

# Cost guard: 30 total messages per session (spec §12)
_MAX_SESSION_TURNS = 50
_COST_GUARD_MSG = (
    "We've covered a lot of ground this session. "
    "Let's wrap up — tap 'advance' to move to your recap."
)

_VALID_PERSONAS = {"student", "seeker", "holder"}

SCREEN_NAMES = {
    0: "intake",
    1: "welcome",
    2: "surface",
    3: "synthesis",
    4: "converge",
    5: "close",
    6: "recap",
}
SCREEN_MOODS = {
    0: "curious",
    1: "warm",
    2: "thoughtful",
    3: "focused",
    4: "direct",
    5: "settled",
    6: "settled",
}
# Max user turns allowed per screen. Bumped up across the board (build
# 436+) so each Chapter feels substantial, not skimmed. The product
# moment we're chasing is "Dilly really sat with me on this" - that
# requires Dilly to probe past the user's first answer on every beat.
# Largest bump is on push_on (4) and one_move (5) where the depth
# happens; intake/welcome stay smallest because they're transitional.
SCREEN_TURN_LIMITS = {0: 8, 1: 5, 2: 8, 3: 8, 4: 9, 5: 6, 6: 0}


# ── Feature flag check ────────────────────────────────────────────────────────

def _require_chapter_enabled() -> None:
    val = os.environ.get("FEATURE_CHAPTER_API", "").strip().lower()
    if val not in ("1", "true", "yes"):
        raise HTTPException(status_code=404, detail="Feature not enabled.")


# ── Anthropic client (lazy, not at import time) ───────────────────────────────

def _get_anthropic_client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


# ── System prompt assembly ────────────────────────────────────────────────────

def _build_system_prompt_parts(persona: str, prompt_ctx: dict) -> tuple[str, str]:
    """Return (cached_block, dynamic_suffix) for the given persona."""
    if persona == "student":
        from projects.dilly.api.prompts.chapter_student import build_student_prompt
        return build_student_prompt(prompt_ctx)
    elif persona == "seeker":
        from projects.dilly.api.prompts.chapter_seeker import build_seeker_prompt
        return build_seeker_prompt(prompt_ctx)
    else:
        from projects.dilly.api.prompts.chapter_holder import build_holder_prompt
        return build_holder_prompt(prompt_ctx)


# ── User context assembler ────────────────────────────────────────────────────

def _build_prompt_ctx(
    email: str,
    persona: str,
    current_screen: int,
    screen_turn_count: int,
    last_recap: Optional[dict] = None,
    arena_snapshot: Optional[dict] = None,
    intake_json: Optional[dict] = None,
) -> dict:
    """Assemble context dict for prompt builders from profile + recaps + arena."""
    ctx: dict = {
        "current_screen_number": current_screen,
        "current_screen_name": SCREEN_NAMES.get(current_screen, "unknown"),
        "screen_turn_count": screen_turn_count,
    }

    # Profile data
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        ctx["user_name"] = (
            profile.get("name")
            or profile.get("full_name")
            or profile.get("first_name")
            or email.split("@")[0]
        )
        ctx["cohort"] = profile.get("cohort") or profile.get("track") or "General"
        ctx["career_goal"] = profile.get("career_goal") or profile.get("goal") or ""
        ctx["application_target"] = profile.get("application_target") or ""
        ctx["target_companies"] = profile.get("target_companies") or []
        ctx["job_locations"] = profile.get("job_locations") or []
        ctx["graduation_year"] = profile.get("graduation_year") or ""
        majors_raw = profile.get("majors") or profile.get("major") or []
        ctx["majors"] = majors_raw if isinstance(majors_raw, list) else [majors_raw]
        minors_raw = profile.get("minors") or profile.get("minor") or []
        ctx["minors"] = minors_raw if isinstance(minors_raw, list) else [minors_raw]
        ctx["overall_dilly_score"] = profile.get("overall_dilly_score") or profile.get("dilly_score") or ""
        ctx["overall_smart"] = profile.get("overall_smart") or profile.get("smart_score") or ""
        ctx["overall_grit"] = profile.get("overall_grit") or profile.get("grit_score") or ""
        ctx["overall_build"] = profile.get("overall_build") or profile.get("build_score") or ""
        # Drop garbage facts (single-letter/whitespace values like "J",
        # "S") before they hit the chapter prompt - the LLM faithfully
        # quotes whatever lands in profile_facts, producing lines like
        # `you were interested in "J"` that read as a glitch. Validator
        # was added in build 409, but legacy rows may still exist.
        def _is_quotable_fact(f: dict) -> bool:
            value = str((f or {}).get("value") or "").strip()
            label = str((f or {}).get("label") or "").strip()
            if len(value) < 3 or len(label) < 3:
                return False
            # Require some letter content - reject "...", "---", numbers-only.
            return any(c.isalpha() for c in value)
        raw_facts = profile.get("profile_facts") or profile.get("facts") or []
        ctx["profile_facts"] = [f for f in raw_facts if _is_quotable_fact(f)]
        ctx["skill_tags"] = profile.get("skill_tags") or profile.get("skills") or []

        # Audit findings (most recent audit)
        ctx["audit_findings"] = profile.get("audit_findings") or []
        wins = profile.get("wins") if isinstance(profile.get("wins"), list) else []
        # Wins from last 30 days
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        ctx["wins_last_30"] = [
            w for w in wins
            if isinstance(w, dict) and str(w.get("date") or "") >= cutoff
        ]
        # Last win logged
        if wins:
            try:
                from datetime import date
                last_win_date = sorted(
                    [w.get("date") or "" for w in wins if isinstance(w, dict) and w.get("date")],
                    reverse=True,
                )[0][:10]
                delta = (date.today() - date.fromisoformat(last_win_date)).days
                ctx["last_win_days_ago"] = delta
            except Exception:
                ctx["last_win_days_ago"] = None
        else:
            ctx["last_win_days_ago"] = None

        # Recent conversation count (last 7 days, estimate from voice threads)
        ctx["recent_conversation_count"] = profile.get("recent_conversation_count") or 0
        ctx["recent_jobs_viewed"] = profile.get("recent_jobs_viewed") or "none"

    except Exception as exc:
        print(f"[CHAPTER] _build_prompt_ctx profile error: {exc}", flush=True)

    # Last session recap
    if last_recap:
        try:
            headline = last_recap.get("headline") or ""
            commitment = last_recap.get("commitment") or ""
            observations = last_recap.get("observations") or []
            obs_str = "\n".join(f"• {o}" for o in observations)
            ctx["last_chapter_recap"] = (
                f"Headline: {headline}\n"
                f"Commitment: {commitment}\n"
                f"Observations:\n{obs_str}"
            )
        except Exception:
            ctx["last_chapter_recap"] = None
    else:
        ctx["last_chapter_recap"] = None

    # Intake data (first session)
    ctx["intake_json"] = intake_json

    # Arena snapshot
    if arena_snapshot:
        try:
            sections = arena_snapshot.get("sections") or {}
            pulse = sections.get("cohort_pulse") or {}
            threat = sections.get("threat_opportunity") or {}
            ctx["arena_cohort"] = arena_snapshot.get("cohort") or ctx.get("cohort") or "General"
            ctx["arena_ai_fluency_pct"] = pulse.get("ai_fluency_pct") or ""
            ctx["arena_cross_cohort_rank"] = pulse.get("cross_cohort_rank") or ""
            ctx["arena_cross_cohort_total"] = pulse.get("cross_cohort_total") or ""
            ctx["arena_disruption_pct"] = threat.get("disruption_pct") or ""
            ctx["arena_trend"] = threat.get("trend") or ""
            ctx["arena_opportunities"] = threat.get("opportunities") or []
            ctx["arena_threats"] = threat.get("threats") or []
        except Exception as exc:
            print(f"[CHAPTER] arena_snapshot parse error: {exc}", flush=True)

    return ctx


# ── Arena snapshot fetcher ────────────────────────────────────────────────────

def _fetch_arena_snapshot(email: str) -> Optional[dict]:
    """Call field-intel logic directly (avoid HTTP round-trip)."""
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        cohort = profile.get("cohort") or profile.get("track") or "General"
        # Import the cached accessor from the arena router
        from projects.dilly.api.routers.ai_arena import _get_field_intel_cached
        cached = _get_field_intel_cached(cohort)
        if cached:
            return cached
    except Exception as exc:
        print(f"[CHAPTER] _fetch_arena_snapshot error: {exc}", flush=True)
    return None


# ── Haiku call with prompt caching ───────────────────────────────────────────

def _haiku_call(
    cached_block: str,
    dynamic_suffix: str,
    messages: list[dict],
    max_tokens: int = 512,
) -> str:
    """
    Call claude-haiku-4-5 with split prompt caching.
    cached_block → cache_control: ephemeral
    dynamic_suffix → no cache (changes per session)
    Returns the assistant text content.
    """
    client = _get_anthropic_client()
    full_system = [
        {
            "type": "text",
            "text": cached_block,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": dynamic_suffix,
        },
    ]
    response = client.messages.create(
        model=_HAIKU_MODEL,
        max_tokens=max_tokens,
        system=full_system,
        messages=messages,
    )
    content = response.content
    if content and hasattr(content[0], "text"):
        return content[0].text
    return ""


# ── Opening message generator ────────────────────────────────────────────────

def _generate_opening_message(
    persona: str,
    prompt_ctx: dict,
    screen: int,
    prior_captures: Optional[dict] = None,
) -> str:
    """Generate the opening message for a screen via Haiku.

    The instruction goes to the *model only*, never the user. We
    intentionally avoid:
      - leaking "Screen N" labels (the model parroted them back as
        "Your prompt says I'm in Screen 5...")
      - including the current screen's own capture in the context
        (that read as "Screen 5 capture exists" + "generate Screen 5"
        which the model interpreted as contradictory and asked for
        clarification instead of generating)
    """
    cached_block, dynamic_suffix = _build_system_prompt_parts(persona, prompt_ctx)

    screen_name = SCREEN_NAMES.get(screen, "unknown")
    # Filter to PRIOR screens only - never include the current screen's
    # capture in its own opening message context.
    prior_only = {}
    if prior_captures:
        for k, v in prior_captures.items():
            try:
                if int(k) < int(screen) and v:
                    prior_only[k] = v
            except (TypeError, ValueError):
                continue

    # Use plain prose instead of "Screen N capture: X" so the labels
    # don't echo back into the assistant's response.
    captures_block = ""
    if prior_only:
        ordered_keys = sorted(prior_only.keys(), key=lambda k: int(k))
        captures_block = (
            "\n\nWhat the user has already shared earlier in this session:\n"
            + "\n".join(f"- {prior_only[k]}" for k in ordered_keys)
        )

    instruction_suffix = (
        f"\n\nWrite the next opening message for the {screen_name} part of the session. "
        "Speak directly to the user. Do not reference 'screens', 'phases', 'sections', "
        "or any structural labels - the user only sees your message, not the scaffolding. "
        "Do not ask the assistant for clarification; just write the message."
    ) + captures_block

    messages = [{"role": "user", "content": instruction_suffix}]

    try:
        # Bumped from 300 to 500 (build 436+) so opening messages can
        # land 2-3 substantive sentences instead of the truncated
        # one-liners that made each Chapter screen feel skimmed.
        text = _haiku_call(cached_block, dynamic_suffix, messages, max_tokens=500)
        return text.strip() or "Let's get started."
    except Exception as exc:
        print(f"[CHAPTER] _generate_opening_message error: {exc}", flush=True)
        return "Let's get started."


# ── Recap generator ───────────────────────────────────────────────────────────

def _generate_recap(
    persona: str,
    prompt_ctx: dict,
    messages_history: list[dict],
    commitment: str,
    commitment_deadline: Optional[str],
) -> dict:
    """
    Generate structured recap from session history.
    Returns dict with headline, observations, between_sessions_prompt.
    """
    cached_block, dynamic_suffix = _build_system_prompt_parts(persona, prompt_ctx)

    recap_instruction = (
        f"The session just ended. The user committed to: '{commitment}'"
        + (f" by {commitment_deadline}." if commitment_deadline else ".")
        + "\n\nWrite a recap in this exact JSON structure:\n"
        + '{"headline": "...", "observations": ["...", "...", "..."], '
        + '"between_sessions_prompt": "..."}\n\n'
        + "headline: ONE specific sentence describing the user's career "
        + "moment right now. Not a summary - a verdict. Avoid generic "
        + "phrases ('your journey', 'on track'). Use concrete language "
        + "the user can argue with. Examples of the right shape: 'You "
        + "have proof you can ship; you don't have proof you can choose.' "
        + "or 'You're playing for the wrong audience and you know it.' "
        + "12-25 words.\n"
        + "observations: 3 strings. Each one starts with what the user "
        + "actually said or did this session, then what it tells you. "
        + "Reference specific words from the conversation, not paraphrases. "
        + "20-40 words each.\n"
        + "between_sessions_prompt: a single question that should haunt "
        + "the user this week. Specific to what they said, not generic. "
        + "Cuts to the version of the answer they're avoiding. 8-20 words.\n"
        + "Return ONLY valid JSON, no markdown, no commentary."
    )

    # Build messages array: full session + recap instruction
    msgs = [m for m in messages_history if m.get("role") in ("user", "assistant")]
    msgs.append({"role": "user", "content": recap_instruction})

    try:
        raw = _haiku_call(cached_block, dynamic_suffix, msgs, max_tokens=600)
        # Strip markdown code fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
        return {
            "headline": str(parsed.get("headline") or "")[:500],
            "observations": [str(o) for o in (parsed.get("observations") or [])[:3]],
            "between_sessions_prompt": str(parsed.get("between_sessions_prompt") or "")[:500],
        }
    except Exception as exc:
        print(f"[CHAPTER] _generate_recap error: {exc}", flush=True)
        return {
            "headline": "Session complete.",
            "observations": [commitment],
            "between_sessions_prompt": "What will you do differently next week?",
        }


# ── POST /chapter/start ───────────────────────────────────────────────────────

@router.post("/chapter/start")
async def chapter_start(request: Request):
    """
    Initialize a new Chapter session. Returns first-screen state.

    Determines first-session vs returning from chapter_total_sessions.
    Snapshots persona (from account_type), fetches arena field-intel,
    generates opening message via Haiku.
    """
    _require_chapter_enabled()
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.chapter_store import (
        create_chapter_session,
        add_chapter_message,
        get_user_chapter_fields,
        SCREEN_NAMES,
        SCREEN_MOODS,
    )

    # Persona from account_type (student / seeker / holder)
    raw_persona = (user.get("account_type") or "student").lower().strip()
    persona = raw_persona if raw_persona in _VALID_PERSONAS else "student"

    # Determine first session
    chapter_fields = get_user_chapter_fields(email)
    total_sessions = chapter_fields.get("chapter_total_sessions") or 0
    is_first_session = (total_sessions == 0)

    # Arena snapshot (best-effort, non-blocking)
    arena_snapshot = _fetch_arena_snapshot(email)

    # Last recap (None for first session)
    last_recap = None
    if not is_first_session:
        from projects.dilly.api.chapter_store import get_last_recap_for_user
        last_recap = get_last_recap_for_user(email)

    # Create session row
    session = create_chapter_session(
        user_email=email,
        persona=persona,
        is_first_session=is_first_session,
        arena_snapshot=arena_snapshot,
    )
    if not session:
        raise HTTPException(status_code=500, detail="Failed to create session.")

    session_id = str(session["id"])
    start_screen = 0 if is_first_session else 1
    screens_total = 7 if is_first_session else 6

    # Build prompt context for opening message
    prompt_ctx = _build_prompt_ctx(
        email=email,
        persona=persona,
        current_screen=start_screen,
        screen_turn_count=0,
        last_recap=last_recap,
        arena_snapshot=arena_snapshot,
    )

    opening = _generate_opening_message(persona, prompt_ctx, start_screen)

    # Save opening as first message
    add_chapter_message(
        session_id=session_id,
        screen_index=start_screen,
        role="assistant",
        content=opening,
    )

    return {
        "session_id": session_id,
        "is_first_session": is_first_session,
        "persona": persona,
        "current_screen": start_screen,
        "screen_name": SCREEN_NAMES.get(start_screen, "intake"),
        "opening_message": opening,
        "dilly_mood": SCREEN_MOODS.get(start_screen, "curious"),
        "screens_total": screens_total,
    }


# ── POST /chapter/{id}/screen/{n}/message ─────────────────────────────────────

@router.post("/chapter/{session_id}/screen/{screen_n}/message")
async def chapter_message(session_id: str, screen_n: int, request: Request):
    """
    Submit a user message on a screen. Returns Dilly's response.

    Validates session ownership, screen currency, and turn limits.
    Applies cost guard (30 turns total). Uses cached system prompt.
    """
    _require_chapter_enabled()
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    try:
        body = await request.json()
    except Exception:
        body = {}

    content = str(body.get("content") or "").strip()
    if not content:
        raise errors.bad_request("content is required")
    if len(content) > 2000:
        content = content[:2000]

    from projects.dilly.api.chapter_store import (
        get_chapter_session,
        add_chapter_message,
        get_messages_for_session,
        count_messages_for_session,
        count_user_messages_for_screen,
        SCREEN_NAMES,
        SCREEN_MOODS,
        SCREEN_TURN_LIMITS,
        MAX_SESSION_TURNS,
    )

    session = get_chapter_session(session_id, email)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.get("completed_at"):
        raise HTTPException(status_code=409, detail="Session already completed.")

    current_screen = int(session.get("screens_completed") or 0) + (
        0 if session.get("is_first_session") else 1
    )
    # For first sessions: screens_completed tracks how many screens have been advanced
    # screen index = screens_completed (0=intake, 1=welcome, ...)
    if session.get("is_first_session"):
        current_screen = int(session.get("screens_completed") or 0)
    else:
        current_screen = int(session.get("screens_completed") or 0) + 1

    if screen_n != current_screen:
        raise HTTPException(
            status_code=400,
            detail=f"Screen mismatch: session is on screen {current_screen}, not {screen_n}.",
        )

    # Cost guard: total session turns
    total_count = count_messages_for_session(session_id)
    if total_count >= MAX_SESSION_TURNS:
        # Save user message and return soft wrap-up
        add_chapter_message(session_id, screen_n, "user", content)
        msg_row = add_chapter_message(session_id, screen_n, "assistant", _COST_GUARD_MSG)
        return {
            "message_id": str(msg_row["id"]) if msg_row else None,
            "content": _COST_GUARD_MSG,
            "dilly_mood": SCREEN_MOODS.get(screen_n, "warm"),
            "screen_turn_count": count_user_messages_for_screen(session_id, screen_n),
            "screen_turn_max": SCREEN_TURN_LIMITS.get(screen_n, 5),
            "can_advance": True,
            "cost_guard": True,
        }

    # Screen turn limit check
    user_turn_count = count_user_messages_for_screen(session_id, screen_n)
    screen_max = SCREEN_TURN_LIMITS.get(screen_n, 5)
    if user_turn_count >= screen_max:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "screen_turn_limit_reached",
                "screen_turn_count": user_turn_count,
                "screen_turn_max": screen_max,
            },
        )

    persona = str(session.get("persona_at_time") or "student")
    arena_snapshot = session.get("arena_snapshot")
    if isinstance(arena_snapshot, str):
        try:
            arena_snapshot = json.loads(arena_snapshot)
        except Exception:
            arena_snapshot = None

    intake_json = session.get("intake_json")
    if isinstance(intake_json, str):
        try:
            intake_json = json.loads(intake_json)
        except Exception:
            intake_json = None

    last_recap = None
    if not session.get("is_first_session"):
        from projects.dilly.api.chapter_store import get_last_recap_for_user
        last_recap = get_last_recap_for_user(email)

    prompt_ctx = _build_prompt_ctx(
        email=email,
        persona=persona,
        current_screen=screen_n,
        screen_turn_count=user_turn_count + 1,
        last_recap=last_recap,
        arena_snapshot=arena_snapshot,
        intake_json=intake_json,
    )

    # Build full message history for this session
    all_msgs = get_messages_for_session(session_id)
    messages_for_api = [
        {"role": m["role"], "content": m["content"]}
        for m in all_msgs
        if m.get("role") in ("user", "assistant")
    ]
    # Append the new user message
    messages_for_api.append({"role": "user", "content": content})

    cached_block, dynamic_suffix = _build_system_prompt_parts(persona, prompt_ctx)

    try:
        # Bumped to 500 alongside opening messages - the chat replies
        # within a screen need the same depth budget so Dilly can
        # actually probe rather than nodding back single sentences.
        reply = _haiku_call(cached_block, dynamic_suffix, messages_for_api, max_tokens=500)
    except Exception as exc:
        print(f"[CHAPTER] haiku call error: {exc}", flush=True)
        reply = "I'm having a moment — could you say that again?"

    # Persist both messages
    add_chapter_message(session_id, screen_n, "user", content)
    msg_row = add_chapter_message(session_id, screen_n, "assistant", reply)

    new_user_count = user_turn_count + 1
    can_advance = new_user_count >= 2  # allow advance after ≥2 user turns

    return {
        "message_id": str(msg_row["id"]) if msg_row else None,
        "content": reply,
        "dilly_mood": SCREEN_MOODS.get(screen_n, "warm"),
        "screen_turn_count": new_user_count,
        "screen_turn_max": screen_max,
        "can_advance": can_advance,
    }


# ── POST /chapter/{id}/screen/{n}/advance ────────────────────────────────────

@router.post("/chapter/{session_id}/screen/{screen_n}/advance")
async def chapter_advance(session_id: str, screen_n: int, request: Request):
    """
    Advance to the next screen. Captures per-screen summary.
    Generates next screen's opening message via Haiku.
    """
    _require_chapter_enabled()
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    try:
        body = await request.json()
    except Exception:
        body = {}

    screen_capture = str(body.get("screen_capture") or "").strip()

    from projects.dilly.api.chapter_store import (
        get_chapter_session,
        advance_chapter_screen,
        add_chapter_message,
        get_messages_for_session,
        SCREEN_NAMES,
        SCREEN_MOODS,
    )

    session = get_chapter_session(session_id, email)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.get("completed_at"):
        raise HTTPException(status_code=409, detail="Session already completed.")

    # Validate screen_n is current screen
    if session.get("is_first_session"):
        current_screen = int(session.get("screens_completed") or 0)
    else:
        current_screen = int(session.get("screens_completed") or 0) + 1

    if screen_n != current_screen:
        raise HTTPException(
            status_code=400,
            detail=f"Screen mismatch: session is on screen {current_screen}, not {screen_n}.",
        )

    persona = str(session.get("persona_at_time") or "student")

    # Auto-generate capture if not provided. Plain prose, never
    # "Screen N" - the model treats "Screen N completed" + "generate
    # for Screen N" as contradictory and asks for clarification
    # instead of generating, which leaks the scaffolding to the user.
    if not screen_capture:
        screen_name = SCREEN_NAMES.get(screen_n, "session")
        screen_capture = f"User finished the {screen_name} part of the session."

    # Advance session row
    updated = advance_chapter_screen(session_id, screen_capture, from_screen=screen_n)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to advance screen.")

    next_screen = screen_n + 1
    screens_completed = int(updated.get("screens_completed") or 0)

    arena_snapshot = session.get("arena_snapshot")
    if isinstance(arena_snapshot, str):
        try:
            arena_snapshot = json.loads(arena_snapshot)
        except Exception:
            arena_snapshot = None

    intake_json = session.get("intake_json")
    if isinstance(intake_json, str):
        try:
            intake_json = json.loads(intake_json)
        except Exception:
            intake_json = None

    last_recap = None
    if not session.get("is_first_session"):
        from projects.dilly.api.chapter_store import get_last_recap_for_user
        last_recap = get_last_recap_for_user(email)

    # Pull screen_captures from updated session for context
    prior_captures = updated.get("screen_captures") or {}
    if isinstance(prior_captures, str):
        try:
            prior_captures = json.loads(prior_captures)
        except Exception:
            prior_captures = {}

    prompt_ctx = _build_prompt_ctx(
        email=email,
        persona=persona,
        current_screen=next_screen,
        screen_turn_count=0,
        last_recap=last_recap,
        arena_snapshot=arena_snapshot,
        intake_json=intake_json,
    )

    opening = _generate_opening_message(
        persona, prompt_ctx, next_screen, prior_captures=prior_captures
    )
    add_chapter_message(session_id, next_screen, "assistant", opening)

    return {
        "next_screen": next_screen,
        "screen_name": SCREEN_NAMES.get(next_screen, "unknown"),
        "opening_message": opening,
        "dilly_mood": SCREEN_MOODS.get(next_screen, "warm"),
        "screens_completed": screens_completed,
    }


# ── POST /chapter/{id}/complete ───────────────────────────────────────────────

@router.post("/chapter/{session_id}/complete")
async def chapter_complete(session_id: str, request: Request):
    """
    Finalize session: generate recap, schedule next session, create calendar event.
    """
    _require_chapter_enabled()
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    try:
        body = await request.json()
    except Exception:
        body = {}

    commitment = str(body.get("commitment") or "").strip()
    commitment_deadline = str(body.get("commitment_deadline") or "").strip() or None

    if not commitment:
        raise errors.bad_request("commitment is required")

    from projects.dilly.api.chapter_store import (
        get_chapter_session,
        get_messages_for_session,
        create_chapter_recap,
        complete_chapter_session,
        increment_chapter_total_sessions,
        update_next_chapter_at,
        create_chapter_calendar_event,
        compute_next_chapter_at,
        SCREEN_NAMES,
    )

    session = get_chapter_session(session_id, email)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.get("completed_at"):
        raise HTTPException(status_code=409, detail="Session already completed.")

    persona = str(session.get("persona_at_time") or "student")

    arena_snapshot = session.get("arena_snapshot")
    if isinstance(arena_snapshot, str):
        try:
            arena_snapshot = json.loads(arena_snapshot)
        except Exception:
            arena_snapshot = None

    intake_json = session.get("intake_json")
    if isinstance(intake_json, str):
        try:
            intake_json = json.loads(intake_json)
        except Exception:
            intake_json = None

    prompt_ctx = _build_prompt_ctx(
        email=email,
        persona=persona,
        current_screen=6,
        screen_turn_count=0,
        arena_snapshot=arena_snapshot,
        intake_json=intake_json,
    )

    all_msgs = get_messages_for_session(session_id)
    messages_history = [
        {"role": m["role"], "content": m["content"]}
        for m in all_msgs
        if m.get("role") in ("user", "assistant")
    ]

    # Generate recap via Haiku
    recap_data = _generate_recap(
        persona=persona,
        prompt_ctx=prompt_ctx,
        messages_history=messages_history,
        commitment=commitment,
        commitment_deadline=commitment_deadline,
    )

    # next_chapter_at = now + 7 days
    next_at = compute_next_chapter_at()

    render_json = {
        "headline": recap_data["headline"],
        "observations": recap_data["observations"],
        "commitment": commitment,
        "commitment_deadline": commitment_deadline,
        "between_sessions_prompt": recap_data["between_sessions_prompt"],
        "next_chapter_at": next_at.isoformat(),
        "persona": persona,
    }

    recap_row = create_chapter_recap(
        session_id=session_id,
        user_email=email,
        headline=recap_data["headline"],
        observations=recap_data["observations"],
        commitment=commitment,
        commitment_deadline=commitment_deadline,
        between_sessions_prompt=recap_data["between_sessions_prompt"],
        next_chapter_at=next_at,
        render_json=render_json,
    )
    if not recap_row:
        raise HTTPException(status_code=500, detail="Failed to create recap.")

    recap_id = str(recap_row["id"])

    # Calendar event (best-effort)
    calendar_event_id = create_chapter_calendar_event(
        user_email=email,
        next_chapter_at=next_at,
        session_id=session_id,
    )

    # Mark session complete
    complete_chapter_session(session_id, recap_id, calendar_event_id)

    # Update user stats
    increment_chapter_total_sessions(email)
    update_next_chapter_at(email, next_at, calendar_event_id)

    return {
        "recap_id": recap_id,
        "recap": {
            "headline": recap_data["headline"],
            "observations": recap_data["observations"],
            "commitment": commitment,
            "commitment_deadline": commitment_deadline,
            "between_sessions_prompt": recap_data["between_sessions_prompt"],
            "next_chapter_at": next_at.isoformat(),
        },
        "next_chapter_at": next_at.isoformat(),
        "calendar_event_id": calendar_event_id,
    }


# ── GET /chapter/recap/{id} ───────────────────────────────────────────────────

@router.get("/chapter/recap/{recap_id}")
async def chapter_get_recap(recap_id: str, request: Request):
    """
    Retrieve a specific recap. Used for Home card, Recap screen, and archive.
    """
    _require_chapter_enabled()
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.chapter_store import get_chapter_recap

    recap = get_chapter_recap(recap_id, email)
    if not recap:
        raise HTTPException(status_code=404, detail="Recap not found.")

    render_json = recap.get("render_json")
    if isinstance(render_json, str):
        try:
            render_json = json.loads(render_json)
        except Exception:
            render_json = None

    return {
        "recap_id": str(recap["id"]),
        "session_id": str(recap.get("session_id") or ""),
        "headline": recap.get("headline") or "",
        "observations": recap.get("observations") or [],
        "commitment": recap.get("commitment") or "",
        "commitment_deadline": (
            str(recap["commitment_deadline"]) if recap.get("commitment_deadline") else None
        ),
        "between_sessions_prompt": recap.get("between_sessions_prompt") or "",
        "next_chapter_at": (
            recap["next_chapter_at"].isoformat()
            if recap.get("next_chapter_at")
            else None
        ),
        "created_at": (
            recap["created_at"].isoformat() if recap.get("created_at") else None
        ),
        "render_json": render_json,
    }


# ── GET /chapter/upcoming ─────────────────────────────────────────────────────

@router.get("/chapter/upcoming")
async def chapter_upcoming(request: Request):
    """
    Return next scheduled Chapter, persona, and a preview opening line.
    """
    _require_chapter_enabled()
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.chapter_store import (
        get_user_chapter_fields,
        get_last_recap_for_user,
    )

    raw_persona = (user.get("account_type") or "student").lower().strip()
    persona = raw_persona if raw_persona in _VALID_PERSONAS else "student"

    chapter_fields = get_user_chapter_fields(email)
    total_sessions = chapter_fields.get("chapter_total_sessions") or 0
    next_chapter_at = chapter_fields.get("next_chapter_at")
    is_first_session = (total_sessions == 0)

    last_recap = get_last_recap_for_user(email) if not is_first_session else None
    last_recap_id = str(last_recap["id"]) if last_recap else None

    # Days until
    days_until = None
    if next_chapter_at:
        try:
            if isinstance(next_chapter_at, str):
                next_dt = datetime.fromisoformat(next_chapter_at.replace("Z", "+00:00"))
            else:
                next_dt = next_chapter_at
            now = datetime.now(timezone.utc)
            if next_dt.tzinfo is None:
                next_dt = next_dt.replace(tzinfo=timezone.utc)
            days_until = max(0, (next_dt.date() - now.date()).days)
        except Exception:
            pass

    # Generate opening preview (cheap call, ~50 tokens)
    opening_preview = _generate_upcoming_preview(
        email=email,
        persona=persona,
        is_first_session=is_first_session,
        last_recap=last_recap,
    )

    return {
        "next_chapter_at": (
            next_chapter_at.isoformat()
            if hasattr(next_chapter_at, "isoformat")
            else str(next_chapter_at) if next_chapter_at else None
        ),
        "days_until": days_until,
        "persona": persona,
        "is_first_session": is_first_session,
        "opening_preview": opening_preview,
        "last_recap_id": last_recap_id,
    }


def _generate_upcoming_preview(
    email: str,
    persona: str,
    is_first_session: bool,
    last_recap: Optional[dict],
) -> str:
    """Generate a 1–2 sentence teaser for the upcoming Chapter card."""
    try:
        prompt_ctx = _build_prompt_ctx(
            email=email,
            persona=persona,
            current_screen=1,
            screen_turn_count=0,
            last_recap=last_recap,
        )
        cached_block, dynamic_suffix = _build_system_prompt_parts(persona, prompt_ctx)

        if is_first_session:
            instruction = (
                "Write a 1–2 sentence teaser for a user who has never done a Chapter session. "
                "Make it feel like an invitation from an advisor who's ready to meet them. "
                "Under 40 words."
            )
        else:
            commitment = (last_recap or {}).get("commitment") or ""
            instruction = (
                f"The user committed last session to: '{commitment}'. "
                "Write a 1–2 sentence teaser for their next Chapter — reference that commitment. "
                "Under 40 words."
            )

        messages = [{"role": "user", "content": instruction}]
        return _haiku_call(cached_block, dynamic_suffix, messages, max_tokens=80).strip()
    except Exception as exc:
        print(f"[CHAPTER] _generate_upcoming_preview error: {exc}", flush=True)
        if is_first_session:
            return "Ready to meet your advisor? Your first Chapter session is waiting."
        return "Your next Chapter is coming up. Let's pick up where we left off."
