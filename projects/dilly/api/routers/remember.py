"""
Dilly Remembered You — proof that Dilly is tracking.

Picks ONE specific callback from the user's recent history (pulses,
Chapter commitments, profile facts) and surfaces it on Home as a
card. Tapping the card opens a chat seeded with the callback so the
user can follow up with Dilly directly.

This is a retention lever distinct from Pulse / Chapter. Its job is
to make the user feel known: "Dilly is actually paying attention to
what I say." No LLM call required — callbacks are templated from
data the user themselves provided. Cheap, fast, and feels personal
because it IS personal.

Priority of signals (we return the first one with data):
  1. Most recent Pulse entry within last 14 days (strong signal,
     reflective content, always ready to call back)
  2. Last Chapter one_move commitment within last 14 days ("you
     said you'd do X — did you?")
  3. A recent deadline the user added that's coming up soon
  4. A recent profile fact added by the AI from chat

Endpoints:
  GET  /remember/today → {type, headline, context, seed_prompt} | {none:true}
  POST /remember/dismiss → mark today's callback as dismissed so it
       doesn't re-surface this calendar day
"""

import datetime
import hashlib

from fastapi import APIRouter, Request

from projects.dilly.api import deps, errors


router = APIRouter(tags=["remember"])


# Wording variations so the same data doesn't read the same way every
# time. Picked deterministically by date so it's stable within a day.
PULSE_INTROS = [
    "On {when} you wrote",
    "You said {when}",
    "Your pulse {when} was",
    "{when} you told me",
]

ONE_MOVE_INTROS = [
    "Last Chapter you said your move was to",
    "Your one move from {when} was to",
    "{when} you committed to",
    "From your last Chapter: you wanted to",
]

DEADLINE_INTROS = [
    "{title} is {when}",
    "You have {title} coming up {when}",
    "{title} lands {when}",
]


def _days_ago_label(date_iso: str) -> str:
    try:
        d = datetime.date.fromisoformat(date_iso[:10])
    except Exception:
        return "recently"
    today = datetime.date.today()
    gap = (today - d).days
    if gap == 0:
        return "earlier today"
    if gap == 1:
        return "yesterday"
    if gap <= 3:
        return f"{gap} days ago"
    if gap <= 7:
        return "earlier this week"
    if gap <= 14:
        return "last week"
    return "a couple weeks ago"


def _days_until_label(date_iso: str) -> str:
    try:
        d = datetime.date.fromisoformat(date_iso[:10])
    except Exception:
        return "soon"
    today = datetime.date.today()
    gap = (d - today).days
    if gap == 0:
        return "today"
    if gap == 1:
        return "tomorrow"
    if gap <= 7:
        return f"in {gap} days"
    if gap <= 14:
        return "next week"
    return "soon"


def _pick_intro(templates: list[str], date_seed: str) -> str:
    seed = int(hashlib.md5(date_seed.encode()).hexdigest(), 16)
    return templates[seed % len(templates)]


def _build_pulse_callback(pulse: dict, today: str) -> dict:
    when = _days_ago_label(pulse.get("date", today))
    intro = _pick_intro(PULSE_INTROS, today + "p").replace("{when}", when)
    response = str(pulse.get("response") or "").strip()
    # Trim to one sentence-ish — first 140 chars is enough to trigger
    # memory without spoiling the follow-up conversation.
    trimmed = response[:140].rstrip()
    if len(response) > 140:
        trimmed += "…"
    return {
        "type": "pulse",
        "headline": f"{intro}:",
        "context": trimmed,
        "seed_prompt": (
            f"A few days back I asked you '{pulse.get('prompt')}' and "
            f"you wrote: \"{response}\". Where are you with that now?"
        ),
    }


def _build_one_move_callback(chapter: dict, today: str) -> dict:
    generated_at = str(chapter.get("generated_at") or today)[:10]
    when = _days_ago_label(generated_at)
    intro = _pick_intro(ONE_MOVE_INTROS, today + "c").replace("{when}", when)
    screens = chapter.get("screens") if isinstance(chapter.get("screens"), list) else []
    one_move_body = ""
    for s in screens:
        if isinstance(s, dict) and s.get("slot") == "one_move":
            one_move_body = str(s.get("body") or "").strip()
            break
    trimmed = one_move_body[:160].rstrip()
    if len(one_move_body) > 160:
        trimmed += "…"
    return {
        "type": "one_move",
        "headline": f"{intro}:",
        "context": trimmed,
        "seed_prompt": (
            f"Last Chapter your one move was: \"{one_move_body}\". "
            f"Did you do it? What happened? If not, what got in the way?"
        ),
    }


def _build_deadline_callback(deadline: dict, today: str) -> dict:
    title = str(deadline.get("title") or deadline.get("label") or "Something").strip()
    date_str = str(deadline.get("date") or "")[:10]
    when = _days_until_label(date_str)
    intro = _pick_intro(DEADLINE_INTROS, today + "d")
    headline = intro.replace("{title}", title).replace("{when}", when)
    notes = str(deadline.get("notes") or "").strip()
    return {
        "type": "deadline",
        "headline": headline,
        "context": notes[:160] + ("…" if len(notes) > 160 else ""),
        "seed_prompt": (
            f"My {title} is {when}. Help me think through what I should "
            f"have ready before then."
        ),
    }


@router.get("/remember/today")
async def remember_today(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile

    profile = get_profile(email) or {}
    today = datetime.date.today().isoformat()

    # Respect dismissal for today.
    dismissed = profile.get("remember_dismissed_on")
    if dismissed == today:
        return {"ok": True, "none": True, "reason": "dismissed_today"}

    # Priority 1: most recent pulse within 14 days, but NOT today
    # (we want a callback, not a mirror of what they just wrote).
    pulse_log = profile.get("pulse_log") if isinstance(profile.get("pulse_log"), list) else []
    cutoff = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()
    recent_pulses = [
        p for p in pulse_log
        if isinstance(p, dict)
        and str(p.get("date") or "")[:10] >= cutoff
        and str(p.get("date") or "")[:10] != today
        and str(p.get("response") or "").strip()
    ]
    if recent_pulses:
        # Pick the most recent — that's the freshest signal.
        pick = sorted(recent_pulses, key=lambda p: str(p.get("date") or ""), reverse=True)[0]
        return {"ok": True, "none": False, **_build_pulse_callback(pick, today)}

    # Priority 2: last Chapter one_move within 14 days.
    chapters = profile.get("chapters_cache") if isinstance(profile.get("chapters_cache"), list) else []
    recent_chapters = [
        c for c in chapters
        if isinstance(c, dict)
        and str(c.get("generated_at") or "")[:10] >= cutoff
    ]
    if recent_chapters:
        pick = sorted(recent_chapters, key=lambda c: str(c.get("generated_at") or ""), reverse=True)[0]
        callback = _build_one_move_callback(pick, today)
        if callback.get("context"):
            return {"ok": True, "none": False, **callback}

    # Priority 3: soonest upcoming deadline (within 14 days).
    deadlines = profile.get("deadlines") if isinstance(profile.get("deadlines"), list) else []
    upcoming = []
    for d in deadlines:
        if not isinstance(d, dict):
            continue
        date_str = str(d.get("date") or "")[:10]
        if not date_str:
            continue
        try:
            dd = datetime.date.fromisoformat(date_str)
        except Exception:
            continue
        gap = (dd - datetime.date.today()).days
        if 0 <= gap <= 14 and not d.get("completedAt"):
            upcoming.append((gap, d))
    if upcoming:
        upcoming.sort(key=lambda t: t[0])
        return {"ok": True, "none": False, **_build_deadline_callback(upcoming[0][1], today)}

    # No meaningful signal yet — return none so the card hides.
    return {"ok": True, "none": True, "reason": "no_signal"}


@router.post("/remember/dismiss")
async def remember_dismiss(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import save_profile

    today = datetime.date.today().isoformat()
    save_profile(email, {"remember_dismissed_on": today})
    return {"ok": True}
