"""Notification trigger library for proactive Dilly pushes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Callable


def _to_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    s = str(value).strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    try:
        if "T" in s:
            return datetime.fromisoformat(s).date()
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def days_between(a: Any, b: Any) -> int:
    da = _to_date(a)
    db = _to_date(b)
    if not da or not db:
        return 0
    return (db - da).days


def is_active_recruiting_season(today: date) -> bool:
    return today.month in {9, 10, 11, 2, 3, 4}


def current_recruiting_season(today: date) -> str:
    if today.month in {9, 10, 11}:
        return "Fall recruiting"
    if today.month in {2, 3, 4}:
        return "Spring recruiting"
    return "Off season"


def get_last_application_age(applications: list[dict], today: date) -> int:
    ages: list[int] = []
    for app in applications or []:
        ts = _to_date(app.get("created_at") or app.get("createdAt") or app.get("applied_at"))
        if ts:
            ages.append(days_between(ts, today))
    return min(ages) if ages else 999


def _top_percentile_from_latest(latest_audit: dict | None) -> int | None:
    if not latest_audit:
        return None
    percs = latest_audit.get("peer_percentiles") or {}
    if not isinstance(percs, dict):
        return None
    vals = [percs.get("smart"), percs.get("grit"), percs.get("build")]
    nums = [float(v) for v in vals if isinstance(v, (int, float))]
    if not nums:
        return None
    avg_pct = sum(nums) / len(nums)
    return int(round(max(1, min(100, 100 - avg_pct))))


def _get_weakest_dimension(latest_audit: dict | None, cohort_stats: dict | None) -> dict:
    scores = (latest_audit or {}).get("scores") or {}
    p75 = (cohort_stats or {}).get("p75") or {}
    candidates = []
    for key, label in (("smart", "Smart"), ("grit", "Grit"), ("build", "Build")):
        score = float(scores.get(key) or 0)
        p75_score = float(p75.get(key) or score)
        candidates.append(
            {
                "name": label,
                "score": int(round(score)),
                "gap": int(round(max(0.0, p75_score - score))),
            }
        )
    candidates.sort(key=lambda d: d["gap"], reverse=True)
    return candidates[0] if candidates else {"name": "Smart", "score": 0, "gap": 0}


def _is_risky_vendor_score(ats_vendor: str, ats_score: float) -> bool:
    # Conservative baseline threshold.
    _ = ats_vendor
    return ats_score < 70


def _extract_people(beyond_resume: Any) -> list[dict]:
    if isinstance(beyond_resume, dict):
        people = beyond_resume.get("people")
        if isinstance(people, list):
            return [p for p in people if isinstance(p, dict)]
    out: list[dict] = []
    if isinstance(beyond_resume, list):
        for item in beyond_resume:
            if not isinstance(item, dict):
                continue
            if (item.get("type") or "").strip().lower() != "person":
                continue
            text = (item.get("text") or "").strip()
            if not text:
                continue
            out.append(
                {
                    "name": text,
                    "company": None,
                    "met_at": item.get("captured_at"),
                    "created_at": item.get("captured_at"),
                    "followed_up": False,
                }
            )
    return out


@dataclass
class Trigger:
    id: str
    priority: int
    cooldown_days: int
    evaluate: Callable[[dict[str, Any]], dict[str, Any]]


def _trigger_deadline_reminder(ctx: dict[str, Any]) -> dict[str, Any]:
    """Fires when days_remaining matches any value in a deadline's reminder_days array."""
    today: date = ctx["today"]
    deadlines = [d for d in (ctx.get("deadlines") or []) if isinstance(d, dict)]
    for d in deadlines:
        if d.get("completedAt"):
            continue
        dd = _to_date(d.get("date"))
        if not dd:
            continue
        days = days_between(today, dd)
        if days < 0:
            continue
        reminder_days = d.get("reminder_days")
        if not isinstance(reminder_days, list) or not reminder_days:
            continue
        if days in reminder_days:
            return {
                "fired": True,
                "data": {
                    "deadline_label": d.get("label") or "Upcoming deadline",
                    "deadline_id": d.get("id") or "",
                    "days_remaining": days,
                    "reminder_type": "per_deadline",
                    "current_score": (ctx.get("latest_audit") or {}).get("final_score"),
                },
            }
    return {"fired": False}


def _trigger_deadline_critical(ctx: dict[str, Any]) -> dict[str, Any]:
    today: date = ctx["today"]
    deadlines = [d for d in (ctx.get("deadlines") or []) if isinstance(d, dict)]
    urgent = []
    for d in deadlines:
        if d.get("completedAt"):
            continue
        dd = _to_date(d.get("date"))
        if not dd:
            continue
        days = days_between(today, dd)
        if 0 <= days <= 3:
            urgent.append((days, d))
    urgent.sort(key=lambda x: x[0])
    if not urgent:
        return {"fired": False}
    days, d = urgent[0]
    return {
        "fired": True,
        "data": {
            "deadline_label": d.get("label") or "Upcoming deadline",
            "days_remaining": days,
            "current_score": (ctx.get("latest_audit") or {}).get("final_score"),
            "ats_score": ctx.get("ats_score"),
        },
    }


def _trigger_deadline_ats_risk(ctx: dict[str, Any]) -> dict[str, Any]:
    today: date = ctx["today"]
    for d in (ctx.get("deadlines") or []):
        if not isinstance(d, dict) or d.get("completedAt"):
            continue
        dd = _to_date(d.get("date"))
        if not dd:
            continue
        days = days_between(today, dd)
        if not (4 <= days <= 10):
            continue
        label = str(d.get("label") or "").strip()
        vendor = (ctx.get("company_ats_map") or {}).get(label)
        ats_score = ctx.get("ats_score")
        if not vendor or ats_score is None or float(ats_score) >= 75:
            continue
        return {
            "fired": True,
            "data": {
                "deadline_label": label or "Upcoming deadline",
                "days_remaining": days,
                "ats_vendor": vendor,
                "ats_score": int(round(float(ats_score))),
            },
        }
    return {"fired": False}


def _trigger_top_25_within_reach(ctx: dict[str, Any]) -> dict[str, Any]:
    latest = ctx.get("latest_audit")
    cohort = ctx.get("cohort_stats")
    if not latest or not isinstance(cohort, dict):
        return {"fired": False}
    scores = latest.get("scores") or {}
    p75 = cohort.get("p75") or {}
    if not isinstance(scores, dict) or not isinstance(p75, dict):
        return {"fired": False}
    current = float(latest.get("final_score") or 0)
    p75_score = (float(p75.get("smart") or 0) + float(p75.get("grit") or 0) + float(p75.get("build") or 0)) / 3.0
    gap = p75_score - current
    if gap <= 0 or gap > 8:
        return {"fired": False}
    today: date = ctx["today"]
    recent = next(
        (
            a
            for a in (ctx.get("audit_history") or [])
            if isinstance(a, dict) and days_between(_to_date(a.get("ts")), today) <= 7
        ),
        None,
    )
    if recent is not None:
        return {"fired": False}
    weak = _get_weakest_dimension(latest, cohort)
    return {
        "fired": True,
        "data": {
            "current_score": int(round(current)),
            "p75_score": int(round(p75_score)),
            "gap": int(round(gap)),
            "track": (ctx.get("profile") or {}).get("track") or "your track",
            "weakest_dim": weak["name"],
            "weakest_dim_score": weak["score"],
            "weakest_dim_gap": weak["gap"],
        },
    }


def _trigger_cohort_pulse_monday(ctx: dict[str, Any]) -> dict[str, Any]:
    today: date = ctx["today"]
    # Python: Monday == 0
    if today.weekday() != 0:
        return {"fired": False}
    pulse = ctx.get("current_cohort_pulse")
    if not isinstance(pulse, dict):
        return {"fired": False}
    if bool(pulse.get("seen")):
        return {"fired": False}
    cohort = pulse.get("cohort") if isinstance(pulse.get("cohort"), dict) else {}
    top_dimension = str(cohort.get("top_improvement_dimension") or "grit")
    top_pattern = str(cohort.get("top_improvement_pattern") or "top cohort fix")
    return {
        "fired": True,
        "data": {
            "students_improved": int(cohort.get("students_improved") or 0),
            "students_total": int(cohort.get("students_total") or 0),
            "top_dimension": top_dimension,
            "top_pattern": top_pattern,
            "avg_pts": float(cohort.get("top_improvement_avg_pts") or 0),
            "user_change": float(pulse.get("user_score_change") or 0),
            "user_percentile": int(pulse.get("user_percentile") or 100),
            "track": (ctx.get("profile") or {}).get("track") or str(cohort.get("track") or "your track"),
        },
    }


def _trigger_audit_stale_recruiting(ctx: dict[str, Any]) -> dict[str, Any]:
    latest = ctx.get("latest_audit")
    today: date = ctx["today"]
    if not latest:
        return {"fired": False}
    days_since = days_between(_to_date(latest.get("ts")), today)
    if days_since < 21:
        return {"fired": False}
    if not is_active_recruiting_season(today):
        return {"fired": False}
    return {
        "fired": True,
        "data": {
            "days_since_audit": days_since,
            "last_score": latest.get("final_score"),
            "season": current_recruiting_season(today),
        },
    }


def _trigger_applied_ats_mismatch(ctx: dict[str, Any]) -> dict[str, Any]:
    today: date = ctx["today"]
    recent_apps = [
        a
        for a in (ctx.get("applications") or [])
        if isinstance(a, dict) and days_between(_to_date(a.get("created_at") or a.get("createdAt")), today) <= 14
    ]
    if not recent_apps:
        return {"fired": False}
    ats_score = ctx.get("ats_score")
    if ats_score is None or float(ats_score) >= 75:
        return {"fired": False}
    cmap = ctx.get("company_ats_map") or {}
    for app in recent_apps:
        company = str(app.get("company") or "").strip()
        vendor = cmap.get(company)
        if not vendor:
            continue
        if not _is_risky_vendor_score(vendor, float(ats_score)):
            continue
        return {
            "fired": True,
            "data": {
                "company": company,
                "ats_vendor": vendor,
                "ats_score": int(round(float(ats_score))),
                "app_count_past_14_days": len(recent_apps),
            },
        }
    return {"fired": False}


def _trigger_application_silence(ctx: dict[str, Any]) -> dict[str, Any]:
    today: date = ctx["today"]
    if not is_active_recruiting_season(today):
        return {"fired": False}
    recent = [
        a
        for a in (ctx.get("applications") or [])
        if isinstance(a, dict) and days_between(_to_date(a.get("created_at") or a.get("createdAt")), today) <= 14
    ]
    if recent:
        return {"fired": False}
    deadlines = [
        d
        for d in (ctx.get("deadlines") or [])
        if isinstance(d, dict) and not d.get("completedAt")
    ]
    return {
        "fired": True,
        "data": {
            "days_since_last_app": get_last_application_age(ctx.get("applications") or [], today),
            "total_apps_ever": len(ctx.get("applications") or []),
            "has_upcoming_deadlines": 1 if deadlines else 0,
            "season": current_recruiting_season(today),
        },
    }


def _trigger_action_items_pending(ctx: dict[str, Any]) -> dict[str, Any]:
    action_items = ctx.get("action_items") or []
    if not isinstance(action_items, list):
        return {"fired": False}
    today: date = ctx["today"]
    pending = []
    for item in action_items:
        if not isinstance(item, dict):
            continue
        if bool(item.get("done")) or bool(item.get("dismissed")):
            continue
        snoozed = _to_date(item.get("snoozed_until"))
        if snoozed and snoozed > today:
            continue
        created = _to_date(item.get("created_at"))
        if created and days_between(created, today) >= 3:
            pending.append(item)
    if not pending:
        return {"fired": False}
    top_item = max(pending, key=lambda x: float(x.get("estimated_pts") or 0))
    return {
        "fired": True,
        "data": {
            "pending_count": len(pending),
            "top_item_text": str(top_item.get("text") or "")[:80],
            "top_item_pts": float(top_item.get("estimated_pts") or 0),
            "top_item_dimension": str(top_item.get("dimension") or "grit"),
            "days_pending": days_between(_to_date(top_item.get("created_at")), today),
        },
    }


def _trigger_cohort_moving_user_flat(ctx: dict[str, Any]) -> dict[str, Any]:
    latest = ctx.get("latest_audit")
    cohort = ctx.get("cohort_stats")
    history = ctx.get("audit_history") or []
    today: date = ctx["today"]
    if not latest or not isinstance(cohort, dict):
        return {"fired": False}
    score = float(latest.get("final_score") or 0)
    avg = cohort.get("avg") or {}
    if not isinstance(avg, dict):
        return {"fired": False}
    cohort_avg = (float(avg.get("smart") or 0) + float(avg.get("grit") or 0) + float(avg.get("build") or 0)) / 3.0
    two_weeks_ago = next(
        (
            a
            for a in history
            if isinstance(a, dict) and days_between(_to_date(a.get("ts")), today) >= 14
        ),
        None,
    )
    if not two_weeks_ago:
        return {"fired": False}
    score_change = score - float(two_weeks_ago.get("final_score") or 0)
    if abs(score_change) > 2:
        return {"fired": False}
    return {
        "fired": True,
        "data": {
            "user_score": int(round(score)),
            "cohort_avg": int(round(cohort_avg)),
            "days_flat": 14,
            "track": (ctx.get("profile") or {}).get("track") or "your track",
            "top_cohort_fix": cohort.get("how_to_get_ahead") or "Focus on your lowest dimension this week.",
        },
    }


def _trigger_relationship_followup(ctx: dict[str, Any]) -> dict[str, Any]:
    today: date = ctx["today"]
    people = _extract_people(ctx.get("beyond_resume"))
    if not people:
        return {"fired": False}
    for person in people:
        met = _to_date(person.get("met_at") or person.get("created_at"))
        if not met:
            continue
        days = days_between(met, today)
        if not (18 <= days <= 42):
            continue
        if person.get("followed_up"):
            continue
        return {
            "fired": True,
            "data": {
                "person_name": person.get("name") or "someone you met",
                "person_company": person.get("company") or "their company",
                "days_since_meeting": days,
            },
        }
    return {"fired": False}


def _trigger_ritual_missed(ctx: dict[str, Any]) -> dict[str, Any]:
    profile = ctx.get("profile") or {}
    today: date = ctx["today"]
    review_day = profile.get("weekly_review_day")
    if review_day is None:
        review_day = ((profile.get("ritual_preferences") or {}).get("weekly_review_day", 0))
    try:
        review_day = int(review_day)
    except (TypeError, ValueError):
        review_day = 0
    # Python weekday Mon=0; spec uses Sunday=0.
    today_dow = (today.weekday() + 1) % 7
    if today_dow != review_day:
        return {"fired": False}
    checked_in = any(
        days_between(_to_date(a.get("created_at") or a.get("createdAt")), today) <= 7
        for a in (ctx.get("applications") or [])
        if isinstance(a, dict)
    )
    if checked_in:
        return {"fired": False}
    upcoming = [
        d
        for d in (ctx.get("deadlines") or [])
        if isinstance(d, dict)
        and not d.get("completedAt")
        and 0 <= days_between(today, _to_date(d.get("date"))) <= 14
    ]
    return {
        "fired": True,
        "data": {
            "upcoming_deadline_count": len(upcoming),
            "total_apps": len(ctx.get("applications") or []),
        },
    }


def _trigger_deep_dive_overdue(ctx: dict[str, Any]) -> dict[str, Any]:
    latest = ctx.get("latest_audit")
    profile = ctx.get("profile") or {}
    today: date = ctx["today"]
    if not latest:
        return {"fired": False}
    last_deep_dive = _to_date(profile.get("last_deep_dive_at"))
    if not last_deep_dive:
        return {
            "fired": True,
            "data": {"reason": "never_done", "audit_count": len(ctx.get("audit_history") or [])},
        }
    days_since = days_between(last_deep_dive, today)
    if days_since < 30:
        return {"fired": False}
    return {
        "fired": True,
        "data": {
            "reason": "overdue",
            "days_since_deep_dive": days_since,
            "current_score": latest.get("final_score"),
        },
    }


TRIGGERS: list[Trigger] = [
    Trigger("DEADLINE_REMINDER", 0, 1, _trigger_deadline_reminder),
    Trigger("DEADLINE_CRITICAL", 1, 1, _trigger_deadline_critical),
    Trigger("DEADLINE_ATS_RISK", 2, 3, _trigger_deadline_ats_risk),
    Trigger("COHORT_PULSE_MONDAY", 3, 7, _trigger_cohort_pulse_monday),
    Trigger("TOP_25_WITHIN_REACH", 4, 5, _trigger_top_25_within_reach),
    Trigger("AUDIT_STALE_RECRUITING", 5, 7, _trigger_audit_stale_recruiting),
    Trigger("APPLIED_ATS_MISMATCH", 6, 7, _trigger_applied_ats_mismatch),
    Trigger("APPLICATION_SILENCE", 7, 5, _trigger_application_silence),
    Trigger("ACTION_ITEMS_PENDING", 8, 4, _trigger_action_items_pending),
    Trigger("COHORT_MOVING_USER_FLAT", 9, 7, _trigger_cohort_moving_user_flat),
    Trigger("RELATIONSHIP_FOLLOWUP", 10, 7, _trigger_relationship_followup),
    Trigger("RITUAL_MISSED", 11, 7, _trigger_ritual_missed),
    Trigger("DEEP_DIVE_OVERDUE", 12, 21, _trigger_deep_dive_overdue),
]


def get_peer_percentile_for_prompt(latest_audit: dict | None) -> int | None:
    return _top_percentile_from_latest(latest_audit)

