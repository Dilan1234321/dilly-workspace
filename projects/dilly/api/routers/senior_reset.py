"""
Senior Reset — bespoke surface for user_path == 'senior_reset'.

This is a Rung-3 per-situation redesign proof-of-concept. The user
was just laid off after years (often decades) in their field. The
app's standard seeker home (Journey, Pipeline, empty-state tiles)
reads wrong for this cohort — they don't need cheerleading, they
need acknowledgment, composure, and a slow-hand daily beat.

GET /senior-reset/dashboard returns the data backing SeniorResetHome:
  {
    identity:     { name, current_role_fallback, years_experience },
    regroup:      { headline, body, weeks_since_layoff },
    moat:         { headline, leverage_sentence, yoe,
                    ai_resistant_skills: [str] },
    today_move:   { title, body, chat_seed },   // single action
    network:      { headline, prompts: [str] },
    market:       { total_senior, example_role },
  }

All fields are deterministic aggregations of profile + memory facts +
life_events. Zero LLM calls per view. If the user's memory is thin,
blocks fall back to composed defaults rather than looking empty.
"""
from __future__ import annotations
import os
import sys
import datetime as _dt
from typing import Optional

from fastapi import APIRouter, Request, HTTPException

from projects.dilly.api import deps

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

router = APIRouter(tags=["senior_reset"])


def _str(v) -> str:
    return "" if v is None else str(v).strip()


def _years_to_float(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    import re
    m = re.search(r"\d+(?:\.\d+)?", str(v))
    try: return float(m.group(0)) if m else 0.0
    except Exception: return 0.0


def _weeks_since_layoff(life_events: list[dict]) -> int | None:
    """Find the most recent 'layoff' event and count weeks since."""
    if not life_events:
        return None
    latest_ts = None
    for e in life_events:
        if e.get("kind") == "layoff":
            ts = e.get("at")
            if ts and (latest_ts is None or ts > latest_ts):
                latest_ts = ts
    if not latest_ts:
        return None
    try:
        when = _dt.datetime.fromisoformat(str(latest_ts).replace("Z", "+00:00"))
        now = _dt.datetime.now(_dt.timezone.utc)
        delta = now - when
        return max(0, delta.days // 7)
    except Exception:
        return None


def _collect_skills(email: str) -> tuple[list[str], list[str]]:
    """Returns (ai_resistant_skills, all_skills). AI-resistant =
    judgment, leadership, mentoring, domain-expertise flavored facts."""
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface  # type: ignore
        surface = get_memory_surface(email) or {}
    except Exception:
        return ([], [])
    items = surface.get("items") or []
    resistant: list[str] = []
    all_s: list[str] = []
    RESISTANT_MARKERS = (
        "leadership", "mentor", "judgment", "negotiat", "strategy",
        "decision", "client", "stakeholder", "team", "management",
        "culture", "relationship", "policy", "complex",
    )
    for it in items:
        cat = (it.get("category") or "").lower()
        if cat in ("skill_unlisted", "soft_skill", "technical_skill", "skill", "expertise"):
            label = _str(it.get("label") or it.get("value"))
            if not label: continue
            if label not in all_s:
                all_s.append(label)
            ll = label.lower()
            if any(m in ll for m in RESISTANT_MARKERS):
                if label not in resistant:
                    resistant.append(label)
    return (resistant[:6], all_s[:12])


def _guess_most_recent_role(email: str, profile: dict) -> str:
    role = (
        _str(profile.get("most_recent_role"))
        or _str(profile.get("current_role"))
        or _str(profile.get("current_job_title"))
        or _str(profile.get("title"))
    )
    if role:
        return role
    # Fall back to parsed resume trajectory
    try:
        from projects.dilly.api.dilly_profile_txt import (  # type: ignore
            read_profile_txt,
            parse_structured_experience_from_profile_txt,
        )
        txt = read_profile_txt(email) or ""
        rows = parse_structured_experience_from_profile_txt(txt) or []
        if rows:
            return _str(rows[0].get("role"))
    except Exception:
        pass
    return ""


def _senior_market_read() -> tuple[int | None, str | None]:
    """
    Count live listings suitable for seniors. Loose filter: title
    contains Senior/Staff/Principal/Director/Head/Lead/VP/Chief.
    Returns (count, example_role) or (None, None) on failure.
    """
    try:
        from projects.dilly.api.routers.internships_v2 import _get_db  # type: ignore
        conn = _get_db()
    except Exception:
        return (None, None)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*), (
                SELECT title FROM internships
                WHERE title ILIKE ANY (ARRAY[
                    '%Senior%', '%Staff%', '%Principal%', '%Director%',
                    '%Head of%', '% Lead %', 'VP %', 'Chief %'
                ])
                ORDER BY posted_date DESC NULLS LAST
                LIMIT 1
            )
            FROM internships
            WHERE title ILIKE ANY (ARRAY[
                '%Senior%', '%Staff%', '%Principal%', '%Director%',
                '%Head of%', '% Lead %', 'VP %', 'Chief %'
            ])
        """)
        row = cur.fetchone()
        if row:
            return (int(row[0] or 0), _str(row[1]))
    except Exception:
        pass
    finally:
        try: conn.close()
        except Exception: pass
    return (None, None)


@router.get("/senior-reset/dashboard")
async def senior_reset_dashboard(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").lower()
    if not email:
        raise HTTPException(401, "not authenticated")

    try:
        from projects.dilly.api.profile_store import ensure_profile_exists  # type: ignore
        profile = ensure_profile_exists(email) or {}
    except Exception:
        profile = {}

    name = _str(profile.get("name"))
    first_name = name.split()[0] if name else ""
    yoe = _years_to_float(profile.get("years_experience"))
    most_recent_role = _guess_most_recent_role(email, profile)
    domain = _str(profile.get("most_recent_industry")) or (most_recent_role or "")
    life_events = profile.get("life_events") or []
    weeks = _weeks_since_layoff(life_events)

    ai_resistant, all_skills = _collect_skills(email)

    # ── Regroup: the first-thing-they-see tone. Calm, not urgent. ──
    if weeks is None:
        regroup_headline = (
            f"{first_name}, here's where you are today." if first_name
            else "Here's where you are today."
        )
        regroup_body = (
            "We'll move at your pace. No pressure today — the market's "
            "not going anywhere, and neither is what you built."
        )
    elif weeks == 0:
        regroup_headline = "Give it a day before you do anything big."
        regroup_body = (
            "Most people make their worst moves in the first 48 hours "
            "after a layoff. Rest. Tomorrow Dilly will be here with a plan."
        )
    elif weeks <= 2:
        regroup_headline = f"Week {weeks + 1}. Still early."
        regroup_body = (
            "You're in the settling phase. Don't benchmark yourself against "
            "people 3 months in. Today's only job: one conversation, one note home."
        )
    elif weeks <= 8:
        regroup_headline = f"Week {weeks + 1}. Into the work."
        regroup_body = (
            "You've got a rhythm now. Most senior roles come through the "
            "second or third person you call, not the first job board click."
        )
    else:
        regroup_headline = f"Week {weeks + 1}. Long arc."
        regroup_body = (
            "Long searches are normal at this level. Your next role will "
            "match you because of who you are, not despite the time it's taken."
        )

    # ── Moat (quantified) ──
    if yoe >= 10 and domain:
        moat_headline = f"{int(yoe)} years of {domain.lower()}."
        moat_leverage = (
            f"The market is short on {domain.lower()} leaders with your depth. "
            f"That's what recruiters are actually looking for — not keywords, "
            f"judgment."
        )
    elif yoe >= 10:
        moat_headline = f"{int(yoe)} years of doing the work."
        moat_leverage = (
            "Experience of this depth is the one thing AI cannot replicate. "
            "Your moat is your judgment, not your resume keywords."
        )
    elif yoe >= 5:
        moat_headline = f"{int(yoe)} years of doing the work."
        moat_leverage = "Senior enough to run things, fresh enough to learn fast."
    else:
        moat_headline = "Your track record is your leverage."
        moat_leverage = "The roles you've held, the people you helped — those are your proof."

    # ── Today's One Move ──
    # Cycle based on week number so the card rotates across the reset
    # arc. All are deterministic and require no LLM.
    moves = [
        {
            "title": "Call one person today",
            "body":  "Not a cold email. Not LinkedIn. Someone who already knows your work. A quick catch-up. That's it.",
            "chat_seed": (
                "I want to reach out to one person I know well about what's next. "
                "Help me think about who it should be. Ask me about the last 3 "
                "people who respected my work and why."
            ),
        },
        {
            "title": "Name one thing you shipped",
            "body":  "Write down the single most recent outcome you owned. One sentence. We'll build the story from there.",
            "chat_seed": (
                "I want to name one specific outcome I owned in my last role. Help "
                "me make it concrete — pull the number out, the team size, the deadline "
                "I hit. Ask me questions until it's specific."
            ),
        },
        {
            "title": "Sketch your next 90 days",
            "body":  "Not a plan. A sketch. What does the next 90 days look like if it goes well?",
            "chat_seed": (
                "I want to sketch a realistic 90-day plan for this search. "
                "Challenge me where it's wishful. I'm a senior professional between roles."
            ),
        },
        {
            "title": "Walk the neighborhood once today",
            "body":  "Layoffs compress you indoors. Twenty minutes outside resets more than it sounds like.",
            "chat_seed": (
                "I'm taking a walk to reset. When I'm back, help me think about "
                "what I actually want in my next role, not just what I'd take."
            ),
        },
    ]
    idx = 0 if weeks is None else (weeks % len(moves))
    today_move = moves[idx]

    # ── Network prompts ──
    network_prompts: list[str] = [
        "Who was the last peer who offered to help?",
        "Which of my former reports ended up somewhere good?",
        "Is there a founder I mentored who's hiring?",
        "What vendor or partner knew my work?",
    ]

    # ── Senior market read ──
    senior_count, example_role = _senior_market_read()

    return {
        "identity": {
            "name":                 name,
            "first_name":           first_name,
            "most_recent_role":     most_recent_role,
            "years_experience":     yoe,
            "domain":               domain or None,
        },
        "regroup": {
            "headline":           regroup_headline,
            "body":               regroup_body,
            "weeks_since_layoff": weeks,
        },
        "moat": {
            "headline":           moat_headline,
            "leverage_sentence":  moat_leverage,
            "yoe":                int(yoe),
            "ai_resistant_skills": ai_resistant,
            "all_skills":         all_skills,
        },
        "today_move": today_move,
        "network": {
            "headline": "Your network is the market at this level.",
            "prompts":  network_prompts,
        },
        "market": {
            "total_senior":  senior_count,
            "example_role":  example_role,
        },
    }
