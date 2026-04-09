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

from fastapi import APIRouter, Request, Query
from fastapi.responses import Response
from typing import Optional

from projects.dilly.api import deps, errors

router = APIRouter(tags=["calendar"])


# ── Single-event ICS helpers (build 76) ───────────────────────────────────

def _ics_escape(text: str) -> str:
    """Escape RFC 5545 TEXT values. Commas, semicolons, backslashes, and
    newlines must be escaped."""
    if not text:
        return ""
    out = str(text)
    out = out.replace("\\", "\\\\")
    out = out.replace(",", "\\,")
    out = out.replace(";", "\\;")
    out = out.replace("\n", "\\n")
    out = out.replace("\r", "")
    out = "".join(ch for ch in out if ord(ch) >= 32 or ch == " ")
    return out[:600]


def _fold_line(line: str) -> str:
    """RFC 5545 line folding — ≤73 chars per line with continuations."""
    if len(line) <= 73:
        return line
    pieces: list[str] = []
    current = line
    while len(current) > 73:
        pieces.append(current[:73])
        current = current[73:]
    pieces.append(current)
    return "\r\n ".join(pieces)


def _parse_ymd(s: Optional[str]) -> Optional[datetime]:
    """Accept YYYY-MM-DD, return a datetime at midnight or None."""
    if not s:
        return None
    try:
        return datetime.strptime(s.strip()[:10], "%Y-%m-%d")
    except Exception:
        return None


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
        "X-WR-CALNAME:dilly",
        "X-APPLE-CALENDAR-COLOR:#1652F0",
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


# ── Build 76: single-event "Add to calendar" endpoint ────────────────────
#
# The subscription flow above (/calendar/feed/{token}.ics) is the right
# long-term primitive, but it only covers deadlines stored in
# profile.deadlines. For one-tap "add this deadline to my calendar" on
# any card the mobile client wants to surface, we expose a stateless
# single-event generator.
#
# The mobile client builds a URL like:
#
#   https://api.trydilly.com/calendar/event.ics
#     ?title=Acme+Data+Intern+deadline
#     &date=2026-04-15
#     &desc=Apply+before+this+date
#     &loc=Remote
#
# and hands it to Linking.openURL. iOS downloads the .ics and shows its
# native "Add to Calendar" panel with a picker for every calendar the
# user has connected (Apple, Google, iCloud, Outlook, Exchange, etc.).
# No platform-specific native code, no permissions prompt, no new
# dependencies. Works with everything.


@router.get("/calendar/event.ics")
async def calendar_single_event_ics(
    title: str = Query(..., min_length=1, max_length=200),
    date: str = Query(..., description="YYYY-MM-DD start date"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD end date (default: date+1)"),
    desc: Optional[str] = Query(None, max_length=2000),
    loc: Optional[str] = Query(None, max_length=300),
    url: Optional[str] = Query(None, max_length=500),
):
    """
    One-shot .ics file built from query params. No auth — the URL is
    the payload. Used by the mobile client for per-card "Add to
    calendar" buttons on the home screen's deadline strip and the
    internship tracker entries.
    """
    start_dt = _parse_ymd(date)
    if not start_dt:
        return Response(
            content="Invalid date (expected YYYY-MM-DD).",
            status_code=400,
            media_type="text/plain",
        )
    end_dt = _parse_ymd(end) if end else None
    if not end_dt:
        from datetime import timedelta
        end_dt = start_dt + timedelta(days=1)

    now_utc = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    uid = f"dilly-event-{_uuid.uuid4().hex[:12]}@trydilly.com"
    start_ymd = start_dt.strftime("%Y%m%d")
    end_ymd = end_dt.strftime("%Y%m%d")

    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Dilly//Career Center//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:dilly",
        "X-WR-TIMEZONE:America/New_York",
        "X-APPLE-CALENDAR-COLOR:#1652F0",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{now_utc}",
        f"DTSTART;VALUE=DATE:{start_ymd}",
        f"DTEND;VALUE=DATE:{end_ymd}",
        f"SUMMARY:{_ics_escape(title)}",
    ]
    if desc:
        lines.append(f"DESCRIPTION:{_ics_escape(desc)}")
    else:
        lines.append("DESCRIPTION:Added from Dilly")
    if loc:
        lines.append(f"LOCATION:{_ics_escape(loc)}")
    if url:
        lines.append(f"URL:{_ics_escape(url)}")

    # Day-before reminder
    lines.extend([
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Dilly reminder",
        "TRIGGER:-P1D",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ])

    ics_text = "\r\n".join(_fold_line(line) for line in lines) + "\r\n"

    safe_name = (title[:40] or "event").replace(" ", "_").replace("/", "_")
    return Response(
        content=ics_text,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.ics"',
            "Cache-Control": "no-store",
        },
    )
