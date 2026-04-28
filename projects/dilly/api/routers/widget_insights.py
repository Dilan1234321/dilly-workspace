"""
Widget insights — pre-computed self-knowledge cards for the Home Screen
+ lock screen widgets.

Product rule: widgets must teach the user something they don't already
know. Echoing facts they typed in is not insight. The card framing is
always one of:
  - VS AI         (where they stand against AI threats in their field)
  - VS COHORT     (where they stand against peers at their stage)
  - DILLY KNOWS   (what Dilly inferred about them they didn't share)
  - WHAT'S MISSING (which category Dilly hasn't been told about — drives
                    deeper coaching when filled in)
  - YOUR PATTERN  (a behavioral signal from their own activity)

Operating cost: zero LLM. All cards are pure stat math + percentile
lookups against static cohort baselines. If we ever want richer cards
later, we'll precompute via cron — never per-widget-refresh.

Endpoint: GET /widgets/insights → { insights: [card, card, ...] }
where each card is { id, category, eyebrow, headline, body, tier? }.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Request

from projects.dilly.api import deps


router = APIRouter(tags=["widgets"])


# ─── Static cohort baselines ─────────────────────────────────────────
# These are placeholders we'll refine once we have real cohort data.
# Numbers chosen to be plausible without overpromising precision.
# Each tuple is (median, p75, p90) for a metric.
COHORT_BASELINES = {
    # Profile depth: how many memory facts the median user has logged.
    "profile_facts": {
        "median": 42, "p75": 78, "p90": 130,
    },
    # Streak length on Moment of Truth.
    "truth_streak_days": {
        "median": 2, "p75": 5, "p90": 9,
    },
    # Categories filled out (out of ~24 Dilly tracks).
    "profile_categories": {
        "median": 8, "p75": 13, "p90": 18,
    },
    # Days since last AI Arena read — lower is better engagement.
    "days_since_ai_arena": {
        "median": 7, "p75": 3, "p90": 1,
    },
    # Days since last fit read on a job.
    "days_since_fit_read": {
        "median": 5, "p75": 2, "p90": 1,
    },
}

# Categories we expect a thoughtful user to fill out. Used by the
# "WHAT'S MISSING" insight.
CORE_CATEGORIES = [
    "goal", "trait", "weakness", "experience", "skill",
    "preference", "constraint", "relationship", "achievement",
]


def _percentile_descriptor(value: float, baseline: Dict[str, float]) -> str:
    """Return a human-readable percentile bucket like 'top 10%' or
    'middle of the pack'."""
    if value >= baseline["p90"]:
        return "top 10%"
    if value >= baseline["p75"]:
        return "top 25%"
    if value >= baseline["median"]:
        return "above average"
    if value >= baseline["median"] * 0.5:
        return "below average"
    return "bottom quartile"


def _days_since(iso_str: str | None) -> int | None:
    if not iso_str:
        return None
    try:
        dt = datetime.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        delta = datetime.datetime.now(datetime.timezone.utc) - dt
        return max(0, delta.days)
    except Exception:
        return None


def _build_insights(profile: Dict[str, Any], memory_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Compute up to ~10 insight cards from existing user data. Pure
    stat math. Each card is independently surface-able; mobile picks 3-5
    to rotate through."""
    cards: List[Dict[str, Any]] = []

    fact_count = len(memory_items)
    categories = {str(it.get("category") or "").lower() for it in memory_items}
    categories.discard("")

    # ── PROFILE DEPTH ──────────────────────────────────────────────
    if fact_count > 0:
        bucket = _percentile_descriptor(fact_count, COHORT_BASELINES["profile_facts"])
        med = COHORT_BASELINES["profile_facts"]["median"]
        if "top" in bucket:
            cards.append({
                "id": "depth_top",
                "category": "vs_cohort",
                "eyebrow": "VS COHORT",
                "headline": f"Dilly knows you better than most.",
                "body": f"You've shared {fact_count} facts. Median for users at your stage: {med}. You're {bucket}.",
            })
        elif fact_count < med:
            cards.append({
                "id": "depth_grow",
                "category": "what_is_missing",
                "eyebrow": "WHAT'S MISSING",
                "headline": f"Dilly is at {fact_count}. Median user is at {med}.",
                "body": f"Tell her one more thing tonight — career goal, weakness, recent win. The gap is what stops her from coaching deep.",
            })

    # ── CATEGORY GAPS ─────────────────────────────────────────────
    missing_core = [c for c in CORE_CATEGORIES if c not in categories]
    if missing_core:
        next_cat = missing_core[0]
        nice = next_cat.replace("_", " ").title()
        cards.append({
            "id": f"gap_{next_cat}",
            "category": "what_is_missing",
            "eyebrow": "WHAT'S MISSING",
            "headline": f"Dilly knows nothing about your {nice.lower()}.",
            "body": f"Users who share their {nice.lower()} get sharper coaching — Dilly stops guessing and starts targeting.",
        })

    # ── STREAK STANDING ───────────────────────────────────────────
    streak = int(profile.get("truth_streak_days") or 0)
    if streak > 0:
        bucket = _percentile_descriptor(streak, COHORT_BASELINES["truth_streak_days"])
        if "top" in bucket:
            cards.append({
                "id": "streak_top",
                "category": "vs_cohort",
                "eyebrow": "VS COHORT",
                "headline": f"{streak}-day Moment of Truth streak.",
                "body": f"{bucket} of users keep this going past {streak} days. Most quit by day 3.",
            })

    # ── CATEGORY DEPTH ────────────────────────────────────────────
    cat_count = len(categories)
    if cat_count > 0:
        bucket = _percentile_descriptor(cat_count, COHORT_BASELINES["profile_categories"])
        cards.append({
            "id": "categories",
            "category": "dilly_knows",
            "eyebrow": "DILLY KNOWS",
            "headline": f"Dilly knows you across {cat_count} categories.",
            "body": f"Most users fill out {COHORT_BASELINES['profile_categories']['median']}. You're {bucket}.",
        })

    # ── AI EXPOSURE PROXY (uses cohorts on profile) ───────────────
    cohorts = profile.get("cohorts") or []
    if isinstance(cohorts, list) and cohorts:
        first_cohort = str(cohorts[0])
        cards.append({
            "id": "ai_field",
            "category": "vs_ai",
            "eyebrow": "VS AI",
            "headline": f"Your field — {first_cohort.replace('_', ' ').title()}.",
            "body": "Open AI Arena to see how AI is reshaping it this week. Dilly tracks the threats and the openings live.",
        })

    # ── ENGAGEMENT GAPS ───────────────────────────────────────────
    days_since_ai = _days_since(profile.get("ai_arena_last_seen_at"))
    if days_since_ai is not None and days_since_ai >= 7:
        cards.append({
            "id": "ai_arena_gap",
            "category": "your_pattern",
            "eyebrow": "YOUR PATTERN",
            "headline": f"AI Arena last opened {days_since_ai} days ago.",
            "body": "AI moves weekly. Most engaged users check in every 3 days — you're likely missing a shift.",
        })

    days_since_fit = _days_since(profile.get("last_fit_read_at"))
    if days_since_fit is not None and days_since_fit >= 5:
        cards.append({
            "id": "fit_read_gap",
            "category": "your_pattern",
            "eyebrow": "YOUR PATTERN",
            "headline": f"No fit reads in {days_since_fit} days.",
            "body": "Even one read per week keeps Dilly's job feed sharp. Otherwise it drifts toward generic.",
        })

    # ── INFERRED STRENGTH ─────────────────────────────────────────
    # Most-frequent category that ISN'T just self-reported context —
    # something Dilly noticed.
    cat_counts: Dict[str, int] = {}
    for it in memory_items:
        c = str(it.get("category") or "").lower()
        if c:
            cat_counts[c] = cat_counts.get(c, 0) + 1
    if cat_counts:
        # Skip the obvious "personal" / "context" buckets.
        SKIP = {"personal", "contact", "preference", "life_context"}
        best = sorted(
            ((k, v) for k, v in cat_counts.items() if k not in SKIP),
            key=lambda kv: kv[1], reverse=True,
        )
        if best:
            top_cat, n = best[0]
            nice = top_cat.replace("_", " ")
            cards.append({
                "id": "strength",
                "category": "dilly_knows",
                "eyebrow": "DILLY KNOWS",
                "headline": f"Your strongest signal is {nice}.",
                "body": f"Dilly has {n} entries in this category — more than any other. That's where she'll lean when she coaches you.",
            })

    return cards[:10]


@router.get("/widgets/insights")
def get_widget_insights(request: Request):
    """Compute insight cards for the home/lock screen widgets."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    # Pull profile (counts, last-seen timestamps, cohorts).
    profile: Dict[str, Any] = {}
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
    except Exception:
        profile = {}

    # Pull memory items for category math.
    memory_items: List[Dict[str, Any]] = []
    try:
        from projects.dilly.api.memory_store import list_items
        raw = list_items(email) or []
        if isinstance(raw, list):
            memory_items = raw
    except Exception:
        memory_items = []

    insights = _build_insights(profile, memory_items)
    return {"insights": insights}
