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


# ── /calendar/events — direct write to profile.deadlines ─────────────
#
# The Chapter session screen has a "Put this on my calendar" button on
# the one_move screen. It calls this endpoint to persist the homework
# into the user's own deadlines list so it shows up in the Home agenda
# and the generated ICS feed. No LLM, no quota — just a write.

@router.post("/calendar/events")
async def add_calendar_event(request: Request):
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

    title = str(body.get("title") or "").strip()
    if not title:
        raise errors.bad_request("title is required")

    # Accept either date (YYYY-MM-DD) or date_iso (full ISO timestamp).
    raw_date = str(body.get("date") or body.get("date_iso") or "").strip()
    if not raw_date:
        raise errors.bad_request("date is required")
    date_str = raw_date[:10]
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise errors.bad_request(f"invalid date: {raw_date}")

    ev_type = str(body.get("type") or "custom").strip() or "custom"
    company = str(body.get("company") or "").strip()
    notes = str(body.get("notes") or "").strip()

    from projects.dilly.api.profile_store import get_profile, save_profile

    profile = get_profile(email) or {}
    existing = profile.get("deadlines")
    if not isinstance(existing, list):
        existing = []

    # Dedup by (title, date, company) so repeat taps don't pile up.
    dedup_key = (title.lower(), date_str, company.lower())
    for d in existing:
        if not isinstance(d, dict):
            continue
        k = (
            str(d.get("title") or d.get("label") or "").lower(),
            str(d.get("date") or "")[:10],
            str(d.get("company") or "").lower(),
        )
        if k == dedup_key:
            return {"ok": True, "duplicate": True}

    new_event = {
        "id": str(_uuid.uuid4()),
        "title": title,
        "date": date_str,
        "type": ev_type,
        "notes": notes,
        "company": company,
        "completedAt": None,
        "createdBy": body.get("createdBy") or "chapter",
    }
    existing.append(new_event)
    save_profile(email, {"deadlines": existing})
    return {"ok": True, "event": new_event}


# ─────────────────────────────────────────────────────────────────────
# Profile-derived calendar suggestions
# ─────────────────────────────────────────────────────────────────────
#
# This endpoint is what makes the calendar feel like Dilly's
# operational layer — every fact about the user that has a date,
# every target company, every interview gets surfaced as a calendar
# entry the mobile client can merge into the local view. Each
# suggestion carries a `source` so the UI can label *why* it's there
# (Profile, Tracker, Cohort intel, Auto-prep, Chapter ritual). The
# mobile client decides whether to materialize a suggestion as an
# actual profile.deadlines entry (user accepts) or just preview it.
#
# Zero LLM cost. Pure profile + cohort baseline lookup.
import re as _re_cal
from datetime import datetime as _dt_cal, timedelta as _td_cal


# Static cohort baseline for application timing intelligence. These are
# rough industry windows (when applications typically open/close) used
# to seed placeholder events when a user has a target_company fact.
# Sourced from public data (company career pages, recruiting blogs).
# Easy to extend; no LLM in the loop.
_COHORT_TIMING: dict[str, dict[str, str]] = {
    # software / quant / consulting — accelerated cycles
    "goldman sachs":     {"opens": "08-01", "closes": "10-15", "label": "Goldman Sachs SA app"},
    "jpmorgan":          {"opens": "08-01", "closes": "10-15", "label": "JPMorgan SA app"},
    "morgan stanley":    {"opens": "08-01", "closes": "10-15", "label": "Morgan Stanley SA app"},
    "citadel":           {"opens": "06-01", "closes": "09-30", "label": "Citadel SA app"},
    "jane street":       {"opens": "06-01", "closes": "09-30", "label": "Jane Street SA app"},
    "two sigma":         {"opens": "06-01", "closes": "09-30", "label": "Two Sigma SA app"},
    "hudson river":      {"opens": "06-01", "closes": "09-30", "label": "Hudson River Trading SA app"},
    "drw":               {"opens": "06-01", "closes": "09-30", "label": "DRW SA app"},
    "mckinsey":          {"opens": "07-01", "closes": "10-31", "label": "McKinsey SA app"},
    "bain":              {"opens": "07-01", "closes": "10-31", "label": "Bain SA app"},
    "bcg":               {"opens": "07-01", "closes": "10-31", "label": "BCG SA app"},
    "google":            {"opens": "08-01", "closes": "12-15", "label": "Google STEP / SWE intern app"},
    "meta":              {"opens": "08-01", "closes": "12-15", "label": "Meta intern app"},
    "amazon":            {"opens": "08-01", "closes": "01-31", "label": "Amazon SDE intern app"},
    "microsoft":         {"opens": "08-01", "closes": "12-15", "label": "Microsoft intern app"},
    "apple":             {"opens": "08-01", "closes": "12-15", "label": "Apple intern app"},
    "stripe":            {"opens": "08-01", "closes": "11-30", "label": "Stripe intern app"},
    "openai":            {"opens": "09-01", "closes": "01-31", "label": "OpenAI intern app"},
    "anthropic":         {"opens": "09-01", "closes": "01-31", "label": "Anthropic intern app"},
    "nvidia":            {"opens": "08-15", "closes": "12-31", "label": "Nvidia intern app"},
    "databricks":        {"opens": "08-15", "closes": "12-31", "label": "Databricks intern app"},
    "snowflake":         {"opens": "08-15", "closes": "12-31", "label": "Snowflake intern app"},
}


def _parse_fact_date(raw: str | None) -> str | None:
    """Best-effort parse of a date out of an extracted fact value/label.
    Returns YYYY-MM-DD or None. Handles ISO, MM/DD/YYYY, MM/DD, "next
    Friday" style fallbacks (very rough — only ISO-ish dates trigger
    auto-events; conversational dates stay text-only)."""
    if not raw:
        return None
    s = str(raw).strip()
    # ISO date or datetime
    m = _re_cal.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            _dt_cal(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        except ValueError:
            pass
    # MM/DD/YYYY or MM/DD
    m = _re_cal.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", s)
    if m:
        mo, da, yr = int(m.group(1)), int(m.group(2)), m.group(3)
        if 1 <= mo <= 12 and 1 <= da <= 31:
            year = int(yr) if yr else _dt_cal.utcnow().year
            if year < 100:
                year += 2000
            try:
                _dt_cal(year, mo, da)
                return f"{year:04d}-{mo:02d}-{da:02d}"
            except ValueError:
                pass
    return None


def _next_occurrence_of(month_day: str, today: _dt_cal | None = None) -> str:
    """Given an MM-DD string, return the YYYY-MM-DD of its next
    occurrence (this year if still ahead, otherwise next year)."""
    today = today or _dt_cal.utcnow()
    try:
        mo, da = month_day.split("-")
        candidate = _dt_cal(today.year, int(mo), int(da))
        if candidate.date() < today.date():
            candidate = _dt_cal(today.year + 1, int(mo), int(da))
        return candidate.strftime("%Y-%m-%d")
    except Exception:
        return today.strftime("%Y-%m-%d")


@router.get("/calendar/profile-suggestions")
async def calendar_profile_suggestions(request: Request):
    """Return calendar-shaped suggestions derived from the user's
    Profile facts + cohort timing baseline + chapter ritual + auto-prep
    blocks for upcoming interviews.

    Each suggestion is a partial event payload:
      { id, title, date, type, notes, source, source_fact_id,
        company, role, action_payload }

    The mobile client merges these with the user's existing
    profile.deadlines + tracker apps. Each suggestion carries an
    explicit `source` so the UI can show *why* Dilly suggested it.

    Zero LLM. Pure data shuffling — safe to call on every calendar
    refresh."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.memory_surface_store import get_memory_surface

    profile = get_profile(email) or {}
    surface = get_memory_surface(email) or {}
    items: list[dict] = surface.get("items") or []

    suggestions: list[dict] = []
    today = _dt_cal.utcnow().date()

    # 1. Date-bearing facts → calendar events
    # interview, deadline, career_fair, application categories with a
    # parseable date in label or value get turned into events.
    _DATED_CATS = {"interview", "deadline", "career_fair", "application"}
    for it in items:
        cat = str(it.get("category") or "").lower()
        if cat not in _DATED_CATS:
            continue
        label = str(it.get("label") or "").strip()
        value = str(it.get("value") or "").strip()
        date_str = _parse_fact_date(label) or _parse_fact_date(value)
        if not date_str:
            continue
        # Parse to compare against today; skip events more than 6 months
        # in the past (stale facts shouldn't pile up the calendar).
        try:
            ev_date = _dt_cal.strptime(date_str, "%Y-%m-%d").date()
            if (today - ev_date).days > 180:
                continue
        except ValueError:
            continue
        company = str(it.get("company") or "").strip()
        # Try to extract a company name from value if not already on item
        if not company:
            for w in value.split():
                if w[:1].isupper() and len(w) >= 3:
                    company = w
                    break
        ev_type = "interview" if cat == "interview" else cat
        suggestions.append({
            "id": f"profile-{it.get('id') or label[:16]}",
            "title": label or value[:60],
            "date": date_str,
            "type": ev_type,
            "notes": value if value != label else "",
            "source": "profile_fact",
            "source_fact_id": str(it.get("id") or ""),
            "company": company,
            "createdBy": "dilly-profile",
        })

    # 2. Auto-prep blocks: 24h before each interview event, schedule a
    # 30-min prep block deep-linked to Mock Interview pre-loaded for
    # the company. This turns interview facts into an actual prep
    # ritual without the user having to remember.
    interview_evts = [s for s in suggestions if s.get("type") == "interview"]
    # Also include interview-type entries already in profile.deadlines
    for d in profile.get("deadlines") or []:
        if not isinstance(d, dict):
            continue
        if str(d.get("type") or "").lower() != "interview":
            continue
        date_str = str(d.get("date") or "")[:10]
        if not date_str:
            continue
        interview_evts.append({
            "title": d.get("title") or d.get("label") or "Interview",
            "date": date_str,
            "company": d.get("company") or "",
            "id": f"profiledl-{d.get('id') or date_str}",
        })
    for iv in interview_evts:
        date_str = iv.get("date")
        if not date_str:
            continue
        try:
            iv_date = _dt_cal.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        prep_date = (iv_date - _td_cal(days=1)).strftime("%Y-%m-%d")
        company = iv.get("company") or ""
        suggestions.append({
            "id": f"prep-{iv.get('id')}",
            "title": f"Prep for {company}" if company else "Interview prep",
            "date": prep_date,
            "type": "prep",
            "notes": "30-min mock interview block. Dilly will role-play the interviewer."
                if company else "30-min mock interview block.",
            "source": "auto_prep",
            "source_fact_id": str(iv.get("id") or ""),
            "company": company,
            "action_payload": {"open": "interview_practice", "company": company} if company else None,
            "createdBy": "dilly-auto-prep",
        })

    # 3. target_company facts → cohort timing placeholders
    # When the user has a target like "Citadel" but no application or
    # interview event yet, surface "Citadel typically opens fall apps
    # Aug 20" so the calendar tells them WHEN to act, not just THAT
    # they want to act.
    targets_seen: set[str] = set()
    for it in items:
        if str(it.get("category") or "").lower() not in {"target_company", "interest"}:
            continue
        company_raw = str(it.get("value") or it.get("label") or "").strip()
        # Crude company-name extraction: take the longest titlecased
        # token / phrase. Falls back to the whole value.
        company_key = company_raw.lower().strip()
        # Strip leading/trailing punctuation
        company_key = company_key.strip(".,;:'\"()[]{}")
        if not company_key or company_key in targets_seen:
            continue
        if company_key not in _COHORT_TIMING:
            # Try a substring match (e.g. "goldman sachs spring app")
            matched = None
            for k in _COHORT_TIMING:
                if k in company_key or company_key in k:
                    matched = k
                    break
            if not matched:
                continue
            company_key = matched
        targets_seen.add(company_key)
        timing = _COHORT_TIMING[company_key]
        opens_date = _next_occurrence_of(timing["opens"])
        closes_date = _next_occurrence_of(timing["closes"])
        suggestions.append({
            "id": f"cohort-open-{company_key}",
            "title": f"{timing['label']} (typical open)",
            "date": opens_date,
            "type": "career_fair",
            "notes": f"Cohort intel: {company_key.title()} typically opens applications around this date.",
            "source": "cohort_intel",
            "source_fact_id": str(it.get("id") or ""),
            "company": company_key.title(),
            "createdBy": "dilly-cohort",
        })
        suggestions.append({
            "id": f"cohort-close-{company_key}",
            "title": f"{timing['label']} (typical close)",
            "date": closes_date,
            "type": "deadline",
            "notes": f"Cohort intel: {company_key.title()} applications typically close around this date.",
            "source": "cohort_intel",
            "source_fact_id": str(it.get("id") or ""),
            "company": company_key.title(),
            "createdBy": "dilly-cohort",
        })

    # 4. person_to_follow_up facts → follow-up suggestion events on
    # the user's calendar a few days from now
    for it in items:
        if str(it.get("category") or "").lower() != "person_to_follow_up":
            continue
        person = str(it.get("label") or "").strip()
        ctx = str(it.get("value") or "").strip()
        if not person:
            continue
        suggestions.append({
            "id": f"followup-{it.get('id')}",
            "title": f"Follow up: {person}",
            "date": (today + _td_cal(days=3)).strftime("%Y-%m-%d"),
            "type": "custom",
            "notes": ctx[:200],
            "source": "profile_fact",
            "source_fact_id": str(it.get("id") or ""),
            "createdBy": "dilly-followup",
        })

    # 5. Chapter ritual — surface the user's chosen weekly chapter
    # day/time as a recurring event so the ritual lives in the
    # calendar alongside everything else.
    chapter_schedule = profile.get("chapter_schedule") or {}
    if isinstance(chapter_schedule, dict):
        day_of_week = chapter_schedule.get("day_of_week")  # 0-6, Sunday=0
        time_str = chapter_schedule.get("time_local")  # "HH:MM"
        if isinstance(day_of_week, int) and 0 <= day_of_week <= 6:
            # Compute the next 4 occurrences (4 weeks ahead)
            for week_offset in range(4):
                # Find the next instance of this day_of_week
                days_ahead = (day_of_week - today.weekday() - 1) % 7 + 1
                if days_ahead == 0:
                    days_ahead = 7
                target = today + _td_cal(days=days_ahead + 7 * week_offset)
                suggestions.append({
                    "id": f"chapter-{target.isoformat()}",
                    "title": "Chapter session with Dilly",
                    "date": target.strftime("%Y-%m-%d"),
                    "type": "custom",
                    "notes": f"Your weekly career session. {time_str or ''}".strip(),
                    "source": "chapter",
                    "action_payload": {"open": "chapter"},
                    "createdBy": "dilly-chapter",
                })

    # Sort by date, dedupe by id (defensive — avoids the same suggestion
    # from multiple paths)
    seen_ids: set[str] = set()
    deduped: list[dict] = []
    for s in sorted(suggestions, key=lambda x: x.get("date") or "9999"):
        sid = s.get("id")
        if not sid or sid in seen_ids:
            continue
        seen_ids.add(sid)
        deduped.append(s)

    return {
        "ok": True,
        "suggestions": deduped,
        "counts": {
            "profile_fact": sum(1 for s in deduped if s.get("source") == "profile_fact"),
            "auto_prep":    sum(1 for s in deduped if s.get("source") == "auto_prep"),
            "cohort_intel": sum(1 for s in deduped if s.get("source") == "cohort_intel"),
            "chapter":      sum(1 for s in deduped if s.get("source") == "chapter"),
        },
    }
