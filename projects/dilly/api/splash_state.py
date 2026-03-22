"""
Splash screen copy for app launch (GET /profile/splash-state).
All student-facing strings are built here — the dashboard does not hardcode them.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from projects.dilly.api.audit_history import get_audits
from projects.dilly.api.cohort_config import assign_cohort, get_recruiter_bar, get_reference_phrase
from projects.dilly.api.routers.applications import _load_applications


def _parse_iso_date(s: str | None) -> datetime | None:
    if not s or not isinstance(s, str):
        return None
    t = s.strip()
    if not t:
        return None
    try:
        if t.endswith("Z"):
            t = t[:-1] + "+00:00"
        d = datetime.fromisoformat(t)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc)
    except Exception:
        return None


def _days_until(dt: datetime) -> float:
    now = datetime.now(timezone.utc)
    return (dt - now).total_seconds() / 86400.0


def _hours_until(dt: datetime) -> float:
    now = datetime.now(timezone.utc)
    return (dt - now).total_seconds() / 3600.0


def _avg_peer_top(perc: dict[str, Any] | None) -> float | None:
    if not perc or not isinstance(perc, dict):
        return None
    vals = []
    for k in ("smart", "grit", "build"):
        v = perc.get(k)
        if v is None:
            continue
        try:
            vals.append(float(v))
        except (TypeError, ValueError):
            continue
    if not vals:
        return None
    return sum(vals) / len(vals)


def _nearest_deadline(profile: dict[str, Any]) -> tuple[dict[str, Any], float] | None:
    raw = profile.get("deadlines") or []
    if not isinstance(raw, list):
        return None
    best: tuple[dict[str, Any], float] | None = None
    for d in raw:
        if not isinstance(d, dict):
            continue
        if d.get("completedAt"):
            continue
        label = (d.get("label") or "").strip()
        dt = _parse_iso_date(d.get("date"))
        if dt is None:
            continue
        days = _days_until(dt)
        if days < 0:
            continue
        if best is None or days < best[1]:
            best = (d, days)
    return best


def _last_applied_days(apps: list[dict[str, Any]]) -> float | None:
    best: datetime | None = None
    for a in apps:
        if not isinstance(a, dict):
            continue
        if (a.get("status") or "") not in ("applied", "interviewing", "offer", "rejected"):
            continue
        dt = _parse_iso_date(a.get("applied_at") or a.get("updated_at"))
        if dt is None:
            continue
        if best is None or dt > best:
            best = dt
    if best is None:
        return None
    return (datetime.now(timezone.utc) - best).total_seconds() / 86400.0


def _recent_rejection(apps: list[dict[str, Any]]) -> dict[str, Any] | None:
    for a in apps:
        if not isinstance(a, dict):
            continue
        if (a.get("status") or "").lower() != "rejected":
            continue
        dt = _parse_iso_date(a.get("updated_at") or a.get("applied_at"))
        if dt is None:
            continue
        if (datetime.now(timezone.utc) - dt).total_seconds() < 72 * 3600:
            return a
    return None


def build_splash_state(email: str, profile: dict[str, Any], subscribed: bool) -> dict[str, Any]:
    _ = subscribed
    audits = get_audits(email)
    apps = _load_applications(email)
    latest = audits[0] if audits else None
    prev = audits[1] if len(audits) > 1 else None

    def _fs(a: dict[str, Any] | None) -> int:
        if not a:
            return 0
        try:
            return int(round(float(a.get("final_score") or 0)))
        except (TypeError, ValueError):
            return 0

    final = _fs(latest)
    peer = (latest or {}).get("peer_percentiles") if latest else None
    avg_top = _avg_peer_top(peer)

    # Resolve cohort using the new system (cohort column > assign_cohort fallback)
    _cohort_raw = (
        profile.get("cohort")
        or assign_cohort(
            profile.get("majors") or ([profile.get("major")] if profile.get("major") else []),
            profile.get("pre_professional_track"),
            profile.get("industry_target"),
        )
    )
    cohort = (_cohort_raw or "General").strip() or "General"
    industry_target = (profile.get("industry_target") or "").strip() or None

    # Keep track as display label (cohort is used for scoring logic)
    track = cohort if cohort != "General" else (
        ((latest or {}).get("detected_track") or profile.get("track") or "your track").strip() or "your track"
    )

    school = (profile.get("schoolId") or profile.get("school_id") or "").strip()
    school_label = "UTampa" if "utampa" in school.lower() or "ut" == school.lower() else (school or "your school")

    # --- new_user ---
    if not latest or final <= 0:
        return {
            "state": "new_user",
            "eyebrow": "Hey, I'm Dilly",
            "eyebrow_color": "gold",
            "eyebrow_pulse": False,
            "headline": "Let me read your resume like Goldman does.",
            "headline_gold": "like Goldman does.",
            "sub": "60 seconds. I'll tell you exactly where you stand — and what's holding you back.",
            "cta_primary": "Upload my resume →",
            "cta_route": "/onboarding/upload",
            "cta_context": "",
            "glow_color": "gold",
            "voice_prompt": None,
        }

    # --- interview within 24h ---
    nd = _nearest_deadline(profile)
    if nd:
        drow, ddays = nd
        label = (drow.get("label") or "").lower()
        dt = _parse_iso_date(drow.get("date"))
        if dt and _hours_until(dt) <= 24 and ("interview" in label or "onsite" in label or "screen" in label):
            co = re.split(r"[\n·]", (drow.get("label") or "Interview").strip())[0].strip() or "Interview"
            loc = dt.astimezone()
            h12 = loc.hour % 12 or 12
            tm = f"{h12}:{loc.minute:02d} {'AM' if loc.hour < 12 else 'PM'}"
            return {
                "state": "interview_tomorrow",
                "eyebrow": f"{co} · Tomorrow {tm}".strip(),
                "eyebrow_color": "amber",
                "eyebrow_pulse": True,
                "headline": "Tonight is your prep window.",
                "headline_gold": "prep window.",
                "sub": "I know their typical questions for your background. Let's run through the ones that'll come up.",
                "cta_primary": "Prep with Dilly →",
                "cta_route": "/voice",
                "cta_context": "context=interview_prep",
                "glow_color": "gold",
                "voice_prompt": f"I have an interview very soon ({drow.get('label') or 'upcoming'}). Run a tight prep pass — likely questions for my background and how to answer in 30 seconds each.",
            }

    # --- deadline urgent / ready (simplified bar at 70) ---
    if nd and ddays <= 5:
        drow, _ = nd
        company_guess = re.split(r"[\n·]", (drow.get("label") or "Application").strip())[0].strip() or "Application"
        days_left = max(1, int(round(ddays)))
        if final < 70:
            return {
                "state": "deadline_urgent",
                "eyebrow": f"{company_guess} · {days_left} days left",
                "eyebrow_color": "coral",
                "eyebrow_pulse": True,
                "headline": "You're not ready yet. Let's fix that.",
                "headline_gold": "Let's fix that.",
                "sub": f"Your score is {final}. Competitive bar for many programs is around 70. That gap is a focused one-hour fix.",
                "cta_primary": "Fix it with Dilly →",
                "cta_route": "/voice",
                "cta_context": "context=deadline_fix",
                "glow_color": "gold",
                "voice_prompt": f"I have about {days_left} days before {company_guess}. My score is {final} and I need a fast plan to close the gap. What's the single highest-leverage fix?",
            }
        return {
            "state": "deadline_ready",
            "eyebrow": f"{company_guess} · {days_left} days",
            "eyebrow_color": "green",
            "eyebrow_pulse": True,
                "headline": "You're above their bar.",
                "headline_gold": "their bar.",
            "sub": "Your score clears a typical screening threshold. Dilly says apply this week — don't wait.",
            "cta_primary": "Let's prep together →",
            "cta_route": "/voice",
            "cta_context": "context=deadline_prep",
            "glow_color": "gold",
            "voice_prompt": f"I'm ready to apply for {company_guess} with deadline in {days_left} days. Help me prep submissions and messaging this week.",
        }

    rej = _recent_rejection(apps)
    if rej:
        co = (rej.get("company") or "That firm").strip()
        return {
            "state": "rejected",
            "eyebrow": f"{co} · Status updated",
            "eyebrow_color": "muted",
            "eyebrow_pulse": False,
            "headline": "I know why that happened.",
            "headline_gold": "happened.",
            "sub": "It wasn't random. Let's look at the gap between your materials and what they optimize for — and what to do next.",
            "cta_primary": "Tell me what happened →",
            "cta_route": "/voice",
            "cta_context": "context=rejection_analysis",
            "glow_color": "gold",
            "voice_prompt": f"I was updated to rejected at {co}. Help me understand what likely happened and the next best move.",
        }

    if prev and _fs(latest) - _fs(prev) >= 3:
        delta = _fs(latest) - _fs(prev)
        avgp = _avg_peer_top(peer)
        tier = f"Top {int(round(avgp))}% {track}" if avgp is not None else f"{track}"
        gold_phrase = f"{tier}."
        headline = f"You moved to {gold_phrase}"
        return {
            "state": "score_improved",
            "eyebrow": f"↑ Up {delta} pts this week",
            "eyebrow_color": "green",
            "eyebrow_pulse": False,
            "headline": headline,
            "headline_gold": gold_phrase,
            "sub": "A few more points and you clear more recruiter filters. You're on a streak — keep it going.",
            "cta_primary": "Keep climbing →",
            "cta_route": "/voice",
            "cta_context": "context=momentum",
            "glow_color": "gold",
            "voice_prompt": f"My score just moved up by about {delta} points. What should I double down on this week to keep the momentum?",
        }

    lap = _last_applied_days(apps)
    if lap is not None and lap >= 12 and final >= 72:
        return {
            "state": "not_applying",
            "eyebrow": "You haven't applied in 12 days",
            "eyebrow_color": "gold",
            "eyebrow_pulse": True,
            "headline": "Recruiting season is moving.",
            "headline_gold": "is moving.",
            "sub": "Your score is strong. Let's surface a short list of roles where you're competitive right now.",
            "cta_primary": "Show me the jobs →",
            "cta_route": "/?tab=resources&view=jobs",
            "cta_context": "",
            "glow_color": "gold",
            "voice_prompt": None,
        }

    recruiter_bar = get_recruiter_bar(cohort, industry_target)
    bar_label = get_reference_phrase(cohort, industry_target)

    if final >= recruiter_bar:
        return {
            "state": "top_25",
            "eyebrow": f"Top 25% {track} · {school_label}",
            "eyebrow_color": "green",
            "eyebrow_pulse": False,
            "headline": f"You're above {bar_label}.",
            "headline_gold": f"{bar_label}.",
            "sub": "You're in range for competitive programs. Your window is open — let's turn signal into interviews.",
            "cta_primary": "Let's get the offer →",
            "cta_route": "/voice",
            "cta_context": "context=apply_now",
            "glow_color": "green",
            "voice_prompt": "I'm above the typical recruiter bar for my cohort. What should my application sprint look like this week?",
        }

    gap = max(1, recruiter_bar - final)
    return {
        "state": "score_gap",
        "eyebrow": "You're close",
        "eyebrow_color": "gold",
        "eyebrow_pulse": True,
        "headline": f"You're {gap} pts from {bar_label}.",
        "headline_gold": f"{bar_label}.",
        "sub": "That's where programs start filtering harder. You're closer than it feels — let's close it.",
        "cta_primary": "Close the gap →",
        "cta_route": "/voice",
        "cta_context": "context=score_gap",
        "glow_color": "gold",
        "voice_prompt": f"I'm about {gap} points from {bar_label}. What's the one change that moves the needle fastest?",
    }
