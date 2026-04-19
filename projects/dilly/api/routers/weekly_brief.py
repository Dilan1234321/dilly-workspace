"""
Weekly Career Brief.

A personalized, career-relevant digest for each user. Powers:
  - The "Weekly Brief" card on the Career Center
  - The Monday morning push notification ("Your brief is ready")
  - Future email digest if we want it

Why this exists: generic push notifications ("come back to Dilly!") are
spam. A notification that says "3 new jobs in your field dropped this
week, your top skill is trending up, one thing to prep this week" is
a reason to open the app. This endpoint generates that content from
what Dilly already knows about the user and what happened in their
space this week.

Cached per user at the week boundary (Mon 00:00 local-ish in UTC) so
we don't re-generate on every open.

Endpoint:
  GET /brief/weekly   - returns this week's brief for the authenticated user
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import sys
import time
import traceback
from collections import OrderedDict
from typing import Any

from fastapi import APIRouter, HTTPException, Request

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from projects.dilly.api import deps

router = APIRouter(tags=["weekly-brief"])

# Cache: key = f"{email}:{iso_week}" → brief payload.
# 7-day TTL.
_BRIEF_CACHE: OrderedDict[str, dict] = OrderedDict()
_BRIEF_CACHE_MAX = 2000
_BRIEF_CACHE_TTL = 7 * 86400


def _iso_week_key(email: str) -> str:
    # Year-week string (Monday-start) so a brief regenerates exactly once
    # per calendar week even if the user opens the app every day.
    today = _dt.date.today()
    yr, wk, _ = today.isocalendar()
    return f"{email}:{yr}-W{wk:02d}"


def _cache_get(key: str) -> dict | None:
    entry = _BRIEF_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > _BRIEF_CACHE_TTL:
        _BRIEF_CACHE.pop(key, None)
        return None
    _BRIEF_CACHE.move_to_end(key)
    return entry["payload"]


def _cache_set(key: str, payload: dict) -> None:
    _BRIEF_CACHE[key] = {"payload": payload, "ts": time.time()}
    _BRIEF_CACHE.move_to_end(key)
    while len(_BRIEF_CACHE) > _BRIEF_CACHE_MAX:
        _BRIEF_CACHE.popitem(last=False)


def _count_new_jobs_this_week(email: str, profile: dict) -> int:
    """Count jobs the user would actually see this week.

    Previous implementation used `cohort_requirements::text ILIKE`
    which matched any job whose JSON blob contained the cohort name
    anywhere — returning tens of thousands when the real feed shows
    50. That mismatch was misleading ("you have 4,200 new matches!"
    then the Jobs tab renders 50 cards).

    The honest count is: active jobs created in the last 7 days that
    pass the SAME path-specific filter the user's feed applies, with
    a realistic hard cap. We don't try to replicate full match_scores
    ranking here — just "is it in the window + path-relevant".
    """
    try:
        from projects.dilly.api.database import get_db
    except Exception:
        return 0

    path = str(profile.get("user_path") or "").lower().strip()
    seven_days_ago = _dt.datetime.utcnow() - _dt.timedelta(days=7)

    try:
        with get_db() as conn:
            cur = conn.cursor()
            where = [
                "i.status = 'active'",
                "i.created_at >= %s",
                "i.description IS NOT NULL",
                "length(i.description) > 100",
            ]
            params: list = [seven_days_ago]

            # Path-specific structural filters — same as the feed. We
            # only apply the strict filter; no heuristic fallback here
            # (the brief should be conservative, not optimistic).
            if path == "dropout":
                where.append("(i.degree_required IN ('not_required', 'unclear') OR i.degree_required IS NULL)")
            elif path == "international_grad":
                where.append("(i.h1b_sponsor IN ('sponsors', 'unclear') OR i.h1b_sponsor IS NULL)")
            elif path in ("formerly_incarcerated", "refugee"):
                where.append("(i.fair_chance IN ('fair_chance', 'unclear') OR i.fair_chance IS NULL)")
            elif path == "rural_remote_only":
                where.append("(LOWER(COALESCE(i.work_mode,'')) = 'remote' OR LOWER(COALESCE(i.location_city,'')) = 'remote')")

            cur.execute(
                f"SELECT COUNT(*) FROM internships i WHERE {' AND '.join(where)}",
                params,
            )
            row = cur.fetchone()
            count = int(row[0] or 0) if row else 0

            # Cap at a believable ceiling matching what the feed actually
            # surfaces. Keeps the brief from claiming "3,400 new jobs"
            # while the Jobs tab renders 50.
            return min(count, 500)
    except Exception as e:
        sys.stderr.write(f"[weekly_brief._count_new_jobs] {type(e).__name__}: {e}\n")
        return 0


def _one_thing_to_prep(profile: dict, facts: list[dict], path: str) -> str | None:
    """Pick one concrete, do-this-week thing based on what Dilly knows.
    Replaces the old "one small move" phrasing which testers flagged
    as vague filler. Every branch returns a specific action the user
    can start today, not a motivational sentence.

    Priority order:
      1. Named goal in profile facts: translate to a this-week action.
      2. Near-term deadline: frame as a prep window.
      3. Path-specific action tuned to the user's situation.
      4. Growth nudge when profile is still thin.
    """
    # Guard: a valid string value must have real content, not just a
    # single character or a whitespace scrap. Profile facts have had
    # garbage like "S" or "a" land here from partial extractions, and
    # the resulting "take the first concrete step toward 'S'" copy
    # made the app look broken. Minimum 4 chars + at least one space
    # (so multi-word phrases pass but "goal" / "job" / "S" don't).
    def _meaningful(s: str) -> bool:
        s = (s or "").strip()
        return len(s) >= 4 and (" " in s or len(s) >= 8)

    # Named goal first — translate to a concrete this-week action.
    for f in facts:
        cat = (f.get("category") or "").lower()
        if cat == "goal":
            value = (f.get("value") or f.get("label") or "").strip()
            if _meaningful(value):
                return f"This week, take the first concrete step toward '{value[:60]}'. Ask Dilly to name it."
    # Near-term deadline as a prep window.
    deadlines = profile.get("deadlines") or []
    if isinstance(deadlines, list) and deadlines:
        first = deadlines[0]
        if isinstance(first, dict):
            label = (first.get("label") or first.get("name") or "").strip()
            if _meaningful(label):
                return f"Deadline approaching: {label[:60]}. Block 30 minutes today to prep it."
    # Path-specific actions — each one names the action, not the feeling.
    if path == "student":
        return "Message one person in your target field this week. Short, specific, honest."
    if path == "dropout":
        return "Ship one visible thing this week. Commit, post, demo. Receipts beat resumes."
    if path == "senior_reset":
        return "Warm up one past colleague this week. People in your network hire first."
    if path == "veteran":
        return "Translate one military achievement into a civilian-language bullet this week."
    if path == "parent_returning":
        return "Set one coffee chat with someone in your target field this week."
    if path == "career_switch":
        return "Publish one skill-transfer proof this week. A short project or case study works."
    if path == "international_grad":
        return "Research one sponsor-friendly company deeply this week and save it to your target list."
    return "Add one more fact to your Dilly Profile this week. Every fact sharpens the guidance."


def _generate_brief(email: str, profile: dict) -> dict:
    """Build the brief payload. No LLM call — pure derivation from facts
    + DB queries. Cheap, deterministic, and fast.

    If we ever want an LLM-written headline, plug it in here (Haiku)
    and cache aggressively (weekly). For now the structured fields are
    more useful than prose."""
    from projects.dilly.api.memory_surface_store import get_memory_surface

    surface = get_memory_surface(email) or {}
    facts = surface.get("items") or []

    name = ((profile.get("name") or "").split() or ["there"])[0]
    path = (profile.get("user_path") or "").strip().lower()

    # Signal 1: jobs that dropped this week and match the user.
    new_jobs = _count_new_jobs_this_week(email, profile)

    # Signal 2: profile growth.
    fact_count = len(facts)

    # Signal 3: one thing to prep this week.
    prep = _one_thing_to_prep(profile, facts, path)

    # Weekly headline — a single-sentence lede for the push notification.
    # This is the "why open the app" line.
    if new_jobs >= 3:
        headline = f"{new_jobs} new jobs dropped this week that match your profile."
        deep_link = "dilly://jobs?weekly=1"
    elif new_jobs > 0:
        headline = (
            f"{new_jobs} new job posted this week that matches you. "
            f"Worth a look."
        )
        deep_link = "dilly://jobs?weekly=1"
    elif fact_count < 40:
        headline = (
            f"Your week in Dilly, {name}: your profile is still growing. "
            f"One more conversation makes next week sharper."
        )
        deep_link = "dilly://ai-chat"
    else:
        headline = (
            f"Your week in Dilly, {name}: Dilly knows {fact_count} things "
            f"about you. Let's put them to work."
        )
        deep_link = "dilly://jobs"

    # Up to 3 short bullets for the in-app card.
    bullets: list[dict[str, str]] = []
    if new_jobs > 0:
        bullets.append({
            "icon": "briefcase",
            "text": f"{new_jobs} new jobs this week match your profile",
            "deep_link": "dilly://jobs?weekly=1",
        })
    if fact_count < 80:
        bullets.append({
            "icon": "chatbubble",
            "text": f"Dilly knows {fact_count} things about you. Aiming for 80+",
            "deep_link": "dilly://ai-chat",
        })
    if prep:
        bullets.append({
            "icon": "flash",
            "text": prep,
            "deep_link": "dilly://ai-chat",
        })

    return {
        "name": name,
        "path": path,
        "week": _dt.date.today().isocalendar()[1],
        "year": _dt.date.today().isocalendar()[0],
        "headline": headline,
        "deep_link": deep_link,
        "new_jobs_count": new_jobs,
        "fact_count": fact_count,
        "bullets": bullets[:3],
        "generated_at": _dt.datetime.utcnow().isoformat() + "Z",
    }


@router.get("/brief/weekly")
async def get_weekly_brief(request: Request):
    """Return the user's weekly brief. Cached once per ISO week per user."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    key = _iso_week_key(email)
    cached = _cache_get(key)
    if cached:
        return {**cached, "cached": True}

    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        payload = _generate_brief(email, profile)
        _cache_set(key, payload)
        return {**payload, "cached": False}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Could not build brief: {type(e).__name__}: {str(e)[:200]}",
        )
