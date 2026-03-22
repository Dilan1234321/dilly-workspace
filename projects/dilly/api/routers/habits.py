"""
Habit Loops + Rituals: weekly review, daily micro-actions, streaks, milestones, rituals.
"""
import datetime
import time

from fastapi import APIRouter, Request

from projects.dilly.api import deps, errors

router = APIRouter(tags=["habits"])


def _parse_date(s: str | None) -> datetime.date | None:
    if not s or not isinstance(s, str):
        return None
    s = s.strip()[:10]
    if not s:
        return None
    try:
        return datetime.datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


@router.get("/habits")
async def get_habits(request: Request):
    """
    Habit loops: streak, daily action, weekly review data, application counts, milestones, ritual suggestions.
    Used by Career Center for habits card, weekly review, and ritual flows.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile, get_profile_folder_path

    _DAILY_ACTIONS = [
        {"id": "view_score", "label": "Check your scores", "action": "center"},
        {"id": "edit_bullet", "label": "Improve one resume bullet", "action": "edit_resume"},
        {"id": "ats_scan", "label": "Run an ATS scan", "action": "ats"},
        {"id": "voice_prep", "label": "Ask Dilly for one tip", "action": "voice"},
        {"id": "view_jobs", "label": "Browse job matches", "action": "jobs"},
        {"id": "run_audit", "label": "Upload an updated resume", "action": "upload"},
        {"id": "add_deadline", "label": "Add an application deadline", "action": "calendar"},
    ]
    import hashlib

    profile = get_profile(email) or {}
    today = datetime.date.today()
    today_str = today.isoformat()

    # Streak
    streak_data = profile.get("streak") or {}
    last_checkin = streak_data.get("last_checkin")
    current_streak = streak_data.get("current_streak", 0)
    longest_streak = streak_data.get("longest_streak", 0)
    yesterday = (today - datetime.timedelta(days=1)).isoformat()
    if last_checkin not in (today_str, yesterday):
        current_streak = 0
    day_seed = int(hashlib.md5(today_str.encode()).hexdigest(), 16) % len(_DAILY_ACTIONS)
    daily_action = _DAILY_ACTIONS[day_seed]
    already_checked_in = last_checkin == today_str

    # Applications
    applications = []
    folder = get_profile_folder_path(email)
    if folder:
        import json
        import os
        app_path = os.path.join(folder, "applications.json")
        if os.path.isfile(app_path):
            try:
                with open(app_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                applications = data.get("applications", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            except Exception:
                pass

    # Application counts: this month, this week
    month_start = today.replace(day=1)
    week_start = today - datetime.timedelta(days=today.weekday())
    applications_this_month = 0
    applications_this_week = 0
    applied_count = 0
    interviewing_count = 0
    offer_count = 0
    silent_apps = []

    for a in applications or []:
        if not isinstance(a, dict):
            continue
        status = (a.get("status") or "saved").strip().lower()
        applied_at = _parse_date(a.get("applied_at"))
        if status == "applied" and applied_at:
            if applied_at >= month_start:
                applications_this_month += 1
            if applied_at >= week_start:
                applications_this_week += 1
        if status == "applied":
            applied_count += 1
            if applied_at:
                days_ago = (today - applied_at).days
                if days_ago >= 14:
                    silent_apps.append({
                        "company": (a.get("company") or "").strip()[:60],
                        "role": (a.get("role") or "").strip()[:60],
                    })
        elif status == "interviewing":
            interviewing_count += 1
        elif status == "offer":
            offer_count += 1

    # Upcoming deadlines (next 14 days)
    deadlines = profile.get("deadlines") or []
    now_ts = time.time()
    day_sec = 86400
    upcoming = []
    for d in deadlines:
        if not isinstance(d, dict) or d.get("completedAt"):
            continue
        date_str = d.get("date")
        if not date_str:
            continue
        dt = _parse_date(date_str)
        if not dt:
            continue
        ts = datetime.datetime.combine(dt, datetime.time.min).timestamp()
        if ts > now_ts and (ts - now_ts) <= 14 * day_sec:
            days = int((ts - now_ts) / day_sec)
            upcoming.append({"label": (d.get("label") or "Deadline")[:60], "date": date_str, "days": days})

    # Weekly review: show on Sunday (weekday 6) or configurable
    weekly_review_day = profile.get("ritual_preferences") or {}
    if isinstance(weekly_review_day, dict):
        review_day = weekly_review_day.get("weekly_review_day", 6)
    else:
        review_day = 6
    is_review_day = today.weekday() == review_day
    rituals_enabled = (profile.get("ritual_preferences") or {}).get("rituals_enabled", True) if isinstance(profile.get("ritual_preferences"), dict) else True

    # Milestones
    milestones = {
        "first_application": bool(profile.get("first_application_at") or applied_count >= 1),
        "first_interview": bool(profile.get("first_interview_at") or interviewing_count >= 1 or offer_count >= 1),
        "first_offer": bool(profile.get("got_offer_at") or offer_count >= 1),
        "ten_applications": applied_count >= 10,
    }

    # Ritual suggestions
    ritual_suggestions = []
    if rituals_enabled:
        if is_review_day:
            ritual_suggestions.append({
                "id": "sunday_planning",
                "label": "Sunday career planning",
                "prompt": "It's my weekly review. What did I apply to this week? What's coming up? What should I follow up on? Give me a short plan for the week.",
            })
        if interviewing_count > 0 or offer_count > 0:
            ritual_suggestions.append({
                "id": "post_interview_debrief",
                "label": "Post-interview debrief",
                "prompt": "I just had an interview (or got an offer). Help me debrief: what went well, what to improve, and what to do next.",
            })

    return {
        "streak": current_streak,
        "longest_streak": longest_streak,
        "already_checked_in": already_checked_in,
        "today": today_str,
        "daily_action": daily_action,
        "applications_this_month": applications_this_month,
        "applications_this_week": applications_this_week,
        "applied_count": applied_count,
        "silent_2_weeks": len(silent_apps),
        "silent_apps": silent_apps[:5],
        "upcoming_deadlines": upcoming[:12],
        "pipeline_counts": {
            "applied": applied_count,
            "interviewing": interviewing_count,
            "offers": offer_count,
        },
        "is_review_day": is_review_day,
        "milestones": milestones,
        "ritual_suggestions": ritual_suggestions,
    }
