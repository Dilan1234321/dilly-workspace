"""
Calendar feed endpoints.
GET  /calendar/feed/{feed_token}.ics  — public iCal feed (no auth, uses feed token)
POST /calendar/generate-feed-token    — create/return a calendar feed token for the user
"""

import os
import sys
import uuid as _uuid
from datetime import datetime

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Request
from fastapi.responses import Response

from projects.dilly.api import deps, errors

router = APIRouter(tags=["calendar"])


def _build_ics(deadlines: list[dict]) -> str:
    """Build a valid iCalendar string from a list of deadline dicts."""
    now = datetime.utcnow()
    dtstamp = now.strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Dilly//Career Deadlines//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Dilly Deadlines",
        "X-WR-TIMEZONE:UTC",
    ]

    for i, d in enumerate(deadlines):
        if not isinstance(d, dict):
            continue
        date_str = (d.get("date") or "").strip()
        label = (d.get("label") or "Deadline").replace("\n", " ").replace("\r", " ")
        if not date_str:
            continue

        uid = d.get("id") or f"deadline-{i}-{date_str}"
        date_val = date_str[:10].replace("-", "")

        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:dilly-{uid}@trydilly.com")
        lines.append(f"DTSTAMP:{dtstamp}")
        lines.append(f"DTSTART;VALUE=DATE:{date_val}")
        lines.append(f"DTEND;VALUE=DATE:{date_val}")
        lines.append(f"SUMMARY:{label}")

        # Add VALARM reminders based on reminder_days
        reminder_days = d.get("reminder_days")
        if isinstance(reminder_days, list):
            for rd in reminder_days:
                if isinstance(rd, (int, float)) and rd > 0:
                    lines.append("BEGIN:VALARM")
                    lines.append("ACTION:DISPLAY")
                    lines.append(f"DESCRIPTION:Reminder: {label}")
                    lines.append(f"TRIGGER:-P{int(rd)}D")
                    lines.append("END:VALARM")

        # Completed deadlines get a strikethrough note
        if d.get("completedAt"):
            lines.append("STATUS:COMPLETED")

        # Type indicator
        dl_type = d.get("type") or "deadline"
        lines.append(f"CATEGORIES:{dl_type}")

        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


@router.get("/calendar/feed/{feed_token}.ics")
async def get_calendar_feed(feed_token: str):
    """
    Public iCal feed endpoint. No auth required — uses a random feed token
    stored on the user's profile to identify the user.
    """
    feed_token = (feed_token or "").strip()
    if not feed_token or len(feed_token) < 8:
        return Response(
            content="Invalid feed token",
            status_code=404,
            media_type="text/plain",
        )

    # Look up user by feed token
    from projects.dilly.api.profile_store import get_profile

    # We need to find the user by their calendar_feed_token
    # Since we store it on the profile, we need a lookup function
    profile = _find_profile_by_feed_token(feed_token)
    if not profile:
        return Response(
            content="Feed not found",
            status_code=404,
            media_type="text/plain",
        )

    deadlines = profile.get("deadlines") if isinstance(profile.get("deadlines"), list) else []
    # Only include active (non-completed) deadlines in the feed
    active_deadlines = [d for d in deadlines if isinstance(d, dict) and not d.get("completedAt")]

    ics_content = _build_ics(active_deadlines)
    return Response(
        content=ics_content,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=dilly-deadlines.ics",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


@router.post("/calendar/generate-feed-token")
async def generate_feed_token(request: Request):
    """Create or return the user's calendar feed token."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile, save_profile

    profile = get_profile(email) or {}
    existing_token = profile.get("calendar_feed_token")
    if existing_token:
        return {"ok": True, "feed_token": existing_token}

    # Generate a new random token
    new_token = str(_uuid.uuid4()).replace("-", "")
    save_profile(email, {"calendar_feed_token": new_token})
    return {"ok": True, "feed_token": new_token}


def _find_profile_by_feed_token(token: str) -> dict | None:
    """Look up a profile by calendar_feed_token. Tries PG first, falls back to file store."""
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            import psycopg2.extras
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            # calendar_feed_token is stored in profile_json JSONB column
            cur.execute(
                "SELECT * FROM users WHERE profile_json->>'calendar_feed_token' = %s LIMIT 1",
                (token,),
            )
            row = cur.fetchone()
            if row:
                from projects.dilly.api.profile_store import _row_to_profile
                return _row_to_profile(dict(row))
    except Exception:
        pass

    return None
