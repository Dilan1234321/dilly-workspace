"""
chapters_store — Postgres DAO for the weekly "Chapter" scheduled session.

Product context:
  A Chapter is a weekly scheduled session Dilly writes for the user.
  Users schedule a day of the week (default Sunday) and an hour (default
  19:00). Dilly produces one structured Chapter per cycle with a title
  and seven screens of content. Between Chapters, users can drop notes
  for Dilly to address in the next session. This module owns the three
  tables that back that flow.

Tables:
  chapters          One row per generated Chapter. Stores title, the
                    seven screens as JSON, the fetched-at timestamp
                    (used to decide when the next one is eligible),
                    and the scheduled-for time it was generated for.
                    screens is a JSON array of 7 {header,body} objects.

  chapter_notes     User's "notes for the next session" queue. Rows
                    with consumed_at NULL are open (haven't been fed
                    into a Chapter yet). When a Chapter is generated
                    we stamp consumed_at on all open notes so the
                    user starts fresh for next week.

  chapter_schedule  One row per user. day_of_week (0=Mon...6=Sun),
                    hour (0-23), and a one-time override for a
                    rescheduled session (next_override_at).

Cost discipline:
  The whole point of this system is to bound LLM cost at 1 call per
  user per cycle. Generate should ONLY be called when a Chapter is
  actually due; the router enforces that, not this store.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import psycopg2
from psycopg2.extras import RealDictCursor


def _conn():
    """Same three-layer env fallback as aha_signals_store / llm_usage_log:
    DATABASE_URL first (Railway), then PG*, then DILLY_DB_*."""
    db_url = (os.environ.get("DATABASE_URL") or "").strip()
    if db_url:
        return psycopg2.connect(db_url, sslmode="require", connect_timeout=3)
    pg_host = (os.environ.get("PGHOST") or "").strip()
    if pg_host:
        return psycopg2.connect(
            host=pg_host,
            database=os.environ.get("PGDATABASE") or "",
            user=os.environ.get("PGUSER") or "",
            password=os.environ.get("PGPASSWORD") or "",
            port=int(os.environ.get("PGPORT") or "5432"),
            sslmode="require",
            connect_timeout=3,
        )
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", ""),
        database=os.environ.get("DILLY_DB_NAME", "dilly"),
        user=os.environ.get("DILLY_DB_USER", "dilly_admin"),
        password=os.environ.get("DILLY_DB_PASSWORD", ""),
        sslmode="require",
        connect_timeout=3,
    )


_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS chapters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  title           TEXT NOT NULL,
  screens_json    JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chapters_email_fetched
  ON chapters (email, fetched_at DESC);

CREATE TABLE IF NOT EXISTS chapter_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  note_text    TEXT NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chapter_notes_open
  ON chapter_notes (email, added_at DESC) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS chapter_schedule (
  email             TEXT PRIMARY KEY,
  day_of_week       SMALLINT NOT NULL DEFAULT 6,
  hour              SMALLINT NOT NULL DEFAULT 19,
  next_override_at  TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def ensure_schema() -> None:
    """Idempotent. Runs on import."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(_SCHEMA_SQL)
    except Exception as e:
        import sys
        sys.stderr.write(f"[chapters] schema ensure failed: {e}\n")


# Run schema setup on import, matching the pattern used by the rest of
# the Dilly DB modules so Railway cold starts get the tables ready.
try:
    ensure_schema()
except Exception:
    pass


# ---------- schedule ops ----------------------------------------------------

def get_schedule(email: str) -> dict[str, Any]:
    """Return the user's schedule, or sensible defaults if none set.
    Defaults: Sunday (6) at 19:00 local. next_override_at is None unless
    they rescheduled a specific upcoming session."""
    try:
        with _conn() as c:
            with c.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT day_of_week, hour, next_override_at "
                    "FROM chapter_schedule WHERE email = %s",
                    (email.lower().strip(),),
                )
                row = cur.fetchone()
                if row:
                    return {
                        "day_of_week": int(row["day_of_week"]),
                        "hour": int(row["hour"]),
                        "next_override_at": row["next_override_at"].isoformat() if row["next_override_at"] else None,
                    }
    except Exception:
        pass
    return {"day_of_week": 6, "hour": 19, "next_override_at": None}


def set_schedule(email: str, *, day_of_week: int, hour: int) -> None:
    """Upsert the user's weekly schedule. Setting the schedule clears
    any one-time reschedule override (fresh start)."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO chapter_schedule (email, day_of_week, hour, next_override_at, updated_at)
                    VALUES (%s, %s, %s, NULL, now())
                    ON CONFLICT (email) DO UPDATE
                    SET day_of_week = EXCLUDED.day_of_week,
                        hour = EXCLUDED.hour,
                        next_override_at = NULL,
                        updated_at = now()
                    """,
                    (email.lower().strip(), int(day_of_week), int(hour)),
                )
    except Exception as e:
        import sys
        sys.stderr.write(f"[chapters] set_schedule failed: {e}\n")


def set_override(email: str, *, override_at: datetime) -> None:
    """Set a one-time reschedule for the next session. Does not change
    the user's regular day/hour. Stored as UTC."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO chapter_schedule (email, day_of_week, hour, next_override_at, updated_at)
                    VALUES (%s, 6, 19, %s, now())
                    ON CONFLICT (email) DO UPDATE
                    SET next_override_at = EXCLUDED.next_override_at,
                        updated_at = now()
                    """,
                    (email.lower().strip(), override_at.astimezone(timezone.utc)),
                )
    except Exception as e:
        import sys
        sys.stderr.write(f"[chapters] set_override failed: {e}\n")


def clear_override(email: str) -> None:
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    "UPDATE chapter_schedule SET next_override_at = NULL, updated_at = now() WHERE email = %s",
                    (email.lower().strip(),),
                )
    except Exception:
        pass


# ---------- chapter ops -----------------------------------------------------

def get_latest_chapter(email: str) -> Optional[dict[str, Any]]:
    """Most recent Chapter, or None if the user has never had one."""
    try:
        with _conn() as c:
            with c.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, title, screens_json, fetched_at, scheduled_for
                    FROM chapters
                    WHERE email = %s
                    ORDER BY fetched_at DESC
                    LIMIT 1
                    """,
                    (email.lower().strip(),),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row["id"]),
                    "title": row["title"],
                    "screens": row["screens_json"] or [],
                    "fetched_at": row["fetched_at"].isoformat(),
                    "scheduled_for": row["scheduled_for"].isoformat() if row["scheduled_for"] else None,
                }
    except Exception:
        return None


def save_chapter(email: str, *, title: str, screens: list[dict[str, Any]], scheduled_for: Optional[datetime]) -> Optional[str]:
    """Insert a new Chapter row. Returns the new id on success."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO chapters (email, title, screens_json, scheduled_for)
                    VALUES (%s, %s, %s::jsonb, %s)
                    RETURNING id
                    """,
                    (
                        email.lower().strip(),
                        title[:200],
                        json.dumps(screens),
                        scheduled_for.astimezone(timezone.utc) if scheduled_for else None,
                    ),
                )
                row = cur.fetchone()
                return str(row[0]) if row else None
    except Exception as e:
        import sys
        sys.stderr.write(f"[chapters] save_chapter failed: {e}\n")
        return None


# ---------- notes ops -------------------------------------------------------

# The 3-notes-per-week / 1-per-12-hours caps live in the router so the
# caller can return nice error codes. This store just gives the router
# the numbers it needs to decide.

NOTE_WEEKLY_CAP = 3
NOTE_COOLDOWN_HOURS = 12


def list_open_notes(email: str, limit: int = 10) -> list[dict[str, Any]]:
    """Notes the user has queued for the next Chapter. Not consumed yet."""
    try:
        with _conn() as c:
            with c.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, note_text, added_at
                    FROM chapter_notes
                    WHERE email = %s AND consumed_at IS NULL
                    ORDER BY added_at DESC
                    LIMIT %s
                    """,
                    (email.lower().strip(), int(limit)),
                )
                return [
                    {
                        "id": str(r["id"]),
                        "text": r["note_text"],
                        "added_at": r["added_at"].isoformat(),
                    }
                    for r in cur.fetchall()
                ]
    except Exception:
        return []


def count_open_notes(email: str) -> int:
    """How many unconsumed notes does the user have queued."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM chapter_notes WHERE email = %s AND consumed_at IS NULL",
                    (email.lower().strip(),),
                )
                row = cur.fetchone()
                return int(row[0]) if row else 0
    except Exception:
        return 0


def last_note_added_at(email: str) -> Optional[datetime]:
    """Timestamp of the user's most recent note (open or consumed).
    Used to enforce the 12-hour cooldown."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    "SELECT MAX(added_at) FROM chapter_notes WHERE email = %s",
                    (email.lower().strip(),),
                )
                row = cur.fetchone()
                return row[0] if row and row[0] else None
    except Exception:
        return None


def add_note(email: str, text: str) -> Optional[str]:
    """Insert a new note. Returns the new id on success.
    Rate limits are enforced by the router, not here."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO chapter_notes (email, note_text)
                    VALUES (%s, %s)
                    RETURNING id
                    """,
                    (email.lower().strip(), text.strip()[:500]),
                )
                row = cur.fetchone()
                return str(row[0]) if row else None
    except Exception as e:
        import sys
        sys.stderr.write(f"[chapters] add_note failed: {e}\n")
        return None


def delete_note(email: str, note_id: str) -> bool:
    """Only removes the user's own notes. Returns True if a row was deleted."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    "DELETE FROM chapter_notes WHERE id = %s AND email = %s",
                    (note_id, email.lower().strip()),
                )
                return cur.rowcount > 0
    except Exception:
        return False


def consume_open_notes(email: str) -> int:
    """Mark all open notes as consumed. Called when a Chapter is generated
    so the user starts next week fresh. Returns number of notes consumed."""
    try:
        with _conn() as c:
            with c.cursor() as cur:
                cur.execute(
                    """
                    UPDATE chapter_notes
                    SET consumed_at = now()
                    WHERE email = %s AND consumed_at IS NULL
                    """,
                    (email.lower().strip(),),
                )
                return cur.rowcount
    except Exception:
        return 0
