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
    """Approximate: count internships with created_at within the last 7
    days that match the user's cohorts (or career_fields) and preferred
    cities. Used in the brief's 'X new jobs match you this week' line."""
    try:
        from projects.dilly.api.database import get_db
    except Exception:
        return 0
    cohorts = profile.get("cohorts") or []
    extra = profile.get("extra_cohorts") or []
    all_cohorts = [str(c).lower() for c in (cohorts + extra) if c]
    cities = [str(c).lower() for c in (profile.get("job_locations") or [])]
    seven_days_ago = _dt.datetime.utcnow() - _dt.timedelta(days=7)
    try:
        with get_db() as conn:
            cur = conn.cursor()
            where = ["i.status = 'active'", "i.created_at >= %s"]
            params: list = [seven_days_ago]
            if all_cohorts:
                placeholders = " OR ".join(["i.cohort_requirements::text ILIKE %s"] * len(all_cohorts))
                where.append(f"({placeholders})")
                params.extend([f"%{c}%" for c in all_cohorts])
            # Loose city match: any preferred city OR remote.
            if cities:
                city_clauses = " OR ".join(
                    ["COALESCE(i.location_city,'') ILIKE %s"] * len(cities)
                )
                where.append(f"(({city_clauses}) OR i.work_mode ILIKE 'remote')")
                params.extend([f"%{c}%" for c in cities])
            cur.execute(
                f"SELECT COUNT(*) FROM internships i WHERE {' AND '.join(where)}",
                params,
            )
            row = cur.fetchone()
            return int(row[0] or 0) if row else 0
    except Exception as e:
        sys.stderr.write(f"[weekly_brief._count_new_jobs] {type(e).__name__}: {e}\n")
        return 0


def _one_thing_to_prep(profile: dict, facts: list[dict], path: str) -> str | None:
    """Pick one concrete, small, do-this-week thing based on what Dilly
    knows. Priorities:
      1. If user has a pending interview (from applications): prep for it.
      2. If profile has a near-term deadline: work toward it.
      3. If user has a named goal: next small step toward it.
      4. If user has a JD in their recent history: tailor a resume for it.
      5. Generic path-appropriate 'add one more fact' nudge."""
    # Look at explicit goals first
    for f in facts:
        cat = (f.get("category") or "").lower()
        if cat == "goal":
            value = (f.get("value") or f.get("label") or "").strip()
            if value:
                return f"One small move toward '{value[:60]}'. Dilly can help you pick it."
    # Look at deadlines
    deadlines = profile.get("deadlines") or []
    if isinstance(deadlines, list) and deadlines:
        first = deadlines[0]
        if isinstance(first, dict):
            label = (first.get("label") or first.get("name") or "").strip()
            if label:
                return f"Deadline approaching: {label[:60]}. Carve out 30 minutes."
    # Path-specific fallback
    if path == "student":
        return "Reach out to one person in your target field this week. One message, nothing heavier."
    if path == "dropout":
        return "Ship one visible thing this week. Commit, post, demo. Receipts beat resumes."
    if path == "senior_reset":
        return "One warm intro this week. People in your network hire first."
    if path == "veteran":
        return "Translate one military achievement into a civilian-language bullet."
    if path == "parent_returning":
        return "One coffee chat with someone in your target field this week."
    if path == "career_switch":
        return "One skill transfer proof this week. A short project, a case study, a writeup."
    if path == "international_grad":
        return "One sponsor-friendly company researched deeply this week."
    return "Tell Dilly one more thing about your career. Every fact sharpens the guidance."


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
