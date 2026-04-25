"""
AI Arena — Field Intelligence endpoint.

GET /ai-arena/field-intel?cohort={slug}

Returns a single payload used by the mobile AI Arena screen to render:
  - Section 2: Cohort Pulse (AI fluency stats)
  - Section 3: Threat & Opportunity split
  - Section 4: Role Radar dot data

Served from memory/arena_weekly.json (written by scripts/arena_weekly_agg.py
every Monday at 06:00 UTC). Falls back to a live DB query if the cache is
stale or missing, using classify_arena_attrs + arena_weekly_agg on demand.

Auth: required (we need profile to infer cohort if not provided).
Cost: zero LLM. Typical response time: <20ms from cache.
"""

from __future__ import annotations

import json
import os
import sys
import time

from fastapi import APIRouter, Request

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", ".."))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_PROJECT_ROOT, "..", ".."))
for _p in (_PROJECT_ROOT, _WORKSPACE_ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from projects.dilly.api import deps, errors

router = APIRouter(tags=["ai-arena"])

_MEMORY_DIR = os.path.join(_WORKSPACE_ROOT, "memory")
_AGG_PATH = os.path.join(_MEMORY_DIR, "arena_weekly.json")
_MAX_STALE_SECONDS = 8 * 86400  # re-generate if >8 days old (1 week + grace)


# ── Cache ──────────────────────────────────────────────────────────────────
_cache: dict | None = None
_cache_mtime: float = 0.0


def _load_agg() -> dict:
    """Load arena_weekly.json, refreshing in-process cache if file changed."""
    global _cache, _cache_mtime
    try:
        mtime = os.path.getmtime(_AGG_PATH)
        if _cache is not None and mtime == _cache_mtime:
            return _cache
        with open(_AGG_PATH, "r", encoding="utf-8") as f:
            _cache = json.load(f)
            _cache_mtime = mtime
            return _cache
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _refresh_agg() -> dict:
    """Trigger the weekly aggregation synchronously (first-run / stale fallback)."""
    try:
        from projects.dilly.scripts.arena_weekly_agg import run as agg_run
        return agg_run(force=True)
    except Exception as e:
        print(f"[field_intel] WARNING: agg refresh failed — {e}", flush=True)
        return {}


def _get_agg(force_refresh: bool = False) -> dict:
    """Return the weekly agg, refreshing if stale or missing."""
    if force_refresh:
        return _refresh_agg()

    data = _load_agg()
    if data:
        age = time.time() - os.path.getmtime(_AGG_PATH)
        if age < _MAX_STALE_SECONDS:
            return data
        # Stale — refresh in background (non-blocking return of old data)
        try:
            import threading
            t = threading.Thread(target=_refresh_agg, daemon=True)
            t.start()
        except Exception:
            pass
        return data  # return stale data immediately; fresh data arrives next request

    # No file yet — generate synchronously (first deploy, cold start)
    return _refresh_agg()


# ── Cohort resolution helpers ──────────────────────────────────────────────

def _cohort_from_profile(email: str) -> str | None:
    """Resolve user's primary cohort from profile store."""
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        cohorts = profile.get("cohorts") or []
        if cohorts and isinstance(cohorts, list):
            return str(cohorts[0])
        # Fallbacks
        for key in ("cohort", "track", "major"):
            v = profile.get(key)
            if v:
                return str(v)
    except Exception:
        pass
    return None


# ── Threat & Opportunity data source ──────────────────────────────────────

def _get_threat_opportunity(cohort: str) -> dict:
    """Pull threat/opportunity data from dilly_core.ai_disruption."""
    try:
        try:
            from dilly_core.ai_disruption import COHORT_AI_DISRUPTION
        except ImportError:
            from projects.dilly.dilly_core.ai_disruption import COHORT_AI_DISRUPTION
        entry = COHORT_AI_DISRUPTION.get(cohort) or {}
        return {
            "disruption_pct":   entry.get("disruption_pct", 30),
            "trend":            entry.get("trend", "rising"),
            "headline":         entry.get("headline", "AI is reshaping this field."),
            "threats":          (entry.get("ai_vulnerable_skills") or [])[:4],
            "opportunities":    (entry.get("ai_resistant_skills") or [])[:4],
            "what_to_do":       entry.get("what_to_do", ""),
        }
    except Exception:
        return {
            "disruption_pct": 30, "trend": "rising",
            "headline": "AI is actively reshaping this field.",
            "threats": [], "opportunities": [], "what_to_do": "",
        }


# ── Endpoint ───────────────────────────────────────────────────────────────

@router.get("/ai-arena/field-intel")
async def get_field_intel(request: Request, cohort: str = ""):
    """Return AI field intelligence for the user's cohort.

    ?cohort= accepts the full cohort name (e.g. "Software Engineering & CS").
    If omitted, infers from the authenticated user's profile.
    Auth required.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    # Resolve cohort
    resolved_cohort = (cohort or "").strip()
    if not resolved_cohort:
        resolved_cohort = _cohort_from_profile(email) or "General"

    # Load aggregated data
    agg = _get_agg()
    cohorts_data = (agg or {}).get("cohorts") or {}
    cross_cohort = (agg or {}).get("cross_cohort") or []
    week_start = (agg or {}).get("week_start") or ""

    # Look up this cohort in the agg (try exact match, then case-insensitive)
    cohort_entry = cohorts_data.get(resolved_cohort)
    if cohort_entry is None:
        for k, v in cohorts_data.items():
            if k.lower() == resolved_cohort.lower():
                cohort_entry = v
                resolved_cohort = k
                break

    # No data yet (first deploy, classifier hasn't run) — return a graceful stub
    if cohort_entry is None:
        return {
            "cohort": resolved_cohort,
            "week_start": week_start or None,
            "data_ready": False,
            "message": "Field intelligence is being computed for the first time. Check back in a few minutes.",
            "pulse": None,
            "threat_opportunity": _get_threat_opportunity(resolved_cohort),
            "role_radar": [],
        }

    # ── Pulse ──────────────────────────────────────────────────────────────
    pulse = {
        "headline":            cohort_entry.get("headline", ""),
        "ai_fluency_pct":      cohort_entry.get("ai_fluency_pct", 0),
        "total_listings":      cohort_entry.get("total_listings", 0),
        "ai_listings":         cohort_entry.get("ai_listings", 0),
        "high_count":          cohort_entry.get("high_count", 0),
        "medium_count":        cohort_entry.get("medium_count", 0),
        "cross_cohort_rank":   cohort_entry.get("cross_cohort_rank", 0),
        "cross_cohort_total":  cohort_entry.get("cross_cohort_total", 0),
        "cohort_avg_pct":      cohort_entry.get("cohort_avg_pct", 0),
        "above_average":       cohort_entry.get("above_average", False),
        "week_start":          week_start,
    }

    # ── Threat & Opportunity ───────────────────────────────────────────────
    threat_opp = _get_threat_opportunity(resolved_cohort)

    # Inject live volume stat into threat/opp for the UI's stat line
    threat_opp["live_total_listings"] = cohort_entry.get("total_listings", 0)
    threat_opp["live_ai_pct"] = cohort_entry.get("ai_fluency_pct", 0)

    # ── Role Radar ─────────────────────────────────────────────────────────
    role_radar = cohort_entry.get("role_radar") or []

    return {
        "cohort":            resolved_cohort,
        "week_start":        week_start,
        "data_ready":        True,
        "pulse":             pulse,
        "threat_opportunity": threat_opp,
        "role_radar":        role_radar,
        "cross_cohort":      cross_cohort[:15],  # top 15 for cross-cohort bar chart
    }


@router.get("/ai-arena/field-intel/refresh")
async def refresh_field_intel(request: Request):
    """Force-refresh the arena_weekly.json cache. Internal use only."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    # Only pro users or internal can trigger a refresh
    try:
        from projects.dilly.api.profile_store import get_profile
        plan = (get_profile(email) or {}).get("plan", "starter")
    except Exception:
        plan = "starter"

    if plan not in ("pro",) and not request.headers.get("X-Dilly-Internal"):
        raise errors.forbidden("Only Pro users can trigger a manual refresh.")

    data = _refresh_agg()
    cohort_count = len((data or {}).get("cohorts", {}))
    return {"ok": True, "cohorts_computed": cohort_count, "week_start": (data or {}).get("week_start")}
