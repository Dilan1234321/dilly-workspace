"""
Chapter advisor DB store — Phase 2.

All tables: chapter_sessions, chapter_messages, chapter_recaps.
Users table additions: chapter_cadence, next_chapter_at,
chapter_calendar_event_id, chapter_total_sessions.

No startup migrations here. Schema materialized via
GET /cron/setup-chapter-tables?token=<CRON_SECRET>.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import psycopg2.extras

from projects.dilly.api.database import get_db

# ── Screen metadata ───────────────────────────────────────────────────────────

SCREEN_NAMES = {
    0: "intake",
    1: "welcome",
    2: "surface",
    3: "synthesis",
    4: "converge",
    5: "recap",
}

SCREEN_MOODS = {
    0: "curious",
    1: "warm",
    2: "thoughtful",
    3: "focused",
    4: "direct",
    5: "settled",
}

# Max user turns per screen (spec §2)
SCREEN_TURN_LIMITS = {
    0: 6,   # intake: 4–5 questions + buffer
    1: 3,   # welcome: 2–3 turns
    2: 5,
    3: 5,
    4: 5,
    5: 2,   # recap: minimal
}

MAX_SESSION_TURNS = 30   # cost guard (spec §12)


# ── Session CRUD ─────────────────────────────────────────────────────────────

def create_chapter_session(
    user_email: str,
    persona: str,
    is_first_session: bool,
    arena_snapshot: Optional[dict] = None,
) -> Optional[dict]:
    """Insert a new chapter_sessions row. Returns the row dict or None on error."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                INSERT INTO chapter_sessions
                    (id, user_id, persona_at_time, is_first_session,
                     started_at, screens_completed, arena_snapshot,
                     screen_captures, created_at)
                VALUES
                    (gen_random_uuid(), %s, %s, %s,
                     now(), 0, %s,
                     '{}', now())
                RETURNING *
                """,
                (
                    user_email,
                    persona,
                    is_first_session,
                    json.dumps(arena_snapshot) if arena_snapshot else None,
                ),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"[CHAPTER] create_chapter_session error: {exc}", flush=True)
        return None


def get_chapter_session(session_id: str, user_email: str) -> Optional[dict]:
    """Fetch a session row, validating it belongs to user_email."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                "SELECT * FROM chapter_sessions WHERE id = %s AND user_id = %s",
                (session_id, user_email),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"[CHAPTER] get_chapter_session error: {exc}", flush=True)
        return None


def advance_chapter_screen(
    session_id: str,
    screen_capture: str,
    from_screen: int,
) -> Optional[dict]:
    """Increment screens_completed and store per-screen capture. Returns updated session."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                UPDATE chapter_sessions
                SET screens_completed = screens_completed + 1,
                    screen_captures = COALESCE(screen_captures, '{}') ||
                                      jsonb_build_object(%s::text, %s::text)
                WHERE id = %s
                RETURNING *
                """,
                (str(from_screen), screen_capture, session_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"[CHAPTER] advance_chapter_screen error: {exc}", flush=True)
        return None


def complete_chapter_session(
    session_id: str,
    recap_id: str,
    calendar_event_id: Optional[str],
) -> bool:
    """Mark session completed, link recap, store calendar event id."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE chapter_sessions
                SET completed_at = now(),
                    recap_id = %s::uuid,
                    calendar_event_id = %s,
                    screens_completed = 5
                WHERE id = %s
                """,
                (recap_id, calendar_event_id, session_id),
            )
            return True
    except Exception as exc:
        print(f"[CHAPTER] complete_chapter_session error: {exc}", flush=True)
        return False


def store_intake_json(session_id: str, intake_json: dict) -> bool:
    """Persist intake answers to chapter_sessions.intake_json."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "UPDATE chapter_sessions SET intake_json = %s WHERE id = %s",
                (json.dumps(intake_json), session_id),
            )
            return True
    except Exception as exc:
        print(f"[CHAPTER] store_intake_json error: {exc}", flush=True)
        return False


# ── Message CRUD ──────────────────────────────────────────────────────────────

def add_chapter_message(
    session_id: str,
    screen_index: int,
    role: str,
    content: str,
) -> Optional[dict]:
    """Insert a chapter_messages row. Returns the row dict or None."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                INSERT INTO chapter_messages
                    (id, session_id, screen_index, role, content, ts)
                VALUES
                    (gen_random_uuid(), %s, %s, %s, %s, now())
                RETURNING *
                """,
                (session_id, screen_index, role, content),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"[CHAPTER] add_chapter_message error: {exc}", flush=True)
        return None


def get_messages_for_session(session_id: str) -> list[dict]:
    """Return all messages for a session, ordered by ts."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                SELECT * FROM chapter_messages
                WHERE session_id = %s
                ORDER BY screen_index ASC, ts ASC
                """,
                (session_id,),
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        print(f"[CHAPTER] get_messages_for_session error: {exc}", flush=True)
        return []


def count_messages_for_session(session_id: str) -> int:
    """Return total message count for a session (both roles)."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT COUNT(*) FROM chapter_messages WHERE session_id = %s",
                (session_id,),
            )
            row = cur.fetchone()
            return int(row[0]) if row else 0
    except Exception as exc:
        print(f"[CHAPTER] count_messages_for_session error: {exc}", flush=True)
        return 0


def count_user_messages_for_screen(session_id: str, screen_index: int) -> int:
    """Return user-role message count for a specific screen."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT COUNT(*) FROM chapter_messages
                WHERE session_id = %s AND screen_index = %s AND role = 'user'
                """,
                (session_id, screen_index),
            )
            row = cur.fetchone()
            return int(row[0]) if row else 0
    except Exception as exc:
        print(f"[CHAPTER] count_user_messages_for_screen error: {exc}", flush=True)
        return 0


# ── Recap CRUD ────────────────────────────────────────────────────────────────

def create_chapter_recap(
    session_id: str,
    user_email: str,
    headline: str,
    observations: list[str],
    commitment: str,
    commitment_deadline: Optional[str],
    between_sessions_prompt: str,
    next_chapter_at: Optional[datetime],
    render_json: Optional[dict],
) -> Optional[dict]:
    """Insert a chapter_recaps row. Returns the row dict or None."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                INSERT INTO chapter_recaps
                    (id, session_id, user_id, headline, observations,
                     commitment, commitment_deadline, between_sessions_prompt,
                     next_chapter_at, render_json, created_at)
                VALUES
                    (gen_random_uuid(), %s, %s, %s, %s,
                     %s, %s, %s,
                     %s, %s, now())
                RETURNING *
                """,
                (
                    session_id,
                    user_email,
                    headline,
                    observations,  # psycopg2 serializes list → TEXT[]
                    commitment,
                    commitment_deadline,
                    between_sessions_prompt,
                    next_chapter_at,
                    json.dumps(render_json) if render_json else None,
                ),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"[CHAPTER] create_chapter_recap error: {exc}", flush=True)
        return None


def get_chapter_recap(recap_id: str, user_email: str) -> Optional[dict]:
    """Fetch a recap row, validating ownership."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                "SELECT * FROM chapter_recaps WHERE id = %s AND user_id = %s",
                (recap_id, user_email),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"[CHAPTER] get_chapter_recap error: {exc}", flush=True)
        return None


def get_last_recap_for_user(user_email: str) -> Optional[dict]:
    """Return the most recent chapter_recaps row for user."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                SELECT * FROM chapter_recaps
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (user_email,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"[CHAPTER] get_last_recap_for_user error: {exc}", flush=True)
        return None


# ── User chapter fields ───────────────────────────────────────────────────────

def get_user_chapter_fields(user_email: str) -> dict:
    """Return chapter-related fields from users table (safe defaults on error)."""
    defaults = {
        "chapter_total_sessions": 0,
        "chapter_cadence": "weekly",
        "next_chapter_at": None,
        "chapter_calendar_event_id": None,
    }
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                SELECT chapter_total_sessions, chapter_cadence,
                       next_chapter_at, chapter_calendar_event_id
                FROM users WHERE email = %s
                """,
                (user_email,),
            )
            row = cur.fetchone()
            if not row:
                return defaults
            return {
                "chapter_total_sessions": int(row.get("chapter_total_sessions") or 0),
                "chapter_cadence": str(row.get("chapter_cadence") or "weekly"),
                "next_chapter_at": row.get("next_chapter_at"),
                "chapter_calendar_event_id": row.get("chapter_calendar_event_id"),
            }
    except Exception as exc:
        print(f"[CHAPTER] get_user_chapter_fields error: {exc}", flush=True)
        return defaults


def increment_chapter_total_sessions(user_email: str) -> bool:
    """Atomically increment users.chapter_total_sessions."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE users
                SET chapter_total_sessions = COALESCE(chapter_total_sessions, 0) + 1
                WHERE email = %s
                """,
                (user_email,),
            )
            return True
    except Exception as exc:
        print(f"[CHAPTER] increment_chapter_total_sessions error: {exc}", flush=True)
        return False


def update_next_chapter_at(
    user_email: str,
    next_at: datetime,
    calendar_event_id: Optional[str] = None,
) -> bool:
    """Update users.next_chapter_at (and optionally chapter_calendar_event_id)."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE users
                SET next_chapter_at = %s,
                    chapter_calendar_event_id = COALESCE(%s, chapter_calendar_event_id)
                WHERE email = %s
                """,
                (next_at, calendar_event_id, user_email),
            )
            return True
    except Exception as exc:
        print(f"[CHAPTER] update_next_chapter_at error: {exc}", flush=True)
        return False


# ── Calendar event helper ─────────────────────────────────────────────────────

def create_chapter_calendar_event(
    user_email: str,
    next_chapter_at: datetime,
    session_id: str,
) -> Optional[str]:
    """
    Add a chapter session event to the user's profile.deadlines list
    (fed into the existing ICS feed). Returns the event_id or None.
    """
    try:
        from projects.dilly.api.profile_store import get_profile, save_profile

        profile = get_profile(user_email) or {}
        calendar_feed_token = profile.get("calendar_feed_token")
        if not calendar_feed_token:
            return None  # user hasn't connected a calendar

        deadlines = profile.get("deadlines") if isinstance(profile.get("deadlines"), list) else []
        event_id = f"chapter-{session_id[:8]}"

        # Dedup — remove any stale chapter next-session event
        deadlines = [
            d for d in deadlines
            if not (isinstance(d, dict) and str(d.get("id") or "").startswith("chapter-"))
        ]

        next_date_str = next_chapter_at.strftime("%Y-%m-%d")
        new_event = {
            "id": event_id,
            "label": "Chapter with Dilly",
            "date": next_date_str,
            "type": "chapter",
            "notes": "Your weekly career advisory session. Tap to open in Dilly.",
            "deep_link": "dilly://chapter/start",
            "completedAt": None,
            "reminder_days": [0],
        }
        deadlines.append(new_event)
        save_profile(user_email, {"deadlines": deadlines})
        return event_id
    except Exception as exc:
        print(f"[CHAPTER] create_chapter_calendar_event error: {exc}", flush=True)
        return None


# ── Next-session timestamp helper ─────────────────────────────────────────────

def compute_next_chapter_at(from_dt: Optional[datetime] = None) -> datetime:
    """Return next_chapter_at = from_dt + 7 days (same weekday/time), UTC."""
    base = from_dt or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    return base + timedelta(days=7)
