"""
/chapters endpoints — the weekly scheduled "Chapter" session.

Product flow:
  - User picks a day and hour (default Sunday 19:00 local).
  - Once per cycle, a new Chapter becomes eligible to generate.
  - Client calls POST /chapters/generate when the user opens the
    session card at or after the scheduled time. Server enforces the
    once-per-cycle rule so a bad client can't burn LLM by hammering.
  - Between Chapters, users drop "notes for Dilly" through POST
    /chapters/notes. Templated acknowledgments, 3 per week / 1 per
    12 hours, enforced here.
  - Reschedule is a one-time override on the next upcoming session.
    The user's regular cadence stays locked.

Cost discipline:
  The Chapter is one structured Haiku 4.5 call per user per cycle.
  Starter tier gets nothing. Dilly tier gets one per week. Pro tier
  is capped at one per day (effectively unlimited for a human). The
  whole point is a bounded, predictable LLM line item.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request

from projects.dilly.api import chapters_store, deps, errors

router = APIRouter(tags=["chapters"])


# ---------------------------------------------------------------------------
# Eligibility helpers
# ---------------------------------------------------------------------------

def _plan_cycle_seconds(plan: str) -> int | None:
    """How often a user at this plan may generate a new Chapter.
    Returns None if the plan has no Chapter access (starter)."""
    p = (plan or "").lower().strip()
    if p == "pro":
        # Pro cap: 1 per day. True "unlimited for a human" without letting
        # a script burn the budget.
        return 24 * 60 * 60
    if p == "dilly":
        return 7 * 24 * 60 * 60
    return None


def _get_plan(email: str) -> str:
    try:
        from projects.dilly.api.profile_store import get_profile as _gp
        return ((_gp(email) or {}).get("plan") or "starter").lower().strip()
    except Exception:
        return "starter"


def _fact_count(email: str) -> int:
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = get_memory_surface(email) or {}
        return len(surface.get("items") or [])
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------

@router.get("/chapters/schedule")
async def chapters_get_schedule(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return chapters_store.get_schedule(email)


@router.post("/chapters/schedule")
async def chapters_set_schedule(request: Request, body: dict = Body(...)):
    """Set the user's weekly cadence.
    Body: { day_of_week: 0-6 (0=Mon, 6=Sun), hour: 0-23 }"""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        dow = int(body.get("day_of_week"))
        hour = int(body.get("hour"))
    except Exception:
        raise errors.validation_error("day_of_week and hour required.")
    if not (0 <= dow <= 6) or not (0 <= hour <= 23):
        raise errors.validation_error("Out of range.")

    chapters_store.set_schedule(email, day_of_week=dow, hour=hour)
    return {"ok": True, **chapters_store.get_schedule(email)}


@router.post("/chapters/reschedule")
async def chapters_reschedule(request: Request, body: dict = Body(...)):
    """Move the NEXT upcoming session to a specific datetime (ISO 8601
    with tz offset). Does not change the weekly cadence.
    Body: { iso: "2026-04-24T19:00:00-04:00" }"""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    iso = (body.get("iso") or "").strip()
    if not iso:
        raise errors.validation_error("iso datetime required.")
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        raise errors.validation_error("Invalid iso datetime.")

    chapters_store.set_override(email, override_at=dt)
    return {"ok": True, **chapters_store.get_schedule(email)}


@router.get("/chapters/recommend-date")
async def chapters_recommend_date(request: Request):
    """Rule-based (zero LLM) recommendation for when to reschedule to.
    For now: three days from now at the user's usual hour. Cheap and
    predictable. We can get fancier with app-open telemetry later."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    sched = chapters_store.get_schedule(email)
    hour = int(sched.get("hour") or 19)
    now = datetime.now(timezone.utc)
    suggestion = (now + timedelta(days=3)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return {
        "iso": suggestion.isoformat(),
        "reason": "A gentle gap from now so you have time to gather your thoughts.",
    }


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------

_NOTE_ACKS = [
    "Noted.",
    "Got it. I'll bring this up.",
    "Locked in for your next Chapter.",
    "Added to my notes.",
]


@router.get("/chapters/notes")
async def chapters_list_notes(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    notes = chapters_store.list_open_notes(email)
    last = chapters_store.last_note_added_at(email)
    cooldown_remaining = 0
    if last:
        elapsed = (datetime.now(timezone.utc) - last).total_seconds()
        cooldown = chapters_store.NOTE_COOLDOWN_HOURS * 3600
        cooldown_remaining = max(0, int(cooldown - elapsed))
    return {
        "notes": notes,
        "count": len(notes),
        "cap": chapters_store.NOTE_WEEKLY_CAP,
        "cooldown_remaining_seconds": cooldown_remaining,
    }


@router.post("/chapters/notes")
async def chapters_add_note(request: Request, body: dict = Body(...)):
    """Add a note for the next Chapter. Returns a templated confirmation.
    Body: { text: string }"""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    # Starter tier: no Chapters, so no notes either. Gate here so the
    # mobile client can surface the paywall cleanly.
    if _get_plan(email) == "starter":
        raise HTTPException(
            status_code=402,
            detail={
                "code": "CHAPTERS_REQUIRES_PLAN",
                "message": "Chapters are part of Dilly.",
                "required_plan": "dilly",
            },
        )

    text = (body.get("text") or "").strip()
    if len(text) < 2:
        raise errors.validation_error("Give the note at least a couple of words.")
    if len(text) > 500:
        raise errors.validation_error("Keep notes under 500 characters.")

    # Weekly cap.
    open_count = chapters_store.count_open_notes(email)
    if open_count >= chapters_store.NOTE_WEEKLY_CAP:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "NOTE_CAP_REACHED",
                "message": f"You can add up to {chapters_store.NOTE_WEEKLY_CAP} notes per Chapter. Your queue is full.",
            },
        )

    # Cooldown.
    last = chapters_store.last_note_added_at(email)
    if last:
        elapsed = (datetime.now(timezone.utc) - last).total_seconds()
        cooldown = chapters_store.NOTE_COOLDOWN_HOURS * 3600
        if elapsed < cooldown:
            remaining = int(cooldown - elapsed)
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "NOTE_COOLDOWN",
                    "message": "Dilly is still writing down your last note. Check back in a bit.",
                    "cooldown_remaining_seconds": remaining,
                },
            )

    new_id = chapters_store.add_note(email, text)
    if not new_id:
        raise HTTPException(status_code=500, detail="Could not save that note.")

    # Pick a templated ack based on how many notes they've added this
    # cycle. Feels slightly different each time without costing an LLM
    # call.
    import random
    ack = random.choice(_NOTE_ACKS)
    return {
        "ok": True,
        "id": new_id,
        "ack": ack,
    }


@router.delete("/chapters/notes/{note_id}")
async def chapters_delete_note(note_id: str, request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    ok = chapters_store.delete_note(email, note_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Current / generate
# ---------------------------------------------------------------------------

def _cycle_due(latest: dict[str, Any] | None, plan: str, override_iso: str | None) -> bool:
    """Is a new Chapter eligible to generate?
    - If there's an override that's in the past, yes.
    - If there's no latest Chapter ever, yes (assuming the user scheduled
      time has passed; first-session gate lives in the generate endpoint).
    - Otherwise, time since latest must exceed the plan's cycle length."""
    cycle = _plan_cycle_seconds(plan)
    if cycle is None:
        return False
    if override_iso:
        try:
            override_dt = datetime.fromisoformat(override_iso.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) >= override_dt:
                return True
        except Exception:
            pass
    if not latest:
        return True
    try:
        fetched = datetime.fromisoformat(latest["fetched_at"].replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - fetched).total_seconds() >= cycle
    except Exception:
        return True


@router.get("/chapters/current")
async def chapters_current(request: Request):
    """Return the latest Chapter plus enough context for the client to
    decide what to render: is a new one eligible? When is the next one?"""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    plan = _get_plan(email)
    latest = chapters_store.get_latest_chapter(email)
    schedule = chapters_store.get_schedule(email)
    facts = _fact_count(email)
    due = _cycle_due(latest, plan, schedule.get("next_override_at"))
    count = chapters_store.count_chapters(email)

    return {
        "plan": plan,
        "has_access": plan in ("dilly", "pro"),
        "facts_in_profile": facts,
        "first_session_gate": 20,
        "schedule": schedule,
        "latest": latest,
        # Total Chapters the user has had, including the most recent.
        # Powers the "Chapter N · N weeks together" streak label in
        # the session UI.
        "count": count,
        "generation_eligible": bool(due and plan in ("dilly", "pro") and facts >= 20),
    }


@router.post("/chapters/generate")
async def chapters_generate(request: Request):
    """Generate the Chapter for this cycle. Enforces:
       - plan tier (starter blocked)
       - first-session gate (20+ facts)
       - cycle rate-limit (plan-dependent)
    Produces a single structured Haiku 4.5 call that returns a title
    and 7 screens of content. Consumes all open notes."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    plan = _get_plan(email)
    cycle = _plan_cycle_seconds(plan)
    if cycle is None:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "CHAPTERS_REQUIRES_PLAN",
                "message": "Chapters are part of Dilly.",
                "required_plan": "dilly",
            },
        )

    facts = _fact_count(email)
    if facts < 20:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "FIRST_SESSION_GATE",
                "message": "Dilly needs to know you better first. Keep adding facts, then come back.",
                "facts": facts,
                "required": 20,
            },
        )

    schedule = chapters_store.get_schedule(email)
    latest = chapters_store.get_latest_chapter(email)
    if not _cycle_due(latest, plan, schedule.get("next_override_at")):
        # Rate limit. Return the latest so the client can show it.
        raise HTTPException(
            status_code=429,
            detail={
                "code": "CHAPTER_NOT_DUE",
                "message": "Your next Chapter is not ready yet.",
                "latest": latest,
            },
        )

    # Pull profile context.
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.memory_surface_store import get_memory_surface

    profile = get_profile(email) or {}
    surface = get_memory_surface(email) or {}
    all_facts = surface.get("items") or []

    # Split facts into "since last chapter" vs older. Gives Dilly
    # something fresh to lead with even when the user's older facts
    # are unchanged.
    last_chapter_ts = None
    if latest:
        try:
            last_chapter_ts = datetime.fromisoformat(latest["fetched_at"].replace("Z", "+00:00"))
        except Exception:
            pass

    def _is_recent(fact: dict) -> bool:
        if not last_chapter_ts:
            return False
        raw = fact.get("created_at") or fact.get("updated_at")
        if not raw:
            return False
        try:
            ts = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            return ts > last_chapter_ts
        except Exception:
            return False

    recent_facts = [f for f in all_facts if _is_recent(f)]
    older_facts = [f for f in all_facts if not _is_recent(f)]

    # Open notes the user left for this Chapter. Templated ack didn't
    # cost anything; the notes themselves feed into the prompt.
    open_notes = chapters_store.list_open_notes(email)

    # Compute a friendly time-of-day greeting the prompt can weave
    # into the cold_open. Backend time only — we don't know the user's
    # tz reliably, so this is approximate.
    from datetime import datetime as _dt
    _hr = _dt.utcnow().hour
    _greeting = (
        "Good morning" if 5 <= _hr < 12 else
        "Good afternoon" if 12 <= _hr < 18 else
        "Good evening"
    )

    # Per-path advisor lens. Injects a short "who this user is" block
    # right after the role definition so the advisor voice matches
    # their situation. A veteran's Chapter should not read like an
    # ex_founder's. Falls back to a neutral lens for unknown paths.
    from dilly_core.chapter_advisor_lens import lens_block
    advisor_lens = lens_block(profile.get("user_path"))

    # Per-user advisor PERSONA. The path lens covers who the user is;
    # the persona covers HOW they want to be advised — warm / sharp /
    # direct. Stacks additively: a veteran + sharp reads very
    # different from a veteran + warm. Empty string when the user
    # hasn't picked one (default advisor voice stays in effect).
    from dilly_core.chapter_persona import persona_block as _persona_block
    persona_chunk = _persona_block(profile.get("advisor_persona"))

    # Build the structured prompt.
    # The Chapter bar is "a real advisor wrote this for me this week."
    # Three things get you most of the way there:
    #   1. A specific callback to something the user said before —
    #      prove you remember.
    #   2. An honest push — ask the thing they haven't wanted to say
    #      out loud.
    #   3. A small citation style so users trust the claims.
    system_prompt = (
        "You are Dilly, writing a weekly one-to-one advisory session for someone you have been mentoring. "
        "Write like a senior advisor who has known this person for a year and bills $300/hr. "
        "Every screen must feel DISTINCT from every other screen. Read the per-screen rules below carefully.\n\n"
        f"{advisor_lens}\n\n"
        + (f"{persona_chunk}\n\n" if persona_chunk else "")
        + "UNIVERSAL STYLE RULES (apply to all screens):\n"
        "- Never use em dashes, semicolons, markdown, bullet points, or asterisks. Periods and commas only.\n"
        "- Write clean prose. No formatting characters that would render as asterisks or dashes in a chat view.\n"
        "- Cite the user's actual experiences, companies, and skills by name. Zero generic advice.\n"
        "- Every screen body is MAX 2 short sentences. Punchy, specific, dense.\n"
        "- Warm but direct tone. Not a therapist, not a cheerleader. An advisor.\n"
        "- Chapter title: 2 to 4 evocative words. Never clinical. Examples: "
        "\"The Reset\", \"Sharpening Your Edge\", \"Cards On The Table\", \"One Clean Move\".\n\n"

        "PER-SCREEN RULES (each slot has a DISTINCT purpose, voice, and forbidden patterns):\n\n"

        f"SCREEN 1 — cold_open\n"
        "PURPOSE: Prove you remember this person. Reconnect with a specific callback, not a generic greeting.\n"
        "FORMAT: Start with the greeting phrase, then ONE specific reference from their profile or prior context. 2 sentences max.\n"
        "DO: Reference a specific commitment they made, a company they mentioned, a project they're working on, an emotion they expressed.\n"
        "DO NOT: Summarize their whole profile. Say 'I've been thinking about you.' Open with a question. Use vague openers like 'Great to see you.'\n"
        f"EXAMPLE: \"{_greeting}, [name]. I keep coming back to what you said about leaving consulting — you've said it twice now and haven't moved.\"\n\n"

        "SCREEN 2 — noticed\n"
        "PURPOSE: Name ONE specific thing you observed in their new data. Dilly is SPEAKING here, not asking.\n"
        "FORMAT: 'I noticed [specific observable fact]. [One-sentence implication].' 2 sentences max.\n"
        "DO: Cite something concrete from new facts, wins, activity, or their notes this week. Name the implication.\n"
        "DO NOT: Ask 'what's on your mind.' Start with a question. Give general observations. Repeat what cold_open said. Ask for confirmation.\n"
        "EXAMPLE: 'You've applied to 12 roles in 3 weeks, but zero in your stated target sector. That gap is worth naming.'\n\n"

        "SCREEN 3 — working\n"
        "PURPOSE: Name ONE specific thing that is genuinely working for this person. Evidence-based, not encouragement.\n"
        "FORMAT: State the win or strength concretely. Explain why it matters for their specific goal. 2 sentences max.\n"
        "DO: Name a real win, a measurable signal, a skill showing up, a behavior working in their favor. Tie it to their goal.\n"
        "DO NOT: Give generic encouragement ('You're doing great!'). Repeat the noticed observation. Make up a win if the data is thin — instead name the one real signal that exists.\n"
        "EXAMPLE: 'Your resume pass-through rate at target companies is above your cohort average. Your project framing is doing the work.'\n\n"

        "SCREEN 4 — push_on\n"
        "PURPOSE: The honest push. The thing they haven't said out loud. An advisor earns the right to say this.\n"
        "FORMAT: A direct, specific observation followed by THE hard question — the one they are probably avoiding. 2 sentences max.\n"
        "DO: Name something specific they are circling around, avoiding, or haven't confronted. Make it personal to their situation.\n"
        "DO NOT: Be harsh or unkind. Give generic advice ('you should network more'). Ask multiple questions. Soften it into nothing. Repeat what was already said.\n"
        "EXAMPLE: 'You have the skills for the PM role you keep describing, but your resume still reads like an engineer. What is actually stopping you from changing that?'\n\n"

        "SCREEN 5 — one_move\n"
        "PURPOSE: The single concrete action before next session. Not options. Not suggestions. THE move.\n"
        "FORMAT: '[Specific action] by [specific day or timeframe].' Optional: one sentence on why this move over others. 2 sentences max.\n"
        "DO: Propose one deliverable with a specific deadline. Be directive. Make it specific enough to do tomorrow.\n"
        "DO NOT: Give a list. Offer alternatives. Be vague ('work on your resume'). Frame it as a suggestion. Cover more than one thing.\n"
        "EXAMPLE: 'Rewrite your resume headline to include AI-integrated systems and update two bullet points by Thursday. That is the single unlock.'\n\n"

        "SCREEN 6 — question\n"
        "PURPOSE: The ONE question Dilly most wants this person to sit with. Opens an inline chat.\n"
        "FORMAT: One focused question. Under 20 words. Invites a real answer, not a yes/no.\n"
        "DO: Make it personal to what was discussed. Make it something they can answer in a few sentences. Something that will actually make them think.\n"
        "DO NOT: Ask a summarizing question. Ask about the whole session. Ask something with an obvious answer. Ask multiple things.\n"
        "EXAMPLE: 'You said you would send those cold emails three weeks ago. What is the actual thing in the way?'\n\n"

        "SCREEN 7 — close\n"
        "PURPOSE: A warm, forward-looking closer. One sentence. Make it feel like the end of a real session.\n"
        "FORMAT: One sentence. Warm but grounded. References something specific from this Chapter or anticipates next one.\n"
        "DO: Land on something that resonates from the session. Point forward.\n"
        "DO NOT: Summarize the whole session. Use 'good luck.' Repeat the one_move verbatim.\n"
        "EXAMPLE: 'Send those emails. I will be looking for the update next week.'\n\n"

        "If the user left NOTES for this Chapter, address the strongest one in noticed, push_on, or one_move.\n\n"
        "Return ONLY this JSON, no prose outside it:\n"
        "{\n"
        "  \"title\": \"<2-4 word Chapter title>\",\n"
        "  \"screens\": [\n"
        "    { \"slot\": \"cold_open\",  \"body\": \"<greeting + specific callback, max 2 sentences>\" },\n"
        "    { \"slot\": \"noticed\",    \"body\": \"<specific observation, Dilly speaking not asking, max 2 sentences>\" },\n"
        "    { \"slot\": \"working\",    \"body\": \"<one concrete win with evidence, max 2 sentences>\" },\n"
        "    { \"slot\": \"push_on\",    \"body\": \"<specific honest push, ends with the hard question, max 2 sentences>\" },\n"
        "    { \"slot\": \"one_move\",   \"body\": \"<one action, one deadline, directive not suggestion, max 2 sentences>\" },\n"
        "    { \"slot\": \"question\",   \"body\": \"<one focused question for inline chat, under 20 words>\" },\n"
        "    { \"slot\": \"close\",      \"body\": \"<one warm forward-looking sentence>\" }\n"
        "  ]\n"
        "}"
    )

    # Assemble user message. Keep it reasonably short; Haiku 4.5 cache
    # threshold is 4096 tokens and we want the system block cached.
    def _summarize_facts(facts_in: list[dict], limit: int) -> str:
        out = []
        for f in facts_in[:limit]:
            label = (f.get("label") or "").strip()
            value = (f.get("value") or "").strip()
            if label and value:
                out.append(f"- {label}: {value}")
            elif value:
                out.append(f"- {value}")
        return "\n".join(out) or "(none)"

    first_name = (profile.get("name") or "").split()[0] if profile.get("name") else ""
    role_or_field = (profile.get("profile_tagline") or profile.get("custom_tagline") or "").strip()

    notes_block = "\n".join(f"- {n['text']}" for n in open_notes) or "(none this week)"

    user_message = (
        f"---USER---\n"
        f"first_name: {first_name or '(unknown)'}\n"
        f"tagline: {role_or_field or '(none)'}\n"
        f"plan: {plan}\n"
        f"---NEW THIS WEEK (address these first)---\n"
        f"{_summarize_facts(recent_facts, 12)}\n"
        f"---BACKGROUND---\n"
        f"{_summarize_facts(older_facts, 25)}\n"
        f"---NOTES THEY LEFT FOR THIS CHAPTER---\n"
        f"{notes_block}\n"
        f"---END---"
    )

    try:
        import anthropic
        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="AI service not configured.")
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1200,
            temperature=0.5,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response(email, getattr(FEATURES, "CHAPTER", "chapter"), response)
        except Exception:
            pass
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned an invalid Chapter. Try again.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CHAPTERS] generate error: {e}", flush=True)
        raise HTTPException(status_code=502, detail="AI service error. Try again.")

    # Validate.
    title = str(parsed.get("title", "")).strip() or "This Week"
    screens_raw = parsed.get("screens") or []
    expected_slots = ["cold_open", "noticed", "working", "push_on", "one_move", "question", "close"]
    screens: list[dict[str, Any]] = []
    for slot in expected_slots:
        body = ""
        for s in screens_raw:
            if isinstance(s, dict) and s.get("slot") == slot:
                body = str(s.get("body") or "").strip()
                break
        if not body:
            # Safety net: any missing slot gets a generic fallback so the
            # client never crashes on bad LLM output.
            body = "(Dilly did not write this one. Come back next Chapter.)"
        # Strip em dashes as a final safety net in case Dilly snuck one in.
        body = body.replace("\u2014", ", ").replace(" - ", ", ")
        screens.append({"slot": slot, "body": body})

    # Also clean the title.
    title = title.replace("\u2014", " ").replace(" - ", " ")

    # Persist + consume notes + clear any reschedule override.
    now = datetime.now(timezone.utc)
    new_id = chapters_store.save_chapter(email, title=title, screens=screens, scheduled_for=now)
    chapters_store.consume_open_notes(email)
    chapters_store.clear_override(email)

    return {
        "id": new_id,
        "title": title,
        "screens": screens,
        "generated_at": now.isoformat(),
    }
