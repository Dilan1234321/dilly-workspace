"""
Home router — single composition endpoint that powers the career center
home screen in one round-trip.

GET /home/brief returns everything the home screen needs:

    {
      "streak":     { current, longest, already_checked_in, daily_action },
      "score":      { current, previous, delta, as_of },
      "pipeline":   { drafts, applied, interviewing, offers, silent_2_weeks },
      "deadlines":  [ { label, date, days_until, type, company, role } ],
      "brief":      [ { id, kind, headline, body, action_label, action_route } ],
      "do_now":     { kind, title, subtitle, action_label, action_route, action_payload },
      "cohort_bar": { label, bar, reference_company }
    }

No LLM calls. All deterministic. Single round-trip for the home screen.
Everything is self-referential — no peer comparisons, no leaderboards,
no social features. Those wait until we have enough users for the
numbers to be meaningful.
"""

from __future__ import annotations

import time
import datetime
import hashlib
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request

from projects.dilly.api import deps, errors

router = APIRouter(tags=["home"])


# ── Rubric cohort bars ────────────────────────────────────────────────────
# Replaces the hardcoded 4-cohort table that was in the mobile client.
# Pulled from the rubric_scorer's cohort requirements so every cohort Dilly
# supports has a real reference number and anchor company.

_COHORT_BAR_DEFAULTS: Dict[str, Dict[str, Any]] = {
    # Tier 1 — explicit anchors for the most common cohorts
    "software_engineering":   {"bar": 75, "company": "Google"},
    "data_analytics":         {"bar": 72, "company": "Meta"},
    "product_management":     {"bar": 72, "company": "Stripe"},
    "business_finance":       {"bar": 72, "company": "Goldman"},
    "consulting":             {"bar": 74, "company": "McKinsey"},
    "marketing":              {"bar": 68, "company": "HubSpot"},
    "design":                 {"bar": 70, "company": "Figma"},
    "science_research":       {"bar": 70, "company": "the NIH"},
    "health_nursing_allied":  {"bar": 68, "company": "Mayo Clinic"},
    "social_sciences":        {"bar": 66, "company": "a top nonprofit"},
    "humanities_communications": {"bar": 66, "company": "a major publisher"},
    "arts_design":            {"bar": 68, "company": "a top studio"},
    "quantitative_math_stats": {"bar": 74, "company": "Jane Street"},
    "engineering_physical":   {"bar": 72, "company": "SpaceX"},
    "sport_management":       {"bar": 66, "company": "a major league team"},
    "education":              {"bar": 66, "company": "Teach for America"},
    "legal":                  {"bar": 72, "company": "a top law firm"},
}


def _cohort_bar(cohort_id: Optional[str]) -> Dict[str, Any]:
    """Get the cohort bar, with a sensible fallback for unknown cohorts."""
    if cohort_id and cohort_id in _COHORT_BAR_DEFAULTS:
        return _COHORT_BAR_DEFAULTS[cohort_id]
    return {"bar": 68, "company": "your target company"}


# ── Helpers ──────────────────────────────────────────────────────────────

def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _parse_date_ts(v: Any) -> Optional[float]:
    """Parse a date or ISO string into a unix timestamp."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if not isinstance(v, str):
        return None
    try:
        # Handle both date-only and full ISO timestamps
        if len(v) == 10:
            return datetime.datetime.strptime(v, "%Y-%m-%d").timestamp()
        return datetime.datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def _days_until(ts: float) -> int:
    """Whole days from now until the given timestamp (negative if past)."""
    return int((ts - time.time()) // 86400)


# ── Streak (reuses existing profile streak fields) ───────────────────────

_DAILY_ACTIONS = [
    "Improve one weak bullet in your resume.",
    "Add one metric to your strongest experience.",
    "Review one job you saved but haven't applied to.",
    "Draft one sentence for your Summary section.",
    "Check one upcoming deadline.",
    "Re-read the last rejection email and pull one lesson.",
    "Add one new skill you actually have to the Skills section.",
    "Send one thank-you follow-up from a past conversation.",
    "Tailor your resume for one new role.",
    "Update one company name or date that's stale.",
]


def _compute_streak(profile: dict) -> Dict[str, Any]:
    """Read the streak state from profile without mutating it.
    The mutation happens in POST /streak/checkin — this just reads."""
    streak_data = profile.get("streak") or {}
    today = datetime.date.today().isoformat()
    last_checkin = streak_data.get("last_checkin")
    current = int(streak_data.get("current_streak") or 0)
    longest = int(streak_data.get("longest_streak") or 0)
    already_checked_in = last_checkin == today

    # If the user missed yesterday AND today, the streak should read as 0
    # (it resets on next check-in). Don't lie about the current state.
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    if last_checkin and last_checkin not in (today, yesterday):
        current = 0

    day_seed = int(hashlib.md5(today.encode()).hexdigest(), 16) % len(_DAILY_ACTIONS)
    daily_action = _DAILY_ACTIONS[day_seed]

    return {
        "current": current,
        "longest": longest,
        "already_checked_in": already_checked_in,
        "daily_action": daily_action,
        "today": today,
    }


# ── Score history + delta ────────────────────────────────────────────────

def _compute_score_section(audits: List[dict]) -> Dict[str, Any]:
    """Pull current + previous audit scores from the history for delta."""
    if not audits:
        return {"current": None, "previous": None, "delta": None, "as_of": None, "history": []}

    # audits list is in reverse-chrono order from /audit/history typically,
    # but we sort explicitly by ts descending to be safe.
    sorted_audits = sorted(
        [a for a in audits if isinstance(a, dict) and a.get("ts")],
        key=lambda a: a.get("ts") or 0,
        reverse=True,
    )
    if not sorted_audits:
        return {"current": None, "previous": None, "delta": None, "as_of": None, "history": []}

    def _score_from(a: dict) -> Optional[float]:
        ra = a.get("rubric_analysis") or {}
        composite = ra.get("primary_composite")
        if composite is None:
            composite = a.get("final_score")
        return _safe_float(composite) if composite is not None else None

    current_audit = sorted_audits[0]
    current_score = _score_from(current_audit)
    previous_audit = sorted_audits[1] if len(sorted_audits) > 1 else None
    previous_score = _score_from(previous_audit) if previous_audit else None
    delta = None
    if current_score is not None and previous_score is not None:
        delta = round(current_score - previous_score, 1)

    history = []
    for a in sorted_audits[:10]:
        s = _score_from(a)
        if s is None:
            continue
        history.append({
            "score": round(s, 1),
            "ts": int(a.get("ts") or 0),
        })
    history.reverse()  # chronological for the chart

    return {
        "current": round(current_score, 1) if current_score is not None else None,
        "previous": round(previous_score, 1) if previous_score is not None else None,
        "delta": delta,
        "as_of": int(current_audit.get("ts") or 0) if current_audit else None,
        "history": history,
    }


# ── Pipeline stats (from applications) ───────────────────────────────────

def _compute_pipeline(applications: List[dict]) -> Dict[str, Any]:
    """Counts for the pipeline widget. Maps application statuses to the
    four-tile view the mobile home screen renders."""
    drafts = 0
    applied = 0
    interviewing = 0
    offers = 0
    silent = 0
    now = time.time()
    SILENT_DAYS = 14
    silent_threshold = now - SILENT_DAYS * 86400

    for a in applications or []:
        if not isinstance(a, dict):
            continue
        status = (a.get("status") or "saved").strip().lower()
        if status in ("saved", "draft"):
            drafts += 1
        elif status == "applied":
            applied += 1
            ts = _parse_date_ts(a.get("applied_at"))
            if ts and ts < silent_threshold:
                silent += 1
        elif status == "interviewing":
            interviewing += 1
        elif status == "offer":
            offers += 1
        # rejected intentionally not counted in the top-line widget

    return {
        "drafts": drafts,
        "applied": applied,
        "interviewing": interviewing,
        "offers": offers,
        "silent_2_weeks": silent,
        "total": drafts + applied + interviewing + offers,
    }


# ── Upcoming deadlines (next 14 days) ────────────────────────────────────

def _compute_deadlines(applications: List[dict], profile: dict) -> List[Dict[str, Any]]:
    """Collect deadlines from application entries AND profile.deadlines.
    Returns next 8, sorted by soonest, only those in the next 14 days."""
    out: List[Dict[str, Any]] = []
    now = time.time()
    horizon = now + 14 * 86400

    # Deadlines attached to applications
    for a in applications or []:
        if not isinstance(a, dict):
            continue
        d = a.get("deadline")
        ts = _parse_date_ts(d)
        if ts and now <= ts <= horizon:
            out.append({
                "label": f"{a.get('company', 'Job')} — {a.get('role', 'Application')} deadline",
                "date": d,
                "ts": int(ts),
                "days_until": _days_until(ts),
                "type": "application",
                "company": a.get("company") or "",
                "role": a.get("role") or "",
            })

    # Free-form deadlines stored in profile.deadlines
    for d in profile.get("deadlines") or []:
        if not isinstance(d, dict):
            continue
        ts = _parse_date_ts(d.get("date"))
        if ts and now <= ts <= horizon:
            out.append({
                "label": d.get("label") or "Deadline",
                "date": d.get("date"),
                "ts": int(ts),
                "days_until": _days_until(ts),
                "type": d.get("type") or "custom",
                "company": d.get("company") or "",
                "role": d.get("role") or "",
            })

    out.sort(key=lambda x: x["ts"])
    return out[:8]


# ── Daily Brief (3 deterministic facts) ──────────────────────────────────

def _compute_brief(
    score: Dict[str, Any],
    pipeline: Dict[str, Any],
    cohort_bar: Dict[str, Any],
    top_jobs: List[dict],
    has_audit: bool,
) -> List[Dict[str, Any]]:
    """Build up to 3 brief cards. Every card references only the user's
    own data — no peer comparisons."""
    facts: List[Dict[str, Any]] = []

    # Card 1: gap to cohort bar (or "above the bar" if they're clear)
    if has_audit and score.get("current") is not None:
        current = score["current"]
        bar = cohort_bar.get("bar") or 68
        company = cohort_bar.get("company") or "your target"
        gap = bar - current
        if gap > 0.5:
            facts.append({
                "id": "gap",
                "kind": "score",
                "headline": f"{round(gap)} points from {company}",
                "body": f"Your Dilly score is {round(current)}. {company}'s bar is {round(bar)}.",
                "action_label": "See what to fix",
                "action_route": "/(app)/resume-editor",
            })
        else:
            over = current - bar
            facts.append({
                "id": "above_bar",
                "kind": "score",
                "headline": f"You clear {company}'s bar by {round(over)} points",
                "body": f"Your Dilly score is {round(current)}. Start applying this week.",
                "action_label": "See jobs",
                "action_route": "/(app)/jobs",
            })

    # Card 2: delta since last scan (if we have it)
    delta = score.get("delta")
    if delta is not None and abs(delta) >= 1:
        if delta > 0:
            facts.append({
                "id": "delta_up",
                "kind": "progress",
                "headline": f"+{delta} points since last audit",
                "body": "Your work is showing up in the numbers. Keep going.",
                "action_label": "See history",
                "action_route": "/(app)/score-detail",
            })
        else:
            facts.append({
                "id": "delta_down",
                "kind": "progress",
                "headline": f"{delta} since last audit",
                "body": "Dilly can tell you which changes knocked the score.",
                "action_label": "See what changed",
                "action_route": "/(app)/score-detail",
            })

    # Card 3: stale applications or pipeline progress
    if pipeline.get("silent_2_weeks", 0) > 0:
        n = pipeline["silent_2_weeks"]
        facts.append({
            "id": "silent",
            "kind": "pipeline",
            "headline": f"{n} application{'s' if n != 1 else ''} went quiet",
            "body": "Two weeks with no reply. Time to follow up or drop it.",
            "action_label": "See which",
            "action_route": "/(app)/internship-tracker",
        })
    elif pipeline.get("drafts", 0) > 0:
        n = pipeline["drafts"]
        facts.append({
            "id": "drafts",
            "kind": "pipeline",
            "headline": f"{n} draft{'s' if n != 1 else ''} waiting",
            "body": "You have unfinished applications. Pick one and ship it.",
            "action_label": "Open drafts",
            "action_route": "/(app)/internship-tracker",
        })
    elif top_jobs:
        job = top_jobs[0]
        facts.append({
            "id": "new_match",
            "kind": "jobs",
            "headline": f"New match: {job.get('title', 'role')}",
            "body": f"{job.get('company', 'A company')} · {job.get('location') or 'Remote'}",
            "action_label": "View",
            "action_route": f"/(app)/jobs?focus={job.get('id', '')}",
        })

    return facts[:3]


# ── "Do this now" single actionable card ─────────────────────────────────

def _compute_do_now(
    has_audit: bool,
    score: Dict[str, Any],
    pipeline: Dict[str, Any],
    deadlines: List[dict],
    top_jobs: List[dict],
    cohort_bar: Dict[str, Any],
) -> Dict[str, Any]:
    """Pick the single highest-priority next action for the user.

    Priority ladder:
      1. No audit yet → run first audit
      2. Deadline in <=3 days → alert
      3. Silent applications → follow up
      4. Score has a gap → open the editor
      5. Drafts waiting → finish drafts
      6. Above the bar + jobs exist → apply
      7. Default: tighten one bullet
    """
    if not has_audit:
        return {
            "kind": "audit_first",
            "title": "Run your first audit",
            "subtitle": "Upload your resume. Dilly will tell you exactly where you stand.",
            "action_label": "Upload resume",
            "action_route": "/onboarding/upload",
            "action_payload": None,
        }

    # Urgent deadline
    for d in deadlines:
        if d.get("days_until", 99) <= 3:
            return {
                "kind": "deadline",
                "title": f"Deadline in {d['days_until']} day{'s' if d['days_until'] != 1 else ''}",
                "subtitle": d.get("label") or "Upcoming deadline",
                "action_label": "Open calendar",
                "action_route": "/(app)/calendar",
                "action_payload": {"company": d.get("company"), "role": d.get("role")},
            }

    # Silent applications
    if pipeline.get("silent_2_weeks", 0) > 0:
        n = pipeline["silent_2_weeks"]
        return {
            "kind": "silent",
            "title": f"Follow up on {n} quiet application{'s' if n != 1 else ''}",
            "subtitle": "Two weeks with no reply. A short nudge doubles response rate.",
            "action_label": "See which",
            "action_route": "/(app)/internship-tracker",
            "action_payload": None,
        }

    current = score.get("current")
    bar = cohort_bar.get("bar") or 68
    if current is not None and current < bar:
        gap = round(bar - current)
        return {
            "kind": "close_gap",
            "title": f"Close {gap} points on your resume",
            "subtitle": f"Open the editor and tackle your weakest section.",
            "action_label": "Open editor",
            "action_route": "/(app)/resume-editor",
            "action_payload": None,
        }

    # Drafts waiting
    if pipeline.get("drafts", 0) > 0:
        return {
            "kind": "drafts",
            "title": f"Finish your {pipeline['drafts']} draft{'s' if pipeline['drafts'] != 1 else ''}",
            "subtitle": "Unsubmitted applications don't help you.",
            "action_label": "Open drafts",
            "action_route": "/(app)/internship-tracker",
            "action_payload": None,
        }

    # Above bar + jobs available
    if top_jobs:
        job = top_jobs[0]
        return {
            "kind": "apply",
            "title": f"Apply to {job.get('company', 'this role')}",
            "subtitle": f"{job.get('title', '')} — matches your profile.",
            "action_label": "Open job",
            "action_route": f"/(app)/jobs?focus={job.get('id', '')}",
            "action_payload": None,
        }

    # Default fallback
    return {
        "kind": "polish",
        "title": "Tighten your strongest bullet",
        "subtitle": "Small improvements compound. Open the editor.",
        "action_label": "Open editor",
        "action_route": "/(app)/resume-editor",
        "action_payload": None,
    }


# ── Weekly Recap (Dilly Weekly) ────────────────────────────────────────────

def _compute_weekly_recap(
    audits: List[dict],
    applications: List[dict],
    streak: Dict[str, Any],
    score: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Build a 'this week in review' card. Only populated on Sundays or
    when there's meaningful activity to report. Returns None if the
    student had zero activity this week.
    """
    now = time.time()
    week_ago = now - 7 * 86400

    # Count audits this week
    audits_this_week = 0
    for a in audits or []:
        ts = a.get("ts")
        if isinstance(ts, (int, float)) and ts > week_ago:
            audits_this_week += 1

    # Count applications this week
    apps_this_week = 0
    for a in applications or []:
        created = a.get("created_at") or a.get("applied_at")
        if not created:
            continue
        try:
            from datetime import datetime as _dt
            if isinstance(created, str):
                ts = _dt.fromisoformat(created.replace("Z", "+00:00")).timestamp()
            elif isinstance(created, (int, float)):
                ts = float(created)
            else:
                continue
            if ts > week_ago:
                apps_this_week += 1
        except Exception:
            continue

    streak_days = streak.get("current", 0)
    delta = score.get("delta")

    # Only show the recap if there's something to report
    if audits_this_week == 0 and apps_this_week == 0 and (delta is None or abs(delta) < 1):
        return None

    # Build headline
    parts: list = []
    if audits_this_week > 0:
        parts.append(f"{audits_this_week} audit{'s' if audits_this_week != 1 else ''}")
    if delta is not None and abs(delta) >= 1:
        parts.append(f"{'+' if delta > 0 else ''}{round(delta)} points")
    if apps_this_week > 0:
        parts.append(f"{apps_this_week} application{'s' if apps_this_week != 1 else ''}")
    if streak_days >= 3:
        parts.append(f"{streak_days}-day streak")

    headline = ", ".join(parts) + "." if parts else "Keep it up."

    return {
        "headline": headline.capitalize(),
        "audits_this_week": audits_this_week,
        "apps_this_week": apps_this_week,
        "score_delta": delta,
        "streak_days": streak_days,
    }


# ── Main endpoint ────────────────────────────────────────────────────────

@router.get("/home/brief")
async def home_brief(request: Request):
    """
    One-shot composition endpoint for the career center home screen.
    Pulls data from: profile, latest audit, audit history, applications,
    internship feed. All deterministic. No LLM. No peer data.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    # Load profile (source of truth for streak + cohort + deadlines)
    profile: dict = {}
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
    except Exception:
        pass

    # Load audit history
    audits: List[dict] = []
    try:
        from projects.dilly.api.audit_history import get_audits
        audits = get_audits(email) or []
    except Exception:
        pass

    # Latest audit (pulled from history to avoid a second fetch)
    latest_audit = audits[0] if audits else {}
    has_audit = bool(latest_audit and (latest_audit.get("final_score") is not None
                                        or (latest_audit.get("rubric_analysis") or {}).get("primary_composite") is not None))

    # Determine cohort + bar
    ra = latest_audit.get("rubric_analysis") or {}
    cohort_id = ra.get("primary_cohort_id") or profile.get("cohort_id")
    cohort_display = ra.get("primary_cohort_display_name") or profile.get("track") or "General"
    bar_cfg = _cohort_bar(cohort_id)
    cohort_bar = {
        "cohort_id": cohort_id,
        "label": cohort_display,
        "bar": bar_cfg["bar"],
        "reference_company": bar_cfg["company"],
    }

    # Load applications
    applications: List[dict] = []
    try:
        from projects.dilly.api.routers.applications import _load_applications
        applications = _load_applications(email) or []
    except Exception:
        pass

    # Top jobs are fetched separately by the mobile client from
    # /v2/internships/feed — we don't duplicate that here. The brief +
    # do-now cards accept top_jobs as optional context.
    top_jobs: List[dict] = []

    # Compose
    streak = _compute_streak(profile)
    score = _compute_score_section(audits)
    pipeline = _compute_pipeline(applications)
    deadlines = _compute_deadlines(applications, profile)
    brief = _compute_brief(score, pipeline, cohort_bar, top_jobs, has_audit)
    do_now = _compute_do_now(has_audit, score, pipeline, deadlines, top_jobs, cohort_bar)
    weekly_recap = _compute_weekly_recap(audits, applications, streak, score)

    return {
        "has_audit": has_audit,
        "streak": streak,
        "score": score,
        "pipeline": pipeline,
        "deadlines": deadlines,
        "brief": brief,
        "do_now": do_now,
        "cohort_bar": cohort_bar,
        "top_jobs": top_jobs,
        "weekly_recap": weekly_recap,
    }
