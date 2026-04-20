"""
Daily Pulse — a 30–60 second reflective check-in.

The weekly Chapter is the deep ritual; Pulse is the daily habit that
keeps users coming back between Chapters. One prompt per day, picked
deterministically from a static pool so every user sees the same
prompt on the same day (no LLM cost). User writes a short response
(optional mood). Streak counter ticks up each consecutive day, with
one "grace" miss allowed per rolling 7-day window so the streak
doesn't shame users for a single skip.

Endpoints:
  GET  /pulse/today   → today's prompt + whether user answered + streak
  POST /pulse         → save a pulse entry for today, returns streak
  GET  /pulse/history → last N entries (default 30) for timeline views

Data shape on profile:
  profile.pulse_log = [
    { id, date, prompt, response, mood? },  # date is YYYY-MM-DD
    ...
  ]
  profile.pulse_streak = {
    current, longest, last_date, grace_used_dates: [YYYY-MM-DD, ...]
  }

We reuse `profile.streak.last_checkin` as well so Pulse check-ins
count toward the existing streak surface used elsewhere in the app
(Home, /profile/checkin). Users don't need two separate streak
numbers — a Pulse is a check-in.
"""

import datetime
import hashlib
import uuid as _uuid

from fastapi import APIRouter, Request

from projects.dilly.api import deps, errors


router = APIRouter(tags=["pulse"])


# Static pool of reflective prompts. Keep these open-ended and warm —
# NOT career-busywork ("update your resume"). The point is to capture
# a micro-reflection from the user's day so Dilly can reference it
# later. If we need more variety we just add to this list; no LLM
# call is ever required for prompt selection.
PROMPTS = [
    "What's one thing you're proud of from today?",
    "Who did you learn from this week, and what stuck?",
    "What's weighing on you right now?",
    "Name one small win — even something tiny.",
    "What are you avoiding that you know you should do?",
    "What's a question you wish someone would ask you?",
    "If today felt off, what's one thing that would make tomorrow better?",
    "What's one skill you used today that you're getting better at?",
    "Who's someone you admire in your field right now, and why?",
    "What did you say yes to this week that you shouldn't have?",
    "What's one thing you did today that your future self will thank you for?",
    "When did you feel most like yourself this week?",
    "What's a risk you're considering?",
    "What's working in your search / routine that you want to keep?",
    "What would you tell a friend going through exactly what you're going through?",
    "What's one piece of feedback you've been afraid to ask for?",
    "Where in your life are you growing the fastest?",
    "What's a belief you've been quietly changing your mind about?",
    "What's the smallest next step you could take tomorrow?",
    "If you had one extra hour today, how would you spend it?",
    "What's something you know you're good at that you don't talk about?",
    "What's been surprising you lately?",
    "Whose approval have you been chasing, and is it worth it?",
    "What does a good day look like for you right now?",
    "What would make this week feel like it mattered?",
    "What's one thing you'd quietly like to get better at?",
    "If you could ask your manager / mentor anything honestly, what would it be?",
    "What's one decision you've been putting off?",
    "What's something good that happened that you didn't tell anyone?",
    "What did you notice about yourself this week that you hadn't before?",
]

# Optional mood tokens we accept. Nothing forced — users can submit
# without a mood. These are low-friction and don't need to be shown
# as a long list in the UI (mobile uses 4-6 common ones).
VALID_MOODS = {
    "great", "good", "okay", "tired", "stressed", "stuck", "hopeful",
    "anxious", "proud", "flat", "motivated", "overwhelmed",
}


def _today_str() -> str:
    return datetime.date.today().isoformat()


def _yesterday_str() -> str:
    return (datetime.date.today() - datetime.timedelta(days=1)).isoformat()


def _pick_prompt_for(date_str: str) -> str:
    """Deterministic per-day prompt selection. Same prompt for all
    users on a given day — small amount of shared context ('did you
    see today's question?') is a feature, not a bug."""
    seed = int(hashlib.md5(date_str.encode()).hexdigest(), 16)
    return PROMPTS[seed % len(PROMPTS)]


def _compute_streak(
    prev_streak: dict,
    today: str,
) -> dict:
    """Given the prior streak state and today's date, return the new
    streak state for a successful check-in today. Grace rule: if the
    user missed exactly one day AND hasn't already used their grace
    in the last 7 days, the streak continues instead of resetting.
    """
    current = int(prev_streak.get("current") or 0)
    longest = int(prev_streak.get("longest") or 0)
    last_date = prev_streak.get("last_date")
    grace_dates = list(prev_streak.get("grace_used_dates") or [])

    today_d = datetime.date.fromisoformat(today)

    if not last_date:
        current = 1
    elif last_date == today:
        # Already counted today — no change.
        pass
    else:
        try:
            last_d = datetime.date.fromisoformat(str(last_date))
        except Exception:
            last_d = None
        if last_d is None:
            current = 1
        else:
            gap = (today_d - last_d).days
            if gap == 1:
                current += 1
            elif gap == 2:
                # One missed day. Check grace window.
                recent_grace = [
                    d for d in grace_dates
                    if (today_d - datetime.date.fromisoformat(d)).days <= 7
                ]
                if len(recent_grace) == 0:
                    # Forgiving: keep streak, record grace use on the
                    # missed day (yesterday).
                    missed = (today_d - datetime.timedelta(days=1)).isoformat()
                    grace_dates.append(missed)
                    current += 1
                else:
                    current = 1
            else:
                current = 1

    longest = max(longest, current)
    # Trim grace log to last 30 days so it doesn't grow forever.
    cutoff = today_d - datetime.timedelta(days=30)
    grace_dates = [
        d for d in grace_dates
        if datetime.date.fromisoformat(d) >= cutoff
    ]

    return {
        "current": current,
        "longest": longest,
        "last_date": today,
        "grace_used_dates": grace_dates,
    }


@router.get("/pulse/today")
async def pulse_today(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile

    profile = get_profile(email) or {}
    today = _today_str()
    prompt = _pick_prompt_for(today)

    pulse_log = profile.get("pulse_log") if isinstance(profile.get("pulse_log"), list) else []
    answered_today = next(
        (p for p in pulse_log if isinstance(p, dict) and str(p.get("date"))[:10] == today),
        None,
    )

    streak = profile.get("pulse_streak") or {}

    return {
        "ok": True,
        "today": today,
        "prompt": prompt,
        "answered": bool(answered_today),
        "response": (answered_today or {}).get("response"),
        "mood": (answered_today or {}).get("mood"),
        "streak": {
            "current": int(streak.get("current") or 0),
            "longest": int(streak.get("longest") or 0),
            "last_date": streak.get("last_date"),
        },
    }


@router.post("/pulse")
async def pulse_submit(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    response = str(body.get("response") or "").strip()
    if not response:
        raise errors.bad_request("response is required")
    # Cap at 1000 chars — pulses are supposed to be small.
    response = response[:1000]

    mood = str(body.get("mood") or "").strip().lower() or None
    if mood is not None and mood not in VALID_MOODS:
        mood = None  # silently drop invalid; don't block the save

    from projects.dilly.api.profile_store import get_profile, save_profile

    profile = get_profile(email) or {}
    today = _today_str()
    prompt = _pick_prompt_for(today)

    pulse_log = profile.get("pulse_log") if isinstance(profile.get("pulse_log"), list) else []
    existing_today = next(
        (i for i, p in enumerate(pulse_log)
         if isinstance(p, dict) and str(p.get("date"))[:10] == today),
        None,
    )

    entry = {
        "id": str(_uuid.uuid4()),
        "date": today,
        "prompt": prompt,
        "response": response,
        "mood": mood,
    }

    if existing_today is not None:
        # Overwrite today's entry — user is editing, not double-counting.
        pulse_log[existing_today] = entry
        is_new_today = False
    else:
        pulse_log.append(entry)
        is_new_today = True

    # Cap log at last 180 entries (~6 months). Older entries fall off
    # to keep profile size bounded.
    if len(pulse_log) > 180:
        pulse_log = pulse_log[-180:]

    prev_streak = profile.get("pulse_streak") or {}
    if is_new_today:
        new_streak = _compute_streak(prev_streak, today)
    else:
        new_streak = prev_streak  # editing today doesn't re-advance

    # Also push into the shared profile.streak so the Home / habits
    # surfaces treat a Pulse as a daily check-in. This keeps the
    # single-number streak story consistent across the app.
    shared_streak = profile.get("streak") or {}
    last_checkin = shared_streak.get("last_checkin")
    if last_checkin != today:
        yesterday = _yesterday_str()
        if last_checkin == yesterday:
            shared_streak["current_streak"] = int(shared_streak.get("current_streak") or 0) + 1
        else:
            shared_streak["current_streak"] = 1
        shared_streak["longest_streak"] = max(
            int(shared_streak.get("longest_streak") or 0),
            int(shared_streak["current_streak"]),
        )
        shared_streak["last_checkin"] = today

    save_profile(email, {
        "pulse_log": pulse_log,
        "pulse_streak": new_streak,
        "streak": shared_streak,
    })

    # Feed the pulse response through the regex extraction pipeline so
    # reflective entries auto-populate profile facts. A user writing
    # "Today I finished my first Python project" in a Pulse should
    # produce a project_detail fact without requiring them to also
    # type it into Dilly's chat. Zero LLM cost — extract_memory_items
    # with use_llm=False runs pattern matching only, same cheap path
    # used on every chat turn. Previously Pulse was a parallel data
    # silo that never made it into memory_surface; the profile grid
    # read from memory_surface, so Pulse content was invisible on the
    # profile page. This closes the loop.
    facts_added: list[dict] = []
    if is_new_today:
        try:
            from projects.dilly.api.memory_extraction import extract_memory_items
            from projects.dilly.api.memory_surface_store import (
                get_memory_surface, save_memory_surface,
            )
            # Wrap the pulse response as a one-turn chat batch so it
            # flows through the same extraction machinery as /ai/chat
            # does. The prompt is included as context only (not
            # extracted from) — the regex extractor only scans user
            # messages anyway.
            synth_messages = [{"role": "user", "content": response}]
            surface = get_memory_surface(email) or {}
            existing = surface.get("items") or []
            new_items = extract_memory_items(
                email,
                f"pulse-{today}-{entry['id'][:8]}",
                synth_messages,
                existing,
                use_llm=False,
                # Pulse reflections are already user-intent-gated by
                # the act of writing them, so bypass the chat-path
                # word-count pre-gate. A short but specific pulse
                # like 'Applied to Anthropic today' should extract
                # even though it wouldn't pass the 20-char+3-word bar.
                skip_gate=True,
            )
            if new_items:
                # Merge + dedup at the category+label grain, same rule
                # run_extraction uses. Kept inline (not via
                # run_extraction) because we want to tag the new
                # items with a 'pulse' source so a later UI could
                # surface "from today's Pulse" provenance.
                for it in new_items:
                    it.setdefault("source", "pulse")
                items_all = [*new_items, *existing]
                dedup: dict[tuple[str, str], dict] = {}
                for item in items_all:
                    key = (
                        str(item.get("category") or "").lower(),
                        str(item.get("label") or "").strip().lower(),
                    )
                    if not key[0] or not key[1]:
                        continue
                    if key not in dedup:
                        dedup[key] = item
                items_all = list(dedup.values())[:400]
                save_memory_surface(
                    email,
                    items=items_all,
                    narrative=surface.get("narrative"),
                    narrative_updated_at=None,
                )
                facts_added = new_items
        except Exception:
            # Never let extraction failure block the pulse save. The
            # entry is already on disk; extraction is a nice-to-have.
            facts_added = []

    return {
        "ok": True,
        "entry": entry,
        "streak": {
            "current": new_streak.get("current", 1),
            "longest": new_streak.get("longest", 1),
            "last_date": new_streak.get("last_date"),
        },
        "is_new_today": is_new_today,
        "facts_added": facts_added,
    }


@router.get("/pulse/history")
async def pulse_history(request: Request, limit: int = 30):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile

    profile = get_profile(email) or {}
    pulse_log = profile.get("pulse_log") if isinstance(profile.get("pulse_log"), list) else []
    # Newest first, bounded.
    limit = max(1, min(180, int(limit or 30)))
    recent = list(reversed(pulse_log))[:limit]
    return {
        "ok": True,
        "entries": recent,
        "total": len(pulse_log),
    }
