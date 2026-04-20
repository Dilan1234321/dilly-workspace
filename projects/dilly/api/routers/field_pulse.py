"""
Field Pulse — AI Arena's weekly-return hook.

The existing Weekly Signal is good content but doesn't FEEL fresh
because users don't know when it updates. Field Pulse wraps the
signal in three retention-forcing affordances:

  1. An unseen badge — when the current iso_week is newer than the
     last_seen_week we wrote to the user's profile, the UI shows
     "New" on the Arena tab icon (data returned here).
  2. A personal tie-in — if the user has recent pulse/win activity,
     we template a one-liner that connects their week to the signal
     ("You wrote on Monday about feeling stuck on X — this week's
     signal is a prompt you might actually use.")
  3. A "next refresh" date — explicit countdown to the next Monday
     so users know when to come back. Makes the return cycle
     concrete instead of vague.

All zero-LLM. The personal tie-in is templated from user data.

Endpoints:
  GET  /ai-arena/field-pulse  → signal + personal hook + seen flags
  POST /ai-arena/field-pulse/seen → mark current iso_week as seen
"""

import datetime

from fastapi import APIRouter, Request

from projects.dilly.api import deps, errors


router = APIRouter(tags=["field_pulse"])


def _current_iso_week() -> str:
    today = datetime.date.today()
    year, week, _ = today.isocalendar()
    return f"{year}-W{week:02d}"


def _next_monday_iso() -> str:
    today = datetime.date.today()
    # weekday(): Mon=0 ... Sun=6. Days until next Monday:
    #   today=Mon -> 7 days until next Monday (not today)
    #   today=Sun -> 1 day
    days_ahead = (7 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    nxt = today + datetime.timedelta(days=days_ahead)
    return nxt.isoformat()


def _personal_hook(profile: dict, signal: dict) -> str | None:
    """Template a one-line tie between the user's recent activity
    and this week's signal. Returns None if there's nothing useful
    to say — caller hides the line rather than showing filler."""
    pulse_log = profile.get("pulse_log") if isinstance(profile.get("pulse_log"), list) else []
    cutoff = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
    recent_pulse = next(
        (
            p for p in reversed(pulse_log)
            if isinstance(p, dict)
            and str(p.get("date") or "")[:10] >= cutoff
            and str(p.get("response") or "").strip()
        ),
        None,
    )
    if recent_pulse:
        r = str(recent_pulse.get("response") or "").strip()
        snippet = r[:80].rstrip()
        if len(r) > 80:
            snippet += "…"
        return (
            f"You wrote earlier this week: \"{snippet}\". "
            f"This week's signal is worth reading with that in mind."
        )

    # Recent wins are the next best tie-in.
    wins = profile.get("wins") if isinstance(profile.get("wins"), list) else []
    if wins:
        latest = sorted(wins, key=lambda w: str(w.get("created_at") or ""), reverse=True)
        for w in latest:
            if not isinstance(w, dict):
                continue
            created = str(w.get("created_at") or "")[:10]
            if created and created >= cutoff:
                title = str(w.get("title") or "").strip()
                if title:
                    return (
                        f"You logged \"{title[:60]}\" this week. "
                        f"The field moved while you were doing that — here's what shifted."
                    )
                break

    return None


@router.get("/ai-arena/field-pulse")
async def field_pulse(request: Request, role: str = ""):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.ai_threat_report_helpers import lookup as lookup_role
    from dilly_core.weekly_signals import signal_for_role
    from dilly_core.ai_threat_report import ROLE_THREAT_REPORT

    profile = get_profile(email) or {}

    # Role resolution — explicit query arg wins, otherwise profile.
    role_key: str | None = None
    if role:
        r = lookup_role(role)
        if r:
            role_key = r["role_key"]
    if not role_key:
        for candidate in (
            profile.get("current_role"),
            profile.get("current_job_title"),
            profile.get("title"),
            profile.get("field"),
            profile.get("major"),
        ):
            if candidate:
                r = lookup_role(str(candidate))
                if r:
                    role_key = r["role_key"]
                    break

    signal = signal_for_role(role_key)
    role_display = (ROLE_THREAT_REPORT.get(role_key or "") or {}).get("display") if role_key else None

    current_week = _current_iso_week()
    signal_week = str(signal.get("iso_week") or current_week)
    last_seen = str(profile.get("field_pulse_last_seen") or "")
    is_new_to_user = signal_week != last_seen

    personal_hook = _personal_hook(profile, signal)

    return {
        "ok": True,
        "role_key": role_key,
        "role_display": role_display,
        "signal": signal,
        "personal_hook": personal_hook,
        "signal_week": signal_week,
        "current_week": current_week,
        "is_new_to_user": is_new_to_user,
        "next_refresh_date": _next_monday_iso(),
    }


@router.post("/ai-arena/field-pulse/seen")
async def mark_seen(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    week = str(body.get("week") or "").strip()
    if not week:
        raise errors.bad_request("week is required")

    from projects.dilly.api.profile_store import save_profile
    save_profile(email, {"field_pulse_last_seen": week})
    return {"ok": True}
