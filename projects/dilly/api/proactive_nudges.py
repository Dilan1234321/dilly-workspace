"""
Proactive, Not Reactive: compute high-signal nudges for Dilly and Career Center.
Respects user preferences (nudge_preferences) and avoids nagging.
"""
from __future__ import annotations

import time
from typing import Any

# Recruiting seasons (month ranges, 1-based). General guidance per track type.
# Summer internships: Jan–Mar apply; Full-time: Aug–Nov apply
_RECRUITING_SEASONS = {
    "internship": {"start_month": 1, "end_month": 4, "label": "Summer internship recruiting"},
    "full_time": {"start_month": 8, "end_month": 12, "label": "Full-time recruiting season"},
}

SILENT_DAYS = 14  # "Silent for 2+ weeks"


def _parse_date(s: str | None) -> float | None:
    """Parse ISO date string to timestamp. Returns None if invalid."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip()[:10]
    if not s:
        return None
    try:
        from datetime import datetime
        dt = datetime.strptime(s, "%Y-%m-%d")
        return dt.timestamp()
    except ValueError:
        return None


def compute_app_funnel_stats(applications: list[dict]) -> dict[str, Any]:
    """
    Aggregate application funnel stats and detect silent applications.
    Silent = status 'applied', applied_at >= 14 days ago, no move to interviewing/offer/rejected.
    """
    now = time.time()
    day_sec = 86400
    silent_threshold = now - (SILENT_DAYS * day_sec)

    applied = 0
    responses = 0  # interviewing or offer (moved past applied)
    interviews = 0
    offers = 0
    rejected = 0
    silent_apps: list[dict] = []

    for a in applications or []:
        if not isinstance(a, dict):
            continue
        status = (a.get("status") or "saved").strip().lower()
        applied_at_ts = _parse_date(a.get("applied_at"))

        if status == "applied":
            applied += 1
            if applied_at_ts and applied_at_ts < silent_threshold:
                silent_apps.append({
                    "company": (a.get("company") or "").strip()[:80],
                    "role": (a.get("role") or "").strip()[:80],
                    "applied_at": a.get("applied_at"),
                })
        elif status == "interviewing":
            interviews += 1
            responses += 1
        elif status == "offer":
            offers += 1
            responses += 1
        elif status == "rejected":
            rejected += 1

    rejected_companies: list[str] = []
    for a in applications or []:
        if isinstance(a, dict) and (a.get("status") or "").strip().lower() == "rejected":
            c = (a.get("company") or "").strip()
            if c and c not in rejected_companies:
                rejected_companies.append(c)

    return {
        "applied": applied,
        "responses": responses,
        "interviews": interviews,
        "offers": offers,
        "rejected": rejected,
        "rejected_companies": rejected_companies[:5],
        "silent_2_weeks": len(silent_apps),
        "silent_apps": silent_apps[:10],
    }


def compute_relationship_nudges(beyond_resume: list[dict] | None) -> list[dict]:
    """
    People mentioned 2–4 weeks ago: suggest check-in.
    Returns list of { person: str, weeks_ago: int }.
    """
    if not beyond_resume or not isinstance(beyond_resume, list):
        return []
    now = time.time()
    day_sec = 86400
    min_days = 14
    max_days = 42  # 2–6 weeks

    nudges: list[dict] = []
    for item in beyond_resume:
        if not isinstance(item, dict):
            continue
        if (item.get("type") or "").strip().lower() != "person":
            continue
        text = (item.get("text") or "").strip()[:100]
        if not text:
            continue
        captured = item.get("captured_at")
        if not captured or not isinstance(captured, str):
            continue
        # Parse ISO timestamp
        try:
            from datetime import datetime
            if "T" in captured:
                dt = datetime.fromisoformat(captured.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(captured[:10], "%Y-%m-%d")
            ts = dt.timestamp()
        except (ValueError, TypeError):
            continue
        days_ago = (now - ts) / day_sec
        if min_days <= days_ago <= max_days:
            weeks = max(1, int(days_ago / 7))
            nudges.append({"person": text, "weeks_ago": weeks})
    return nudges[:5]


def compute_seasonal_awareness(
    application_target: str | None,
    track: str | None,
) -> dict[str, Any] | None:
    """
    Is recruiting season ramping up for their target?
    Returns { in_season: bool, label: str, suggestion: str } or None.
    """
    if not application_target or application_target == "exploring":
        return None
    now = time.gmtime()
    month = now.tm_mon

    key = "internship" if "intern" in (application_target or "").lower() else "full_time"
    season = _RECRUITING_SEASONS.get(key)
    if not season:
        return None

    start, end = season["start_month"], season["end_month"]
    in_season = start <= month <= end
    if not in_season:
        return None
    return {
        "in_season": True,
        "label": season["label"],
        "suggestion": "Recruiting season is active. Here's your sprint plan.",
    }


def compute_score_nudge(
    prev_scores: dict | None,
    cur_scores: dict | None,
) -> dict[str, Any] | None:
    """
    Score improved by 5+ on any dimension? Return nudge.
    """
    if not prev_scores or not cur_scores:
        return None
    dims = ["smart", "grit", "build"]
    for d in dims:
        prev = prev_scores.get(d) or 0
        cur = cur_scores.get(d) or 0
        gain = cur - prev
        if gain >= 5:
            return {
                "dimension": d,
                "gain": int(gain),
                "new_score": int(cur),
            }
    return None


def compute_proactive_nudges(
    profile: dict | None,
    applications: list[dict] | None,
    deadlines: list[dict] | None,
    scores: dict | None,
    prev_scores: dict | None,
) -> dict[str, Any]:
    """
    Compute all proactive nudges. Respects nudge_preferences.
    Returns dict with app_funnel, relationship_nudges, seasonal, score_nudge, deadline_urgent.
    """
    prefs = (profile or {}).get("nudge_preferences") or {}
    if isinstance(prefs, dict):
        deadline_ok = prefs.get("deadline_nudges", True)
        app_ok = prefs.get("app_funnel_nudges", True)
        rel_ok = prefs.get("relationship_nudges", True)
        seasonal_ok = prefs.get("seasonal_nudges", True)
        score_ok = prefs.get("score_nudges", True)
    else:
        deadline_ok = app_ok = rel_ok = seasonal_ok = score_ok = True

    out: dict[str, Any] = {
        "app_funnel": None,
        "relationship_nudges": [],
        "seasonal": None,
        "score_nudge": None,
        "deadline_urgent": None,
    }

    if app_ok and applications:
        stats = compute_app_funnel_stats(applications)
        if stats["applied"] + stats["interviews"] + stats["offers"] + stats["rejected"] > 0:
            out["app_funnel"] = stats

    if rel_ok:
        beyond = (profile or {}).get("beyond_resume") or []
        out["relationship_nudges"] = compute_relationship_nudges(beyond)

    if seasonal_ok:
        target = (profile or {}).get("application_target")
        track = (profile or {}).get("track")
        out["seasonal"] = compute_seasonal_awareness(target, track)

    if score_ok and prev_scores and scores:
        out["score_nudge"] = compute_score_nudge(prev_scores, scores)

    if deadline_ok and deadlines:
        now_ts = time.time()
        day_sec = 86400
        candidates = []
        for d in (deadlines or []):
            if not isinstance(d, dict) or d.get("completedAt"):
                continue
            date_str = (d.get("date") or "").strip()
            if not date_str:
                continue
            ts = _parse_date(date_str)
            if ts and ts > now_ts:
                days = (ts - now_ts) / day_sec
                if 0 <= days <= 7:
                    candidates.append((days, {"label": (d.get("label") or "Upcoming").strip()[:80], "days": int(days), "date": date_str}))
        if candidates:
            candidates.sort(key=lambda x: x[0])
            out["deadline_urgent"] = candidates[0][1]

    return out


def format_proactive_for_voice(nudges: dict[str, Any]) -> list[str]:
    """
    Format proactive nudges as bullet lines for Voice system prompt.
    One line per nudge type. Kept short to avoid overwhelming.
    """
    lines: list[str] = []
    app = nudges.get("app_funnel")
    if app and (app.get("applied", 0) + app.get("interviews", 0) + app.get("offers", 0) + app.get("rejected", 0)) > 0:
        total = app["applied"] + app["responses"] + app["rejected"]
        parts = [f"{app['applied']} applied", f"{app['responses']} responses", f"{app['interviews']} interviews"]
        if app.get("rejected"):
            parts.append(f"{app['rejected']} rejected")
        summary = ", ".join(parts)
        if app.get("silent_2_weeks", 0) > 0:
            lines.append(f"Application funnel: {summary}. {app['silent_2_weeks']} have been silent 2+ weeks — offer follow-up templates if they ask.")
        else:
            lines.append(f"Application funnel: {summary}.")
        if app.get("rejected", 0) > 0:
            companies = app.get("rejected_companies") or []
            if companies:
                lines.append(f"They have rejections (e.g. {', '.join(companies[:3])}). If they bring up rejection, offer reframe and 1–2 next steps.")
            else:
                lines.append("They have rejections. If they bring up rejection, offer reframe and 1–2 next steps.")

    rel = nudges.get("relationship_nudges") or []
    if rel:
        names = [r["person"] for r in rel[:2]]
        weeks = rel[0].get("weeks_ago", 2)
        lines.append(f"Relationship nudge: They met {', '.join(names)} {weeks}+ weeks ago. If relevant, suggest a check-in — don't push.")

    if nudges.get("seasonal"):
        lines.append(f"Seasonal: {nudges['seasonal']['label']} is active. One-line sprint nudge if it fits.")

    if nudges.get("score_nudge"):
        sn = nudges["score_nudge"]
        lines.append(f"Score win: {sn['dimension'].title()} up {sn['gain']} pts. Acknowledge briefly if they ask about progress.")

    if nudges.get("deadline_urgent"):
        du = nudges["deadline_urgent"]
        lines.append(f"Urgent deadline: {du['label']} in {du['days']} days. Offer prep help — one nudge only.")

    return lines
